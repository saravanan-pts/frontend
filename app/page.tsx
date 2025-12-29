"use client";

import { useEffect, useRef, useState } from "react";
import { Toaster, toast } from "react-hot-toast";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import GraphVisualization, {
  type GraphVisualizationRef,
} from "@/components/GraphVisualization";
import GraphControls from "@/components/GraphControls";
import GraphSelector from "@/components/GraphSelector";
import NodeDetailPanel from "@/components/NodeDetailPanel";
import FileUpload from "@/components/FileUpload";
import TextInput from "@/components/TextInput";
import SettingsPanel from "@/components/SettingsPanel";
import EntityForm from "@/components/EntityForm";
import RelationshipForm from "@/components/RelationshipForm";
import ContextMenu, { type ContextMenuTarget } from "@/components/ContextMenu";
import { useGraphStore } from "@/lib/store";
import { useGraph } from "@/hooks/useGraph"; // Using the new Secure Hook
import { useSurrealDB } from "@/hooks/useSurrealDB";
import { Upload, FileText, Info, Settings } from "lucide-react";
import type { Entity, Relationship } from "@/types";

export default function Home() {
  const graphRef = useRef<GraphVisualizationRef>(null);
  const { activeTab, setActiveTab, setSelectedEntity } = useGraphStore();
  
  // Get all data and actions from our new Secure Hook
  const { 
    entities, 
    relationships, 
    loadGraph, 
    searchGraph, // <--- The new Search Function
    createEntity, 
    updateEntity, 
    deleteEntity, 
    createRelationship, 
    updateRelationship, 
    deleteRelationship, 
    getRelationship, 
    selectRelationship 
  } = useGraph();

  const { isConnected } = useSurrealDB();
  const [isInitialLoad, setIsInitialLoad] = useState(true);
  const [selectedDocumentId, setSelectedDocumentId] = useState<string | null>(null);
  
  // Modal states
  const [showEntityForm, setShowEntityForm] = useState(false);
  const [editingEntity, setEditingEntity] = useState<Entity | null>(null);
  const [showRelationshipForm, setShowRelationshipForm] = useState(false);
  const [editingRelationship, setEditingRelationship] = useState<Relationship | null>(null);
  const [relationshipFromId, setRelationshipFromId] = useState<string | undefined>();
  const [relationshipToId, setRelationshipToId] = useState<string | undefined>();
  
  // Context menu state
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    target: ContextMenuTarget;
    nodeId?: string;
    edgeId?: string;
  } | null>(null);

  // 1. Initial Load
  useEffect(() => {
    const init = async () => {
      try {
        await loadGraph(selectedDocumentId);
      } catch (e) {
        console.error("Initialization error:", e);
      } finally {
        setIsInitialLoad(false);
      }
    };
    init();
  }, [loadGraph]);

  // 2. Reload when Document Changes
  useEffect(() => {
    if (!isInitialLoad) {
      loadGraph(selectedDocumentId).catch((error) => {
        console.error("Failed to reload graph:", error);
      });
    }
  }, [selectedDocumentId]);

  // 3. Update Visualization when Data Changes
  useEffect(() => {
    if (graphRef.current) {
      // Small delay to ensure UI is ready
      const timeoutId = setTimeout(() => {
        graphRef.current?.loadGraphData(entities, relationships);
      }, 100);
      return () => clearTimeout(timeoutId);
    }
  }, [entities, relationships]);

  // --- Handlers ---

  const handleEntitySubmit = async (data: any) => {
    try {
      if (editingEntity) {
        await updateEntity(editingEntity.id, data);
        toast.success("Entity updated successfully");
      } else {
        await createEntity(data);
        toast.success("Entity created successfully");
      }
      setShowEntityForm(false);
      setEditingEntity(null);
    } catch (error: any) {
      toast.error(error.message || "Failed to save entity");
    }
  };

  const handleRelationshipSubmit = async (
    from: string,
    to: string,
    type: string,
    properties?: any,
    confidence?: number
  ) => {
    try {
      if (editingRelationship) {
        await updateRelationship(editingRelationship.id, {
          from,
          to,
          type,
          properties,
          confidence,
        });
        toast.success("Relationship updated successfully");
      } else {
        await createRelationship(from, to, type, properties, confidence);
        toast.success("Relationship created successfully");
      }
      setShowRelationshipForm(false);
      setEditingRelationship(null);
      setRelationshipFromId(undefined);
      setRelationshipToId(undefined);
      selectRelationship(null);
    } catch (error: any) {
      toast.error(error.message || "Failed to save relationship");
    }
  };

  // --- Search Handler (Connected to API) ---
  const handleSearch = async (query: string) => {
    if (!query.trim()) {
      // If search is cleared, reload original data
      loadGraph(selectedDocumentId);
      return;
    }
    
    try {
      const results = await searchGraph(query);
      // Update the Store directly with search results
      useGraphStore.getState().setEntities(results);
      // Optional: Clear edges to focus on the search results
      useGraphStore.getState().setRelationships([]);
      
      toast.success(`Found ${results.length} matches`);
    } catch (e) {
      toast.error("Search failed");
    }
  };

  // --- UI Actions ---

  const handleContextMenu = (x: number, y: number, target: ContextMenuTarget, nodeId?: string, edgeId?: string) => {
    setContextMenu({ x, y, target, nodeId, edgeId });
  };

  const handleCreateNode = () => {
    setEditingEntity(null);
    setShowEntityForm(true);
  };

  const handleEditNode = (nodeId?: string) => {
    const entityId = nodeId || contextMenu?.nodeId;
    if (entityId) {
      const entity = entities.find((e) => e.id === entityId);
      if (entity) {
        setEditingEntity(entity);
        setShowEntityForm(true);
      }
    }
  };

  const handleDeleteNode = async (nodeId?: string) => {
    const entityId = nodeId || contextMenu?.nodeId;
    if (entityId) {
      try {
        await deleteEntity(entityId);
        toast.success("Entity deleted successfully");
        setSelectedEntity(null);
      } catch (error: any) {
        toast.error("Failed to delete entity");
      }
    }
  };

  const handleCreateRelationship = (fromEntityId?: string) => {
    setEditingRelationship(null);
    setRelationshipFromId(fromEntityId || contextMenu?.nodeId);
    setRelationshipToId(undefined);
    setShowRelationshipForm(true);
  };

  const handleEditEdge = (relationshipOrId?: Relationship | string) => {
    let relationship: Relationship | undefined;
    
    if (typeof relationshipOrId === 'string') {
      relationship = relationships.find((r) => r.id === relationshipOrId);
    } else if (relationshipOrId) {
      relationship = relationshipOrId;
    } else {
      // Try to find from context menu
      const relId = contextMenu?.edgeId;
      if (relId) relationship = relationships.find((r) => r.id === relId);
    }
    
    if (relationship) {
      setEditingRelationship(relationship);
      setRelationshipFromId(relationship.from);
      setRelationshipToId(relationship.to);
      setShowRelationshipForm(true);
    }
  };

  const handleDeleteEdge = async (edgeId?: string) => {
    const relId = edgeId || contextMenu?.edgeId;
    if (relId) {
      try {
        await deleteRelationship(relId);
        toast.success("Relationship deleted successfully");
      } catch (error: any) {
        toast.error("Failed to delete relationship");
      }
    }
  };

  const handleNodeSelect = (entityId: string) => {
    const entity = entities.find((e) => e.id === entityId);
    if (entity) {
      setSelectedEntity(entity);
      selectRelationship(null);
      setActiveTab("details");
    }
  };

  const handleNodeDeselect = () => {
    setSelectedEntity(null);
  };

  const handleEdgeSelect = async (edgeId: string) => {
    const relationship = relationships.find((r) => r.id === edgeId);
    if (relationship) {
      selectRelationship(relationship);
      setEditingRelationship(relationship);
      setRelationshipFromId(relationship.from);
      setRelationshipToId(relationship.to);
      setShowRelationshipForm(true);
      setSelectedEntity(null);
    }
  };

  const handleEdgeDeselect = () => {
    selectRelationship(null);
  };

  const tabs = [
    { id: "upload" as const, label: "Upload", icon: Upload },
    { id: "input" as const, label: "Input", icon: FileText },
    { id: "details" as const, label: "Details", icon: Info },
    { id: "settings" as const, label: "Settings", icon: Settings },
  ];

  return (
    <ErrorBoundary>
      <div className="min-h-screen bg-gray-50 flex flex-col">
        {/* Header */}
        <header className="bg-white border-b border-gray-200 shadow-sm">
          <div className="px-6 py-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-gray-900">
                Knowledge Graph POC
              </h1>
              {/* Status Dot */}
              <div
                className={`w-3 h-3 rounded-full ${
                  entities.length > 0 ? "bg-green-500" : "bg-gray-400"
                }`}
                title={entities.length > 0 ? "Data Loaded" : "No Data"}
              />
            </div>
            <div className="flex items-center gap-4">
              <div className="text-sm text-gray-600">
                {entities.length} entities, {relationships.length} relationships
              </div>
            </div>
          </div>
        </header>

        {/* Main Content */}
        <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
          {/* Graph Section */}
          <div className="flex-1 flex flex-col lg:w-[70%] w-full">
            <div className="bg-white border-b border-gray-200 px-4 py-2 flex items-center justify-end">
              <GraphSelector
                selectedDocumentId={selectedDocumentId}
                onSelectDocument={setSelectedDocumentId}
                onRefresh={() => loadGraph(selectedDocumentId)}
              />
            </div>
            
            {/* UPDATED: GraphControls with onSearch */}
            <GraphControls 
              graphRef={graphRef}
              onCreateNode={handleCreateNode}
              onCreateRelationship={handleCreateRelationship}
              onSearch={handleSearch} 
            />

            <div className="flex-1 relative">
              {isInitialLoad ? (
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="text-center">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4" />
                    <p className="text-gray-600">Loading graph...</p>
                  </div>
                </div>
              ) : (
                <GraphVisualization
                  ref={graphRef}
                  onNodeSelect={handleNodeSelect}
                  onNodeDeselect={handleNodeDeselect}
                  onEdgeSelect={handleEdgeSelect}
                  onEdgeDeselect={handleEdgeDeselect}
                  onContextMenu={handleContextMenu}
                  onCreateNode={handleCreateNode}
                  onCreateRelationship={(f, t) => {
                    setRelationshipFromId(f);
                    setRelationshipToId(t);
                    setShowRelationshipForm(true);
                  }}
                />
              )}
            </div>
          </div>

          {/* Sidebar Panel */}
          <div className="lg:w-[30%] w-full bg-white border-t lg:border-t-0 lg:border-l border-gray-200 flex flex-col">
            <div className="flex border-b border-gray-200 overflow-x-auto">
              {tabs.map((tab) => {
                const Icon = tab.icon;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`flex-1 min-w-[80px] flex items-center justify-center gap-1 lg:gap-2 px-2 lg:px-4 py-3 text-xs lg:text-sm font-medium transition-colors ${
                      activeTab === tab.id
                        ? "bg-blue-50 text-blue-600 border-b-2 border-blue-600"
                        : "text-gray-600 hover:bg-gray-50"
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    <span className="hidden sm:inline">{tab.label}</span>
                  </button>
                );
              })}
            </div>

            <div className="flex-1 overflow-y-auto p-4">
              {activeTab === "upload" && <FileUpload />}
              {activeTab === "input" && <TextInput />}
              {activeTab === "details" && (
                <NodeDetailPanel 
                  onClose={() => setSelectedEntity(null)}
                  onCreateRelationship={handleCreateRelationship}
                  onEditRelationship={handleEditEdge}
                  onDeleteRelationship={handleDeleteEdge}
                />
              )}
              {activeTab === "settings" && <SettingsPanel />}
            </div>
          </div>
        </div>

        {/* Modals */}
        {showEntityForm && (
          <EntityForm
            entity={editingEntity || undefined}
            onSubmit={handleEntitySubmit}
            onCancel={() => setShowEntityForm(false)}
          />
        )}

        {showRelationshipForm && (
          <RelationshipForm
            fromEntityId={relationshipFromId}
            toEntityId={relationshipToId}
            relationship={editingRelationship || undefined}
            entities={entities}
            onSubmit={handleRelationshipSubmit}
            onCancel={() => setShowRelationshipForm(false)}
          />
        )}

        {contextMenu && (
          <ContextMenu
            x={contextMenu.x}
            y={contextMenu.y}
            target={contextMenu.target}
            onCreateNode={handleCreateNode}
            onEditNode={() => handleEditNode()}
            onDeleteNode={() => handleDeleteNode()}
            onCreateRelationship={() => handleCreateRelationship()}
            onEditEdge={() => handleEditEdge()}
            onDeleteEdge={() => handleDeleteEdge()}
            onClose={() => setContextMenu(null)}
          />
        )}

        <Toaster position="top-right" />
      </div>
    </ErrorBoundary>
  );
}