"use client";

import { useEffect, useState, useCallback } from "react";
// IMPORT THE STORE to control the UI
import { useGraphStore } from "@/lib/store";

export function useBackend() {
  const [isConnected, setIsConnected] = useState(false);
  const [stats, setStats] = useState({ nodes: 0, edges: 0 });
  const [isProcessing, setIsProcessing] = useState(false);

  // Access the store actions
  const { setEntities, setRelationships } = useGraphStore();

  // This is the only URL the frontend needs to know
  const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

  // Check if Backend API is alive
  const checkHealth = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/health/`);
      if (res.ok) {
        setIsConnected(true);
        return true;
      }
      setIsConnected(false);
      return false;
    } catch (error) {
      console.error("Backend API connection failed:", error);
      setIsConnected(false);
      return false;
    }
  }, [API_URL]);

  // Fetch graph stats from Backend API
  const refreshStats = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/graph/fetch`);
      if (res.ok) {
        const data = await res.json();
        // Handle different possible backend response structures
        const nodes = data.nodes || data.entities || [];
        const edges = data.edges || data.relationships || [];
        
        setStats({
          nodes: nodes.length,
          edges: edges.length
        });
      }
    } catch (error) {
      // Ignore 429 errors for stats, it's fine
    }
  }, [API_URL]);

  // Ask Backend to clear the data AND wipe frontend memory
  const resetDatabase = useCallback(async () => {
    if (!confirm("Are you sure? This will delete ALL data.")) return;
    
    setIsProcessing(true);
    try {
      // 1. Call API to delete data in DB
      const res = await fetch(`${API_URL}/clear/`, { method: "POST" });
      
      if (!res.ok) throw new Error("Failed to clear database");
      
      // 2. Refresh Stats (Should be 0)
      await refreshStats();
      
      // 3. CRITICAL FIX: Wipe the frontend graph memory immediately
      setEntities([]);
      setRelationships([]);

      alert("Database cleared successfully");
    } catch (err) {
      console.error(err);
      alert("Error resetting database. Check if Backend is Online.");
    } finally {
      setIsProcessing(false);
    }
  }, [API_URL, refreshStats, setEntities, setRelationships]);

  // Initial check
  useEffect(() => {
    let mounted = true;
    checkHealth().then((connected) => {
      if (mounted && connected) refreshStats();
    });
    
    // Poll every 30s
    const interval = setInterval(checkHealth, 30000);
    return () => clearInterval(interval);
  }, [checkHealth, refreshStats]);

  return { isConnected, stats, isProcessing, resetDatabase, refreshStats, checkHealth };
}