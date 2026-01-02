import { surrealDB } from "@/lib/surrealdb-client";
import { TABLES } from "@/lib/schema";
import type { Entity, Relationship, Document } from "@/types";

// PERFORMANCE CONFIGURATION
const GRAPH_LIMITS = {
    INITIAL_NODES: 100, 
    MAX_EDGES: 100
};

// --- HELPER: STRIP PREFIXES TO GET CLEAN ID ---
const cleanId = (id: string) => {
    if (!id) return "";
    return id.replace(/^(entity:|person:|organization:|location:)/, "").trim();
};

export class GraphOperations {
  private get db() {
    return surrealDB.getClient();
  }

  // --- NEW: Delete by Filename Helper ---
  async deleteDocumentByFilename(filename: string): Promise<boolean> {
      try {
          const query = `SELECT id FROM document WHERE filename = $filename LIMIT 1`;
          const result = await this.db.query(query, { filename });
          // @ts-ignore
          const record = result[0]?.result?.[0];
          
          if (!record || !record.id) {
              throw new Error(`File '${filename}' not found in database.`);
          }
          console.log(`[GraphOps] Found ID ${record.id} for file '${filename}'. Deleting...`);
          return await this.deleteDocument(record.id);
      } catch (e: any) {
          console.error("Delete by Filename Error:", e);
          throw e;
      }
  }

  async deleteDocument(id: string): Promise<boolean> {
      try {
          console.log(`[GraphOps] Starting cascade delete for document: ${id}`);
          
          const info = await this.db.query('INFO FOR DB');
          // @ts-ignore
          const tablesObject = info[0]?.result?.tables || {}; 
          // FIX: Explicitly cast to string[] to satisfy TS
          const allTableNames = Object.keys(tablesObject) as string[];
          
          const exclude = ["entity", "document", "relationship_def", "data_source_config", "user", "session"];
          // FIX: Filter works now because we cast to string[]
          const edgeTables = allTableNames.filter(t => !exclude.includes(t));

          for (const table of edgeTables) {
             try { await this.db.query(`DELETE FROM ${table} WHERE source = $id`, { id }); } catch(e) {}
          }
          await this.db.query(`DELETE FROM entity WHERE metadata.source = $id`, { id });
          await this.db.delete(id);
          
          console.log(`[GraphOps] Successfully deleted document ${id} and its data.`);
          return true;
      } catch (e: any) {
          console.error("Delete Document Error:", e);
          throw new Error("Failed to delete document: " + e.message);
      }
  }

  // --- 2. SEARCH & FILTER API ---
  async searchEntities(query: string, typeFilter?: string) {
    try {
      let sql = `SELECT * FROM ${TABLES.ENTITY} WHERE label ~ $query`;
      if (typeFilter && typeFilter !== "ALL") {
        sql += ` AND type = $typeFilter`;
      }
      sql += ` LIMIT 20`; 

      const result = await this.db.query(sql, { query, typeFilter });
      // FIX: Cast result to any[] before mapping
      const rawHits = (result[0] as any)?.result || [];
      const searchHits = (Array.isArray(rawHits) ? rawHits : []).map((r: any) => this.mapRecordToEntity(r));

      if (searchHits.length === 0) return { entities: [], relationships: [] };

      const hitIds = searchHits.map((e: Entity) => e.id);
      const edgeQuery = `SELECT * FROM relationship WHERE in IN $ids OR out IN $ids LIMIT 100`;
      const edgeResult = await this.db.query(edgeQuery, { ids: hitIds });
      
      // FIX: Cast result to any[]
      const rawEdges = (edgeResult[0] as any)?.result || [];
      const relationships = (Array.isArray(rawEdges) ? rawEdges : []).map((r: any) => this.mapRecordToRelationship(r));

      const neighborIds = new Set<string>();
      relationships.forEach((r: Relationship) => {
          if (!hitIds.includes(r.from)) neighborIds.add(r.from);
          if (!hitIds.includes(r.to)) neighborIds.add(r.to);
      });

      const missingIds = Array.from(neighborIds);
      let neighbors: Entity[] = [];
      if (missingIds.length > 0) {
          const neighborQuery = `SELECT * FROM ${TABLES.ENTITY} WHERE id IN $ids`;
          const neighborResult = await this.db.query(neighborQuery, { ids: missingIds });
          // FIX: Cast result to any[]
          const rawNeighbors = (neighborResult[0] as any)?.result || [];
          neighbors = (Array.isArray(rawNeighbors) ? rawNeighbors : []).map((r: any) => this.mapRecordToEntity(r));
      }

      return { entities: [...searchHits, ...neighbors], relationships: relationships };
    } catch (e) {
      console.error("Search API Error:", e);
      return { entities: [], relationships: [] };
    }
  }

