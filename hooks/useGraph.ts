import { useState, useCallback } from "react";
import { useGraphStore } from "@/lib/store";
import { graphService } from "../services/graphService";
import type { Entity, Relationship } from "@/types";

export function useGraph() {
  const store = useGraphStore();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const entities = Array.from(store.entities.values());
  const relationships = store.relationships;
  const selectedRelationship = store.selectedRelationship;

  // --- 1. LOAD DATA ---
  const loadGraph = useCallback(async (documentId: string | null) => {
    setIsLoading(true);
    setError(null);
    try {
      const { setEntities, setRelationships } = useGraphStore.getState();
      
      // Call the API (GET /graph/fetch)
      const data = await graphService.getAll(documentId);
      
      setEntities(data.entities || []);
      setRelationships(data.relationships || []);
    } catch (err: any) {
      console.error("Failed to load graph:", err);
      setError(err.message || "Failed to load graph");
    } finally {
      setIsLoading(false);
    }
  }, []);

  const refresh = useCallback(() => {
    loadGraph(null);
  }, [loadGraph]);

  // --- 2. SEARCH (Client-Side Logic) ---
  const searchGraph = async (query: string, type?: string) => {
    // Since backend has no search, we filter what we already downloaded
    const lowerQuery = query.toLowerCase();
    const allEntities = Array.from(useGraphStore.getState().entities.values());
    
    // Filter locally
    const filtered = allEntities.filter(node => 
      node.label?.toLowerCase().includes(lowerQuery) ||
      JSON.stringify(node.properties).toLowerCase().includes(lowerQuery)
    );

    return { entities: filtered, relationships: [] };
  };

  // --- 3. STATS (Client-Side Logic) ---
  const getStats = async () => {
    // Simply count the data in the store
    const store = useGraphStore.getState();
    return {
        nodeCount: store.entities.size,
        edgeCount: store.relationships.length,
        // Add fake stats if UI needs them
        density: 0,
        communities: 0
    };
  };

  const analyzeGraph = async () => {
    return await graphService.analyze();
  };

  // --- CRUD WRAPPERS ---
  const createEntity = async (e: any) => {
    const newEntity = await graphService.createNode(e);
    useGraphStore.getState().addEntity(newEntity);
    return newEntity;
  };

  const updateEntity = async (id: string, u: any) => {
    const updatedEntity = await graphService.updateNode(id, u);
    useGraphStore.getState().updateEntity(id, updatedEntity);
    return updatedEntity;
  };

  const deleteEntity = async (id: string) => {
    await graphService.deleteNode(id);
    useGraphStore.getState().deleteEntity(id);
  };

  const createRelationship = async (from: string, to: string, type: string, p?: any, c?: number) => {
    const newRel = await graphService.createEdge({ from, to, type, properties: p, confidence: c });
    useGraphStore.getState().addRelationship(newRel);
    return newRel;
  };

  const updateRelationship = async (id: string, u: any) => {
    const updatedRel = await graphService.updateEdge(id, u);
    useGraphStore.getState().updateRelationship(id, updatedRel);
    return updatedRel;
  };

  const deleteRelationship = async (id: string) => {
    await graphService.deleteEdge(id);
    useGraphStore.getState().deleteRelationship(id);
  };

  const selectRelationship = (rel: Relationship | null) => {
    useGraphStore.getState().setSelectedRelationship(rel);
  };

  const getRelationship = async (id: string) => { return null; };
  
  const deleteDocumentByFilename = async (filename: string) => {
    return await graphService.deleteDocument(filename);
  };

  return {
    entities, relationships, selectedRelationship, isLoading, error,
    loadGraph, refresh, searchGraph, getStats, analyzeGraph,
    createEntity, updateEntity, deleteEntity,
    createRelationship, updateRelationship, deleteRelationship,
    getRelationship, selectRelationship, deleteDocumentByFilename
  };
}