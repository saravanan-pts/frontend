"use client";

import { useCallback, useState } from "react";
import { useGraphStore } from "@/lib/store";
import type { Entity, Relationship } from "@/types";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

// --- CONFIGURATION: Define your Entity Categories here ---
const ENTITY_CATEGORIES: Record<string, string> = {
  // Map specific backend labels to cleaner UI types
  "person": "Person",
  "people": "Person",
  "org": "Organization",
  "company": "Organization",
  "loc": "Location",
  "place": "Location",
  "doc": "Document",
  "file": "Document",
  // Add more mappings as needed based on your data
};

const classifyNode = (rawLabel: string): string => {
  const lower = rawLabel.toLowerCase();
  // 1. Check exact map
  if (ENTITY_CATEGORIES[lower]) return ENTITY_CATEGORIES[lower];
  
  // 2. Heuristic: Capitalize first letter if no match found
  return lower.charAt(0).toUpperCase() + lower.slice(1);
};

export function useGraph() {
  const {
    entities, relationships, selectedEntity, selectedRelationship,
    setEntities, setRelationships,
    addEntity, updateEntity, deleteEntity,
    addRelationship, updateRelationship, deleteRelationship,
    setSelectedEntity, setSelectedRelationship, setLoading,
  } = useGraphStore();

  const [isLoading, setIsLoading] = useState(false);

  // --- DATA SANITIZER ---
  const sanitizeData = (rawNodes: any[], rawEdges: any[]) => {
    const cleanId = (val: any): string => {
      if (!val) return "";
      if (typeof val === 'object' && val !== null) {
        return String(val.id || val["T.id"] || JSON.stringify(val)).replace(/['"\[\]\s]/g, "").toLowerCase().trim();
      }
      return String(val).replace(/['"\[\]\s]/g, "").toLowerCase().trim();
    };

    // Process Nodes
    const cleanNodes = rawNodes
      .map((n: any) => {
        const id = cleanId(n);
        let rawLabel = String(n.label || n["T.label"] || "node").replace(/['"\[\]]/g, "");
        
        // --- NEW: CLASSIFY ENTITY TYPE ---
        // If the backend stores the "Name" as the "Label", we try to detect a better type
        // logic: If label looks like a generic ID, keep it. Otherwise, clean it.
        const type = classifyNode(rawLabel);

        const props: any = {};
        const sourceObj = n.properties || n;
        if (sourceObj && typeof sourceObj === 'object') {
          Object.keys(sourceObj).forEach(k => {
              if (!['id', 'label', 'T.id', 'T.label', 'source', 'target'].includes(k)) {
                 const val = sourceObj[k];
                 props[k] = Array.isArray(val) ? val[0] : val;
              }
          });
        }

        return {
          id,
          label: rawLabel, // Keep original label for search
          type: type,      // Use cleaned type for Filters/Colors
          properties: props,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        } as Entity;
      })
      .filter(n => n.id && n.id !== "manual" && n.id !== "null" && n.id !== "undefined");

    const validNodeIds = new Set(cleanNodes.map(n => n.id));

    // Process Edges
    const cleanEdges: Relationship[] = [];
    let dropped = 0;

    rawEdges.forEach((e: any) => {
      const id = cleanId(e) || `rel-${Math.random()}`;
      const from = cleanId(e.source || e.from || e.outV);
      const to = cleanId(e.target || e.to || e.inV);
      const label = String(e.label || e["T.label"] || "related_to").replace(/['"\[\]]/g, "");

      if (validNodeIds.has(from) && validNodeIds.has(to)) {
        cleanEdges.push({
          id, from, to, type: label,
          properties: e.properties || {},
          confidence: 1.0,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        } as Relationship);
      } else { dropped++; }
    });

    console.log(`[Sanitizer] Nodes: ${cleanNodes.length}, Edges: ${cleanEdges.length} (Dropped: ${dropped})`);
    return { cleanNodes, cleanEdges };
  };

  // --- LOAD GRAPH ---
  const loadGraph = useCallback(async (documentId?: string | null) => {
    setLoading(true); setIsLoading(true);
    try {
      const url = `${API_URL}/api/graph/fetch`;
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ document_id: documentId }),
      });
      if (!response.ok) throw new Error(`Backend Error: ${response.status}`);

      const data = await response.json();
      const rawNodes = data.nodes || data.entities || [];
      const rawEdges = data.edges || data.relationships || [];

      const { cleanNodes, cleanEdges } = sanitizeData(rawNodes, rawEdges);
      setEntities(cleanNodes);
      setRelationships(cleanEdges);

    } catch (error: any) {
      console.error("[API] Load failed:", error);
      // Fallback: Clear graph on error so UI doesn't hang
      // setEntities([]); setRelationships([]);
    } finally {
      setLoading(false); setIsLoading(false);
    }
  }, [setEntities, setRelationships, setLoading]);

  // --- SEARCH & ACTIONS (Kept Intact) ---
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
      } catch(e) { console.error(e); return { entities: [], relationships: [] }; }
  }, []);

  // --- STORE STUBS (Kept Intact) ---
  const createEntity = useCallback(async (e: any) => e, []);
  const updateEntityById = useCallback(async (id: string, u: any) => { updateEntity(id, u); return u; }, [updateEntity]);
  const removeEntity = useCallback(async (id: string) => { deleteEntity(id); }, [deleteEntity]);
  const createRelationship = useCallback(async (from: string, to: string, type: string, p?: any, c?: number) => { 
      return { id: "temp", from, to, type, properties: p || {}, confidence: c || 1 } as Relationship; 
  }, []);
  const updateRelationshipById = useCallback(async (id: string, u: any) => { updateRelationship(id, u as any); return u; }, [updateRelationship]);
  const removeRelationship = useCallback(async (id: string) => { deleteRelationship(id); }, [deleteRelationship]);
  const getRelationshipById = useCallback(async (id: string) => relationships.find(r => r.id === id) || null, [relationships]);
  const getNeighbors = useCallback(async () => ({ nodes: [], edges: [] }), []);

  return {
    entities: Array.from(entities.values()), relationships, selectedEntity, selectedRelationship,
    loadGraph, analyzeGraph, searchGraph, 
    createEntity, updateEntity: updateEntityById, deleteEntity: removeEntity,
    createRelationship, updateRelationship: updateRelationshipById, deleteRelationship: removeRelationship,
    getRelationship: getRelationshipById, getNeighbors,
    selectEntity: setSelectedEntity, selectRelationship: setSelectedRelationship, isLoading 
  };
}