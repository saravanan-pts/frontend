import { apiClient } from './apiClient';
import type { Entity, Relationship } from '@/types';

export const graphService = {
  // --- SEARCH (Updated to accept 'type') ---
  search: async (query: string, type?: string) => {
    // POST /graph/search
    const payload = { query, type }; 
    const response = await apiClient.post<{ entities: Entity[], relationships: Relationship[] }>('/graph/search', payload);
    return response.data;
  },

  // --- GET GRAPH DATA ---
  getAll: async (documentId?: string | null) => {
    const url = documentId ? `/graph?documentId=${documentId}` : '/graph';
    const response = await apiClient.get<{ entities: Entity[], relationships: Relationship[] }>(url);
    return response.data;
  },

  // --- STATS & ANALYSIS ---
  getStats: async () => {
    const response = await apiClient.get('/graph/stats');
    return response.data;
  },

  analyze: async () => {
    const response = await apiClient.post('/graph/analyze');
    return response.data;
  },

  // --- DOCUMENTS ---
  deleteDocument: async (filename: string) => {
    const response = await apiClient.delete('/documents', { data: { filename } });
    return response.data;
  },

  // --- CRUD: NODES ---
  createNode: async (nodeData: any) => {
    const response = await apiClient.post('/nodes', nodeData);
    return response.data;
  },

  updateNode: async (id: string, nodeData: any) => {
    const response = await apiClient.put(`/nodes/${id}`, nodeData);
    return response.data;
  },

  deleteNode: async (id: string) => {
    const response = await apiClient.delete(`/nodes/${id}`);
    return response.data;
  },

  // --- CRUD: EDGES ---
  createEdge: async (edgeData: any) => {
    const response = await apiClient.post('/edges', edgeData);
    return response.data;
  },

  updateEdge: async (id: string, edgeData: any) => {
    const response = await apiClient.put(`/edges/${id}`, edgeData);
    return response.data;
  },

  deleteEdge: async (id: string) => {
    const response = await apiClient.delete(`/edges/${id}`);
    return response.data;
  }
};