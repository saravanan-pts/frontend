import { useState, useCallback } from "react";
import { useGraphStore } from "@/lib/store";
import { graphService } from "../services/graphService"; // <--- NOW USES EXTERNAL SERVICE
import type { Entity, Relationship } from "@/types";

export function useGraph() {
  const store = useGraphStore();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const entities = Array.from(store.entities.values());
  const relationships = store.relationships;
  const selectedRelationship = store.selectedRelationship;

  // --- ACTIONS ---

  // 1. Load Graph Data
  const loadGraph = useCallback(async (documentId: string | null) => {
    setIsLoading(true);
    setError(null);
    try {
      const { setEntities, setRelationships } = useGraphStore.getState();
      
      // Call External Backend
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

  // 2. Search
  const searchGraph = async (query: string, type?: string) => {
    try {
      return await graphService.search(query);
    } catch (e: any) {
      throw e;
    }
  };

  // 3. Stats & Analysis
  const getStats = async () => {
    return await graphService.getStats();
  };

  const analyzeGraph = async () => {
    return await graphService.analyze();
  };

  // --- CRUD: ENTITIES ---
  const createEntity = async (e: any) => {
    try {
      const newEntity = await graphService.createNode(e);
      useGraphStore.getState().addEntity(newEntity);
      return newEntity;
    } catch (err) { throw err; }
  };

  const updateEntity = async (id: string, updates: any) => {
    try {
      const updatedEntity = await graphService.updateNode(id, updates);
      useGraphStore.getState().updateEntity(id, updatedEntity);
      return updatedEntity;
    } catch (err) { throw err; }
  };

  const deleteEntity = async (id: string) => {
    try {
      await graphService.deleteNode(id);
      useGraphStore.getState().deleteEntity(id);
    } catch (err) { throw err; }
  };

  // --- CRUD: RELATIONSHIPS ---
  const createRelationship = async (from: string, to: string, type: string, props?: any, confidence?: number) => {
    try {
      const newRel = await graphService.createEdge({ from, to, type, properties: props, confidence });
      useGraphStore.getState().addRelationship(newRel);
      return newRel;
    } catch (err) { throw err; }
  };

  const updateRelationship = async (id: string, updates: any) => {
    try {
      const updatedRel = await graphService.updateEdge(id, updates);
      useGraphStore.getState().updateRelationship(id, updatedRel);
      return updatedRel;
    } catch (err) { throw err; }
  };

  const deleteRelationship = async (id: string) => {
    try {
      await graphService.deleteEdge(id);
      useGraphStore.getState().deleteRelationship(id);
    } catch (err) { throw err; }
  };

  // --- MISC ---
  const selectRelationship = (rel: Relationship | null) => {
    useGraphStore.getState().setSelectedRelationship(rel);
  };

  const getRelationship = async (id: string) => {
    // Optional: Implement fetch single relationship if needed backend-side
    return null; 
  };

  const deleteDocumentByFilename = async (filename: string) => {
    return await graphService.deleteDocument(filename);
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
    analyzeGraph,
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