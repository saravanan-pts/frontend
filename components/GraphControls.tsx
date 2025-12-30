"use client";

import { useState } from "react";
import { ZoomIn, ZoomOut, Maximize2, Search, Download, Plus, Link2, Sparkles, X } from "lucide-react";
import type { EntityType } from "@/types";
import { ENTITY_TYPES } from "@/lib/schema";
import { useGraphStore } from "@/lib/store";

interface GraphControlsProps {
  graphRef: React.RefObject<any>;
  onCreateNode?: () => void;
  onCreateRelationship?: () => void;
  onSearch: (query: string) => void;
  onAnalyze?: () => void;
}

export default function GraphControls({ 
    graphRef, 
    onCreateNode, 
    onCreateRelationship, 
    onSearch,
    onAnalyze 
}: GraphControlsProps) {
  const { filterTypes, toggleFilterType, clearFilters } = useGraphStore();
  const [searchQuery, setSearchQuery] = useState("");
  const [showFilters, setShowFilters] = useState(false);

  const handleFit = () => { graphRef.current?.fit(); };
  
  // Update: Clear both the state text AND the visual search
  const handleClearSearch = () => {
    setSearchQuery("");
    onSearch(""); // This resets the graph visualization
  };

  const handleResetZoom = () => { 
      handleClearSearch(); // Clear search on reset
      graphRef.current?.resetZoom(); 
  };
  
  const handleZoomIn = () => { graphRef.current?.zoomIn(); };
  const handleZoomOut = () => { graphRef.current?.zoomOut(); };
  
  const handleExportPNG = () => { graphRef.current?.exportGraph("png"); };
  const handleExportJSON = () => { graphRef.current?.exportGraph("json"); };

  const handleFilterToggle = (type: EntityType) => {
    toggleFilterType(type);
    const newFilters = filterTypes.includes(type)
      ? filterTypes.filter((t) => t !== type)
      : [...filterTypes, type];
    graphRef.current?.filterByType(newFilters);
  };

  const handleClearFilters = () => {
    clearFilters();
    graphRef.current?.filterByType([]);
  };

  const handleTriggerSearch = () => {
      onSearch(searchQuery);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleTriggerSearch();
    }
  };

  return (
    <div className="bg-white border-b border-gray-200 p-2 lg:p-4 shadow-sm">
      <div className="flex flex-wrap items-center gap-2 lg:gap-4">
        
        {/* Creation Buttons */}
        {(onCreateNode || onCreateRelationship) && (
          <div className="flex items-center gap-1 lg:gap-2 border-r border-gray-200 pr-2 lg:pr-4">
            {onCreateNode && (
              <button onClick={onCreateNode} className="flex items-center gap-1 lg:gap-2 px-3 py-1.5 lg:px-4 lg:py-2 bg-blue-600 text-white rounded text-sm hover:bg-blue-700">
                <Plus className="w-4 h-4" /> <span className="hidden sm:inline">Add Node</span>
              </button>
            )}
            {onCreateRelationship && (
              <button onClick={onCreateRelationship} className="flex items-center gap-1 lg:gap-2 px-3 py-1.5 lg:px-4 lg:py-2 bg-green-600 text-white rounded text-sm hover:bg-green-700">
                <Link2 className="w-4 h-4" /> <span className="hidden sm:inline">Add Edge</span>
              </button>
            )}
          </div>
        )}
        
        {/* Zoom Controls */}
        <div className="flex items-center gap-1 border-r border-gray-200 pr-2 lg:pr-4">
          <button onClick={handleZoomIn} className="p-2 hover:bg-gray-100 rounded" title="Zoom In">
            <ZoomIn className="w-4 h-4" />
          </button>
          <button onClick={handleZoomOut} className="p-2 hover:bg-gray-100 rounded" title="Zoom Out">
            <ZoomOut className="w-4 h-4" />
          </button>
          <button onClick={handleFit} className="p-2 hover:bg-gray-100 rounded" title="Fit to Screen">
            <Maximize2 className="w-4 h-4" />
          </button>
          <button onClick={handleResetZoom} className="px-2 py-1 hover:bg-gray-100 rounded text-xs font-bold" title="Reset Layout & Search">
            Reset
          </button>
        </div>

        {/* SEARCH BAR (UPDATED with 'X' Icon) */}
        <div className="flex-1 min-w-[120px] lg:min-w-[200px]">
          <div className="relative">
            {/* Left Search Icon */}
            <Search 
                className="absolute left-2 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400 cursor-pointer hover:text-gray-600" 
                onClick={handleTriggerSearch}
            />
            
            <input
              type="text"
              placeholder="Search Node..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              className="w-full pl-8 pr-8 py-1 lg:py-2 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
            />

            {/* Right Clear 'X' Icon - Only shows when there is text */}
            {searchQuery && (
              <button 
                onClick={handleClearSearch}
                className="absolute right-2 top-1/2 transform -translate-y-1/2 p-1 rounded-full hover:bg-gray-100"
              >
                <X className="w-3 h-3 text-gray-400" />
              </button>
            )}
          </div>
        </div>

        {/* Analyze Button */}
        {onAnalyze && (
            <button 
                onClick={onAnalyze}
                className="flex items-center gap-1 lg:gap-2 px-3 py-2 bg-purple-600 text-white rounded text-sm hover:bg-purple-700 transition-colors shadow-sm ml-2"
                title="Detect Communities & Themes (AI)"
            >
                <Sparkles className="w-4 h-4" /> 
                <span className="hidden sm:inline">Analyze</span>
            </button>
        )}

        {/* Filters */}
        <div className="relative ml-2">
          <button onClick={() => setShowFilters(!showFilters)} className="px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded text-sm">
            Filters {filterTypes.length > 0 && `(${filterTypes.length})`}
          </button>
          {showFilters && (
            <div className="absolute right-0 mt-2 w-64 bg-white border border-gray-200 rounded-lg shadow-lg z-10 p-4">
              <div className="flex justify-between items-center mb-3">
                <h3 className="font-semibold text-sm">Filter by Type</h3>
                <button onClick={handleClearFilters} className="text-xs text-blue-600 hover:text-blue-800">Clear</button>
              </div>
              <div className="space-y-2">
                {ENTITY_TYPES.map((type) => (
                  <label key={type} className="flex items-center space-x-2 cursor-pointer">
                    <input type="checkbox" checked={filterTypes.includes(type)} onChange={() => handleFilterToggle(type)} className="rounded" />
                    <span className="text-sm">{type}</span>
                  </label>
                ))}
              </div>
            </div>
          )}
        </div>
        
        {/* Export */}
        <div className="flex items-center gap-1 lg:gap-2 border-l border-gray-200 pl-2 lg:pl-4">
          <button onClick={handleExportPNG} className="p-2 hover:bg-gray-100 rounded" title="Download PNG"><Download className="w-4 h-4" /></button>
          <button onClick={handleExportJSON} className="px-3 py-2 bg-blue-600 text-white rounded text-sm hover:bg-blue-700">JSON</button>
        </div>
      </div>
    </div>
  );
}