  // --- 3. GLOBAL VIEW STRATEGY ---
  async getGraphData(documentId?: string) {
    try {
        console.log(`[GraphOps] Loading graph data...`);
        const rels = await this.getAllRelationships(documentId); 
        
        const criticalNodeIds = new Set<string>();
        rels.forEach(r => {
            if(r.from) criticalNodeIds.add(r.from);
            if(r.to) criticalNodeIds.add(r.to);
        });
        const requiredIds = Array.from(criticalNodeIds);

        let criticalEntities: Entity[] = [];
        if (requiredIds.length > 0) {
            const nodeQuery = `SELECT * FROM ${TABLES.ENTITY} WHERE id IN $ids`;
            const nodeResult = await this.db.query(nodeQuery, { ids: requiredIds });
            // FIX: Cast result to any[]
            const rawNodes = (nodeResult[0] as any)?.result || [];
            criticalEntities = (Array.isArray(rawNodes) ? rawNodes : []).map((r: any) => this.mapRecordToEntity(r));
        }

        const remainingLimit = GRAPH_LIMITS.INITIAL_NODES - criticalEntities.length;
        let fillerEntities: Entity[] = [];
        
        if (remainingLimit > 0) {
            let fillerQuery = `SELECT * FROM ${TABLES.ENTITY} WHERE true`; 
            if (documentId) fillerQuery += ` AND metadata.source = $documentId`;
            if (requiredIds.length > 0) fillerQuery += ` AND id NOT IN $ids`;
            fillerQuery += ` ORDER BY updatedAt DESC LIMIT ${remainingLimit}`;
            
            const fillerResult = await this.db.query(fillerQuery, { ids: requiredIds, documentId });
            // FIX: Cast result to any[]
            const rawFillers = (fillerResult[0] as any)?.result || [];
            fillerEntities = (Array.isArray(rawFillers) ? rawFillers : []).map((r: any) => this.mapRecordToEntity(r));
        }

        return { entities: [...criticalEntities, ...fillerEntities], relationships: rels };
    } catch(e) {
        console.error("Graph Load Error:", e);
        return { entities: [], relationships: [] };
    }
  }

  // --- 4. CRUD OPERATIONS ---
  async createEntity(entity: Omit<Entity, "id" | "createdAt" | "updatedAt">): Promise<Entity> {
    try {
      const now = new Date().toISOString();
      const query = `CREATE ${TABLES.ENTITY} CONTENT { type: $type, label: $label, properties: $properties, metadata: $metadata, createdAt: $createdAt, updatedAt: $updatedAt }`;
      const result = await this.db.query(query, { type: entity.type, label: entity.label, properties: entity.properties || {}, metadata: entity.metadata || {}, createdAt: now, updatedAt: now });
      // @ts-ignore
      const record = result[0]?.result?.[0];
      return this.mapRecordToEntity(record);
    } catch (error: any) { throw error; }
  }

  // --- FIX 1: ROBUST UPDATE ENTITY ---
  // Fixes the "Failed to save entity" 500 Error
  async updateEntity(id: string, updates: any): Promise<Entity> {
    try {
      // 1. Normalize ID to ensure we target "entity:xyz"
      const clean = cleanId(id);
      const recordId = `${TABLES.ENTITY}:${clean}`;

      // 2. Remove 'id' from the update payload
      // SurrealDB throws an error if you try to "update" the immutable ID field
      const { id: ignoredId, ...cleanUpdates } = updates;
      
      // 3. Add timestamp
      cleanUpdates.updatedAt = new Date().toISOString();

      console.log(`[GraphOps] Updating Entity: ${recordId}`, cleanUpdates);

      const result = await this.db.merge(recordId, cleanUpdates);
      return this.mapRecordToEntity(result);
    } catch (e: any) {
      console.error("[GraphOps] Update Entity Failed:", e);
      throw new Error("Update failed: " + e.message);
    }
  }

