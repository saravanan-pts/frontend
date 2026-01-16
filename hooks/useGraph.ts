"use client";

import { useCallback, useState } from "react";
import { useGraphStore } from "@/lib/store";
import type { Entity, Relationship } from "@/types";

// Ensure we target the Backend (Port 8000), not the Frontend (Port 3000)
// If NEXT_PUBLIC_API_URL is not set in .env, we default to localhost:8000
const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export function useGraph() {
  const {
    entities,
    relationships,
    selectedEntity,
    selectedRelationship,
    setEntities,
    setRelationships,
    addEntity, updateEntity, deleteEntity,
    addRelationship, updateRelationship, deleteRelationship,
    setSelectedEntity, setSelectedRelationship,
    setLoading,
  } = useGraphStore();

  const [isLoading, setIsLoading] = useState(false);

  // --- DATA SANITIZER ---
  const sanitizeData = (rawNodes: any[], rawEdges: any[]) => {
    // Helper to clean IDs
    const cleanId = (val: any): string => {
      if (!val) return "";
      // Handle objects being passed as IDs (common in some DB responses)
      if (typeof val === 'object' && val !== null) {
        return String(val.id || val["T.id"] || JSON.stringify(val)).replace(/['"\[\]\s]/g, "").toLowerCase().trim();
      }
      return String(val).replace(/['"\[\]\s]/g, "").toLowerCase().trim();
    };

    // Process Nodes
    const cleanNodes = rawNodes
      .map((n: any) => {
        const id = cleanId(n);
        const label = String(n.label || n["T.label"] || "node").replace(/['"\[\]]/g, "");
        
        const props: any = {};
        const sourceObj = n.properties || n;
        if (sourceObj && typeof sourceObj === 'object') {
          Object.keys(sourceObj).forEach(k => {
              if (!['id', 'label', 'T.id', 'T.label'].includes(k)) {
                 const val = sourceObj[k];
                 props[k] = Array.isArray(val) ? val[0] : val;
              }
          });
        }

        return {
          id,
          label,
          type: label,
          properties: props,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        } as Entity;
      })
      .filter(n => {
        // Filter out invalid IDs
        if (!n.id || n.id === "manual" || n.id === "null" || n.id === "undefined" || n.id === "[objectobject]") return false;
        return true;
      });

    const validNodeIds = new Set(cleanNodes.map(n => n.id));

    // Process Edges
    const cleanEdges: Relationship[] = [];
    let dropped = 0;

    rawEdges.forEach((e: any) => {
      const id = cleanId(e) || `rel-${Math.random()}`;
      const from = cleanId(e.from || e.outV);
      const to = cleanId(e.to || e.inV);
      const label = String(e.label || e["T.label"] || "related_to").replace(/['"\[\]]/g, "");

      if (validNodeIds.has(from) && validNodeIds.has(to)) {
        cleanEdges.push({
          id,
          from,
          to,
          type: label,
          properties: e.properties || {},
          confidence: 1.0,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        } as Relationship);
      } else {
        dropped++;
      }
    });

    console.log(`[Sanitizer] Raw Nodes: ${rawNodes.length} -> Clean: ${cleanNodes.length}`);
    console.log(`[Sanitizer] Raw Edges: ${rawEdges.length} -> Clean: ${cleanEdges.length} (Dropped: ${dropped})`);
    
    return { cleanNodes, cleanEdges };
  };

  // --- LOAD GRAPH ---
  const loadGraph = useCallback(async (documentId?: string | null) => {
    setLoading(true);
    setIsLoading(true);
    
    try {
      const url = `${API_URL}/api/graph/fetch`;
      console.log(`[API] Requesting: POST ${url}`);

      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ document_id: documentId }),
      });
      
      if (!response.ok) {
        throw new Error(`Backend Error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      const rawNodes = data.nodes || data.entities || [];
      const rawEdges = data.edges || data.relationships || [];

      if (rawNodes.length === 0) {
        console.warn("[API] Backend returned 0 nodes. Graph is empty.");
        setEntities([]);
        setRelationships([]);
      } else {
        const { cleanNodes, cleanEdges } = sanitizeData(rawNodes, rawEdges);
        setEntities(cleanNodes);
        setRelationships(cleanEdges);
      }

    } catch (error: any) {
      console.error("[API] Load failed:", error);
    } finally {
      setLoading(false);
      setIsLoading(false);
    }
  }, [setEntities, setRelationships, setLoading]);

  // --- SEARCH & ACTIONS ---
  const analyzeGraph = useCallback(async () => { return {}; }, []);

  const searchGraph = useCallback(async (query: string) => {
      try {
        const response = await fetch(`${API_URL}/api/graph/search`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: query })
        });
        if (!response.ok) throw new Error("Search failed");
        return await response.json();
      } catch(e) {
        console.error(e);
        return { entities: [], relationships: [] };
      }
  }, []);

  // --- STORE STUBS ---
  const createEntity = useCallback(async (e: any) => e, []);
  const updateEntityById = useCallback(async (id: string, u: any) => { updateEntity(id, u); return u; }, [updateEntity]);
  const removeEntity = useCallback(async (id: string) => { deleteEntity(id); }, [deleteEntity]);
  const createRelationship = useCallback(async (from: string, to: string, type: string, properties?: any, confidence?: number) => { 
      return { id: "temp", from, to, type, properties: properties || {}, confidence: confidence || 1 } as Relationship; 
  }, []);
  const updateRelationshipById = useCallback(async (id: string, u: any) => { updateRelationship(id, u as any); return u; }, [updateRelationship]);
  const removeRelationship = useCallback(async (id: string) => { deleteRelationship(id); }, [deleteRelationship]);
  const getRelationshipById = useCallback(async (id: string) => relationships.find(r => r.id === id) || null, [relationships]);
  const getNeighbors = useCallback(async () => ({ nodes: [], edges: [] }), []);

  return {
    entities: Array.from(entities.values()),
    relationships,
    selectedEntity, selectedRelationship,
    loadGraph, 
    analyzeGraph,
    searchGraph, 
    createEntity, updateEntity: updateEntityById, deleteEntity: removeEntity,
    createRelationship, updateRelationship: updateRelationshipById, deleteRelationship: removeRelationship,
    getRelationship: getRelationshipById, 
    getNeighbors,
    selectEntity: setSelectedEntity, selectRelationship: setSelectedRelationship,
    isLoading 
  };
}