"use client";

import { useState } from "react";
import { Filter, ChevronDown, ChevronRight, ChevronLeft } from "lucide-react";

interface FilterPanelProps {
  entityTypes: string[];
  relationshipTypes: string[];
  selectedEntities: string[];
  selectedRelationships: string[];
  onToggleEntity: (type: string) => void;
  onToggleRelationship: (type: string) => void;
  onClose: () => void; // <--- NEW PROP
}

export default function FilterPanel({
  entityTypes,
  relationshipTypes,
  selectedEntities,
  selectedRelationships,
  onToggleEntity,
  onToggleRelationship,
  onClose,
}: FilterPanelProps) {
  const [isEntitiesOpen, setIsEntitiesOpen] = useState(true);
  const [isRelationshipsOpen, setIsRelationshipsOpen] = useState(true);

  return (
    <div className="h-full bg-white border-r border-gray-200 flex flex-col w-64 shadow-sm z-20">
      {/* Header with Collapse Button */}
      <div className="p-4 border-b border-gray-200 flex items-center justify-between bg-gray-50">
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-gray-500" />
          <h2 className="font-semibold text-gray-800 text-sm">Filters</h2>
        </div>
        {/* Collapse Button */}
        <button 
          onClick={onClose}
          className="p-1 hover:bg-gray-200 rounded text-gray-500 transition-colors"
          title="Collapse Filters"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        
        {/* 1. Entity Types */}
        <div className="border-b border-gray-100 pb-2">
          <button 
            onClick={() => setIsEntitiesOpen(!isEntitiesOpen)}
            className="w-full flex items-center justify-between p-2 hover:bg-gray-100 rounded transition-colors group"
          >
            <span className="text-xs font-bold text-gray-500 uppercase tracking-wider group-hover:text-gray-700">
              Entity Types
            </span>
            {isEntitiesOpen ? <ChevronDown className="w-4 h-4 text-gray-400" /> : <ChevronRight className="w-4 h-4 text-gray-400" />}
          </button>

          {isEntitiesOpen && (
            <div className="pl-2 pr-2 mt-1 space-y-1">
              {entityTypes.map((type) => (
                <label key={type} className="flex items-center gap-2 px-2 py-1.5 hover:bg-gray-50 rounded cursor-pointer group transition-colors">
                  <div className="relative flex items-center">
                    <input
                      type="checkbox"
                      className="peer w-3.5 h-3.5 border-gray-300 rounded text-blue-600 focus:ring-blue-500 cursor-pointer"
                      checked={selectedEntities.includes(type)}
                      onChange={() => onToggleEntity(type)}
                    />
                  </div>
                  <span className="text-sm text-gray-600 group-hover:text-gray-900 select-none">
                    {type}
                  </span>
                </label>
              ))}
              {entityTypes.length === 0 && <p className="text-xs text-gray-400 italic px-2 py-1">No entities found</p>}
            </div>
          )}
        </div>

        {/* 2. Relationship Types */}
        <div className="pt-2">
          <button 
            onClick={() => setIsRelationshipsOpen(!isRelationshipsOpen)}
            className="w-full flex items-center justify-between p-2 hover:bg-gray-100 rounded transition-colors group"
          >
            <span className="text-xs font-bold text-gray-500 uppercase tracking-wider group-hover:text-gray-700">
              Relationship Types
            </span>
            {isRelationshipsOpen ? <ChevronDown className="w-4 h-4 text-gray-400" /> : <ChevronRight className="w-4 h-4 text-gray-400" />}
          </button>

          {isRelationshipsOpen && (
            <div className="pl-2 pr-2 mt-1 space-y-1">
              {relationshipTypes.map((type) => (
                <label key={type} className="flex items-center gap-2 px-2 py-1.5 hover:bg-gray-50 rounded cursor-pointer group transition-colors">
                  <div className="relative flex items-center">
                    <input
                      type="checkbox"
                      className="peer w-3.5 h-3.5 border-gray-300 rounded text-green-600 focus:ring-green-500 cursor-pointer"
                      checked={selectedRelationships.includes(type)}
                      onChange={() => onToggleRelationship(type)}
                    />
                  </div>
                  <span className="text-sm text-gray-600 group-hover:text-gray-900 select-none">
                    {type}
                  </span>
                </label>
              ))}
              {relationshipTypes.length === 0 && <p className="text-xs text-gray-400 italic px-2 py-1">No relationships found</p>}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}