  // --- FIX 2: ROBUST DELETE ENTITY ---
  async deleteEntity(id: string): Promise<void> {
    try {
      const clean = cleanId(id);
      const recordId = `${TABLES.ENTITY}:${clean}`;

      // 1. Delete connected edges first (cleanup)
      await this.db.query(`DELETE FROM relationship WHERE from = $id OR to = $id`, { id: recordId });
      
      // 2. Delete the node
      await this.db.delete(recordId);
      console.log(`[GraphOps] Deleted Entity: ${recordId}`);
    } catch (e) {
      console.error("[GraphOps] Delete Entity Failed:", e);
    }
  }

  // --- ROBUST CREATE RELATIONSHIP (Already Fixed) ---
  async createRelationship(from: string, to: string, type: string, properties: any = {}, confidence: number = 1): Promise<Relationship> {
      console.log(`[GraphOps] Creating Relationship: ${from} -> ${type} -> ${to}`);
      
      const now = new Date().toISOString();
      const rawFrom = cleanId(from);
      const rawTo = cleanId(to);
      const relType = type.replace(/\s+/g, '_').toUpperCase();

      await this.db.query(`DEFINE TABLE IF NOT EXISTS ${relType} SCHEMALESS PERMISSIONS FULL`);

      const query = `
        RELATE ${TABLES.ENTITY}:${rawFrom} -> ${relType} -> ${TABLES.ENTITY}:${rawTo}
        CONTENT {
          confidence: $confidence,
          properties: $properties,
          createdAt: $createdAt
        }
        RETURN *;
      `;

      try {
        const result = await this.db.query(query, { confidence, properties, createdAt: now });
        // @ts-ignore
        const record = result[0]?.result?.[0];
        
        if (!record) {
            throw new Error(`Database returned no result. Check if entities exist: ${rawFrom}, ${rawTo}`);
        }
        return this.mapRecordToRelationship(record);
      } catch (e: any) {
        console.error("[GraphOps] Create Relationship Failed:", e);
        throw new Error("DB Error: " + e.message);
      }
  }

  async updateRelationship(id: string, updates: any): Promise<Relationship> {
      const result = await this.db.merge(id, updates);
      return this.mapRecordToRelationship(result);
  }

  async deleteRelationship(id: string): Promise<void> { await this.db.delete(id); }

  async clearAllData() {
    try {
      console.log("[Clear] Starting full database wipe...");
      const info = await this.db.query('INFO FOR DB');
      // @ts-ignore
      const tablesObject = info[0]?.result?.tables || {}; 
      const allTables = Object.keys(tablesObject);
      if (allTables.length === 0) return { deleted: 0 };
      const removeQueries = allTables.map(tableName => `REMOVE TABLE ${tableName};`).join(" ");
      await this.db.query(removeQueries);
      return { success: true, tablesRemoved: allTables };
    } catch (e: any) {
      throw new Error("Failed to clear database: " + e.message);
    }
  }

  async getStats() {
    try {
      const [entityRes, relRes, docRes] = await Promise.all([
        this.db.query('SELECT count() FROM entity GROUP ALL'),
        this.db.query('SELECT count() FROM relationship GROUP ALL'),
        this.db.query('SELECT count() FROM document GROUP ALL')
      ]);
      // @ts-ignore
      const entityCount = entityRes[0]?.result?.[0]?.count || 0;
      // @ts-ignore
      const relCount = relRes[0]?.result?.[0]?.count || 0;
      // @ts-ignore
      const docCount = docRes[0]?.result?.[0]?.count || 0;

      return {
        nodes: entityCount,
        edges: relCount,
        documents: docCount,
        lastUpdated: new Date().toISOString()
      };
    } catch (e) {
      console.error("Stats Error:", e);
      return { nodes: 0, edges: 0, documents: 0 };
    }
  }

