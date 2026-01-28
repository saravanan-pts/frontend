"use client";

import { useEffect, useRef, useState, useMemo, useCallback, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { Toaster, toast } from "react-hot-toast";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import GraphVisualization, { type GraphVisualizationRef } from "@/components/GraphVisualization";
import GraphControls from "@/components/GraphControls";
import NodeDetailPanel from "@/components/NodeDetailPanel";
import FilterPanel from "@/components/FilterPanel";
// import MainSidebar from "@/components/MainSidebar"; // PERMANENTLY REMOVED
import FileUpload from "@/components/FileUpload";
import TextInput from "@/components/TextInput";
import SettingsPanel from "@/components/SettingsPanel";
import EntityForm from "@/components/EntityForm";
import RelationshipForm from "@/components/RelationshipForm";
import ContextMenu, { type ContextMenuTarget } from "@/components/ContextMenu";
import { useGraphStore } from "@/lib/store";
import { useGraph } from "@/hooks/useGraph";
import { Upload, FileText, Info, Settings, RefreshCw, Trash2, PanelRightClose, PanelRightOpen } from "lucide-react";
import type { Entity, Relationship } from "@/types";

import { API_URL } from "@/lib/constants";

// --- HELPERS ---
const getId = (item: any): string => {
  if (!item) return "";
  if (typeof item === 'string') return item;
  if (typeof item === 'number') return String(item);
  if (typeof item === 'object' && item.id) return getId(item.id);
  return String(item);
};

// Robust normalizer for strict matching
const normalize = (str: any) => {
    if (!str) return "";
    return String(str).toLowerCase().replace(/[\s\-_]/g, ""); 
};

function HomeContent() {
  const graphRef = useRef<GraphVisualizationRef>(null);
  const searchParams = useSearchParams();

  // 1. GET RAW DATA FROM STORE
  const { activeTab, setActiveTab, setSelectedEntity, selectedEntity, entities, relationships } = useGraphStore();
  
  // 2. USE API HOOK
  const { loadGraph, searchGraph, analyzeGraph, createEntity, updateEntity, deleteEntity, createRelationship, deleteRelationship } = useGraph();

  // 3. STATE MANAGEMENT
  const [isInitialLoad, setIsInitialLoad] = useState(true);
  const [selectedSelection, setSelectedSelection] = useState<string>(""); 
  const [documents, setDocuments] = useState<any[]>([]);
  const [isDeleting, setIsDeleting] = useState(false);
  
  // Integration State
  const embedMode = searchParams.get("mode") === "embed";
  
  // Right Panel: Open by default ONLY if NOT in embed mode
  const [isRightPanelOpen, setIsRightPanelOpen] = useState(!embedMode); 
  const [isFilterPanelOpen, setIsFilterPanelOpen] = useState(false);
  
  // View State
  const [viewEntities, setViewEntities] = useState<Entity[]>([]);
  const [viewRelationships, setViewRelationships] = useState<Relationship[]>([]);
  
  // Filter States
  const [allEntityTypes, setAllEntityTypes] = useState<string[]>([]);
  const [allRelTypes, setAllRelTypes] = useState<string[]>([]);
  const [selectedEntityFilters, setSelectedEntityFilters] = useState<string[]>([]);
  const [selectedRelFilters, setSelectedRelFilters] = useState<string[]>([]);

  // Forms & Context Menu
  const [showEntityForm, setShowEntityForm] = useState(false);
  const [editingEntity, setEditingEntity] = useState<Entity | null>(null);
  const [showRelationshipForm, setShowRelationshipForm] = useState(false);
  const [editingRelationship, setEditingRelationship] = useState<Relationship | null>(null);
  const [relationshipFromId, setRelationshipFromId] = useState<string | undefined>();
  const [relationshipToId, setRelationshipToId] = useState<string | undefined>();
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; target: ContextMenuTarget; nodeId?: string; edgeId?: string; } | null>(null);

  // --- DATA SYNC & STABILIZATION ---
  const stableEntities = useMemo(() => {
      let rawList: Entity[] = [];
      if (entities instanceof Map) rawList = Array.from(entities.values());
      else if (Array.isArray(entities)) rawList = entities;
      return rawList;
  }, [entities]);

  const stableRelationships = useMemo(() => relationships || [], [relationships]);

  // Extract Types for Filters
  useEffect(() => {
    if (stableEntities.length > 0) {
      const typeSet = new Set<string>();
      stableEntities.forEach(e => {
          const clean = String(e.type || "Concept").trim(); 
          if (clean) typeSet.add(clean);
      });
      const uniqueTypes = Array.from(typeSet).sort();
      setAllEntityTypes(prev => JSON.stringify(prev) === JSON.stringify(uniqueTypes) ? prev : uniqueTypes);
      setSelectedEntityFilters(prev => prev.length === 0 ? uniqueTypes : prev);
    }
    if (stableRelationships.length > 0) {
      const rTypes = Array.from(new Set(stableRelationships.map(r => r.type))).sort();
      setAllRelTypes(prev => JSON.stringify(prev) === JSON.stringify(rTypes) ? prev : rTypes);
      setSelectedRelFilters(prev => prev.length === 0 ? rTypes : prev);
    }
  }, [stableEntities, stableRelationships]);

  // --- FETCH DOCUMENTS ---
  const fetchDocuments = useCallback(async () => {
    try { 
      const res = await fetch(`${API_URL}/api/documents`); 
      if (res.ok) { 
        const data = await res.json();
        const docsList = data.files || (Array.isArray(data) ? data : []);
        setDocuments(docsList);
        return docsList; 
      } 
      return [];
    } catch (e) { 
      console.error("Failed to fetch documents:", e);
      setDocuments([]); 
      return [];
    }
  }, []);

  const handleSelectionChange = async (value: string) => {
      setSelectedSelection(value);
      if (!value) await loadGraph(null); // Load all
      else await loadGraph({ document_id: value });
  };

  // --- INITIALIZATION (STRICT MATCHING) ---
  useEffect(() => {
    const initIntegration = async () => {
        const docs = await fetchDocuments();
        
        // Check URL Params (from GenUI)
        const globalDomain = searchParams.get("domain");
        const globalDocId = searchParams.get("docId");
        
        if (globalDocId) {
            // STRICT LOGIC: Must match to load
            const targetDocNorm = normalize(globalDocId);
            const targetDomainNorm = normalize(globalDomain);

            const match = docs.find((d: any) => {
                const fName = normalize(d.filename || d.documentId);
                const docMatches = fName.includes(targetDocNorm);
                
                // If domain exists, check it too
                if (targetDomainNorm) {
                    return docMatches && (fName.includes(targetDomainNorm) || (d.domain && normalize(d.domain).includes(targetDomainNorm)));
                }
                return docMatches;
            });

            if (match) {
                console.log(`Auto-selecting matched file: ${match.filename}`);
                setSelectedSelection(match.id);
                // Trigger load immediately for the match
                await loadGraph({ document_id: match.id });
            } else {
                console.warn(`STRICT MODE: No matching file found for DocID: ${globalDocId}. Waiting...`);
                // DO NOT LOAD GRAPH if no match in embed mode
            }
        } else {
             // If normal user (no params), load entire graph on start
             if (isInitialLoad && !embedMode) await loadGraph(null);
        }
        setIsInitialLoad(false);
    };
    initIntegration();
  }, [fetchDocuments, searchParams, loadGraph, embedMode]); 
  
  // --- VIEW LIMITER (Performance) ---
  useEffect(() => {
    if (stableEntities.length === 0) {
      setViewEntities([]); setViewRelationships([]);
      return;
    }
    const timer = setTimeout(() => {
        const nodesToShow = stableEntities.slice(0, 1500); // Cap at 1500 nodes
        
        if (selectedEntity && !nodesToShow.find(n => getId(n) === getId(selectedEntity))) {
            const found = stableEntities.find(n => getId(n) === getId(selectedEntity));
            if (found) nodesToShow.push(found);
        }
        
        const validIds = new Set(nodesToShow.map(n => getId(n)));
        const validEdges = stableRelationships.filter(r => 
            validIds.has(getId(r.from)) && validIds.has(getId(r.to))
        );
        
        setViewEntities(nodesToShow);
        setViewRelationships(validEdges);
    }, 50);
    return () => clearTimeout(timer);
  }, [stableEntities, stableRelationships, selectedEntity]);

  // --- NODE SELECTION HANDLER ---
  const handleNodeSelect = useCallback((id: string) => {
      const targetId = String(id).trim();
      const targetNorm = normalize(targetId);

      let entity = stableEntities.find(x => {
          const xId = String(getId(x));
          const xLabel = String(x.label || "");
          return (
              xId === targetId || normalize(xId) === targetNorm || 
              xLabel === targetId || normalize(xLabel) === targetNorm
          );
      });

      if (!entity) entity = viewEntities.find(x => normalize(getId(x)) === targetNorm);

      if (entity) {
          setSelectedEntity(entity);
          setActiveTab("details");
          setIsRightPanelOpen(true);
      } else {
          toast.error("Node details unavailable");
      }
  }, [stableEntities, viewEntities, setSelectedEntity, setActiveTab]);

  const handleForceRefresh = () => { 
      if (graphRef.current) graphRef.current.fit(); 
      fetchDocuments(); 
      if(selectedSelection) handleSelectionChange(selectedSelection); 
      else if(!embedMode) loadGraph(null);
  };
  
  const handleDeleteFile = async () => {
    if (!selectedSelection) return; 
    const doc = documents.find(d => d.id === selectedSelection); 
    if (!doc || !confirm(`Delete "${doc.filename || doc.documentId}"?`)) return;
    
    setIsDeleting(true); 
    try { 
        await fetch(`${API_URL}/api/documents`, { 
            method: 'DELETE', 
            headers: { 'Content-Type': 'application/json' }, 
            body: JSON.stringify({ id: doc.id, filename: doc.filename, documentId: doc.documentId }), 
        });
        toast.success("File deleted"); 
        setDocuments(prev => prev.filter(d => d.id !== selectedSelection)); 
        setSelectedSelection(""); 
        await loadGraph(null); 
    } catch (e) { toast.error("Failed to delete"); } 
    finally { setIsDeleting(false); }
  };

  // --- RENDER HELPERS ---
  const tabs = [ 
    { id: "upload", label: "Upload", icon: Upload }, 
    { id: "input", label: "Input", icon: FileText }, 
    { id: "details", label: "Details", icon: Info }, 
    { id: "settings", label: "Settings", icon: Settings }, 
  ];

  return (
      <div className="min-h-screen bg-[#020617] flex flex-col md:flex-row overflow-hidden text-[#F8FAFC]">
        
        {/* FILTER PANEL (Left, conditional) */}
        {isFilterPanelOpen && (
          <div className="hidden md:block border-r border-[#334155] bg-[#0F172A] w-64 shrink-0">
            <FilterPanel
              entityTypes={allEntityTypes} relationshipTypes={allRelTypes}
              selectedEntities={selectedEntityFilters} selectedRelationships={selectedRelFilters}
              onToggleEntity={(t) => setSelectedEntityFilters(p => p.includes(t) ? p.filter(x=>x!==t) : [...p,t])}
              onToggleRelationship={(t) => setSelectedRelFilters(p => p.includes(t) ? p.filter(x=>x!==t) : [...p,t])}
              onClose={() => setIsFilterPanelOpen(false)}
            />
          </div>
        )}

        {/* MAIN CANVAS AREA */}
        <div className="flex-1 flex flex-col h-full overflow-hidden bg-[#020617]">
          
          {/* --- FIX: SPECIAL HEADER FOR EMBED MODE --- */}
          {embedMode && (
            <div className="bg-[#0F172A] border-b border-[#334155] px-4 py-2 flex items-center justify-between z-20">
                <div className="flex items-center gap-3">
                    <div className="w-2 h-2 rounded-full bg-[#10B981] shadow-[0_0_8px_rgba(16,185,129,0.5)]" />
                    <span className="text-sm text-slate-400">
                        Context: <span className="text-blue-400 font-medium">{searchParams.get("domain") || "General"}</span> 
                        <span className="mx-2 text-slate-600">/</span>
                        <span className="text-white font-medium">{searchParams.get("docId") || "Waiting for selection..."}</span>
                    </span>
                </div>
                <div className="text-xs text-[#94A3B8]">
                    {viewEntities.length} nodes
                </div>
            </div>
          )}

          {/* STANDARD HEADER: Hidden in Embed Mode */}
          {!embedMode && (
            <header className="bg-[#0F172A] border-b border-[#334155] shadow-sm z-20 px-6 py-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <h2 className="text-xl font-semibold text-white">Knowledge Graph POC</h2>
                    <button onClick={handleForceRefresh} className="p-1 hover:bg-[#1E293B] rounded-full" title="Refresh Data">
                        <RefreshCw className="w-4 h-4 text-[#94A3B8]" />
                    </button>
                    <div className="w-3 h-3 rounded-full bg-[#10B981]" title="Connected" />
                </div>
                
                <div className="flex items-center gap-4">
                    <div className="text-sm text-[#94A3B8]">
                    {viewEntities.length < stableEntities.length ? `Viewing ${viewEntities.length} of ${stableEntities.length}` : `${stableEntities.length} entities`}
                    </div>
                    {/* Toggle Right Panel Button */}
                    <button onClick={() => setIsRightPanelOpen(!isRightPanelOpen)} className="p-2 hover:bg-[#1E293B] rounded-lg text-[#94A3B8]" title="Toggle Sidebar">
                        {isRightPanelOpen ? <PanelRightClose className="w-5 h-5" /> : <PanelRightOpen className="w-5 h-5" />}
                    </button>
                </div>
            </header>
          )}

          <div className="flex-1 flex flex-row overflow-hidden">
            <div className="flex-1 flex flex-col min-w-0 transition-all duration-300 ease-in-out">
              
              {/* FILE SELECTOR BAR: Hidden in Embed Mode */}
              {!embedMode && (
                <div className="bg-[#0F172A] border-b border-[#334155] px-4 py-2 flex items-center justify-end gap-3">
                   <div className="flex items-center gap-2 max-w-lg w-full">
                     <select 
                       value={selectedSelection} 
                       onChange={(e) => handleSelectionChange(e.target.value)} 
                       className="flex-1 p-2 border border-[#334155] bg-[#1E293B] text-white rounded-md text-sm outline-none focus:border-blue-500"
                     >
                       <option value="">-- Load Entire Graph --</option>
                       {documents.map(doc => (
                         <option key={doc.id} value={doc.id}>
                           {doc.filename || doc.documentId} ({doc.entityCount || '?'} nodes)
                         </option>
                       ))}
                     </select>
                     <button onClick={handleDeleteFile} disabled={!selectedSelection} className="p-2 text-red-400 bg-[#1E293B] hover:bg-[#334155] rounded-md border border-[#334155]" title="Delete Selected File">
                        <Trash2 className="w-4 h-4" />
                     </button>
                   </div>
                </div>
              )}

              {/* GRAPH TOOLBAR (Zoom, Search, Filter Toggle) */}
              <GraphControls
                graphRef={graphRef}
                onCreateNode={() => setShowEntityForm(true)}
                onCreateRelationship={() => setShowRelationshipForm(true)}
                onSearch={async (q) => { 
                    const match = stableEntities.find(e => (e.label||"").toLowerCase().includes(q.toLowerCase()));
                    if(match) { toast.success("Found!"); handleNodeSelect(match.id); } 
                    else toast.error("Not found");
                }}
                onAnalyze={async () => toast.success("Analysis complete")}
                isFilterPanelOpen={isFilterPanelOpen}
                onToggleFilterPanel={() => setIsFilterPanelOpen(!isFilterPanelOpen)}
              />

              {/* GRAPH VISUALIZATION */}
              <div className="flex-1 relative p-0 bg-[#020617] overflow-hidden">
                {isInitialLoad ? (
                  <div className="absolute inset-0 flex items-center justify-center flex-col gap-2">
                      <RefreshCw className="w-8 h-8 animate-spin text-blue-500" />
                      <p className="text-[#94A3B8]">Loading Graph Data...</p>
                  </div>
                ) : (
                  <div className="absolute inset-0 w-full h-full">
                    <GraphVisualization
                      ref={graphRef}
                      entities={viewEntities}
                      relationships={viewRelationships}
                      selectedDocumentId={selectedSelection}
                      onNodeSelect={handleNodeSelect}
                      onNodeDeselect={() => {
                          setSelectedEntity(null);
                          if(embedMode) setIsRightPanelOpen(false); 
                      }}
                      onContextMenu={(x, y, t, n, e) => setContextMenu({ x, y, target: t, nodeId: n, edgeId: e })}
                      onCreateNode={() => setShowEntityForm(true)}
                      onCreateRelationship={(f, t) => { setRelationshipFromId(f); setRelationshipToId(t); setShowRelationshipForm(true); }}
                    />
                  </div>
                )}
              </div>
            </div>
            
            {/* RIGHT PANEL: Details, Upload, Settings */}
            <div className={`${isRightPanelOpen ? "w-80 lg:w-96 border-l opacity-100" : "w-0 border-l-0 opacity-0"} bg-[#0F172A] border-[#334155] flex flex-col z-10 transition-all duration-300 ease-in-out overflow-hidden`}>
              
              {/* TABS (Hidden in Embed Mode) */}
              {!embedMode && (
                  <div className="flex border-b border-[#334155] overflow-x-auto min-w-[320px]">
                    {tabs.map((tab: any) => {
                      const Icon = tab.icon;
                      return (
                        <button key={tab.id} onClick={() => setActiveTab(tab.id)} className={`flex-1 min-w-[60px] flex items-center justify-center gap-1 py-3 text-xs lg:text-sm font-medium transition-colors ${activeTab === tab.id ? "text-[#2563EB] border-b-2 border-[#2563EB] bg-[#1E293B]" : "text-[#94A3B8] hover:bg-[#1E293B]"}`}>
                          <Icon className="w-4 h-4" /> <span className="hidden sm:inline">{tab.label}</span>
                        </button>
                      );
                    })}
                  </div>
              )}

              {/* PANEL CONTENT */}
              <div className="flex-1 overflow-y-auto p-4 bg-[#0F172A] text-[#F8FAFC] min-w-[320px]">
                {embedMode ? (
                    // In Embed Mode, only show Node Details
                    <NodeDetailPanel 
                        onClose={() => { setSelectedEntity(null); setIsRightPanelOpen(false); }} 
                        onCreateRelationship={() => setShowRelationshipForm(true)}
                        onEditRelationship={() => setShowRelationshipForm(true)}
                        onDeleteRelationship={deleteRelationship}
                    />
                ) : (
                    // Standard Mode: Show whatever tab is active
                    <>
                        {activeTab === "upload" && <FileUpload />}
                        {activeTab === "input" && <TextInput />}
                        {activeTab === "details" && <NodeDetailPanel onClose={() => setSelectedEntity(null)} onCreateRelationship={() => setShowRelationshipForm(true)} onEditRelationship={() => setShowRelationshipForm(true)} onDeleteRelationship={deleteRelationship} />}
                        {activeTab === "settings" && <SettingsPanel />}
                    </>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* MODALS */}
        {showEntityForm && <EntityForm entity={editingEntity || undefined} existingTypes={allEntityTypes} onSubmit={async(d) => { await createEntity(d); setShowEntityForm(false); }} onCancel={() => setShowEntityForm(false)} />}
        {showRelationshipForm && <RelationshipForm fromEntityId={relationshipFromId} toEntityId={relationshipToId} relationship={editingRelationship || undefined} entities={stableEntities} existingRelationships={stableRelationships} onSubmit={async(f,t,y,p) => { await createRelationship(f,t,y,p); setShowRelationshipForm(false); }} onCancel={() => setShowRelationshipForm(false)} />}
        
        {/* CONTEXT MENU */}
        {contextMenu && <ContextMenu x={contextMenu.x} y={contextMenu.y} target={contextMenu.target} onCreateNode={() => setShowEntityForm(true)} onEditNode={() => { if(contextMenu.nodeId) { const e = stableEntities.find(x => getId(x) === contextMenu.nodeId); if (e) { setEditingEntity(e); setShowEntityForm(true); } } setContextMenu(null); }} onDeleteNode={() => { if(contextMenu.nodeId && confirm("Delete node?")) deleteEntity(contextMenu.nodeId); setContextMenu(null); }} onCreateRelationship={() => { setRelationshipFromId(contextMenu.nodeId); setShowRelationshipForm(true); setContextMenu(null); }} onEditEdge={() => setShowRelationshipForm(true)} onDeleteEdge={() => { if(contextMenu.edgeId && confirm("Delete edge?")) deleteRelationship(contextMenu.edgeId); setContextMenu(null); }} onClose={() => setContextMenu(null)} />}
        
        <Toaster position="top-right" toastOptions={{ style: { background: '#1E293B', color: '#F8FAFC', border: '1px solid #334155' } }} />
      </div>
  );
}

export default function Home() {
  return (
    <ErrorBoundary>
      <Suspense fallback={ <div className="min-h-screen bg-[#020617] flex items-center justify-center text-[#F8FAFC]"> <div className="flex flex-col items-center gap-4"> <RefreshCw className="w-8 h-8 animate-spin text-[#2563EB]" /> <p className="text-lg">Initializing Knowledge Graph...</p> </div> </div> }>
        <HomeContent />
      </Suspense>
    </ErrorBoundary>
  );
}