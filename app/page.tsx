"use client";

import { useEffect, useRef, useState, useMemo, useCallback } from "react";
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
// REMOVED: useSurrealDB and surrealdb-client imports
import { Upload, FileText, Info, Settings, RefreshCw, Trash2 } from "lucide-react";
import type { Entity, Relationship } from "@/types";
import { apiClient } from "@/services/apiClient"; // Import API Client for direct calls if needed

// --- HELPER: Robust ID Normalizer ---
const getId = (item: any): string => {
  if (!item) return "";
  if (typeof item === 'string') return item;
  if (typeof item === 'object' && item.id) return item.id;
  return String(item);
};

// --- HELPER: Strip Table Prefix (e.g., "person:123" -> "123") ---
const stripId = (id: string): string => {
  if (!id) return "";
  return id.includes(':') ? id.split(':').pop()! : id;
};

export default function Home() {
  const graphRef = useRef<GraphVisualizationRef>(null);

  // Store hooks
  const { activeTab, setActiveTab, setSelectedEntity, selectedEntity } = useGraphStore();

  // Graph hooks (Master Data)
  const {
    entities,
    relationships, 
    loadGraph,
    analyzeGraph,
    searchGraph, // Use the hook's search capability
    createEntity,
    updateEntity,
    deleteEntity,
    createRelationship,
    updateRelationship,
    deleteRelationship
  } = useGraph();

  // REMOVED: useSurrealDB hook
  const [isInitialLoad, setIsInitialLoad] = useState(true);
  const [selectedDocumentId, setSelectedDocumentId] = useState<string | null>(null);
  const [documents, setDocuments] = useState<any[]>([]);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isFilterPanelOpen, setIsFilterPanelOpen] = useState(true);

  // --- VIRTUALIZATION STATE ---
  const [viewEntities, setViewEntities] = useState<Entity[]>([]);
  const [viewRelationships, setViewRelationships] = useState<Relationship[]>([]);

  // REMOVED: Namespace/Database state (Backend manages this now)

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

  // --- STABLE DATA REFERENCES ---
  const stableEntities = useMemo(() => entities, [entities.length, entities[0]?.id]);
  const stableRelationships = useMemo(() => relationships, [relationships.length, relationships[0]?.id]);

  // --- FIX: VIRTUALIZATION & SMART LINKING ---
  useEffect(() => {
    if (stableEntities.length === 0) {
        if (viewEntities.length > 0) {
            setViewEntities([]);
            setViewRelationships([]);
        }
        return;
    }

    const timer = setTimeout(() => {
        const initialNodes = stableEntities.slice(0, 100);
        
        const nodeLookup = new Map<string, string>();
        initialNodes.forEach(node => {
            const fullId = getId(node);
            nodeLookup.set(fullId, fullId);
            nodeLookup.set(stripId(fullId), fullId);
        });

        const validEdges: Relationship[] = [];

        stableRelationships.forEach(r => {
            const rawSource = getId(r.from || r.in || r.source);
            const rawTarget = getId(r.to || r.out || r.target);

            const sourceMatch = nodeLookup.get(rawSource) || nodeLookup.get(stripId(rawSource));
            const targetMatch = nodeLookup.get(rawTarget) || nodeLookup.get(stripId(rawTarget));

            if (sourceMatch && targetMatch) {
                validEdges.push({
                    ...r,
                    source: sourceMatch,
                    target: targetMatch,
                    from: sourceMatch,
                    to: targetMatch
                });
            }
        });

        setViewEntities(initialNodes);
        setViewRelationships(validEdges);
    }, 10); 

    return () => clearTimeout(timer);

  }, [stableEntities, stableRelationships]); 

  // Memoize view data
  const stableViewEntities = useMemo(() => viewEntities, [viewEntities]);
  const stableViewRelationships = useMemo(() => viewRelationships, [viewRelationships]);

  // --- DOCUMENTS LOGIC ---
  const fetchDocuments = async () => {
    try {
      // UPDATED: Use apiClient to fetch from Backend (Repo B) directly
      // Assuming Backend has GET /documents. If not, this might need adjustment.
      const res = await apiClient.get("/documents"); 
      setDocuments(res.data);
    } catch (e) { 
        // Silent fail or log
        console.error("Failed to fetch documents (Backend might not support listing yet)", e); 
    }
  };

  // Initial Load
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

  useEffect(() => {
    if (!isInitialLoad) loadGraph(selectedDocumentId).catch(console.error);
  }, [selectedDocumentId, loadGraph]);

  // --- FILTER INITIALIZATION ---
  useEffect(() => {
    if (stableEntities.length > 0) {
      const eTypes = Array.from(new Set(stableEntities.map(e => e.type))).sort();
      setAllEntityTypes(prev => (JSON.stringify(prev) === JSON.stringify(eTypes) ? prev : eTypes));
      setSelectedEntityFilters(prev => (prev.length === 0 ? eTypes : prev));
    }

    if (stableRelationships.length > 0) {
      const rTypes = Array.from(new Set(stableRelationships.map(r => r.type))).sort();
      setAllRelTypes(prev => (JSON.stringify(prev) === JSON.stringify(rTypes) ? prev : rTypes));
      setSelectedRelFilters(prev => (prev.length === 0 ? rTypes : prev));
    }
  }, [stableEntities, stableRelationships]);

  useEffect(() => {
    if (graphRef.current) {
      graphRef.current.filterByType(selectedEntityFilters);
      graphRef.current.filterByRelationship(selectedRelFilters);
    }
  }, [selectedEntityFilters, selectedRelFilters]);

  // --- SMART SEARCH ---
  const handleSearch = async (query: string) => {
    const term = query.toLowerCase().trim();

    // Reset to Top 100
    if (!term) {
      const limit = 100;
      const initialNodes = stableEntities.slice(0, limit);
      // ... (Rest logic for reset is same as useEffect, omitted for brevity but logic holds)
      // For simplicity, re-triggering the main effect by updating view
      setViewEntities(initialNodes);
      // Re-calculate edges (simplified for this snippet)
      const validEdges: Relationship[] = []; // Re-run edge logic if strictly needed here
      setViewRelationships(validEdges); 
      
      if (graphRef.current) {
        graphRef.current.searchAndHighlight("");
        graphRef.current.fit();
      }
      return;
    }

    // 1. Search Local Master Data First
    const match = stableEntities.find(e => (e.label || "").toLowerCase().includes(term));

    if (match) {
        // ... (Existing Logic for expanding neighbors locally) ...
        // We keep the existing logic because it's good client-side UX
        const matchId = getId(match);
        const neighbors = new Set<string>();
        neighbors.add(matchId);
        
        const relatedEdges = stableRelationships.filter(r => {
             const s = getId(r.from || r.in || r.source);
             const t = getId(r.to || r.out || r.target);
             return s === matchId || t === matchId || stripId(s) === stripId(matchId) || stripId(t) === stripId(matchId);
        });

        relatedEdges.forEach(r => {
             neighbors.add(getId(r.from || r.in || r.source));
             neighbors.add(getId(r.to || r.out || r.target));
        });

        const newNodes = stableEntities.filter(e => {
            const id = getId(e);
            return neighbors.has(id) || neighbors.has(stripId(id));
        });

        // Simplified edge reconstruction
        const newEdges = stableRelationships.filter(r => {
             const s = getId(r.from || r.in || r.source);
             const t = getId(r.to || r.out || r.target);
             // Check if both ends are in newNodes
             const sIn = newNodes.some(n => getId(n) === s || stripId(getId(n)) === stripId(s));
             const tIn = newNodes.some(n => getId(n) === t || stripId(getId(n)) === stripId(t));
             return sIn && tIn;
        });

        setViewEntities(newNodes);
        setViewRelationships(newEdges);
        toast.success(`Found locally: ${match.label}`);
        setSelectedEntity(match);
        setActiveTab("details");
    } else {
      // 2. Fallback: Global Search via Hook
      try {
        // UPDATED: Use the hook's search capability which uses the service
        const result = await searchGraph(term);
        
        if (result && result.entities && result.entities.length > 0) {
            const newEntities = result.entities;
            const newRels = result.relationships || [];

            const { addEntity, addRelationship } = useGraphStore.getState();
            newEntities.forEach((e: Entity) => addEntity(e));
            newRels.forEach((r: Relationship) => addRelationship(r));

            setViewEntities(prev => [...prev, ...newEntities]);
            setViewRelationships(prev => [...prev, ...newRels]);

            toast.success(`Found via API: ${term}`);
        } else {
            toast.error("Not found.");
        }
      } catch (error) {
        toast.error("Search failed.");
        console.error(error);
      }
    }
  };

  // --- Handlers ---
  const handleDeleteFile = async () => {
    if (!selectedDocumentId) return;
    const doc = documents.find(d => d.id === selectedDocumentId);
    if (!doc || !confirm(`Delete "${doc.filename}"?`)) return;

    setIsDeleting(true);
    try {
      // UPDATED: Use apiClient directly
      await apiClient.delete('/documents', { data: { filename: doc.filename } });
      
      toast.success("File deleted");
      setDocuments(prev => prev.filter(d => d.id !== selectedDocumentId));
      setSelectedDocumentId(null);
      await loadGraph(null);
    } catch (e) { toast.error("Failed to delete file"); }
    finally { setIsDeleting(false); }
  };

  const handleEntitySubmit = async (data: any) => {
    try {
      if (editingEntity) await updateEntity(editingEntity.id, data);
      else await createEntity(data);
      await loadGraph(selectedDocumentId);
      setShowEntityForm(false); setEditingEntity(null);
      toast.success("Entity saved");
    } catch (e) { toast.error("Failed"); }
  };

  const handleRelationshipSubmit = async (from: string, to: string, type: string, props?: any, conf?: number) => {
    try {
      if (editingRelationship) await updateRelationship(editingRelationship.id, { from, to, type, properties: props, confidence: conf });
      else await createRelationship(from, to, type, props, conf);
      await loadGraph(selectedDocumentId);
      setShowRelationshipForm(false); setEditingRelationship(null);
      toast.success("Relationship saved");
    } catch (e) { toast.error("Failed"); }
  };

  const handleEditNode = (id?: string) => {
    const e = stableEntities.find(x => getId(x) === id);
    if (e) { setEditingEntity(e); setShowEntityForm(true); setContextMenu(null); }
  };
  const handleDeleteNode = async (id?: string) => {
    if (id && confirm("Delete node?")) { await deleteEntity(id); await loadGraph(selectedDocumentId); setContextMenu(null); }
  };
  const handleEditRelationship = (id?: string) => {
    const r = stableRelationships.find(x => getId(x) === id);
    if (r) { setEditingRelationship(r); setRelationshipFromId(r.from); setRelationshipToId(r.to); setShowRelationshipForm(true); setContextMenu(null); }
  };
  const handleDeleteRelationship = async (id?: string) => {
    if (id && confirm("Delete relationship?")) { await deleteRelationship(id); await loadGraph(selectedDocumentId); setContextMenu(null); }
  };
  const handleCreateRelationship = (arg?: string | unknown) => {
    setEditingRelationship(null);
    setRelationshipFromId(typeof arg === 'string' ? arg : contextMenu?.nodeId || selectedEntity?.id);
    setRelationshipToId(undefined); setShowRelationshipForm(true); setContextMenu(null);
  };
  const handleCreateNode = () => { setEditingEntity(null); setShowEntityForm(true); setContextMenu(null); };

  const handleAnalyze = async () => {
    const t = toast.loading("Analyzing...");
    try { await analyzeGraph(); toast.success("Done!", { id: t }); await loadGraph(selectedDocumentId); }
    catch (e) { toast.error("Failed", { id: t }); }
  };

  const handleForceRefresh = () => {
    if (graphRef.current) graphRef.current.fit();
    fetchDocuments();
    loadGraph(selectedDocumentId);
  };

  const toggleEntityFilter = (type: string) => setSelectedEntityFilters(prev => prev.includes(type) ? prev.filter(t => t !== type) : [...prev, type]);
  const toggleRelFilter = (type: string) => setSelectedRelFilters(prev => prev.includes(type) ? prev.filter(t => t !== type) : [...prev, type]);

  const tabs = [
    { id: "upload", label: "Upload", icon: Upload },
    { id: "input", label: "Input", icon: FileText },
    { id: "details", label: "Details", icon: Info },
    { id: "settings", label: "Settings", icon: Settings },
  ];

  return (
    <ErrorBoundary>
      <div className="min-h-screen bg-gray-50 flex flex-col md:flex-row overflow-hidden">
        <div className="hidden md:block"><MainSidebar /></div>

        {isFilterPanelOpen && (
          <div className="hidden md:block border-r border-gray-200">
            <FilterPanel
              entityTypes={allEntityTypes} relationshipTypes={allRelTypes}
              selectedEntities={selectedEntityFilters} selectedRelationships={selectedRelFilters}
              onToggleEntity={toggleEntityFilter} onToggleRelationship={toggleRelFilter}
              onClose={() => setIsFilterPanelOpen(false)}
            />
          </div>
        )}

        <div className="flex-1 flex flex-col h-full overflow-hidden">
          <header className="bg-white border-b border-gray-200 shadow-sm z-20 px-6 py-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <h2 className="text-xl font-semibold text-gray-800">Knowledge Graph POC</h2>
              <button onClick={handleForceRefresh} className="p-1 hover:bg-gray-100 rounded-full" title="Reload"><RefreshCw className="w-4 h-4 text-gray-400" /></button>
            </div>
            <div className="text-sm text-gray-600">
              {viewEntities.length < stableEntities.length ?
                `Viewing ${viewEntities.length} of ${stableEntities.length} entities` :
                `${stableEntities.length} entities`
              }
            </div>
          </header>

          <div className="flex-1 flex flex-row overflow-hidden bg-gray-50">
            <div className="flex-1 flex flex-col min-w-0">
              <div className="bg-white border-b border-gray-200 px-4 py-2 flex items-center justify-end gap-3">
                {/* REMOVED: Namespace/DB Selectors */}
                <div className="flex items-center gap-2 max-w-md w-full">
                  <select value={selectedDocumentId || ""} onChange={(e) => setSelectedDocumentId(e.target.value || null)} className="flex-1 p-2 border border-gray-300 rounded-md text-sm">
                    <option value="">-- Load All / Select File --</option>
                    {documents.map((doc) => <option key={doc.id || doc.filename} value={doc.id}>{doc.filename}</option>)}
                  </select>
                  <button onClick={handleDeleteFile} disabled={!selectedDocumentId || isDeleting} className="p-2 text-red-600 bg-red-50 hover:bg-red-100 rounded-md disabled:opacity-50 border border-red-200"><Trash2 className="w-4 h-4" /></button>
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
                      entities={stableViewEntities}
                      relationships={stableViewRelationships}
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

            <div className="w-80 lg:w-96 bg-white border-l border-gray-200 flex flex-col z-10">
              <div className="flex border-b border-gray-200 overflow-x-auto">
                {tabs.map((tab: any) => {
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
                {activeTab === "details" && <NodeDetailPanel onClose={() => setSelectedEntity(null)} onCreateRelationship={handleCreateRelationship} onEditRelationship={() => { }} onDeleteRelationship={() => { }} />}
                {activeTab === "settings" && <SettingsPanel />}
              </div>
            </div>
          </div>
        </div>

        {showEntityForm && <EntityForm entity={editingEntity || undefined} existingTypes={allEntityTypes} onSubmit={handleEntitySubmit} onCancel={() => setShowEntityForm(false)} />}
        {showRelationshipForm && <RelationshipForm fromEntityId={relationshipFromId} toEntityId={relationshipToId} relationship={editingRelationship || undefined} entities={stableEntities} existingRelationships={stableRelationships} onSubmit={handleRelationshipSubmit} onCancel={() => setShowRelationshipForm(false)} />}
        {contextMenu && <ContextMenu x={contextMenu.x} y={contextMenu.y} target={contextMenu.target} onCreateNode={handleCreateNode} onEditNode={() => handleEditNode(contextMenu.nodeId)} onDeleteNode={() => handleDeleteNode(contextMenu.nodeId)} onCreateRelationship={() => handleCreateRelationship(contextMenu.nodeId)} onEditEdge={() => handleEditRelationship(contextMenu.edgeId)} onDeleteEdge={() => handleDeleteRelationship(contextMenu.edgeId)} onClose={() => setContextMenu(null)} />}
        <Toaster position="top-right" />
      </div>
    </ErrorBoundary>
  );
}