  // --- HELPERS ---
  async getAllRelationships(documentId?: string): Promise<Relationship[]> {
    try {
      const info = await this.db.query('INFO FOR DB');
      // @ts-ignore
      const tablesObject = info[0]?.result?.tables || {}; 
      // FIX: Cast to string[] to allow .filter
      const allTableNames = Object.keys(tablesObject) as string[];
      
      const exclude = ["entity", "document", "relationship_def", "data_source_config", "user", "session"];
      const edgeTables = allTableNames.filter(t => !exclude.includes(t));
      if (edgeTables.length === 0) return [];

      let query = `SELECT * FROM ${edgeTables.join(', ')}`;
      if (documentId) query += ` WHERE source = $documentId OR source = '${documentId}'`;
      query += ` ORDER BY createdAt DESC LIMIT ${GRAPH_LIMITS.MAX_EDGES}`; 
      
      const result = await this.db.query(query, { documentId });
      // FIX: Cast to any[] to allow .filter and .map
      const rawRecords = (result[0] as any)?.result || [];
      const records = Array.isArray(rawRecords) ? rawRecords : [];
      
      const validEdges = records.filter((r: any) => (r.in && r.out) || (r.from && r.to));
      return validEdges.map((r: any) => this.mapRecordToRelationship(r));
    } catch (e) { return []; }
  }

  private mapRecordToEntity(r: any): Entity {
    return { id: r.id, type: r.type || "Unknown", label: r.label || r.id, properties: r.properties || r, metadata: r.metadata || {}, createdAt: r.createdAt, updatedAt: r.updatedAt };
  }

  private mapRecordToRelationship(r: any): Relationship {
    return { id: r.id, from: r.from || r.in, to: r.to || r.out, type: r.id ? r.id.split(':')[0] : "Edge", properties: r.properties || {}, confidence: r.confidence, source: r.source, createdAt: r.createdAt };
  }

  private mapRecordToDocument(r: any): Document { 
    return { 
        id: r.id, 
        filename: r.filename, 
        content: r.content, 
        fileType: r.fileType, 
        uploadedAt: r.uploadedAt || r.createdAt || new Date().toISOString(), 
        processedAt: r.processedAt, 
        entityCount: r.entityCount, 
        relationshipCount: r.relationshipCount 
    }; 
  }
  
  // --- FETCH DOCUMENTS ---
  async getAllDocuments(): Promise<Document[]> {
    try {
      if (typeof window !== 'undefined') {
        const response = await fetch('/api/documents');
        if (!response.ok) throw new Error("Failed to fetch documents");
        return await response.json();
      }
      const result = await this.db.query(`SELECT id, filename, fileType, entityCount, relationshipCount, createdAt, processedAt FROM document ORDER BY createdAt DESC`);
      const rawDocs = (result[0] as any)?.result || [];
      const docs = Array.isArray(rawDocs) ? rawDocs : [];
      return docs.map((d: any) => this.mapRecordToDocument(d));
    } catch (e) {
      console.error("[GraphOps] Get Documents Error:", e);
      return [];
    }
  }

  async getEntitiesByDocument(id: string) { return (await this.getGraphData(id)).entities; } 
  async getAllEntities() { return (await this.getGraphData()).entities; }

  async createDocument(data: { filename: string; content: string; fileType: string }) {
    const payload = { 
        filename: data.filename,
        content: data.content,
        fileType: data.fileType,
        entityCount: 0,
        relationshipCount: 0,
        createdAt: new Date().toISOString(),
        processedAt: new Date().toISOString()
    };
    const r = await this.db.create(TABLES.DOCUMENT, payload);
    return this.mapRecordToDocument(r[0]);
  }

  async updateDocument(id: string, u: any) { const r = await this.db.merge(id, u); return this.mapRecordToDocument(r); }
  async getNeighbors(id: string) { return { entities:[], relationships:[] }; }
  async getSubgraph(ids: string[]) { return { entities:[], relationships:[] }; }
  async getEntity(id: string) { return null; }
  async getRelationship(id: string) { return null; }
}

export const graphOps = new GraphOperations();