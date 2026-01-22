"use client";

import { useEffect, useRef, useState, useMemo, useCallback, Suspense } from "react";
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
import { Upload, FileText, Info, Settings, RefreshCw, Trash2 } from "lucide-react";
import type { Entity, Relationship } from "@/types";

import { API_URL } from "@/lib/constants";

const getId = (item: any): string => {
  if (!item) return "";
  if (typeof item === 'string') return item;
  return String(item.id || item);
};

// Internal component containing the main logic
function GraphExplorer() {
  const graphRef = useRef<GraphVisualizationRef>(null);
  
  // 1. GET RAW DATA FROM STORE
  const { activeTab, setActiveTab, setSelectedEntity, selectedEntity, entities, relationships } = useGraphStore();
  
  // 2. USE API HOOK
  const { loadGraph, searchGraph, analyzeGraph, createEntity, updateEntity, deleteEntity, createRelationship, deleteRelationship } = useGraph();

  const [isInitialLoad, setIsInitialLoad] = useState(true);
  const [selectedDocumentId, setSelectedDocumentId] = useState<string | null>(null);
  const [documents, setDocuments] = useState<any[]>([]);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isFilterPanelOpen, setIsFilterPanelOpen] = useState(true);
  
  // View State
  const [viewEntities, setViewEntities] = useState<Entity[]>([]);
  const [viewRelationships, setViewRelationships] = useState<Relationship[]>([]);
  
  // Forms & Context Menu
  const [showEntityForm, setShowEntityForm] = useState(false);
  const [editingEntity, setEditingEntity] = useState<Entity | null>(null);
  const [showRelationshipForm, setShowRelationshipForm] = useState(false);
  const [editingRelationship, setEditingRelationship] = useState<Relationship | null>(null);
  const [relationshipFromId, setRelationshipFromId] = useState<string | undefined>();
  const [relationshipToId, setRelationshipToId] = useState<string | undefined>();
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; target: ContextMenuTarget; nodeId?: string; edgeId?: string; } | null>(null);
  
  // Filters
  const [allEntityTypes, setAllEntityTypes] = useState<string[]>([]);
  const [allRelTypes, setAllRelTypes] = useState<string[]>([]);
  const [selectedEntityFilters, setSelectedEntityFilters] = useState<string[]>([]);
  const [selectedRelFilters, setSelectedRelFilters] = useState<string[]>([]);

  // --- FIX: CONVERT MAP TO ARRAY ---
  const stableEntities = useMemo(() => {
      // If store uses Map, convert to Array
      if (entities instanceof Map) {
          return Array.from(entities.values());
      }
      // If store uses Array, return as is
      if (Array.isArray(entities)) {
          return entities;
      }
      return [];
  }, [entities]);

  const stableRelationships = useMemo(() => relationships || [], [relationships]);

  // --- 1. FETCH DOCUMENTS & INIT ---
  const fetchDocuments = useCallback(async () => {
    try { 
      const res = await fetch(`${API_URL}/api/documents`); 
      if (res.ok) { 
        const data = await res.json();
        setDocuments(data.files || data || []); 
      } 
    } catch (e) { 
      console.error(e); 
      setDocuments([]); 
    }
  }, []);

  useEffect(() => {
    const init = async () => { 
        try { 
            await fetchDocuments(); 
            await loadGraph(null); 
        } catch (e) { console.error(e); } 
        finally { setIsInitialLoad(false); } 
    };
    init();
  }, [loadGraph, fetchDocuments]);
  
  // Reload when document selection changes
  useEffect(() => { 
      if (!isInitialLoad) {
          const filters = selectedDocumentId ? { document_id: selectedDocumentId } : null;
          loadGraph(filters).catch(console.error); 
      }
  }, [selectedDocumentId, loadGraph, isInitialLoad]);

  // --- 2. PREPARE VIEW DATA ---
  useEffect(() => {
    if (stableEntities.length === 0) {
      setViewEntities([]); setViewRelationships([]);
      return;
    }
    const timer = setTimeout(() => {
        // Safe slicing since stableEntities is now guaranteed to be an Array
        const nodesToShow = stableEntities.slice(0, 500); 
        
        if (selectedEntity && !nodesToShow.find(n => getId(n) === getId(selectedEntity))) {
            nodesToShow.push(selectedEntity);
        }

        const validIds = new Set(nodesToShow.map(n => getId(n)));
        const validEdges = stableRelationships.filter(r => 
            validIds.has(getId(r.from)) && validIds.has(getId(r.to))
        );

        setViewEntities(nodesToShow);
        setViewRelationships(validEdges);
    }, 10);
    return () => clearTimeout(timer);
  }, [stableEntities, stableRelationships, selectedEntity]);

  // --- 3. FILTER LOGIC (Aggressive Deduplication) ---
  useEffect(() => {
    if (stableEntities.length > 0) {
      // 1. Get all raw types
      const rawTypes = stableEntities.map(e => e.type || "Concept");
      
      // 2. Create a Set to remove duplicates
      const typeSet = new Set<string>();
      
      rawTypes.forEach(t => {
          // Force string, trim whitespace, and normalize case
          const clean = String(t).trim(); 
          if (clean) {
              // Capitalize first letter (e.g. "activity" -> "Activity")
              const formatted = clean.charAt(0).toUpperCase() + clean.slice(1).toLowerCase();
              typeSet.add(formatted);
          }
      });

      // 3. Convert Set back to Array and Sort
      const uniqueTypes = Array.from(typeSet).sort();
      
      // Update state only if changed to prevent loops
      setAllEntityTypes(prev => JSON.stringify(prev) === JSON.stringify(uniqueTypes) ? prev : uniqueTypes);
      
      // Default: Select all types if none selected
      setSelectedEntityFilters(prev => prev.length === 0 ? uniqueTypes : prev);
    }

    if (stableRelationships.length > 0) {
      const rTypes = Array.from(new Set(stableRelationships.map(r => r.type))).sort();
      setAllRelTypes(prev => JSON.stringify(prev) === JSON.stringify(rTypes) ? prev : rTypes);
      setSelectedRelFilters(prev => prev.length === 0 ? rTypes : prev);
    }
  }, [stableEntities, stableRelationships]);
  
  // Apply Filters to Graph
  useEffect(() => { 
      if (graphRef.current) { 
          graphRef.current.filterByType(selectedEntityFilters); 
          graphRef.current.filterByRelationship(selectedRelFilters); 
      } 
  }, [selectedEntityFilters, selectedRelFilters]);

  // --- 4. HANDLERS ---
  const handleSearch = async (query: string) => {
    const term = query.toLowerCase().trim();
    if (!term) { 
        if (graphRef.current) { graphRef.current.searchAndHighlight(""); graphRef.current.fit(); } 
        setSelectedEntity(null); 
        return; 
    }
    
    // 1. Local Search First
    const match = stableEntities.find(e => (e.label || "").toLowerCase().includes(term));
    if (match) {
      toast.success(`Found: ${match.label}`); 
      setSelectedEntity(match); 
      setTimeout(() => { if (graphRef.current) graphRef.current.searchAndHighlight(query); }, 100);
      return;
    }

    // 2. Backend Search Fallback
    const result = await searchGraph(term);
    if (result && result.results && result.results.length > 0) {
       toast.success(`Found ${result.results.length} matches`);
    } else {
       toast.error("Node not found");
    }
  };

  const handleDeleteFile = async () => {
    if (!selectedDocumentId) return; 
    const doc = documents.find(d => d.id === selectedDocumentId); 
    if (!doc || !confirm(`Delete "${doc.filename}"?`)) return;
    
    setIsDeleting(true); 
    try { 
        const response = await fetch(`${API_URL}/api/documents`, { 
            method: 'DELETE', 
            headers: { 'Content-Type': 'application/json' }, 
            body: JSON.stringify({ filename: doc.filename }), 
        });
        if (response.ok) { 
            toast.success("File deleted"); 
            setDocuments(prev => prev.filter(d => d.id !== selectedDocumentId)); 
            setSelectedDocumentId(null); 
            await loadGraph(null); 
        } else throw new Error("Delete failed"); 
    } catch (e) { toast.error("Failed to delete file"); } 
    finally { setIsDeleting(false); }
  };

  // CRUD Handlers
  const handleEntitySubmit = async (data: any) => { 
      try { 
          if (editingEntity) await updateEntity(editingEntity.id, data); 
          else await createEntity(data); 
          
          setShowEntityForm(false); 
          setEditingEntity(null); 
          toast.success("Entity saved"); 
      } catch (e) { toast.error("Failed"); } 
  };
  
  const handleRelationshipSubmit = async (from: string, to: string, type: string, props?: any) => { 
      try { 
          if (editingRelationship) {
              toast.error("Edit edge not supported yet");
          } else {
              await createRelationship(from, to, type, props); 
          }
          setShowRelationshipForm(false); 
          setEditingRelationship(null); 
          toast.success("Relationship saved"); 
      } catch (e) { toast.error("Failed"); } 
  };
  
  const handleEditNode = (id?: string) => { 
      const e = stableEntities.find(x => getId(x) === id); 
      if (e) { setEditingEntity(e); setShowEntityForm(true); setContextMenu(null); } 
  };
  
  const handleDeleteNode = async (id?: string) => { 
      if (id && confirm("Delete node?")) { 
          await deleteEntity(id); 
          setContextMenu(null); 
      } 
  };
  
  const handleEditRelationship = (id?: string) => { 
      const r = stableRelationships.find(x => getId(x) === id); 
      if (r) { 
          setEditingRelationship(r); 
          setRelationshipFromId(r.from); 
          setRelationshipToId(r.to); 
          setShowRelationshipForm(true); 
          setContextMenu(null); 
      } 
  };
  
  const handleDeleteRelationship = async (id?: string) => { 
      if (id && confirm("Delete relationship?")) { 
          await deleteRelationship(id); 
          setContextMenu(null); 
      } 
  };
  
  const handleCreateRelationship = (arg?: string | unknown) => { 
      setEditingRelationship(null); 
      setRelationshipFromId(typeof arg === 'string' ? arg : contextMenu?.nodeId || selectedEntity?.id); 
      setRelationshipToId(undefined); 
      setShowRelationshipForm(true); 
      setContextMenu(null); 
  };
  
  const handleCreateNode = () => { 
      setEditingEntity(null); 
      setShowEntityForm(true); 
      setContextMenu(null); 
  };
  
  const handleAnalyze = async () => { 
      const t = toast.loading("Analyzing..."); 
      try { 
          await analyzeGraph('community_detection'); 
          toast.success("Done!", { id: t }); 
      } catch (e) { toast.error("Failed", { id: t }); } 
  };
  
  const handleForceRefresh = () => { 
      if (graphRef.current) graphRef.current.fit(); 
      fetchDocuments(); 
      const filters = selectedDocumentId ? { document_id: selectedDocumentId } : null;
      loadGraph(filters); 
  };
  
  const toggleEntityFilter = (type: string) => setSelectedEntityFilters(prev => prev.includes(type) ? prev.filter(t => t !== type) : [...prev, type]);
  const toggleRelFilter = (type: string) => setSelectedRelFilters(prev => prev.includes(type) ? prev.filter(t => t !== type) : [...prev, type]);

  const tabs = [ { id: "upload", label: "Upload", icon: Upload }, { id: "input", label: "Input", icon: FileText }, { id: "details", label: "Details", icon: Info }, { id: "settings", label: "Settings", icon: Settings }, ];

  return (
    <ErrorBoundary>
      <div className="min-h-screen bg-[#020617] flex flex-col md:flex-row overflow-hidden text-[#F8FAFC]">
        <div className="hidden md:block bg-[#0F172A] border-r border-[#334155]">
            <MainSidebar />
        </div>
        {isFilterPanelOpen && (
          <div className="hidden md:block border-r border-[#334155] bg-[#0F172A]">
            <FilterPanel
              entityTypes={allEntityTypes} relationshipTypes={allRelTypes}
              selectedEntities={selectedEntityFilters} selectedRelationships={selectedRelFilters}
              onToggleEntity={toggleEntityFilter} onToggleRelationship={toggleRelFilter}
              onClose={() => setIsFilterPanelOpen(false)}
            />
          </div>
        )}
        <div className="flex-1 flex flex-col h-full overflow-hidden bg-[#020617]">
          {/* Header */}
          <header className="bg-[#0F172A] border-b border-[#334155] shadow-sm z-20 px-6 py-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <h2 className="text-xl font-semibold text-white">Knowledge Graph POC</h2>
              <button onClick={handleForceRefresh} className="p-1 hover:bg-[#1E293B] rounded-full transition-colors"><RefreshCw className="w-4 h-4 text-[#94A3B8]" /></button>
              <div className="w-3 h-3 rounded-full bg-[#10B981]" />
            </div>
            <div className="text-sm text-[#94A3B8]">
              {viewEntities.length < stableEntities.length ? `Viewing ${viewEntities.length} of ${stableEntities.length}` : `${stableEntities.length} entities`}
            </div>
          </header>

          <div className="flex-1 flex flex-row overflow-hidden">
            <div className="flex-1 flex flex-col min-w-0">
              {/* Controls Bar */}
              <div className="bg-[#0F172A] border-b border-[#334155] px-4 py-2 flex items-center justify-end gap-3">
                <div className="flex items-center gap-2 max-w-md w-full">
                  <select value={selectedDocumentId || ""} onChange={(e) => setSelectedDocumentId(e.target.value || null)} className="flex-1 p-2 border border-[#334155] bg-[#1E293B] text-white rounded-md text-sm">
                    <option value="">-- Load All / Select File --</option>
                    {documents.map((doc) => <option key={doc.id} value={doc.id}>{doc.filename} ({doc.entityCount} nodes{doc.relationCount ? `, ${doc.relationCount} edges` : ''})</option>)}
                  </select>
                  <button onClick={handleDeleteFile} disabled={!selectedDocumentId || isDeleting} className="p-2 text-red-400 bg-[#1E293B] hover:bg-[#334155] rounded-md disabled:opacity-50 border border-[#334155] transition-colors"><Trash2 className="w-4 h-4" /></button>
                </div>
              </div>

              <GraphControls
                graphRef={graphRef}
                onCreateNode={handleCreateNode}
                onCreateRelationship={() => handleCreateRelationship(null)}
                onSearch={handleSearch}
                onAnalyze={handleAnalyze}
                isFilterPanelOpen={isFilterPanelOpen}
                onToggleFilterPanel={() => setIsFilterPanelOpen(true)}
              />

              {/* Visualization Canvas */}
              <div className="flex-1 relative p-0 bg-[#020617]">
                {isInitialLoad ? (
                  <div className="absolute inset-0 flex items-center justify-center"><p className="text-[#94A3B8]">Loading...</p></div>
                ) : (
                  <div className="absolute inset-0 overflow-hidden">
                    <GraphVisualization
                      ref={graphRef}
                      entities={viewEntities}
                      relationships={viewRelationships}
                      selectedDocumentId={selectedDocumentId}
                      onNodeSelect={(id) => { const e = stableEntities.find(x => getId(x) === id); if (e) { setSelectedEntity(e); setActiveTab("details"); } }}
                      onNodeDeselect={() => setSelectedEntity(null)}
                      onContextMenu={(x, y, t, n, e) => setContextMenu({ x, y, target: t, nodeId: n, edgeId: e })}
                      onCreateNode={handleCreateNode}
                      onCreateRelationship={(f, t) => { setRelationshipFromId(f); setRelationshipToId(t); setShowRelationshipForm(true); }}
                    />
                  </div>
                )}
              </div>
            </div>
            
            {/* Right Sidebar */}
            <div className="w-80 lg:w-96 bg-[#0F172A] border-l border-[#334155] flex flex-col z-10">
              <div className="flex border-b border-[#334155] overflow-x-auto">
                {tabs.map((tab: any) => {
                  const Icon = tab.icon;
                  return (
                    <button key={tab.id} onClick={() => setActiveTab(tab.id)} className={`flex-1 min-w-[60px] flex items-center justify-center gap-1 py-3 text-xs lg:text-sm font-medium transition-colors ${activeTab === tab.id ? "text-[#2563EB] border-b-2 border-[#2563EB] bg-[#1E293B]" : "text-[#94A3B8] hover:bg-[#1E293B]"}`}>
                      <Icon className="w-4 h-4" /> <span className="hidden sm:inline">{tab.label}</span>
                    </button>
                  );
                })}
              </div>
              <div className="flex-1 overflow-y-auto p-4 bg-[#0F172A] text-[#F8FAFC]">
                {activeTab === "upload" && <FileUpload />}
                {activeTab === "input" && <TextInput />}
                {activeTab === "details" && <NodeDetailPanel onClose={() => setSelectedEntity(null)} onCreateRelationship={handleCreateRelationship} onEditRelationship={handleEditRelationship} onDeleteRelationship={handleDeleteRelationship} />}
                {activeTab === "settings" && <SettingsPanel />}
              </div>
            </div>
          </div>
        </div>

        {/* Modals */}
        {showEntityForm && <EntityForm entity={editingEntity || undefined} existingTypes={allEntityTypes} onSubmit={handleEntitySubmit} onCancel={() => setShowEntityForm(false)} />}
        {showRelationshipForm && <RelationshipForm fromEntityId={relationshipFromId} toEntityId={relationshipToId} relationship={editingRelationship || undefined} entities={stableEntities} existingRelationships={stableRelationships} onSubmit={handleRelationshipSubmit} onCancel={() => setShowRelationshipForm(false)} />}
        {contextMenu && <ContextMenu x={contextMenu.x} y={contextMenu.y} target={contextMenu.target} onCreateNode={handleCreateNode} onEditNode={() => handleEditNode(contextMenu.nodeId)} onDeleteNode={() => handleDeleteNode(contextMenu.nodeId)} onCreateRelationship={() => handleCreateRelationship(contextMenu.nodeId)} onEditEdge={() => handleEditRelationship(contextMenu.edgeId)} onDeleteEdge={() => handleDeleteRelationship(contextMenu.edgeId)} onClose={() => setContextMenu(null)} />}
        <Toaster position="top-right" toastOptions={{ style: { background: '#1E293B', color: '#F8FAFC', border: '1px solid #334155' } }} />
      </div>
    </ErrorBoundary>
  );
}

// Export default wrapping the explorer in Suspense
export default function Home() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center bg-[#020617] text-[#94A3B8]">Loading...</div>}>
      <GraphExplorer />
    </Suspense>
  );
}
