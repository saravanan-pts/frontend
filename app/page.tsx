"use client";

import { useEffect, useRef, useState, useMemo } from "react";
import { Toaster, toast } from "react-hot-toast";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import GraphVisualization, { type GraphVisualizationRef } from "@/components/GraphVisualization";
import GraphControls from "@/components/GraphControls";
import GraphSelector from "@/components/GraphSelector";
import NodeDetailPanel from "@/components/NodeDetailPanel";
import FilterPanel from "@/components/FilterPanel"; 
import MainSidebar from "@/components/MainSidebar"; // <--- Main Sidebar
import FileUpload from "@/components/FileUpload";
import TextInput from "@/components/TextInput";
import SettingsPanel from "@/components/SettingsPanel";
import EntityForm from "@/components/EntityForm";
import RelationshipForm from "@/components/RelationshipForm";
import ContextMenu, { type ContextMenuTarget } from "@/components/ContextMenu";
import { useGraphStore } from "@/lib/store";
import { useGraph } from "@/hooks/useGraph";
import { useSurrealDB } from "@/hooks/useSurrealDB";
import { Upload, FileText, Info, Settings, RefreshCw } from "lucide-react";
import type { Entity, Relationship } from "@/types";

export default function Home() {
  const graphRef = useRef<GraphVisualizationRef>(null);
  const { activeTab, setActiveTab, setSelectedEntity } = useGraphStore();
  
  const { 
    entities, 
    relationships, 
    loadGraph, 
    searchGraph,
    analyzeGraph, 
    createEntity, 
    updateEntity, 
    deleteEntity, 
    createRelationship, 
    updateRelationship, 
    deleteRelationship, 
    selectRelationship 
  } = useGraph();

  const { isConnected } = useSurrealDB();
  const [isInitialLoad, setIsInitialLoad] = useState(true);
  const [selectedDocumentId, setSelectedDocumentId] = useState<string | null>(null);
  
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

  // --- FILTER STATE ---
  const [allEntityTypes, setAllEntityTypes] = useState<string[]>([]);
  const [allRelTypes, setAllRelTypes] = useState<string[]>([]);
  
  const [selectedEntityFilters, setSelectedEntityFilters] = useState<string[]>([]);
  const [selectedRelFilters, setSelectedRelFilters] = useState<string[]>([]);

  // Stabilize Data
  const stableEntities = useMemo(() => entities, [entities.length]);
  const stableRelationships = useMemo(() => relationships, [relationships.length]);

  // 1. Initial Data Load
  useEffect(() => {
    const init = async () => {
      try { await loadGraph(selectedDocumentId); } 
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
          graphRef.current.filterByRelationship(selectedRelFilters);
      }
  }, [selectedEntityFilters, selectedRelFilters]);

  // Filter Handlers
  const toggleEntityFilter = (type: string) => {
      setSelectedEntityFilters(prev => prev.includes(type) ? prev.filter(t => t !== type) : [...prev, type]);
  };

  const toggleRelFilter = (type: string) => {
      setSelectedRelFilters(prev => prev.includes(type) ? prev.filter(t => t !== type) : [...prev, type]);
  };

  // --- Other Handlers ---
  const handleEntitySubmit = async (data: any) => {
    try {
      if (editingEntity) await updateEntity(editingEntity.id, data);
      else await createEntity(data);
      toast.success("Entity saved");
      setShowEntityForm(false); setEditingEntity(null);
    } catch (error: any) { toast.error("Failed to save entity"); }
  };

  const handleRelationshipSubmit = async (from: string, to: string, type: string, properties?: any, confidence?: number) => {
    try {
      if (editingRelationship) await updateRelationship(editingRelationship.id, { from, to, type, properties, confidence });
      else await createRelationship(from, to, type, properties, confidence);
      toast.success("Relationship saved");
      setShowRelationshipForm(false); setEditingRelationship(null);
    } catch (error: any) { toast.error("Failed to save relationship"); }
  };

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
     loadGraph(selectedDocumentId);
  };

  const handleContextMenu = (x: number, y: number, target: ContextMenuTarget, nodeId?: string, edgeId?: string) => setContextMenu({ x, y, target, nodeId, edgeId });
  const handleCreateNode = () => { setEditingEntity(null); setShowEntityForm(true); };
  const handleCreateRelationship = (fromEntityId?: string) => { setEditingRelationship(null); setRelationshipFromId(fromEntityId || contextMenu?.nodeId); setRelationshipToId(undefined); setShowRelationshipForm(true); };
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
        
        {/* 1. MAIN SIDEBAR (Text + Icons) */}
        <div className="hidden md:block">
           <MainSidebar />
        </div>

        {/* 2. FILTER SIDEBAR (Collapsible) */}
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

        {/* 3. MAIN CONTENT (Graph + Controls + Right Panel) */}
        <div className="flex-1 flex flex-col h-full overflow-hidden">
           {/* Header moved inside main content area for this layout style */}
           <header className="bg-white border-b border-gray-200 shadow-sm z-20 px-6 py-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                 <h2 className="text-xl font-semibold text-gray-800">Knowledge Graph POC</h2>
                 <button onClick={handleForceRefresh} className="p-1 hover:bg-gray-100 rounded-full" title="Reload"><RefreshCw className="w-4 h-4 text-gray-400" /></button>
                 <div className={`w-3 h-3 rounded-full ${entities.length > 0 ? "bg-green-500" : "bg-gray-400"}`} />
              </div>
              <div className="text-sm text-gray-600">{entities.length} entities, {relationships.length} relationships</div>
           </header>

           <div className="flex-1 flex flex-row overflow-hidden bg-gray-50">
             {/* GRAPH AREA */}
             <div className="flex-1 flex flex-col min-w-0">
               <div className="bg-white border-b border-gray-200 px-4 py-2 flex items-center justify-end">
                 <GraphSelector selectedDocumentId={selectedDocumentId} onSelectDocument={setSelectedDocumentId} onRefresh={() => loadGraph(selectedDocumentId)} />
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

             {/* RIGHT PANEL */}
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
        
        {/* Modals */}
        {showEntityForm && <EntityForm entity={editingEntity || undefined} onSubmit={handleEntitySubmit} onCancel={() => setShowEntityForm(false)} />}
        {showRelationshipForm && <RelationshipForm fromEntityId={relationshipFromId} toEntityId={relationshipToId} relationship={editingRelationship || undefined} entities={entities} onSubmit={handleRelationshipSubmit} onCancel={() => setShowRelationshipForm(false)} />}
        {contextMenu && <ContextMenu x={contextMenu.x} y={contextMenu.y} target={contextMenu.target} onCreateNode={handleCreateNode} onEditNode={()=>{}} onDeleteNode={()=>{}} onCreateRelationship={()=>{}} onEditEdge={()=>{}} onDeleteEdge={()=>{}} onClose={() => setContextMenu(null)} />}
        <Toaster position="top-right" />
      </div>
    </ErrorBoundary>
  );
}