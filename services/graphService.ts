import { apiClient } from './apiClient';
import type { Entity, Relationship } from '@/types';

export const graphService = {
  // --- 1. LOAD GRAPH (Matches your graph.py: GET /graph/fetch) ---
  getAll: async (documentId?: string | null) => {
    try {
      // Your main.py has prefix="/graph", and graph.py has @router.get("/fetch")
      const response = await apiClient.get('/graph/fetch');
      
      const data = response.data;
      if (data.success === false) {
        throw new Error(data.error || "Backend failed to fetch graph");
      }

      return {
        entities: data.entities || [], 
        relationships: data.relationships || []
      };
    } catch (error) {
      console.error("Fetch Graph Error:", error);
      return { entities: [], relationships: [] };
    }
  },

  // --- 2. SEARCH (Backend missing this, so we return null to trigger Client-Side fallback) ---
  search: async (query: string) => {
    // There is no /graph/search endpoint in your file.
    return null; 
  },

  // --- 3. STATS (Backend missing this, so we return null) ---
  getStats: async () => {
    // There is no /graph/stats endpoint in your file.
    return null;
  },

  // --- 4. ANALYZE (Backend missing this) ---
  analyze: async () => {
    return { result: "Analysis not supported on this backend version." };
  },

  // --- 5. DOCUMENTS (Matches 'clear' router in main.py) ---
  deleteDocument: async (filename: string) => {
    // Guessing standard naming: POST /clear/document
    const response = await apiClient.post('/clear/document', { filename });
    return response.data;
  },

  // --- 6. ENTITY CRUD (Matches prefix="/entities" in main.py) ---
  createNode: async (nodeData: any) => {
    const response = await apiClient.post('/entities', nodeData);
    return response.data;
  },

  updateNode: async (id: string, nodeData: any) => {
    const response = await apiClient.put(`/entities/${id}`, nodeData);
    return response.data;
  },

  deleteNode: async (id: string) => {
    const response = await apiClient.delete(`/entities/${id}`);
    return response.data;
  },

  // --- 7. RELATIONSHIP CRUD (Matches prefix="/relationships" in main.py) ---
  createEdge: async (edgeData: any) => {
    const response = await apiClient.post('/relationships', edgeData);
    return response.data;
  },

  updateEdge: async (id: string, edgeData: any) => {
    const response = await apiClient.put(`/relationships/${id}`, edgeData);
    return response.data;
  },

  deleteEdge: async (id: string) => {
    const response = await apiClient.delete(`/relationships/${id}`);
    return response.data;
  }
};