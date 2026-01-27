"use client";

import { useMemo } from "react";
import { useGraphStore } from "@/lib/store";
import { X, Edit2, Trash2, Plus, ArrowRight, ArrowLeft, Share2, BrainCircuit, ShieldCheck, AlertTriangle } from "lucide-react";

interface NodeDetailPanelProps {
  onClose: () => void;
  onCreateRelationship: (nodeId: string) => void;
  onEditRelationship: (id: string) => void;
  onDeleteRelationship: (id: string) => void;
}

export default function NodeDetailPanel({
  onClose,
  onCreateRelationship,
  onEditRelationship,
  onDeleteRelationship
}: NodeDetailPanelProps) {
  const { selectedEntity, relationships, entities, deleteEntity } = useGraphStore();
  
  // =========================================================
  // HOOKS MUST BE CALLED UNCONDITIONALLY AT THE TOP
  // =========================================================

  // 1. FILTER RELATIONSHIPS
  const nodeRelationships = useMemo(() => {
    if (!selectedEntity) return [];
    return relationships.filter(
      (r) => r.from === selectedEntity.id || r.to === selectedEntity.id
    );
  }, [selectedEntity, relationships]);

  // 2. PREPARE PROPERTIES (Moved ABOVE the return statement)
  const displayProps = useMemo(() => {
      if (!selectedEntity) return [];

      // A. Get properties from nested object OR spread top-level if legacy
      const raw = selectedEntity.properties || {};
      
      // B. Merge with specific top-level fields we want to show
      const merged = { ...raw };
      if ((selectedEntity as any).confidence) merged.confidence = (selectedEntity as any).confidence;
      
      // C. Filter out system keys that shouldn't be in the list
      const blockList = ['id', 'label', 'type', 'x', 'y', 'vx', 'vy', 'index', 'group', 'normType', 'confidence', 'justification'];
      
      return Object.entries(merged).filter(([key]) => !blockList.includes(key));
  }, [selectedEntity]);

  // =========================================================
  // CONDITIONAL RENDER CHECK
  // =========================================================
  if (!selectedEntity) return null;

  // 3. COLOR LOGIC
  const getEntityColor = (type: string) => {
      const t = String(type || "concept").toLowerCase().replace(/\s+/g, '');
      switch (t) {
        // --- CORE SUBJECTS (The "Case" Files) ---
        case 'case':          return '#60a5fa'; // Pastel Blue
        case 'claim':         return '#3b82f6'; // Bright Blue
        case 'quote':         return '#818cf8'; // Indigo
        case 'policy':        return '#6366f1'; // Violet
        case 'lead':          return '#a78bfa'; // Light Purple
        case 'complaint':     return '#c084fc'; // Purple
        case 'session':       return '#8b5cf6'; // Darker Violet
        case 'transaction':   return '#2563eb'; // Royal Blue
        case 'investigation': return '#4f46e5'; // Deep Indigo
        case 'endorsement':   return '#7c3aed'; // Deep Purple
        case 'renewal':       return '#9333ea'; // Magenta Purple

        // --- PEOPLE & ACTORS ---
        case 'customer':      return '#f472b6'; // Pastel Pink
        case 'person':        return '#ec4899'; // Bright Pink
        case 'agent':         return '#db2777'; // Deep Pink
        case 'authority':     return '#be185d'; // Maroon Pink
        case 'profession':    return '#fda4af'; // Light Rose
        case 'demographic':   return '#fb7185'; // Rose

        // --- FINANCE & METRICS ---
        case 'amount':        return '#34d399'; // Emerald
        case 'financialvalue':return '#10b981'; // Green
        case 'metric':        return '#2dd4bf'; // Teal
        case 'score':         return '#14b8a6'; // Dark Teal
        case 'deductible':    return '#059669'; // Dark Green
        case 'liability':     return '#047857'; // Forest Green

        // --- RISK & ALERTS ---
        case 'cause':         return '#fb923c'; // Orange
        case 'risk':          return '#f87171'; // Light Red
        case 'accident':      return '#ef4444'; // Red
        case 'flag':          return '#dc2626'; // Dark Red
        case 'alert':         return '#ea580c'; // Burnt Orange
        case 'fraud':         return '#b91c1c'; // Blood Red
        case 'effect':        return '#991b1b'; // Deep Red

        // --- PROCESS & TIME ---
        case 'activity':      return '#22d3ee'; // Bright Cyan
        case 'action':        return '#06b6d4'; // Darker Cyan
        case 'time':          return '#94a3b8'; // Blue Gray
        case 'timestamp':     return '#64748b'; // Slate Gray
        case 'outcome':       return '#0ea5e9'; // Sky Blue
        case 'status':        return '#0284c7'; // Steel Blue

        // --- ASSETS & THINGS ---
        case 'product':       return '#facc15'; // Yellow
        case 'asset':         return '#a3e635'; // Lime
        case 'vehicle':       return '#84cc16'; // Dark Lime
        case 'device':        return '#d9f99d'; // Pale Lime
        case 'document':      return '#fef08a'; // Pale Yellow
        case 'channel':       return '#fbbf24'; // Amber

        // --- LOCATIONS ---
        case 'branch':        return '#d6d3d1'; // Stone Gray
        case 'location':      return '#a8a29e'; // Warm Gray
        case 'state':         return '#78716c'; // Brownish Gray
        case 'region':        return '#57534e'; // Dark Brown

        // --- DEFAULT ---
        case 'concept':       return '#cbd5e1'; // Light Slate
        default:              return '#475569'; // Default Slate
      }
  };

  const typeLabel = selectedEntity.type || selectedEntity.properties?.normType || "Concept";
  const entityColor = getEntityColor(typeLabel);

  const getNodeLabel = (id: string) => {
    if (entities instanceof Map) {
        return entities.get(id)?.label || id;
    }
    if (Array.isArray(entities)) {
        return (entities as any[]).find((e) => e.id === id)?.label || id;
    }
    return id;
  };

  const handleDelete = () => {
    if (confirm(`Delete ${selectedEntity.label}?`)) {
      deleteEntity(selectedEntity.id);
      onClose();
    }
  };

  const ConfidenceBar = ({ score }: { score?: number }) => {
    const val = score !== undefined ? score : 1.0;
    const percentage = Math.round(val * 100);
    
    let colorClass = "bg-green-500";
    if (val < 0.5) colorClass = "bg-red-500";
    else if (val < 0.8) colorClass = "bg-yellow-500";

    return (
        <div className="flex items-center gap-2 mt-1">
            <div className="flex-1 h-1.5 bg-slate-700 rounded-full overflow-hidden">
                <div className={`h-full ${colorClass}`} style={{ width: `${percentage}%` }} />
            </div>
            <span className="text-[10px] font-bold text-slate-400">{percentage}%</span>
        </div>
    );
  };

  return (
    <div className="h-full flex flex-col bg-[#0F172A] border-l border-[#334155] shadow-2xl w-80 lg:w-96 z-50">
      
      {/* --- HEADER --- */}
      <div className="relative p-6 border-b border-[#334155] bg-[#1E293B]">
        <div className="absolute top-0 left-0 w-full h-1.5" style={{ backgroundColor: entityColor, boxShadow: `0 0 15px ${entityColor}` }} />
        
        <div className="flex justify-between items-start">
          <div className="flex-1 pr-4">
              <h2 className="text-2xl font-black text-white leading-tight break-words font-sans">
                {selectedEntity.label}
              </h2>
              <div className="mt-2 flex items-center gap-2 flex-wrap">
                <span className="inline-block px-3 py-1 rounded-full text-xs font-bold text-[#020617] shadow-lg border border-white/20 uppercase tracking-wide" 
                      style={{ backgroundColor: entityColor }}>
                  {typeLabel}
                </span>
                <span className="text-[10px] text-slate-500 font-mono">#{selectedEntity.id.slice(0,6)}</span>
              </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-700 rounded-full text-[#94A3B8] transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-5 space-y-6">
        
        {/* --- INTELLIGENCE CARD --- */}
        <div className="bg-slate-800/50 rounded-lg p-4 border border-slate-700/50">
            <h3 className="text-xs font-bold text-blue-400 uppercase tracking-wider mb-2 flex items-center gap-2">
                <BrainCircuit className="w-3 h-3" /> AI Analysis
            </h3>
            {selectedEntity.properties?.justification ? (
                <p className="text-sm text-slate-300 italic leading-relaxed mb-3">
                    "{selectedEntity.properties.justification}"
                </p>
            ) : (
                <p className="text-xs text-slate-500 italic mb-3">No AI justification available for this entity.</p>
            )}
            <div className="mb-1">
                <div className="flex justify-between text-[10px] uppercase font-bold text-slate-400">
                    <span>Entity Confidence</span>
                    <ShieldCheck className="w-3 h-3" />
                </div>
                <ConfidenceBar score={selectedEntity.properties?.confidence} />
            </div>
        </div>

        {/* --- PROPERTIES SECTION (Using Unconditional Hook Result) --- */}
        <div>
            <h3 className="text-xs font-bold text-[#64748B] uppercase tracking-wider mb-3">Raw Properties</h3>
            {displayProps.length > 0 ? (
                <div className="bg-[#1E293B] rounded-lg border border-[#334155] divide-y divide-[#334155]">
                   {displayProps.map(([key, val]) => (
                      <div key={key} className="p-3">
                        <span className="block text-[10px] font-bold text-[#94A3B8] uppercase mb-0.5">{key.replace(/_/g, ' ')}</span>
                        <span className="block text-sm text-white break-words">{String(val)}</span>
                      </div>
                   ))}
                </div>
            ) : (
                <div className="p-4 text-center text-xs text-[#64748B] italic bg-[#1E293B] rounded-lg">No raw properties defined</div>
            )}
        </div>

        {/* --- RELATIONSHIPS SECTION --- */}
        <div>
           <div className="flex items-center justify-between mb-4">
            <h3 className="text-xs font-bold text-[#64748B] uppercase tracking-wider">Relationships ({nodeRelationships.length})</h3>
            <button onClick={() => onCreateRelationship(selectedEntity.id)} className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded flex items-center gap-1 transition-all">
                <Plus className="w-3 h-3" /> Add
            </button>
          </div>
          
          <div className="space-y-3">
            {nodeRelationships.length > 0 ? (
                nodeRelationships.map((rel) => {
                    const isSource = rel.from === selectedEntity.id;
                    const otherId = isSource ? rel.to : rel.from;
                    const otherName = getNodeLabel(otherId);
                    const arrowColor = isSource ? 'text-green-400' : 'text-orange-400';
                    const rType = rel.type as string;
                    const isCausal = rType === 'CAUSES' || rType === 'RESULTED_IN' || rType === 'LED_TO';
                    const relTypeColor = isCausal 
                        ? 'text-red-400 border-red-900 bg-red-900/30' 
                        : 'text-blue-400 border-blue-800 bg-blue-900/30';
                    const confidence = (rel as any).confidence;
                    const justification = (rel as any).justification;

                    return (
                    <div key={rel.id} className="relative group bg-[#020617] border border-[#334155] rounded-lg p-3 hover:border-blue-500 transition-all">
                        <div className="mb-2 flex justify-between items-start">
                            <span className={`inline-block px-2 py-0.5 text-[10px] font-bold uppercase rounded border ${relTypeColor}`}>
                                {rel.type}
                            </span>
                            {confidence !== undefined && (
                                <div className="flex items-center gap-1 text-[10px] font-mono text-slate-400" title={`Confidence: ${Math.round(confidence * 100)}%`}>
                                    {confidence < 0.7 && <AlertTriangle className="w-3 h-3 text-yellow-500" />}
                                    {Math.round(confidence * 100)}%
                                </div>
                            )}
                        </div>
                        <div className="flex items-center gap-3 mb-2">
                            <div className={`flex items-center gap-1 text-[10px] font-bold uppercase ${arrowColor}`}>
                            {isSource ? <ArrowRight className="w-3 h-3" /> : <ArrowLeft className="w-3 h-3" />}
                            {isSource ? 'To' : 'From'}
                            </div>
                            <span className="text-sm font-semibold text-white truncate flex-1" title={otherId}>{otherName}</span>
                        </div>
                        {justification && (
                            <div className="mt-2 pt-2 border-t border-slate-800">
                                <p className="text-[10px] text-slate-400 italic">"{justification}"</p>
                            </div>
                        )}
                        <div className="absolute top-2 right-2 flex opacity-0 group-hover:opacity-100 transition-opacity bg-[#0F172A] rounded border border-[#334155]">
                            <button onClick={() => onEditRelationship(rel.id)} className="p-1.5 hover:bg-slate-700 text-gray-400 hover:text-blue-400 transition-colors"><Edit2 className="w-3 h-3" /></button>
                            <button onClick={() => onDeleteRelationship(rel.id)} className="p-1.5 hover:bg-slate-700 text-gray-400 hover:text-red-400 transition-colors"><Trash2 className="w-3 h-3" /></button>
                        </div>
                    </div>
                    );
                })
            ) : (
                <div className="flex flex-col items-center justify-center py-8 bg-[#1E293B] rounded-lg border border-dashed border-[#334155]">
                    <div className="w-8 h-8 rounded-full bg-[#334155] flex items-center justify-center mb-2"><Share2 className="w-4 h-4 text-[#94A3B8]" /></div>
                    <span className="text-xs text-[#94A3B8]">No connections found</span>
                </div>
            )}
          </div>
        </div>
      </div>

      <div className="p-4 border-t border-[#334155] bg-[#1E293B]">
        <button onClick={handleDelete} className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-red-500/10 text-red-400 hover:bg-red-500/20 border border-red-500/20 rounded-lg text-sm font-semibold transition-all">
            <Trash2 className="w-4 h-4" /> Delete Entity
        </button>
      </div>
    </div>
  );
}