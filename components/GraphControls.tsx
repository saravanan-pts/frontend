"use client";

import { useState } from "react";
import { ZoomIn, ZoomOut, Maximize2, Search, Download, Plus, Link2, Sparkles, X, Scaling, Filter } from "lucide-react";

interface GraphControlsProps {
  graphRef: React.RefObject<any>;
  onCreateNode?: () => void;
  onCreateRelationship?: () => void;
  onSearch: (query: string) => void;
  onAnalyze?: () => void;
  isFilterPanelOpen: boolean;  // <--- NEW PROP
  onToggleFilterPanel: () => void; // <--- NEW PROP
}

export default function GraphControls({ 
    graphRef, 
    onCreateNode, 
    onCreateRelationship, 
    onSearch,
    onAnalyze,
    isFilterPanelOpen,
    onToggleFilterPanel
}: GraphControlsProps) {
  const [searchQuery, setSearchQuery] = useState("");

  const handleFit = () => { graphRef.current?.fit(); };
  
  const handleClearSearch = () => {
    setSearchQuery("");
    onSearch(""); 
  };

  const handleResetZoom = () => { 
      handleClearSearch(); 
      graphRef.current?.resetZoom(); 
  };
  
  const handleZoomIn = () => { graphRef.current?.zoomIn(); };
  const handleZoomOut = () => { graphRef.current?.zoomOut(); };
  
  const handleExportPNG = () => { graphRef.current?.exportGraph("png"); };
  const handleExportJSON = () => { graphRef.current?.exportGraph("json"); };

  const handleTriggerSearch = () => { onSearch(searchQuery); };
  const handleKeyDown = (e: React.KeyboardEvent) => { if (e.key === "Enter") handleTriggerSearch(); };

  return (
    <div className="bg-[#0F172A] border-b border-[#334155] p-2 lg:p-4 shadow-sm">
      <div className="flex flex-wrap items-center gap-2 lg:gap-4 text-gray-300">
        
        {/* 1. EXPAND FILTERS BUTTON (Visible only when closed) */}
        {!isFilterPanelOpen && (
           <button 
             onClick={onToggleFilterPanel}
             className="flex items-center gap-2 px-3 py-2 bg-slate-700 border border-[#334155] text-gray-300 rounded-lg hover:bg-slate-600 text-sm font-medium mr-2"
           >
             <Filter className="w-4 h-4" />
             Filters
           </button>
        )}

        {/* Creation Buttons */}
        {(onCreateNode || onCreateRelationship) && (
          <div className="flex items-center gap-1 lg:gap-2 border-r border-[#334155] pr-2 lg:pr-4">
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
        <div className="flex items-center gap-1 border-r border-[#334155] pr-2 lg:pr-4">
          <button onClick={handleZoomIn} className="p-2 hover:bg-slate-700 rounded" title="Zoom In">
            <ZoomIn className="w-4 h-4" />
          </button>
          <button onClick={handleZoomOut} className="p-2 hover:bg-slate-700 rounded" title="Zoom Out">
            <ZoomOut className="w-4 h-4" />
          </button>
          <button onClick={handleFit} className="p-2 hover:bg-slate-700 rounded" title="Fit to Screen">
            <Maximize2 className="w-4 h-4" />
          </button>
          <button onClick={handleResetZoom} className="flex items-center gap-1 px-2 py-1 hover:bg-slate-700 rounded text-xs font-bold" title="Reset 1:1">
            <Scaling className="w-4 h-4" /> 1:1
          </button>
        </div>

        {/* SEARCH BAR */}
        <div className="flex-1 min-w-[120px] lg:min-w-[200px]">
          <div className="relative">
            <Search 
                className="absolute left-2 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400 cursor-pointer hover:text-gray-300" 
                onClick={handleTriggerSearch}
            />
            <input
              type="text"
              placeholder="Search Node..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              className="w-full pl-8 pr-8 py-1 lg:py-2 text-sm bg-[#1E293B] border border-[#334155] text-white rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            {searchQuery && (
              <button onClick={handleClearSearch} className="absolute right-2 top-1/2 transform -translate-y-1/2 p-1 rounded-full hover:bg-slate-700">
                <X className="w-3 h-3 text-gray-400" />
              </button>
            )}
          </div>
        </div>

        {/* Analyze Button */}
        {onAnalyze && (
            <button onClick={onAnalyze} className="flex items-center gap-1 lg:gap-2 px-3 py-2 bg-purple-600 text-white rounded text-sm hover:bg-purple-700 transition-colors shadow-sm ml-2">
                <Sparkles className="w-4 h-4" /> <span className="hidden sm:inline">Analyze</span>
            </button>
        )}

        {/* Export */}
        <div className="flex items-center gap-1 lg:gap-2 border-l border-[#334155] pl-2 lg:pl-4">
          <button onClick={handleExportPNG} className="p-2 hover:bg-slate-700 rounded" title="Download PNG"><Download className="w-4 h-4" /></button>
          <button onClick={handleExportJSON} className="px-3 py-2 bg-blue-600 text-white rounded text-sm hover:bg-blue-700">JSON</button>
        </div>
      </div>
    </div>
  );
}