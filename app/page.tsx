"use client";

import { useEffect, useRef, useState, useMemo } from "react";
import { Toaster, toast } from "react-hot-toast";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import GraphVisualization, { type GraphVisualizationRef } from "@/components/GraphVisualization";
import GraphControls from "@/components/GraphControls";
import NodeDetailPanel from "@/components/NodeDetailPanel";
import FilterPanel from "@/components/FilterPanel"; 
import MainSidebar from "@/components/MainSidebar";
import FileUpload from "@/components/FileUpload";
import TextInput from "@/components/TextInput";
import SettingsPanel from "@/components/SettingsPanel";
import EntityForm from "@/components/EntityForm";
import RelationshipForm from "@/components/RelationshipForm";
import ContextMenu, { type ContextMenuTarget } from "@/components/ContextMenu";
import { useGraphStore } from "@/lib/store";
import { useGraph } from "@/hooks/useGraph";
import { useSurrealDB } from "@/hooks/useSurrealDB";
import { Upload, FileText, Info, Settings, RefreshCw, Trash2 } from "lucide-react";
import type { Entity, Relationship } from "@/types";

export default function Home() {
  const graphRef = useRef<GraphVisualizationRef>(null);
  
  // FIX: Added 'selectedEntity' here so we can use it as a fallback for creating relationships
  const { activeTab, setActiveTab, setSelectedEntity, selectedEntity } = useGraphStore();
  
  const { 
    entities, 
    relationships, 
    loadGraph, 
    analyzeGraph, 
    createEntity, 
    updateEntity,
    deleteEntity, 
    createRelationship, 
    updateRelationship,
    deleteRelationship 
  } = useGraph();

  const { isConnected } = useSurrealDB();
  const [isInitialLoad, setIsInitialLoad] = useState(true);
  
  const [selectedDocumentId, setSelectedDocumentId] = useState<string | null>(null); 
  
  const [documents, setDocuments] = useState<any[]>([]);
  const [isDeleting, setIsDeleting] = useState(false);

  // UI State
  const [isFilterPanelOpen, setIsFilterPanelOpen] = useState(true); 

  // Modal states
  const [showEntityForm, setShowEntityForm] = useState(false);
  const [editingEntity, setEditingEntity] = useState<Entity | null>(null);
  const [showRelationshipForm, setShowRelationshipForm] = useState(false);
  const [editingRelationship, setEditingRelationship] = useState<Relationship | null>(null);
  const [relationshipFromId, setRelationshipFromId] = useState<string | undefined>();
  const [relationshipToId, setRelationshipToId] = useState<string | undefined>();
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; target: ContextMenuTarget; nodeId?: string; edgeId?: string; } | null>(null);

  // Filter State
  const [allEntityTypes, setAllEntityTypes] = useState<string[]>([]);
  const [allRelTypes, setAllRelTypes] = useState<string[]>([]);
  const [selectedEntityFilters, setSelectedEntityFilters] = useState<string[]>([]);
  const [selectedRelFilters, setSelectedRelFilters] = useState<string[]>([]);

  // STOP INFINITE RELOADS: Use JSON.stringify for stable dependency comparison
  const stableEntities = useMemo(() => entities, [JSON.stringify(entities)]);
  const stableRelationships = useMemo(() => relationships, [JSON.stringify(relationships)]);

  const fetchDocuments = async () => {
    try {
      const res = await fetch("/api/documents");
      if (res.ok) {
        const data = await res.json();
        setDocuments(data);
      }
    } catch (e) {
      console.error("Failed to fetch documents:", e);
    }
  };

  // 1. Initial Data Load
  useEffect(() => {
    const init = async () => {
      try { 
        await fetchDocuments();
        await loadGraph(selectedDocumentId || null); 
      } 
      catch (e) { console.error("Initialization error:", e); } 
      finally { setIsInitialLoad(false); }
    };
    init();
  }, [loadGraph]);

  // 2. Reload when Document Changes
  useEffect(() => {
    if (!isInitialLoad) {
      loadGraph(selectedDocumentId).catch((error) => console.error("Failed to reload graph:", error));
    }
  }, [selectedDocumentId]);

  // 3. Extract Types for Filters
  useEffect(() => {
    if (entities.length > 0) {
        const eTypes = Array.from(new Set(entities.map(e => e.type))).sort();
        setAllEntityTypes(eTypes);
        setSelectedEntityFilters(prev => prev.length === 0 ? eTypes : prev);
    }
    if (relationships.length > 0) {
        const rTypes = Array.from(new Set(relationships.map(r => r.type))).sort();
        setAllRelTypes(rTypes);
        setSelectedRelFilters(prev => prev.length === 0 ? rTypes : prev);
    }
  }, [entities, relationships]);

  // 4. Apply Filters
  useEffect(() => {
      if (graphRef.current) {
          graphRef.current.filterByType(selectedEntityFilters);
      }
  }, [selectedEntityFilters, selectedRelFilters]);

  const toggleEntityFilter = (type: string) => {
      setSelectedEntityFilters(prev => prev.includes(type) ? prev.filter(t => t !== type) : [...prev, type]);
  };

  const toggleRelFilter = (type: string) => {
      setSelectedRelFilters(prev => prev.includes(type) ? prev.filter(t => t !== type) : [...prev, type]);
  };

  const handleDeleteFile = async () => {
    if (!selectedDocumentId) return;

    const doc = documents.find(d => d.id === selectedDocumentId);
    if (!doc) return;

    if (!confirm(`Are you sure you want to delete "${doc.filename}" and all its graph data?`)) {
      return;
    }

    setIsDeleting(true);
    const toastId = toast.loading("Deleting file...");

    try {
      const response = await fetch('/api/documents', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename: doc.filename }),
      });

      if (response.ok) {
        toast.success("File deleted successfully", { id: toastId });
        setDocuments(prev => prev.filter(d => d.id !== selectedDocumentId));
        setSelectedDocumentId(null); 
        await loadGraph(null);
      } else {
        throw new Error("Delete failed");
      }
    } catch (error) {
      console.error("Delete Error:", error);
      toast.error("Failed to delete file", { id: toastId });
    } finally {
      setIsDeleting(false);
    }
  };

  // --- Handlers ---
  const handleEntitySubmit = async (data: any) => {
    try {
      if (editingEntity) await updateEntity(editingEntity.id, data);
      else await createEntity(data);
      
      await loadGraph(selectedDocumentId);
      
      toast.success("Entity saved");
      setShowEntityForm(false); setEditingEntity(null);
    } catch (error: any) { toast.error("Failed to save entity"); }
  };

  const handleRelationshipSubmit = async (from: string, to: string, type: string, properties?: any, confidence?: number) => {
    try {
      if (editingRelationship) await updateRelationship(editingRelationship.id, { from, to, type, properties, confidence });
      else await createRelationship(from, to, type, properties, confidence);
      
      await loadGraph(selectedDocumentId);

      toast.success("Relationship saved");
      setShowRelationshipForm(false); setEditingRelationship(null);
    } catch (error: any) { toast.error("Failed to save relationship"); }
  };

  // --- CONTEXT MENU HANDLERS ---
  
  const handleEditNode = (nodeId?: string) => {
      if (!nodeId) return;
      const entity = entities.find(e => e.id === nodeId);
      if (entity) {
          setEditingEntity(entity);
          setShowEntityForm(true);
          setContextMenu(null);
      }
  };

  const handleDeleteNode = async (nodeId?: string) => {
      if (!nodeId) return;
      if (!confirm("Are you sure you want to delete this node?")) return;
      try {
          await deleteEntity(nodeId);
          await loadGraph(selectedDocumentId);
          toast.success("Node deleted");
          setContextMenu(null);
          setSelectedEntity(null);
      } catch (e) { toast.error("Failed to delete node"); }
  };

  const handleEditRelationship = (edgeId?: string) => {
      if (!edgeId) return;
      const rel = relationships.find(r => r.id === edgeId);
      if (rel) {
          setEditingRelationship(rel);
          setRelationshipFromId(rel.from);
          setRelationshipToId(rel.to);
          setShowRelationshipForm(true);
          setContextMenu(null);
      }
  };

  const handleDeleteRelationship = async (edgeId?: string) => {
      if (!edgeId) return;
      if (!confirm("Are you sure you want to delete this relationship?")) return;
      try {
          await deleteRelationship(edgeId);
          await loadGraph(selectedDocumentId);
          toast.success("Relationship deleted");
          setContextMenu(null);
      } catch (e) { toast.error("Failed to delete relationship"); }
  };

  // --- CRITICAL FIX: Robust "Create Relationship" Handler ---
  // Handles: Context Menu click, Details Panel Button click, and Direct calls
  const handleCreateRelationship = (arg?: string | unknown) => { 
      setEditingRelationship(null); 
      let fromId: string | undefined = undefined;

      // 1. Check if a string ID was passed directly (Context menu often does this)
      if (typeof arg === 'string') {
          fromId = arg;
      } 
      // 2. Check if triggered from Context Menu state
      else if (contextMenu?.nodeId) {
          fromId = contextMenu.nodeId;
      }
      // 3. Fallback: Check if an entity is currently selected (Details Panel button)
      else if (selectedEntity) {
          fromId = selectedEntity.id;
      }
      
      setRelationshipFromId(fromId); 
      setRelationshipToId(undefined); 
      setShowRelationshipForm(true); 
      setContextMenu(null);
  };
  
  const handleCreateNode = () => { setEditingEntity(null); setShowEntityForm(true); setContextMenu(null); };

  const handleSearch = async (query: string) => {
    if (!query.trim()) {
        if (graphRef.current) graphRef.current.searchAndHighlight("");
        return;
    }
    if (graphRef.current) graphRef.current.searchAndHighlight(query);
    
    const term = query.toLowerCase();
    const match = entities.find(e => (e.label || "").toLowerCase().includes(term));
    if (match) {
        setSelectedEntity(match); 
        setActiveTab("details"); 
        toast.success("Found: " + match.label);
    }
  };

  const handleAnalyze = async () => {
    const toastId = toast.loading("Analyzing Graph...");
    try {
        await analyzeGraph();
        toast.success("Done!", { id: toastId });
        await loadGraph(selectedDocumentId);
    } catch (e) { toast.error("Failed", { id: toastId }); }
  };

  const handleForceRefresh = () => {
     if(graphRef.current) graphRef.current.fit();
     fetchDocuments();
     loadGraph(selectedDocumentId);
  };

  const handleContextMenu = (x: number, y: number, target: ContextMenuTarget, nodeId?: string, edgeId?: string) => setContextMenu({ x, y, target, nodeId, edgeId });
  const handleNodeSelect = (id: string) => { const e = entities.find(x => x.id === id); if(e) { setSelectedEntity(e); setActiveTab("details"); } };
  const handleNodeDeselect = () => setSelectedEntity(null);

  const tabs = [
    { id: "upload" as const, label: "Upload", icon: Upload },
    { id: "input" as const, label: "Input", icon: FileText },
    { id: "details" as const, label: "Details", icon: Info },
    { id: "settings" as const, label: "Settings", icon: Settings },
  ];

  return (
    <ErrorBoundary>
      <div className="min-h-screen bg-gray-50 flex flex-col md:flex-row overflow-hidden">
        
        <div className="hidden md:block">
           <MainSidebar />
        </div>

        {isFilterPanelOpen && (
           <div className="hidden md:block border-r border-gray-200">
             <FilterPanel 
               entityTypes={allEntityTypes}
               relationshipTypes={allRelTypes}
               selectedEntities={selectedEntityFilters}
               selectedRelationships={selectedRelFilters}
               onToggleEntity={toggleEntityFilter}
               onToggleRelationship={toggleRelFilter}
               onClose={() => setIsFilterPanelOpen(false)}
             />
           </div>
        )}

        <div className="flex-1 flex flex-col h-full overflow-hidden">
           <header className="bg-white border-b border-gray-200 shadow-sm z-20 px-6 py-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                 <h2 className="text-xl font-semibold text-gray-800">Knowledge Graph POC</h2>
                 <button onClick={handleForceRefresh} className="p-1 hover:bg-gray-100 rounded-full" title="Reload"><RefreshCw className="w-4 h-4 text-gray-400" /></button>
                 <div className={`w-3 h-3 rounded-full ${entities.length > 0 ? "bg-green-500" : "bg-gray-400"}`} />
              </div>
              <div className="text-sm text-gray-600">{entities.length} entities, {relationships.length} relationships</div>
           </header>

           <div className="flex-1 flex flex-row overflow-hidden bg-gray-50">
             <div className="flex-1 flex flex-col min-w-0">
               <div className="bg-white border-b border-gray-200 px-4 py-2 flex items-center justify-end">
                 
                 <div className="flex items-center gap-2 max-w-md w-full">
                    <select
                        value={selectedDocumentId || ""}
                        onChange={(e) => setSelectedDocumentId(e.target.value || null)}
                        className="flex-1 p-2 border border-gray-300 rounded-md text-sm"
                    >
                        <option value="">-- Load All / Select File --</option>
                        {documents.map((doc) => (
                            <option key={doc.id} value={doc.id}>
                                {doc.filename} ({doc.entityCount} nodes)
                            </option>
                        ))}
                    </select>

                    <button
                        onClick={handleDeleteFile}
                        disabled={!selectedDocumentId || isDeleting}
                        className="p-2 text-red-600 bg-red-50 hover:bg-red-100 rounded-md disabled:opacity-50 border border-red-200 transition-colors"
                        title="Delete selected file"
                    >
                        <Trash2 className="w-4 h-4" />
                    </button>
                 </div>

               </div>
               
               <GraphControls 
                 graphRef={graphRef} 
                 onCreateNode={handleCreateNode} 
                 onCreateRelationship={handleCreateRelationship} 
                 onSearch={handleSearch} 
                 onAnalyze={handleAnalyze} 
                 isFilterPanelOpen={isFilterPanelOpen}
                 onToggleFilterPanel={() => setIsFilterPanelOpen(true)}
               />
  
               <div className="flex-1 relative p-4">
                 {isInitialLoad ? (
                   <div className="absolute inset-0 flex items-center justify-center"><p className="text-gray-600">Loading...</p></div>
                 ) : (
                   <div className="bg-white rounded-lg shadow-sm border border-gray-200 h-full overflow-hidden">
                       <GraphVisualization
                       ref={graphRef}
                       entities={stableEntities}
                       relationships={stableRelationships}
                       onNodeSelect={handleNodeSelect}
                       onNodeDeselect={handleNodeDeselect}
                       onContextMenu={handleContextMenu}
                       onCreateNode={handleCreateNode}
                       onCreateRelationship={(f, t) => { setRelationshipFromId(f); setRelationshipToId(t); setShowRelationshipForm(true); }}
                       />
                   </div>
                 )}
               </div>
             </div>

             <div className="w-80 lg:w-96 bg-white border-l border-gray-200 flex flex-col z-10">
               <div className="flex border-b border-gray-200 overflow-x-auto">
                 {tabs.map((tab) => {
                   const Icon = tab.icon;
                   return (
                     <button key={tab.id} onClick={() => setActiveTab(tab.id)} className={`flex-1 min-w-[60px] flex items-center justify-center gap-1 py-3 text-xs lg:text-sm font-medium ${activeTab === tab.id ? "text-blue-600 border-b-2 border-blue-600" : "text-gray-600 hover:bg-gray-50"}`}>
                       <Icon className="w-4 h-4" /> <span className="hidden sm:inline">{tab.label}</span>
                     </button>
                   );
                 })}
               </div>
               <div className="flex-1 overflow-y-auto p-4">
                 {activeTab === "upload" && <FileUpload />}
                 {activeTab === "input" && <TextInput />}
                 {activeTab === "details" && <NodeDetailPanel onClose={() => setSelectedEntity(null)} onCreateRelationship={handleCreateRelationship} onEditRelationship={()=>{}} onDeleteRelationship={()=>{}} />}
                 {activeTab === "settings" && <SettingsPanel />}
               </div>
             </div>
           </div>
        </div>
        
        {showEntityForm && <EntityForm entity={editingEntity || undefined} onSubmit={handleEntitySubmit} onCancel={() => setShowEntityForm(false)} />}
        
        {/* --- FIX APPLIED HERE: existingRelationships prop added --- */}
        {showRelationshipForm && (
            <RelationshipForm 
                fromEntityId={relationshipFromId} 
                toEntityId={relationshipToId} 
                relationship={editingRelationship || undefined} 
                entities={stableEntities} // Using stableEntities for performance
                existingRelationships={stableRelationships} // <--- FIX: Passing existing data to dropdown
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
                onEditNode={() => handleEditNode(contextMenu.nodeId)} 
                onDeleteNode={() => handleDeleteNode(contextMenu.nodeId)} 
                
                onCreateRelationship={() => handleCreateRelationship(contextMenu.nodeId)} 
                onEditEdge={() => handleEditRelationship(contextMenu.edgeId)} 
                onDeleteEdge={() => handleDeleteRelationship(contextMenu.edgeId)} 
                
                onClose={() => setContextMenu(null)} 
            />
        )}

        <Toaster position="top-right" />
      </div>
    </ErrorBoundary>
  );
}