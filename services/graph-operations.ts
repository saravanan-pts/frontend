import { surrealDB } from "@/lib/surrealdb-client";
import { TABLES } from "@/lib/schema";
import type { Entity, Relationship, Document } from "@/types";

export class GraphOperations {
  private get db() {
    return surrealDB.getClient();
  }

  // --- Entity Operations ---
  async createEntity(entity: Omit<Entity, "id" | "createdAt" | "updatedAt">): Promise<Entity> {
    try {
      const now = new Date().toISOString();
      const query = `CREATE ${TABLES.ENTITY} CONTENT { 
        type: $type, label: $label, properties: $properties, 
        metadata: $metadata, createdAt: $createdAt, updatedAt: $updatedAt 
      }`;
      const result = await this.db.query(query, {
        type: entity.type, label: entity.label, properties: entity.properties || {}, 
        metadata: entity.metadata || {}, createdAt: now, updatedAt: now,
      });
      // @ts-ignore
      const record = result[0]?.result?.[0];
      if (!record) throw new Error("Failed to create entity");
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

  // --- GLOBAL VIEW STRATEGY ---
  // Goal: Show the most recent activity from the WHOLE database, not just one file.
  
  async getGraphData() {
    try {
        console.log(`[GraphOps] Loading GLOBAL graph data...`);

        // 1. Fetch Latest 1000 Relationships (GLOBAL)
        // We look at ALL tables, sorted by time.
        const rels = await this.getAllRelationships(); 
        console.log(`[GraphOps] Found ${rels.length} global relationships.`);
        
        // 2. Extract Critical Node IDs
        // These are nodes that MUST be shown because an edge connects to them.
        const criticalNodeIds = new Set<string>();
        rels.forEach(r => {
            if(r.from) criticalNodeIds.add(r.from);
            if(r.to) criticalNodeIds.add(r.to);
        });
        const requiredIds = Array.from(criticalNodeIds);

        // 3. Fetch the Critical Nodes
        let criticalEntities: Entity[] = [];
        if (requiredIds.length > 0) {
            const nodeQuery = `SELECT * FROM ${TABLES.ENTITY} WHERE id IN $ids`;
            const nodeResult = await this.db.query(nodeQuery, { ids: requiredIds });
            // @ts-ignore
            criticalEntities = (nodeResult[0]?.result || []).map(r => this.mapRecordToEntity(r));
        }

        // 4. Fetch "Filler" Nodes (Global)
        // If we haven't hit the 1000 limit yet, fill the rest with the newest unconnected nodes.
        const remainingLimit = 1000 - criticalEntities.length;
        let fillerEntities: Entity[] = [];
        
        if (remainingLimit > 0) {
            let fillerQuery = `SELECT * FROM ${TABLES.ENTITY} WHERE true`; 

            // Exclude nodes we already loaded
            if (requiredIds.length > 0) {
                fillerQuery += ` AND id NOT IN $ids`;
            }
            
            // GLOBAL SORT: Just give me the newest data from anywhere
            fillerQuery += ` ORDER BY updatedAt DESC LIMIT ${remainingLimit}`;
            
            const fillerResult = await this.db.query(fillerQuery, { ids: requiredIds });
            // @ts-ignore
            fillerEntities = (fillerResult[0]?.result || []).map(r => this.mapRecordToEntity(r));
        }

        // 5. Merge & Return
        const allEntities = [...criticalEntities, ...fillerEntities];
        console.log(`[GraphOps] Returning ${allEntities.length} entities and ${rels.length} edges.`);
        
        return { entities: allEntities, relationships: rels };

    } catch(e) {
        console.error("Graph Load Error:", e);
        return { entities: [], relationships: [] };
    }
  }

  // Backwards compatibility
  async getAllEntities(): Promise<Entity[]> {
      const data = await this.getGraphData();
      return data.entities;
  }

  async getAllRelationships(documentId?: string): Promise<Relationship[]> {
    try {
      const info = await this.db.query('INFO FOR DB');
      // @ts-ignore
      const tablesObject = info[0]?.result?.tables || {}; 
      const allTableNames = Object.keys(tablesObject);
      const exclude = ["entity", "document", "relationship_def", "data_source_config", "user", "session"];
      const edgeTables = allTableNames.filter(t => !exclude.includes(t));
      
      if (edgeTables.length === 0) return [];

      console.log(`Scanning all edge tables...`);
      
      let query = `SELECT * FROM ${edgeTables.join(', ')}`;
      
      // OPTIONAL: Only filter by document if explicitly requested (usually not in Global Mode)
      if (documentId) {
          query += ` WHERE source = $documentId OR source = '${documentId}'`;
      }
      
      // Global Limit 1000
      query += ` ORDER BY createdAt DESC LIMIT 1000`; 
      
      const result = await this.db.query(query, { documentId });
      // @ts-ignore
      const records = result[0]?.result || [];
      const validEdges = records.filter((r: any) => (r.in && r.out) || (r.from && r.to));
      return validEdges.map((r: any) => this.mapRecordToRelationship(r));
    } catch (e) { return []; }
  }

  // --- Helpers ---
  private mapRecordToEntity(r: any): Entity {
    return { 
      id: r.id, type: r.type || "Unknown", label: r.label || r.id, 
      properties: r.properties || r, metadata: r.metadata || {}, 
      createdAt: r.createdAt, updatedAt: r.updatedAt 
    };
  }

  private mapRecordToRelationship(r: any): Relationship {
    return { 
      id: r.id, from: r.from || r.in, to: r.to || r.out, 
      type: r.id ? r.id.split(':')[0] : "Edge", 
      properties: r.properties || {}, confidence: r.confidence, source: r.source, createdAt: r.createdAt 
    };
  }

  private mapRecordToDocument(r: any): Document { return { id: r.id, filename: r.filename, content: r.content, fileType: r.fileType, uploadedAt: r.uploadedAt, processedAt: r.processedAt, entityCount: r.entityCount, relationshipCount: r.relationshipCount }; }
  
  async getEntitiesByDocument(id: string) { return (await this.getGraphData()).entities; } 
  async createDocument(d: any) { const payload = { ...d, createdAt: new Date().toISOString(), processedAt: new Date().toISOString(), entityCount: 0, relationshipCount: 0 }; const r = await this.db.create(TABLES.DOCUMENT, payload); return this.mapRecordToDocument(r[0]); }
  async updateDocument(id: string, u: any) { const r = await this.db.merge(id, u); return this.mapRecordToDocument(r); }
  async deleteDocument(id: string) { await this.db.delete(id); }
  async clearAllData() { await this.db.query('DELETE FROM entity; DELETE FROM relationship; DELETE FROM document;'); return { entitiesDeleted:0, relationshipsDeleted:0, documentsDeleted:0 }; }
  async getNeighbors(id: string) { return { entities:[], relationships:[] }; }
  async getSubgraph(ids: string[]) { return { entities:[], relationships:[] }; }
  async searchEntities(q: string) { return []; }
  async createRelationship(f, t, type, p={}, c=1, s="man") { return {} as any; }
  async updateRelationship(id, u) { return {} as any; }
  async deleteRelationship(id) {}
  async getEntity(id) { return null; }
  async getRelationship(id) { return null; }
  async getAllDocuments() { return []; }
}

export const graphOps = new GraphOperations();