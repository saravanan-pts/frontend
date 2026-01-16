"use client";

import { useState, useEffect } from "react";
import { useGraphStore } from "@/lib/store";
import { X, Edit2, Trash2, Plus, Share2, ArrowRight, ArrowLeft } from "lucide-react";
import type { Relationship, Entity } from "@/types";

interface NodeDetailPanelProps {
  onClose: () => void;
  onCreateRelationship: (nodeId: string) => void;
  onEditRelationship: (id: string) => void;
  onDeleteRelationship: (id: string) => void;
}

const getEntityColor = (type: string) => {
    const t = (type || "Unknown").toLowerCase();
    const staticColors: Record<string, string> = {
      "person": "#3B82F6", "organization": "#8B5CF6", "location": "#10B981",
      "place": "#10B981", "event": "#F59E0B", "concept": "#EC4899",
      "time": "#06B6D4", "document": "#94A3B8"
    };
    if (staticColors[t]) return staticColors[t];
    let hash = 0;
    for (let i = 0; i < t.length; i++) hash = t.charCodeAt(i) + ((hash << 5) - hash);
    const c = (hash & 0x00FFFFFF).toString(16).toUpperCase();
    return '#' + '00000'.substring(0, 6 - c.length) + c;
  };

export default function NodeDetailPanel({
  onClose,
  onCreateRelationship,
  onEditRelationship,
  onDeleteRelationship
}: NodeDetailPanelProps) {
  const { selectedEntity, relationships, entities, deleteEntity } = useGraphStore();
  const [nodeRelationships, setNodeRelationships] = useState<Relationship[]>([]);

  useEffect(() => {
    if (selectedEntity) {
      const related = relationships.filter(
        (r) => r.from === selectedEntity.id || r.to === selectedEntity.id
      );
      setNodeRelationships(related);
    }
  }, [selectedEntity, relationships]);

  if (!selectedEntity) return null;

  const handleDelete = () => {
    if (confirm("Delete this entity?")) {
      deleteEntity(selectedEntity.id);
      onClose();
    }
  };

  const entityColor = getEntityColor(selectedEntity.type);

  // Helper to find name of connected node
  const getNodeLabel = (id: string) => {
      // 1. Check if it's a Map (Primary Store Structure)
      if (entities instanceof Map) {
          const node = entities.get(id);
          return node ? node.label : id;
      }
      
      // 2. Check if it's an Array (Fallback)
      if (Array.isArray(entities)) {
          // FIX: Cast to 'any' or 'Entity[]' to prevent TypeScript 'never' error
          const list = entities as Entity[];
          const node = list.find((e) => e.id === id);
          return node ? node.label : id;
      }
      
      return id; 
  };

  return (
    <div className="h-full flex flex-col bg-[#0F172A] border-l border-[#334155] shadow-xl animate-in slide-in-from-right-10 duration-200 w-80 lg:w-96">
      
      {/* Header */}
      <div className="relative p-5 border-b border-[#334155] bg-[#1E293B] overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-1" style={{ backgroundColor: entityColor, boxShadow: `0 0 15px ${entityColor}` }} />
        <div className="flex justify-between items-start relative z-10">
          <div className="flex-1 pr-2">
            <h2 className="text-xl font-bold text-white leading-tight break-words">
              {selectedEntity.label}
            </h2>
            <span className="inline-flex items-center mt-2 px-2.5 py-0.5 rounded-full text-xs font-bold text-white shadow-sm border border-white/10" style={{ backgroundColor: entityColor }}>
              {selectedEntity.type}
            </span>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-white/10 rounded-md text-[#94A3B8] transition-colors"><X className="w-5 h-5" /></button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        {/* Properties */}
        <div>
          <h3 className="text-xs font-bold text-[#64748B] uppercase tracking-wider mb-2">Properties</h3>
          <div className="bg-[#1E293B] rounded-lg border border-[#334155] overflow-hidden">
            {Object.keys(selectedEntity.properties || {}).length > 0 ? (
               Object.entries(selectedEntity.properties).map(([key, val]) => (
                 <div key={key} className="flex flex-col p-3 border-b border-[#334155] last:border-0 hover:bg-[#334155]/20 transition-colors">
                   <span className="text-xs font-medium text-[#94A3B8] mb-1">{key}</span>
                   <span className="text-sm text-white break-words">{String(val)}</span>
                 </div>
               ))
            ) : (
              <div className="p-4 text-center text-xs text-[#64748B] italic">No properties defined</div>
            )}
          </div>
        </div>

        {/* Relationships */}
        <div>
           <div className="flex items-center justify-between mb-3">
            <h3 className="text-xs font-bold text-[#64748B] uppercase tracking-wider">Relationships ({nodeRelationships.length})</h3>
            <button onClick={() => onCreateRelationship(selectedEntity.id)} className="flex items-center gap-1 px-2.5 py-1.5 bg-[#2563EB] hover:bg-blue-600 text-white text-xs font-medium rounded-md transition-colors"><Plus className="w-3.5 h-3.5" /> Add New</button>
          </div>

          <div className="space-y-2.5">
            {nodeRelationships.length > 0 ? (
              nodeRelationships.map((rel) => {
                const isSource = rel.from === selectedEntity.id;
                const otherId = isSource ? rel.to : rel.from;
                const otherName = getNodeLabel(otherId);

                return (
                  <div key={rel.id} className="group flex flex-col bg-[#1E293B] border border-[#334155] rounded-lg p-3 hover:border-[#2563EB] transition-all hover:shadow-lg hover:shadow-blue-900/10">
                    <div className="flex justify-between items-center mb-2">
                        <span className="font-bold text-[10px] tracking-wide text-[#2563EB] bg-blue-900/20 px-1.5 py-0.5 rounded uppercase border border-blue-900/30">{rel.type}</span>
                        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button onClick={() => onEditRelationship(rel.id)} className="p-1.5 hover:bg-[#334155] rounded text-[#94A3B8] hover:text-white"><Edit2 className="w-3 h-3" /></button>
                            <button onClick={() => onDeleteRelationship(rel.id)} className="p-1.5 hover:bg-[#334155] rounded text-red-400 hover:text-red-300"><Trash2 className="w-3 h-3" /></button>
                        </div>
                    </div>
                    <div className="flex items-center gap-2 text-sm">
                        {isSource ? (
                             <span className="flex items-center text-[#64748B] text-xs font-medium gap-1">To <ArrowRight className="w-3 h-3" /></span>
                        ) : (
                             <span className="flex items-center text-[#64748B] text-xs font-medium gap-1">From <ArrowLeft className="w-3 h-3" /></span>
                        )}
                        <span className="text-white font-medium truncate" title={otherId}>
                            {otherName}
                        </span>
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

      {/* Footer */}
      <div className="p-4 border-t border-[#334155] bg-[#1E293B]">
        <button onClick={handleDelete} className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-red-500/10 text-red-400 hover:bg-red-500/20 border border-red-500/20 rounded-lg text-sm font-medium transition-all"><Trash2 className="w-4 h-4" /> Delete Entity</button>
      </div>
    </div>
  );
}