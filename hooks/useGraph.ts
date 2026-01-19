"use client";

import { useCallback, useState } from "react";
import { useGraphStore } from "@/lib/store";
import { toast } from "react-hot-toast";
import type { Entity, Relationship } from "@/types";

import { API_URL } from "@/lib/constants";

export function useGraph() {
  const {
    entities, relationships, selectedEntity, selectedRelationship,
    setEntities, setRelationships,
    addEntity, updateEntity, deleteEntity,
    addRelationship, updateRelationship, deleteRelationship,
    setSelectedEntity, setSelectedRelationship, setLoading,
  } = useGraphStore();

  const [isLoading, setIsLoading] = useState(false);

  // --- DATA SANITIZER (Simplified) ---
  const sanitizeData = (rawNodes: any[], rawEdges: any[]) => {
    const cleanId = (val: any): string => {
      if (!val) return "";
      return String(val.id || val || "").replace(/['"\[\]\s]/g, "").trim();
    };

    // Process Nodes
    const cleanNodes = rawNodes.map((n: any) => {
      const id = cleanId(n);
      
      // 1. TRUST THE BACKEND TYPE
      // The backend 'normalizer.py' now handles the classification. 
      // We just use what it sends.
      const type = n.type || n.label || "Concept"; 

      return {
        id,
        label: n.label || id,
        type: type, 
        properties: n.properties || {},
      } as Entity;
    }).filter(n => n.id);

    const validNodeIds = new Set(cleanNodes.map(n => n.id));

    // Process Edges
    const cleanEdges: Relationship[] = [];
    rawEdges.forEach((e: any) => {
      const id = cleanId(e) || `rel-${Math.random()}`;
      const from = cleanId(e.source || e.from);
      const to = cleanId(e.target || e.to);
      const label = e.label || e.type || "related_to";

      if (validNodeIds.has(from) && validNodeIds.has(to)) {
        cleanEdges.push({
          id, from, to, type: label,
          properties: e.properties || {},
        } as Relationship);
      }
    });

    return { cleanNodes, cleanEdges };
  };

  // --- 1. LOAD GRAPH (API) ---
  const loadGraph = useCallback(async (filters?: object | null) => {
    setLoading(true); setIsLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/graph/fetch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filters: filters || {} }),
      });
      
      if (!res.ok) throw new Error("Failed to fetch graph");
      
      const data = await res.json();
      // Handle various response structures
      const rawNodes = data.entities || data.nodes || [];
      const rawEdges = data.relationships || data.edges || [];
      
      const { cleanNodes, cleanEdges } = sanitizeData(rawNodes, rawEdges);
      
      setEntities(cleanNodes);
      setRelationships(cleanEdges);
    } catch (error) {
      console.error(error);
      toast.error("Failed to load graph");
    } finally {
      setLoading(false); setIsLoading(false);
    }
  }, [setEntities, setRelationships, setLoading]);

  // --- NEW: CLEAR GRAPH FUNCTION ---
  const clearGraph = useCallback(async () => {
    setLoading(true);
    try {
        // Explicitly sending scope to match backend expectation
        const res = await fetch(`${API_URL}/clear`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ scope: "all" }),
        });
        
        if (res.ok) {
            toast.success("Graph cleared successfully");
            await loadGraph(null); // Reload empty state
        } else {
            throw new Error("Clear failed");
        }
    } catch (error) {
        console.error(error);
        toast.error("Failed to clear graph");
    } finally {
        setLoading(false);
    }
  }, [loadGraph, setLoading]);

  // --- 2. SEARCH (API) ---
  const searchGraph = useCallback(async (query: string) => {
    try {
      const res = await fetch(`${API_URL}/api/graph/search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, limit: 10 }),
      });
      if (!res.ok) throw new Error("Search failed");
      return await res.json();
    } catch (error) {
      console.error(error);
      return { entities: [], relationships: [] };
    }
  }, []);

  // --- 3. ANALYZE (API) ---
  const analyzeGraph = useCallback(async (type: 'shortest_path' | 'community_detection', params: any = {}) => {
    try {
      const res = await fetch(`${API_URL}/api/graph/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, params }),
      });
      if (!res.ok) throw new Error("Analysis failed");
      const data = await res.json();
      return data.result;
    } catch (error) {
      toast.error("Analysis failed");
    }
  }, []);

  // --- 4. ENTITY CRUD (API) ---
  const createEntityApi = useCallback(async (data: any) => {
    try {
      await fetch(`${API_URL}/api/graph/entity`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: "create", data }),
      });
      addEntity(data); // Optimistic Update
      return true;
    } catch (e) { toast.error("Create failed"); }
  }, [addEntity]);

  const updateEntityApi = useCallback(async (id: string, data: any) => {
    try {
      await fetch(`${API_URL}/api/graph/entity`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: "update", data: { ...data, id } }),
      });
      updateEntity(id, data);
      return data;
    } catch (e) { toast.error("Update failed"); }
  }, [updateEntity]);

  const deleteEntityApi = useCallback(async (id: string) => {
    try {
      await fetch(`${API_URL}/api/graph/entity`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: "delete", data: { id } }),
      });
      deleteEntity(id);
    } catch (e) { toast.error("Delete failed"); }
  }, [deleteEntity]);

  // --- 5. RELATIONSHIP CRUD (API) ---
  const createRelationshipApi = useCallback(async (from: string, to: string, type: string, props: any = {}) => {
    try {
      const data = { source: from, target: to, label: type, properties: props };
      await fetch(`${API_URL}/api/graph/relationship`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: "create", data }),
      });
      await loadGraph(); // Reload to get valid edge ID
      return true;
    } catch (e) { toast.error("Create edge failed"); }
  }, [loadGraph]);

  // Helpers
  const getRelationshipById = useCallback((id: string) => relationships.find(r => r.id === id) || null, [relationships]);
  const getNeighbors = useCallback(async () => ({ nodes: [], edges: [] }), []); // Stub for now

  return {
    // Data
    entities: Array.from(entities.values()), 
    relationships, 
    selectedEntity, 
    selectedRelationship,
    isLoading,
    
    // Actions
    loadGraph, 
    searchGraph, 
    analyzeGraph,
    clearGraph, // Exported this
    
    // CRUD
    createEntity: createEntityApi, 
    updateEntity: updateEntityApi, 
    deleteEntity: deleteEntityApi,
    createRelationship: createRelationshipApi, 
    updateRelationship: () => {}, 
    deleteRelationship: deleteRelationship, // Can implement delete API if needed
    
    // UI state
    getRelationship: getRelationshipById, 
    getNeighbors,
    selectEntity: setSelectedEntity, 
    selectRelationship: setSelectedRelationship
  };
}