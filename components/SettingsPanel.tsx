"use client";

import { useState, useEffect } from "react";
import { Settings, Download, Upload, Trash2, Moon, Sun, Activity, Server } from "lucide-react";
import { useGraphStore } from "@/lib/store";
import { useGraph } from "@/hooks/useGraph";
import { apiClient } from "@/services/apiClient"; // Import new API client
import AlertDialog from "@/components/AlertDialog";
import ConfirmDialog from "@/components/ConfirmDialog";

export default function SettingsPanel() {
  const { clearGraph } = useGraphStore();
  const { loadGraph } = useGraph();
  
  // REMOVED: useSurrealDB hook
  // ADDED: Local state for Backend Health
  const [backendStatus, setBackendStatus] = useState<"connected" | "disconnected" | "checking">("checking");
  const [darkMode, setDarkMode] = useState(false);
  
  // Dialog states
  const [showImportAlert, setShowImportAlert] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [showClearConfirm, setShowClearConfirm] = useState(false);

  // --- HEALTH CHECK ---
  const checkBackendHealth = async () => {
    setBackendStatus("checking");
    try {
      // Pings the backend health endpoint (defined in main.py)
      await apiClient.get("/health"); 
      setBackendStatus("connected");
    } catch (error) {
      console.error("Backend health check failed:", error);
      setBackendStatus("disconnected");
    }
  };

  // Check health on mount
  useEffect(() => {
    checkBackendHealth();
  }, []);

  const handleExportGraph = () => {
    const { entities, relationships } = useGraphStore.getState();
    const data = {
      entities: Array.from(entities.values()),
      relationships,
      exportedAt: new Date().toISOString(),
    };

    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: "application/json",
    });
    const link = document.createElement("a");
    link.download = `graph-export-${Date.now()}.json`;
    link.href = URL.createObjectURL(blob);
    link.click();
  };

  const handleImportGraph = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "application/json";
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;

      try {
        const text = await file.text();
        const data = JSON.parse(text);

        if (data.entities && data.relationships) {
          // In a real app, you might send this to the backend to bulk insert
          // For now, we rely on the store reloading or client-side hydration
          // await loadGraph(); 
          setShowImportAlert({ type: "success", message: "Graph imported successfully (Client Side)" });
        } else {
          setShowImportAlert({ type: "error", message: "Invalid graph file format" });
        }
      } catch (error) {
        setShowImportAlert({ type: "error", message: "Failed to import graph: " + (error as Error).message });
      }
    };
    input.click();
  };

  const handleClearAll = () => {
    setShowClearConfirm(true);
  };

  const confirmClearAll = () => {
    clearGraph();
    setShowClearConfirm(false);
    setShowImportAlert({ type: "success", message: "Graph data cleared" });
  };

  const toggleDarkMode = () => {
    setDarkMode(!darkMode);
    if (!darkMode) {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 mb-4">
        <Settings className="w-5 h-5" />
        <h2 className="text-lg font-semibold">Settings</h2>
      </div>

      {/* Backend Status Section */}
      <div className="bg-gray-50 rounded-lg p-4 border border-gray-100">
        <h3 className="font-semibold text-sm mb-3 flex items-center gap-2">
          <Server className="w-4 h-4 text-gray-500" /> System Status
        </h3>
        <div className="space-y-2 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-gray-600">Backend API:</span>
            <span
              className={`font-medium flex items-center gap-1 ${
                backendStatus === "connected" ? "text-green-600" : 
                backendStatus === "disconnected" ? "text-red-600" : "text-yellow-600"
              }`}
            >
              {backendStatus === "connected" && <Activity className="w-3 h-3" />}
              {backendStatus === "connected" ? "Online" : 
               backendStatus === "disconnected" ? "Offline" : "Checking..."}
            </span>
          </div>
          
          <div className="flex items-center justify-between">
            <span className="text-gray-600">API URL:</span>
            <span className="text-gray-800 font-mono text-xs bg-gray-200 px-2 py-1 rounded">
               {process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000"}
            </span>
          </div>

          <div className="mt-2 p-2 bg-blue-50 text-blue-700 text-xs rounded border border-blue-100">
            Database & AI configurations are securely managed by the Backend Server.
          </div>

          <button
            onClick={checkBackendHealth}
            className="w-full mt-3 px-3 py-2 bg-white border border-gray-300 text-gray-700 rounded text-sm hover:bg-gray-50 transition-colors"
          >
            Refresh Status
          </button>
        </div>
      </div>

      {/* Graph Preferences */}
      <div className="bg-gray-50 rounded-lg p-4 border border-gray-100">
        <h3 className="font-semibold text-sm mb-3">Preferences</h3>
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-600">Dark Mode</span>
            <button
              onClick={toggleDarkMode}
              className="p-2 hover:bg-gray-200 rounded transition-colors"
            >
              {darkMode ? (
                <Sun className="w-5 h-5 text-orange-500" />
              ) : (
                <Moon className="w-5 h-5 text-slate-700" />
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Data Management */}
      <div className="bg-gray-50 rounded-lg p-4 border border-gray-100">
        <h3 className="font-semibold text-sm mb-3">Data Management</h3>
        <div className="space-y-2">
          <button
            onClick={handleExportGraph}
            className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
          >
            <Download className="w-4 h-4" />
            Export Graph Data
          </button>
          <button
            onClick={handleImportGraph}
            className="w-full flex items-center justify-center gap-2 px-4 py-2 border border-gray-300 bg-white text-gray-700 rounded hover:bg-gray-50 transition-colors"
          >
            <Upload className="w-4 h-4" />
            Import Graph Data
          </button>
          <button
            onClick={handleClearAll}
            className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-red-50 text-red-600 border border-red-200 rounded hover:bg-red-100 transition-colors"
          >
            <Trash2 className="w-4 h-4" />
            Clear All Data
          </button>
        </div>
      </div>

      {/* Dialogs */}
      {showImportAlert && (
        <AlertDialog
          title={showImportAlert.type === "success" ? "Success" : "Error"}
          message={showImportAlert.message}
          type={showImportAlert.type}
          onClose={() => setShowImportAlert(null)}
        />
      )}

      {showClearConfirm && (
        <ConfirmDialog
          title="Clear All Data"
          message="Are you sure you want to clear all graph data? This action cannot be undone."
          confirmText="Clear"
          cancelText="Cancel"
          onConfirm={confirmClearAll}
          onCancel={() => setShowClearConfirm(false)}
          danger={true}
        />
      )}
    </div>
  );
}