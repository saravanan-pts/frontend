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
  const callApi = async (action: string, payload: any = {}) => {
    const endpoints: Record<string, string> = {
        "search": "/api/graph/search",
        "getGraphData": "/api/graph/fetch",
        "getStats": "/api/graph/stats",
        "createEntity": "/api/graph/entity",
        "updateEntity": "/api/graph/entity",
        "deleteEntity": "/api/graph/entity",
        "createRelationship": "/api/graph/relationship",
        "updateRelationship": "/api/graph/relationship",
        "deleteRelationship": "/api/graph/relationship",
        "deleteDocument": "/api/graph/document",
        "deleteDocumentByFilename": "/api/graph/document",
        
        // --- NEW ENDPOINT (Use the unique path) ---
        "analyze": "/api/graph/analyze", 
    };

    const url = endpoints[action];
    if (!url) throw new Error(`Unknown action: ${action}`);

    try {
      let res;
      if (action === "getStats") {
        res = await fetch(url, { method: "GET" });
      } else if (action === "analyze") {
        res = await fetch(url, { method: "POST" });
      } else {
        res = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action, payload }),
        });
      }

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `API Error: ${res.statusText}`);
      return data;
    } catch (e: any) {
      console.error(`[API] Failed to execute ${action} at ${url}:`, e);
      throw e;
    }
  };

  // --- ACTIONS ---
  const loadGraph = useCallback(async (documentId: string | null) => {
    setIsLoading(true);
    setError(null);
    try {
      const { setEntities, setRelationships } = useGraphStore.getState();
      const data = await callApi("getGraphData", { documentId });
      setEntities(data.entities || []);
      setRelationships(data.relationships || []);
    } catch (err: any) { setError(err.message); } 
    finally { setIsLoading(false); }
  }, []);

  const refresh = useCallback(() => { loadGraph(null); }, [loadGraph]);
  const searchGraph = async (query: string, type?: string) => { return await callApi("search", { query, type }); };
  const getStats = async () => { return await callApi("getStats"); };
  
  // --- NEW EXPORT ---
  const analyzeGraph = async () => { return await callApi("analyze"); };

  const createEntity = async (e: any) => { const n = await callApi("createEntity", e); useGraphStore.getState().addEntity(n); return n; };
  const updateEntity = async (id: string, u: any) => { const n = await callApi("updateEntity", { id, updates: u }); useGraphStore.getState().updateEntity(id, n); return n; };
  const deleteEntity = async (id: string) => { await callApi("deleteEntity", { id }); useGraphStore.getState().deleteEntity(id); };

  const createRelationship = async (from: string, to: string, type: string, p?: any, c?: number) => { const r = await callApi("createRelationship", { from, to, type, properties: p, confidence: c }); useGraphStore.getState().addRelationship(r); return r; };
  const updateRelationship = async (id: string, u: any) => { const r = await callApi("updateRelationship", { id, updates: u }); useGraphStore.getState().updateRelationship(id, r); return r; };
  const deleteRelationship = async (id: string) => { await callApi("deleteRelationship", { id }); useGraphStore.getState().deleteRelationship(id); };

  const selectRelationship = (rel: Relationship | null) => { useGraphStore.getState().setSelectedRelationship(rel); };
  const getRelationship = async (id: string) => { return null; };
  const deleteDocumentByFilename = async (filename: string) => { return await callApi("deleteDocumentByFilename", { filename }); };

  return {
    entities, relationships, selectedRelationship, isLoading, error,
    loadGraph, refresh, searchGraph, getStats, analyzeGraph, // <--- Exported
    createEntity, updateEntity, deleteEntity,
    createRelationship, updateRelationship, deleteRelationship,
    getRelationship, selectRelationship, deleteDocumentByFilename 
  };
}