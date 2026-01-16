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
import { Upload, FileText, Info, Settings, RefreshCw, Trash2 } from "lucide-react";
import type { Entity, Relationship } from "@/types";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

const getId = (item: any): string => {
  if (!item) return "";
  if (typeof item === 'string') return item;
  if (typeof item === 'object' && item.id) return item.id;
  return String(item);
};
const stripId = (id: string): string => {
  if (!id) return "";
  return id.includes(':') ? id.split(':').pop()! : id;
};

export default function Home() {
  const graphRef = useRef<GraphVisualizationRef>(null);
  const { activeTab, setActiveTab, setSelectedEntity, selectedEntity } = useGraphStore();
  const { entities, relationships, loadGraph, analyzeGraph, searchGraph, createEntity, updateEntity, deleteEntity, createRelationship, updateRelationship, deleteRelationship } = useGraph();

  const isConnected = true; 
  const [isInitialLoad, setIsInitialLoad] = useState(true);
  const [selectedDocumentId, setSelectedDocumentId] = useState<string | null>(null);
  const [documents, setDocuments] = useState<any[]>([]);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isFilterPanelOpen, setIsFilterPanelOpen] = useState(true);
  const [viewEntities, setViewEntities] = useState<Entity[]>([]);
  const [viewRelationships, setViewRelationships] = useState<Relationship[]>([]);
  const [namespaces, setNamespaces] = useState<string[]>([]);
  const [databases, setDatabases] = useState<string[]>([]);
  const [selectedNamespace, setSelectedNamespace] = useState<string>("");
  const [selectedDatabase, setSelectedDatabase] = useState<string>("");
  const [showEntityForm, setShowEntityForm] = useState(false);
  const [editingEntity, setEditingEntity] = useState<Entity | null>(null);
  const [showRelationshipForm, setShowRelationshipForm] = useState(false);
  const [editingRelationship, setEditingRelationship] = useState<Relationship | null>(null);
  const [relationshipFromId, setRelationshipFromId] = useState<string | undefined>();
  const [relationshipToId, setRelationshipToId] = useState<string | undefined>();
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; target: ContextMenuTarget; nodeId?: string; edgeId?: string; } | null>(null);
  const [allEntityTypes, setAllEntityTypes] = useState<string[]>([]);
  const [allRelTypes, setAllRelTypes] = useState<string[]>([]);
  const [selectedEntityFilters, setSelectedEntityFilters] = useState<string[]>([]);
  const [selectedRelFilters, setSelectedRelFilters] = useState<string[]>([]);

  const stableEntities = useMemo(() => entities, [entities.length, entities[0]?.id]);
  const stableRelationships = useMemo(() => relationships, [relationships.length, relationships[0]?.id]);

  useEffect(() => {
    if (stableEntities.length === 0) {
      if (viewEntities.length > 0) { setViewEntities([]); setViewRelationships([]); }
      return;
    }
    const timer = setTimeout(() => {
        const nodesToShow = stableEntities.slice(0, 150); // Show more nodes if needed
        if (selectedEntity) {
            const isVisible = nodesToShow.some(n => getId(n) === getId(selectedEntity));
            if (!isVisible) nodesToShow.push(selectedEntity);
        }
        const nodeLookup = new Map<string, string>();
        nodesToShow.forEach(node => {
            const fullId = getId(node);
            nodeLookup.set(fullId, fullId);
            nodeLookup.set(stripId(fullId), fullId);
        });
        const validEdges: Relationship[] = [];
        stableRelationships.forEach(rel => {
            const r = rel as any;
            const rawSource = getId(r.from || r.in || r.source);
            const rawTarget = getId(r.to || r.out || r.target);
            const sourceMatch = nodeLookup.get(rawSource) || nodeLookup.get(stripId(rawSource));
            const targetMatch = nodeLookup.get(rawTarget) || nodeLookup.get(stripId(rawTarget));
            if (sourceMatch && targetMatch) {
                validEdges.push({ ...rel, from: sourceMatch, to: targetMatch });
            }
        });
        setViewEntities(nodesToShow);
        setViewRelationships(validEdges);
    }, 10);
    return () => clearTimeout(timer);
  }, [stableEntities, stableRelationships, selectedEntity]);

  const stableViewEntities = useMemo(() => viewEntities, [viewEntities]);
  const stableViewRelationships = useMemo(() => viewRelationships, [viewRelationships]);

  const fetchNamespaces = useCallback(async () => {
    try { setNamespaces(["AzureCosmosDB"]); setSelectedNamespace("AzureCosmosDB"); } catch (e) { console.error(e); }
  }, []);
  const fetchDatabases = useCallback(async (ns: string) => {
    if (!ns) { setDatabases([]); return; }
    try { setDatabases(["GraphDB"]); setSelectedDatabase("GraphDB"); } catch (e) { console.error(e); }
  }, []);
  const handleNamespaceChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newNs = e.target.value; setSelectedNamespace(newNs); if (newNs) fetchDatabases(newNs);
  };
  const handleDatabaseChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newDb = e.target.value; setSelectedDatabase(newDb); toast.success(`Active Database: ${newDb}`); fetchDocuments();
  };

  const fetchDocuments = async () => {
    try { 
      const res = await fetch(`${API_URL}/api/documents`); 
      if (res.ok) { 
        const data = await res.json();
        const docsArray = Array.isArray(data) ? data : (data.files || []);
        setDocuments(docsArray); 
      } 
    } catch (e) { 
      console.error(e); 
      setDocuments([]); 
    }
  };

  useEffect(() => {
    const init = async () => { try { await fetchDocuments(); await loadGraph(selectedDocumentId || null); if (isConnected) fetchNamespaces(); } catch (e) { console.error(e); } finally { setIsInitialLoad(false); } };
    init();
  }, [loadGraph, isConnected, fetchNamespaces]);
  
  // Reload graph when document selection changes
  useEffect(() => { 
      if (!isInitialLoad) {
          loadGraph(selectedDocumentId).catch(console.error); 
          if(graphRef.current) graphRef.current.resetZoom();
      }
  }, [selectedDocumentId, loadGraph]);

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
  
  useEffect(() => { if (graphRef.current) { graphRef.current.filterByType(selectedEntityFilters); graphRef.current.filterByRelationship(selectedRelFilters); } }, [selectedEntityFilters, selectedRelFilters]);

  const handleSearch = async (query: string) => {
    const term = query.toLowerCase().trim();
    if (!term) { if (graphRef.current) { graphRef.current.searchAndHighlight(""); graphRef.current.fit(); } setSelectedEntity(null); return; }
    const match = stableEntities.find(e => (e.label || "").toLowerCase().includes(term));
    if (match) {
      toast.success(`Found: ${match.label}`); setSelectedEntity(match); setActiveTab("details");
      setTimeout(() => { if (graphRef.current) graphRef.current.searchAndHighlight(query); }, 100);
    } else {
      try {
        const result = await searchGraph(term); const newEntities = result?.entities || []; const newRels = result?.relationships || [];
        if (newEntities.length > 0) {
          const { addEntity, addRelationship } = useGraphStore.getState(); newEntities.forEach((e: Entity) => addEntity(e)); newRels.forEach((r: Relationship) => addRelationship(r));
          const newMatch = newEntities.find((e: Entity) => (e.label || "").toLowerCase().includes(term));
          if (newMatch) { toast.success(`Found in database: ${newMatch.label}`); setSelectedEntity(newMatch); setActiveTab("details"); setTimeout(() => { if (graphRef.current) graphRef.current.searchAndHighlight(query); }, 200); }
        } else { toast.error("Node not found."); }
      } catch (error) { toast.error("Global search error"); }
    }
  };

  const handleDeleteFile = async () => {
    if (!selectedDocumentId) return; const doc = documents.find(d => d.id === selectedDocumentId); if (!doc || !confirm(`Delete "${doc.filename}"?`)) return;
    setIsDeleting(true); try { const response = await fetch(`${API_URL}/api/documents`, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ filename: doc.filename }), });
      if (response.ok) { toast.success("File deleted"); setDocuments(prev => prev.filter(d => d.id !== selectedDocumentId)); setSelectedDocumentId(null); await loadGraph(null); } else throw new Error("Delete failed"); } catch (e) { toast.error("Failed to delete file"); } finally { setIsDeleting(false); }
  };
  const handleEntitySubmit = async (data: any) => { try { if (editingEntity) await updateEntity(editingEntity.id, data); else await createEntity(data); await loadGraph(selectedDocumentId); setShowEntityForm(false); setEditingEntity(null); toast.success("Entity saved"); } catch (e) { toast.error("Failed"); } };
  const handleRelationshipSubmit = async (from: string, to: string, type: string, props?: any, conf?: number) => { try { if (editingRelationship) await updateRelationship(editingRelationship.id, { from, to, type, properties: props, confidence: conf }); else await createRelationship(from, to, type, props, conf); await loadGraph(selectedDocumentId); setShowRelationshipForm(false); setEditingRelationship(null); toast.success("Relationship saved"); } catch (e) { toast.error("Failed"); } };
  const handleEditNode = (id?: string) => { const e = stableEntities.find(x => getId(x) === id); if (e) { setEditingEntity(e); setShowEntityForm(true); setContextMenu(null); } };
  const handleDeleteNode = async (id?: string) => { if (id && confirm("Delete node?")) { await deleteEntity(id); await loadGraph(selectedDocumentId); setContextMenu(null); } };
  const handleEditRelationship = (id?: string) => { const r = stableRelationships.find(x => getId(x) === id); if (r) { setEditingRelationship(r); setRelationshipFromId(r.from); setRelationshipToId(r.to); setShowRelationshipForm(true); setContextMenu(null); } };
  const handleDeleteRelationship = async (id?: string) => { if (id && confirm("Delete relationship?")) { await deleteRelationship(id); await loadGraph(selectedDocumentId); setContextMenu(null); } };
  const handleCreateRelationship = (arg?: string | unknown) => { setEditingRelationship(null); setRelationshipFromId(typeof arg === 'string' ? arg : contextMenu?.nodeId || selectedEntity?.id); setRelationshipToId(undefined); setShowRelationshipForm(true); setContextMenu(null); };
  const handleCreateNode = () => { setEditingEntity(null); setShowEntityForm(true); setContextMenu(null); };
  const handleAnalyze = async () => { const t = toast.loading("Analyzing..."); try { await analyzeGraph(); toast.success("Done!", { id: t }); await loadGraph(selectedDocumentId); } catch (e) { toast.error("Failed", { id: t }); } };
  const handleForceRefresh = () => { if (graphRef.current) graphRef.current.fit(); fetchDocuments(); loadGraph(selectedDocumentId); if (isConnected) fetchNamespaces(); };
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
          <header className="bg-[#0F172A] border-b border-[#334155] shadow-sm z-20 px-6 py-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <h2 className="text-xl font-semibold text-white">Knowledge Graph POC</h2>
              <button onClick={handleForceRefresh} className="p-1 hover:bg-[#1E293B] rounded-full transition-colors"><RefreshCw className="w-4 h-4 text-[#94A3B8]" /></button>
              <div className={`w-3 h-3 rounded-full ${isConnected ? "bg-[#10B981]" : "bg-[#94A3B8]"}`} />
            </div>
            <div className="text-sm text-[#94A3B8]">
              {viewEntities.length < stableEntities.length ? `Viewing ${viewEntities.length} of ${stableEntities.length}` : `${stableEntities.length} entities`}
            </div>
          </header>
          <div className="flex-1 flex flex-row overflow-hidden">
            <div className="flex-1 flex flex-col min-w-0">
              <div className="bg-[#0F172A] border-b border-[#334155] px-4 py-2 flex items-center justify-end gap-3">
                <select value={selectedNamespace} onChange={handleNamespaceChange} className="p-2 border border-[#334155] bg-[#1E293B] text-white rounded-md text-sm min-w-[120px] focus:ring-2 focus:ring-[#2563EB]">
                  <option value="">Select NS</option>
                  {namespaces.map(ns => <option key={ns} value={ns}>{ns}</option>)}
                </select>
                <select value={selectedDatabase} onChange={handleDatabaseChange} disabled={!selectedNamespace} className="p-2 border border-[#334155] bg-[#1E293B] text-white rounded-md text-sm min-w-[120px] disabled:opacity-50">
                  <option value="">Select DB</option>
                  {databases.map(db => <option key={db} value={db}>{db}</option>)}
                </select>
                <div className="h-6 w-px bg-[#334155] mx-1"></div>
                <div className="flex items-center gap-2 max-w-md w-full">
                  <select value={selectedDocumentId || ""} onChange={(e) => setSelectedDocumentId(e.target.value || null)} className="flex-1 p-2 border border-[#334155] bg-[#1E293B] text-white rounded-md text-sm">
                    <option value="">-- Load All / Select File --</option>
                    {documents.map((doc) => <option key={doc.id} value={doc.id}>{doc.filename} ({doc.entityCount} nodes)</option>)}
                  </select>
                  <button onClick={handleDeleteFile} disabled={!selectedDocumentId || isDeleting} className="p-2 text-red-400 bg-[#1E293B] hover:bg-[#334155] rounded-md disabled:opacity-50 border border-[#334155] transition-colors"><Trash2 className="w-4 h-4" /></button>
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
              <div className="flex-1 relative p-0 bg-[#020617]">
                {isInitialLoad ? (
                  <div className="absolute inset-0 flex items-center justify-center"><p className="text-[#94A3B8]">Loading...</p></div>
                ) : (
                  <div className="absolute inset-0 overflow-hidden">
                    <GraphVisualization
                      ref={graphRef}
                      entities={stableViewEntities}
                      relationships={stableViewRelationships}
                      selectedDocumentId={selectedDocumentId} // PASSED HERE
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
                {activeTab === "details" && <NodeDetailPanel onClose={() => setSelectedEntity(null)} onCreateRelationship={handleCreateRelationship} onEditRelationship={() => { }} onDeleteRelationship={() => { }} />}
                {activeTab === "settings" && <SettingsPanel />}
              </div>
            </div>
          </div>
        </div>
        {showEntityForm && <EntityForm entity={editingEntity || undefined} existingTypes={allEntityTypes} onSubmit={handleEntitySubmit} onCancel={() => setShowEntityForm(false)} />}
        {showRelationshipForm && <RelationshipForm fromEntityId={relationshipFromId} toEntityId={relationshipToId} relationship={editingRelationship || undefined} entities={stableEntities} existingRelationships={stableRelationships} onSubmit={handleRelationshipSubmit} onCancel={() => setShowRelationshipForm(false)} />}
        {contextMenu && <ContextMenu x={contextMenu.x} y={contextMenu.y} target={contextMenu.target} onCreateNode={handleCreateNode} onEditNode={() => handleEditNode(contextMenu.nodeId)} onDeleteNode={() => handleDeleteNode(contextMenu.nodeId)} onCreateRelationship={() => handleCreateRelationship(contextMenu.nodeId)} onEditEdge={() => handleEditRelationship(contextMenu.edgeId)} onDeleteEdge={() => handleDeleteRelationship(contextMenu.edgeId)} onClose={() => setContextMenu(null)} />}
        <Toaster position="top-right" toastOptions={{ style: { background: '#1E293B', color: '#F8FAFC', border: '1px solid #334155' } }} />
      </div>
    </ErrorBoundary>
  );
}