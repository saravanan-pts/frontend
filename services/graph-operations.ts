import { surrealDB } from "@/lib/surrealdb-client";
import { TABLES } from "@/lib/schema";
import type { Entity, Relationship, Document } from "@/types";

// PERFORMANCE CONFIGURATION
const GRAPH_LIMITS = {
    INITIAL_NODES: 100, 
    MAX_EDGES: 100
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
          const allTableNames = Object.keys(tablesObject);
          
          const exclude = ["entity", "document", "relationship_def", "data_source_config", "user", "session"];
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
      // @ts-ignore
      const searchHits = (result[0]?.result || []).map(r => this.mapRecordToEntity(r));

      if (searchHits.length === 0) return { entities: [], relationships: [] };

      const hitIds = searchHits.map((e: Entity) => e.id);
      const edgeQuery = `SELECT * FROM relationship WHERE in IN $ids OR out IN $ids LIMIT 100`;
      const edgeResult = await this.db.query(edgeQuery, { ids: hitIds });
      // @ts-ignore
      const relationships = (edgeResult[0]?.result || []).map(r => this.mapRecordToRelationship(r));

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
          // @ts-ignore
          neighbors = (neighborResult[0]?.result || []).map(r => this.mapRecordToEntity(r));
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
            // @ts-ignore
            criticalEntities = (nodeResult[0]?.result || []).map(r => this.mapRecordToEntity(r));
        }

        const remainingLimit = GRAPH_LIMITS.INITIAL_NODES - criticalEntities.length;
        let fillerEntities: Entity[] = [];
        
        if (remainingLimit > 0) {
            let fillerQuery = `SELECT * FROM ${TABLES.ENTITY} WHERE true`; 
            if (documentId) fillerQuery += ` AND metadata.source = $documentId`;
            if (requiredIds.length > 0) fillerQuery += ` AND id NOT IN $ids`;
            fillerQuery += ` ORDER BY updatedAt DESC LIMIT ${remainingLimit}`;
            
            const fillerResult = await this.db.query(fillerQuery, { ids: requiredIds, documentId });
            // @ts-ignore
            fillerEntities = (fillerResult[0]?.result || []).map(r => this.mapRecordToEntity(r));
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

  async updateEntity(id: string, updates: any): Promise<Entity> {
    const result = await this.db.merge(id, updates);
    return this.mapRecordToEntity(result);
  }

  async deleteEntity(id: string): Promise<void> {
    try { await this.db.query(`DELETE FROM ${TABLES.RELATIONSHIP} WHERE from = $id OR to = $id`, { id }); } catch (e) {}
    await this.db.delete(id);
  }

  async createRelationship(from: string, to: string, type: string, properties: any = {}, confidence: number = 1): Promise<Relationship> {
      const now = new Date().toISOString();
      await this.db.query(`DEFINE TABLE IF NOT EXISTS ${type} SCHEMALESS PERMISSIONS FULL`);
      const query = `RELATE $from->$type->$to CONTENT { confidence: $confidence, properties: $properties, createdAt: $createdAt }`;
      const result = await this.db.query(query, { from, to, type, confidence, properties, createdAt: now });
      // @ts-ignore
      const record = result[0]?.result?.[0];
      return this.mapRecordToRelationship(record);
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
      const allTableNames = Object.keys(tablesObject);
      const exclude = ["entity", "document", "relationship_def", "data_source_config", "user", "session"];
      const edgeTables = allTableNames.filter(t => !exclude.includes(t));
      if (edgeTables.length === 0) return [];

      let query = `SELECT * FROM ${edgeTables.join(', ')}`;
      if (documentId) query += ` WHERE source = $documentId OR source = '${documentId}'`;
      query += ` ORDER BY createdAt DESC LIMIT ${GRAPH_LIMITS.MAX_EDGES}`; 
      
      const result = await this.db.query(query, { documentId });
      // @ts-ignore
      const records = result[0]?.result || [];
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
        // FIX: Fallback to createdAt if uploadedAt is missing to prevent frontend crashes
        uploadedAt: r.uploadedAt || r.createdAt || new Date().toISOString(), 
        processedAt: r.processedAt, 
        entityCount: r.entityCount, 
        relationshipCount: r.relationshipCount 
    }; 
  }
  
  // --- FIX: FETCH FROM API ---
  async getAllDocuments(): Promise<Document[]> {
    try {
      // 1. If running in the browser, fetch from the Next.js API
      if (typeof window !== 'undefined') {
        const response = await fetch('/api/documents');
        if (!response.ok) throw new Error("Failed to fetch documents");
        return await response.json();
      }

      // 2. If running server-side, query DB directly
      const result = await this.db.query(`
        SELECT 
          id, filename, fileType, entityCount, relationshipCount, 
          createdAt, processedAt 
        FROM document 
        ORDER BY createdAt DESC
      `);
      
      // @ts-ignore
      const docs = result[0]?.result || [];
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