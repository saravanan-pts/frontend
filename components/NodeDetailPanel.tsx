"use client";

import { useMemo, useState, useEffect } from "react";
import { useGraphStore } from "@/lib/store";
import { X, Edit2, Trash2, Plus, ArrowRight, ArrowLeft, Share2 } from "lucide-react";
import { normalizeType, getEntityColor } from "@/lib/graphUtils";
import type { Entity } from "@/types";

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
  
  const nodeRelationships = useMemo(() => {
    if (!selectedEntity) return [];
    return relationships.filter(
      (r) => r.from === selectedEntity.id || r.to === selectedEntity.id
    );
  }, [selectedEntity, relationships]);

  if (!selectedEntity) return null;

  const cleanType = normalizeType(selectedEntity.type, selectedEntity.label);
  const entityColor = getEntityColor(cleanType);

  const handleDelete = () => {
    if (confirm(`Delete ${selectedEntity.label}?`)) {
      deleteEntity(selectedEntity.id);
      onClose();
    }
  };

  // --- FIX IS HERE ---
  // Correctly handles Map vs Array to prevent TypeScript errors
  const getNodeLabel = (id: string) => {
    // 1. If it's a Map (Strict Store Type)
    if (entities instanceof Map) {
        return entities.get(id)?.label || id;
    }
    // 2. If it's an Array (Fallback)
    if (Array.isArray(entities)) {
        return (entities as Entity[]).find((e) => e.id === id)?.label || id;
    }
    return id;
  };

  return (
    <div className="h-full flex flex-col bg-[#0F172A] border-l border-[#334155] shadow-2xl w-80 lg:w-96 z-50">
      
      {/* HEADER: Matching image_ba4e0a.png */}
      <div className="relative p-6 border-b border-[#334155] bg-[#1E293B]">
        <div className="absolute top-0 left-0 w-full h-1" style={{ backgroundColor: entityColor, boxShadow: `0 0 15px ${entityColor}` }} />
        <div className="flex justify-between items-start">
          <div className="flex-1 pr-4">
             {/* Large Title */}
             <h2 className="text-2xl font-black text-white leading-tight break-words">{selectedEntity.label}</h2>
             
             {/* Badge Directly Below */}
             <div className="mt-2">
               <span className="inline-block px-3 py-1 rounded-full text-xs font-bold text-white shadow-lg border border-white/20 uppercase tracking-wide" style={{ backgroundColor: entityColor }}>
                 {cleanType}
               </span>
             </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-700 rounded-full text-[#94A3B8] transition-colors"><X className="w-5 h-5" /></button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-5 space-y-8">
        {/* PROPERTIES */}
        {selectedEntity.properties && Object.keys(selectedEntity.properties).length > 0 ? (
          <div>
            <h3 className="text-xs font-bold text-[#64748B] uppercase tracking-wider mb-3">Properties</h3>
            <div className="bg-[#1E293B] rounded-lg border border-[#334155] divide-y divide-[#334155]">
               {Object.entries(selectedEntity.properties).map(([key, val]) => (
                 <div key={key} className="p-3">
                   <span className="block text-[10px] font-bold text-[#94A3B8] uppercase mb-0.5">{key.replace(/_/g, ' ')}</span>
                   <span className="block text-sm text-white break-words">{String(val)}</span>
                 </div>
               ))}
            </div>
          </div>
        ) : (
            <div className="p-4 text-center text-xs text-[#64748B] italic">No properties defined</div>
        )}

        {/* RELATIONSHIPS */}
        <div>
           <div className="flex items-center justify-between mb-4">
            <h3 className="text-xs font-bold text-[#64748B] uppercase tracking-wider">Relationships ({nodeRelationships.length})</h3>
            <button onClick={() => onCreateRelationship(selectedEntity.id)} className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded flex items-center gap-1"><Plus className="w-3 h-3" /> Add</button>
          </div>
          
          <div className="space-y-3">
            {nodeRelationships.length > 0 ? (
                nodeRelationships.map((rel) => {
                    const isSource = rel.from === selectedEntity.id;
                    const otherId = isSource ? rel.to : rel.from;
                    const otherName = getNodeLabel(otherId);

                    return (
                    <div key={rel.id} className="relative group bg-[#020617] border border-[#334155] rounded-lg p-3 hover:border-blue-500 transition-all">
                        <div className="mb-2">
                            <span className="inline-block px-2 py-0.5 bg-blue-900/50 text-blue-400 text-[10px] font-bold uppercase rounded border border-blue-800">{rel.type}</span>
                        </div>
                        <div className="flex items-center gap-3">
                            <div className={`flex items-center gap-1 text-[10px] font-bold uppercase ${isSource ? 'text-green-400' : 'text-orange-400'}`}>
                            {isSource ? <ArrowRight className="w-3 h-3" /> : <ArrowLeft className="w-3 h-3" />}
                            {isSource ? 'To' : 'From'}
                            </div>
                            <span className="text-sm font-semibold text-white truncate flex-1" title={otherId}>{otherName}</span>
                        </div>
                        <div className="absolute top-2 right-2 flex opacity-0 group-hover:opacity-100 transition-opacity bg-[#0F172A] rounded border border-[#334155]">
                            <button onClick={() => onEditRelationship(rel.id)} className="p-1.5 hover:bg-slate-700 text-gray-400 hover:text-blue-400"><Edit2 className="w-3 h-3" /></button>
                            <button onClick={() => onDeleteRelationship(rel.id)} className="p-1.5 hover:bg-slate-700 text-gray-400 hover:text-red-400"><Trash2 className="w-3 h-3" /></button>
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
        <button onClick={handleDelete} className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-red-500/10 text-red-400 hover:bg-red-500/20 border border-red-500/20 rounded-lg text-sm font-semibold transition-all"><Trash2 className="w-4 h-4" /> Delete Entity</button>
      </div>
    </div>
  );
}