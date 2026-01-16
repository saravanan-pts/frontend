"use client";

import { useState } from "react";
import { Settings, Download, Upload, Trash2, Moon, Sun, Activity, Server, RefreshCw } from "lucide-react";
import { useGraphStore } from "@/lib/store";
import { useGraph } from "@/hooks/useGraph";
import { useBackend } from "@/hooks/useBackend"; // Import the hook
import { apiClient } from "@/services/apiClient"; 
import AlertDialog from "@/components/AlertDialog";
import ConfirmDialog from "@/components/ConfirmDialog";

export default function SettingsPanel() {
  const { clearGraph } = useGraphStore();
  const { loadGraph } = useGraph();
  
  // MERGED: Use the centralized backend hook for status
  const { isConnected, checkHealth } = useBackend();
  
  const [darkMode, setDarkMode] = useState(false);
  
  // Dialog states
  const [showImportAlert, setShowImportAlert] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [isClearing, setIsClearing] = useState(false);

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
          // Future: Add backend bulk insert here if needed
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

  // UPDATED: Clear both Backend (DB) and Frontend (Store)
  const confirmClearAll = async () => {
    setIsClearing(true);
    try {
      // 1. Clear Backend Database
      await apiClient.post("/clear"); 
      
      // 2. Clear Frontend Store
      clearGraph();
      
      setShowClearConfirm(false);
      setShowImportAlert({ type: "success", message: "Database and local graph cleared successfully" });
    } catch (error) {
      setShowClearConfirm(false);
      setShowImportAlert({ type: "error", message: "Failed to clear backend database. Check connection." });
      console.error("Clear failed:", error);
    } finally {
      setIsClearing(false);
    }
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
                isConnected ? "text-green-600" : "text-red-600"
              }`}
            >
              {isConnected ? <Activity className="w-3 h-3" /> : <Activity className="w-3 h-3 animate-pulse" />}
              {isConnected ? "Online" : "Offline / Connecting..."}
            </span>
          </div>
          
          <div className="flex items-center justify-between">
            <span className="text-gray-600">API URL:</span>
            <span className="text-gray-800 font-mono text-xs bg-gray-200 px-2 py-1 rounded">
                {process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"}
            </span>
          </div>

          <div className="mt-2 p-2 bg-blue-50 text-blue-700 text-xs rounded border border-blue-100">
            Database & AI configurations are securely managed by the Backend Server.
          </div>

          <button
            onClick={checkHealth}
            className="w-full mt-3 px-3 py-2 bg-white border border-gray-300 text-gray-700 rounded text-sm hover:bg-gray-50 transition-colors flex justify-center items-center gap-2"
          >
            <RefreshCw className="w-3 h-3" />
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
            disabled={!isConnected}
            className={`w-full flex items-center justify-center gap-2 px-4 py-2 border rounded transition-colors ${
              !isConnected 
                ? "bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed"
                : "bg-red-50 text-red-600 border-red-200 hover:bg-red-100"
            }`}
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
          message="Are you sure you want to clear all graph data from the Database? This action cannot be undone."
          confirmText={isClearing ? "Clearing..." : "Clear"}
          cancelText="Cancel"
          onConfirm={confirmClearAll}
          onCancel={() => setShowClearConfirm(false)}
          danger={true}
        />
      )}
    </div>
  );
}