import { useState, useCallback } from "react";
import { useGraphStore } from "@/lib/store";
import type { Entity, Relationship } from "@/types";

export function useGraph() {
  const store = useGraphStore();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const entities = Array.from(store.entities.values());
  const relationships = store.relationships;
  const selectedRelationship = store.selectedRelationship;

  // --- SMART API ROUTER ---
  // This directs every request to the correct specific API file
  const callApi = async (action: string, payload: any = {}) => {
    
    // Map actions to their new specific file locations
    const endpoints: Record<string, string> = {
        // Search & Load
        "search": "/api/graph/search",
        "getGraphData": "/api/graph/fetch",
        "getStats": "/api/graph/stats",
        
        // Nodes (Entities)
        "createEntity": "/api/graph/entity",
        "updateEntity": "/api/graph/entity",
        "deleteEntity": "/api/graph/entity",
        
        // Edges (Relationships)
        "createRelationship": "/api/graph/relationship",
        "updateRelationship": "/api/graph/relationship",
        "deleteRelationship": "/api/graph/relationship",
        
        // Documents (Files)
        "deleteDocument": "/api/graph/document",
        "deleteDocumentByFilename": "/api/graph/document"
    };

    const url = endpoints[action];
    if (!url) throw new Error(`Unknown action: ${action}`);

    try {
      let res;
      
      // Special handling for GET requests (Stats)
      if (action === "getStats") {
        res = await fetch(url, {
             method: "GET",
             headers: { "Content-Type": "application/json" }
        });
      } else {
        // Standard POST requests for everything else
        res = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action, payload }),
        });
      }

      const data = await res.json();
      
      if (!res.ok) {
        throw new Error(data.error || `API Error: ${res.statusText}`);
      }
      
      return data;
    } catch (e: any) {
      console.error(`[API] Failed to execute ${action} at ${url}:`, e);
      throw e;
    }
  };

  // --- ACTIONS ---

  // 1. LOAD GRAPH (Stable - No Infinite Loop)
  const loadGraph = useCallback(async (documentId: string | null) => {
    setIsLoading(true);
    setError(null);
    try {
      // Use getState() to safely access setters
      const { setEntities, setRelationships } = useGraphStore.getState();
      
      const data = await callApi("getGraphData", { documentId });
      
      setEntities(data.entities || []);
      setRelationships(data.relationships || []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const refresh = useCallback(() => { loadGraph(null); }, [loadGraph]);

  // 2. SEARCH
  const searchGraph = async (query: string, type?: string) => {
      // Calls /api/graph/search
      return await callApi("search", { query, type });
  };

  // 3. STATS
  const getStats = async () => {
      // Calls /api/graph/stats
      return await callApi("getStats");
  };

  // 4. ENTITY CRUD
  const createEntity = async (e: any) => { 
      const n = await callApi("createEntity", e); 
      useGraphStore.getState().addEntity(n); 
      return n; 
  };
  
  const updateEntity = async (id: string, updates: any) => { 
      const n = await callApi("updateEntity", { id, updates }); 
      useGraphStore.getState().updateEntity(id, n); 
      return n; 
  };
  
  const deleteEntity = async (id: string) => { 
      await callApi("deleteEntity", { id }); 
      useGraphStore.getState().deleteEntity(id); 
  };

  // 5. RELATIONSHIP CRUD
  const createRelationship = async (from: string, to: string, type: string, p?: any, c?: number) => { 
      const r = await callApi("createRelationship", { from, to, type, properties: p, confidence: c }); 
      useGraphStore.getState().addRelationship(r); 
      return r; 
  };

  const updateRelationship = async (id: string, u: any) => { 
      const r = await callApi("updateRelationship", { id, updates: u }); 
      useGraphStore.getState().updateRelationship(id, r); 
      return r; 
  };

  const deleteRelationship = async (id: string) => { 
      await callApi("deleteRelationship", { id }); 
      useGraphStore.getState().deleteRelationship(id); 
  };

  // 6. HELPER ACTIONS
  const selectRelationship = (rel: Relationship | null) => { 
      useGraphStore.getState().setSelectedRelationship(rel); 
  };
  
  const getRelationship = async (id: string) => { return null; };

  // New: Document Deletion Helper
  const deleteDocumentByFilename = async (filename: string) => {
      return await callApi("deleteDocumentByFilename", { filename });
  };

  return {
    entities, 
    relationships, 
    selectedRelationship, 
    isLoading, 
    error,
    loadGraph, 
    refresh, 
    searchGraph, 
    getStats,
    createEntity, 
    updateEntity, 
    deleteEntity,
    createRelationship, 
    updateRelationship, 
    deleteRelationship,
    getRelationship, 
    selectRelationship,
    deleteDocumentByFilename 
  };
}