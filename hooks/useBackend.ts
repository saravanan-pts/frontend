"use client";

import { useEffect, useState, useCallback } from "react";
import { useGraphStore } from "@/lib/store";

export function useBackend() {
  const [isConnected, setIsConnected] = useState(false);
  const [stats, setStats] = useState({ nodes: 0, edges: 0 });
  const [isProcessing, setIsProcessing] = useState(false);

  // FIXED: Removed setGraphData, using the individual setters
  const { setEntities, setRelationships } = useGraphStore();

  const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

  // 1. Check Health
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

  // 2. Fetch Stats
  const refreshStats = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/api/graph/stats`);
      if (res.ok) {
        const data = await res.json();
        setStats({
          nodes: data.node_count || data.nodes || 0,
          edges: data.edge_count || data.edges || 0
        });
      }
    } catch (error) {
      // Slient fail for stats
    }
  }, [API_URL]);

  // 3. Reset Database
  const resetDatabase = useCallback(async () => {
    if (!confirm("Are you sure? This will delete ALL data.")) return;
    
    setIsProcessing(true);
    try {
      // Matches your backend endpoint
      const res = await fetch(`${API_URL}/clear/`, { method: "POST" });
      
      if (!res.ok) throw new Error("Failed to clear database");
      
      await refreshStats();
      
      // FIXED: Clear frontend store using correct methods
      setEntities([]);
      setRelationships([]);

      alert("Database cleared successfully");
    } catch (err) {
      console.error(err);
      alert("Error resetting database.");
    } finally {
      setIsProcessing(false);
    }
  }, [API_URL, refreshStats, setEntities, setRelationships]);

  useEffect(() => {
    let mounted = true;
    checkHealth().then((connected) => {
      if (mounted && connected) refreshStats();
    });
    
    const interval = setInterval(checkHealth, 30000);
    return () => clearInterval(interval);
  }, [checkHealth, refreshStats]);

  return { isConnected, stats, isProcessing, resetDatabase, refreshStats, checkHealth };
}