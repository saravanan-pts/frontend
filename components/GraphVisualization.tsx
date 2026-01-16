"use client";

import React, { useCallback, useMemo, useImperativeHandle, useState, useEffect, forwardRef } from 'react';
import dynamic from 'next/dynamic';
import type { Entity, Relationship } from '@/types';

type GraphNode = Entity & {
  x?: number;
  y?: number;
  vx?: number;
  vy?: number;
  filename?: string; 
};

const ForceGraph2D = dynamic(() => import('react-force-graph-2d'), { 
  ssr: false,
  loading: () => <div className="flex items-center justify-center h-full text-slate-500">Loading Graph Engine...</div>
}) as any;

interface GraphVisualizationProps {
  entities: Entity[];
  relationships: Relationship[];
  selectedDocumentId?: string | null;
  onNodeSelect: (id: string) => void;
  onNodeDeselect: () => void;
  onContextMenu: (x: number, y: number, target: any, nodeId?: string, edgeId?: string) => void;
  onCreateNode: (x: number, y: number) => void;
  onCreateRelationship: (from: string, to: string) => void;
}

export interface GraphVisualizationRef {
  filterByType: (types: string[]) => void;
  filterByRelationship: (types: string[]) => void;
  searchAndHighlight: (query: string) => void;
  zoomIn: () => void;
  zoomOut: () => void;
  resetZoom: () => void;
  fit: () => void;
  exportGraph: (type: 'png' | 'json') => void; 
}

const GraphVisualization = forwardRef<GraphVisualizationRef, GraphVisualizationProps>(({
  entities,
  relationships,
  selectedDocumentId,
  onNodeSelect,
  onNodeDeselect,
  onContextMenu,
  onCreateNode,
  onCreateRelationship
}, ref) => {
  const [graphInstance, setGraphInstance] = useState<any>(null);
  
  const [highlightNodes, setHighlightNodes] = useState<Set<string>>(new Set());
  const [hoverNode, setHoverNode] = useState<string | null>(null);
  const [activeTypes, setActiveTypes] = useState<string[]>([]);
  const [activeRelTypes, setActiveRelTypes] = useState<string[]>([]);

  // --- PHYSICS ENGINE TUNING ---
  useEffect(() => {
    if (graphInstance) {
        // Strong repulsion (-400) to keep nodes from overlapping
        graphInstance.d3Force('charge').strength(-400); 
        // Longer links (120) so text labels fit nicely
        graphInstance.d3Force('link').distance(120); 
        // Very gentle center force to keep graph in view without snapping it back too hard
        graphInstance.d3Force('center').strength(0.02);
    }
  }, [graphInstance]);

  // --- EXPOSED METHODS ---
  useImperativeHandle(ref, () => ({
    filterByType: (types: string[]) => setActiveTypes(types),
    filterByRelationship: (types: string[]) => setActiveRelTypes(types),
    searchAndHighlight: (query: string) => {
      if (!query) {
        setHighlightNodes(new Set());
        return;
      }
      const matches = entities.filter(e => e.label.toLowerCase().includes(query.toLowerCase()));
      const matchIds = new Set(matches.map(m => m.id));
      setHighlightNodes(matchIds);
      
      // Smart Camera Logic:
      if (matches.length === 1 && graphInstance) {
          // If 1 match, fly to it safely
          const match = matches[0] as GraphNode;
          // We wait a tiny bit to ensure coordinates exist
          setTimeout(() => {
              if (match.x !== undefined && match.y !== undefined) {
                 graphInstance.centerAt(match.x, match.y, 1000);
                 graphInstance.zoom(2.0, 1000);
              }
          }, 100);
      } else if (matches.length > 1 && graphInstance) {
         // If multiple matches, fit them all in view
         graphInstance.zoomToFit(1000, 50);
      }
    },
    
    zoomIn: () => {
      if (graphInstance) graphInstance.zoom(graphInstance.zoom() * 1.2, 400);
    },
    zoomOut: () => {
      if (graphInstance) graphInstance.zoom(graphInstance.zoom() / 1.2, 400);
    },
    resetZoom: () => {
      if (graphInstance) graphInstance.zoomToFit(400, 50);
    },
    fit: () => {
      if (graphInstance) graphInstance.zoomToFit(400, 50);
    },
    exportGraph: (type: 'png' | 'json') => console.log("Export:", type)
  }));

  // --- FILTERING ---
  const visibleData = useMemo(() => {
    let nodes = entities;
    
    // 1. Type Filter
    if (activeTypes.length > 0) {
        nodes = nodes.filter(n => activeTypes.includes(n.type));
    }

    // 2. Document Filter
    if (selectedDocumentId) {
       // Only filter if the data actually supports it (has filename/docId)
       const hasDocProp = nodes.some(n => (n as any).documentId || (n as any).filename);
       if (hasDocProp) {
           nodes = nodes.filter(n => 
               (n as any).documentId === selectedDocumentId || 
               (n as any).filename === selectedDocumentId
           );
       }
    }

    // 3. Link Filter (Must connect two visible nodes)
    const nodeIds = new Set(nodes.map(n => n.id));
    let links = relationships.filter(l => {
        // Handle potentially missing source/target safely
        const s = (l as any).source?.id || (l as any).source || l.from;
        const t = (l as any).target?.id || (l as any).target || l.to;
        return nodeIds.has(s) && nodeIds.has(t);
    });

    if (activeRelTypes.length > 0) {
      links = links.filter(l => activeRelTypes.includes(l.type));
    }

    return { nodes, links };
  }, [entities, relationships, activeTypes, activeRelTypes, selectedDocumentId]);

  // --- AUTO ZOOM ON DATA LOAD ---
  // This replaces onEngineStop. It only fires when data size changes significantly.
  useEffect(() => {
      if (graphInstance && visibleData.nodes.length > 0) {
          // Wait 500ms for physics to unfurl the nodes, then fit to screen
          const timer = setTimeout(() => {
              graphInstance.zoomToFit(500, 50);
          }, 500);
          return () => clearTimeout(timer);
      }
  }, [graphInstance, visibleData.nodes.length]);

  const getNodeColor = (type: string, isDimmed: boolean = false) => {
    if (isDimmed) return '#1E293B'; 
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

  const handleNodeClick = useCallback((nodeRaw: any) => {
    const node = nodeRaw as GraphNode;
    onNodeSelect(node.id);
    const neighbors = new Set<string>();
    neighbors.add(node.id);
    
    visibleData.links.forEach((link: any) => {
        const s = link.source?.id || link.source || link.from;
        const t = link.target?.id || link.target || link.to;
        if (s === node.id) neighbors.add(t);
        if (t === node.id) neighbors.add(s);
    });
    setHighlightNodes(neighbors);

    // Smooth Zoom to Node
    if (graphInstance && node.x !== undefined && node.y !== undefined) {
        graphInstance.centerAt(node.x, node.y, 700);
        graphInstance.zoom(2.0, 700); 
    }
  }, [onNodeSelect, visibleData.links, graphInstance]);

  return (
    <div className="w-full h-full bg-genui-main relative cursor-move">
      <ForceGraph2D
        ref={setGraphInstance}
        graphData={visibleData}
        linkSource="from"
        linkTarget="to"
        
        linkColor={() => '#64748B'}
        linkWidth={1.5}
        linkDirectionalArrowLength={3.5}
        linkDirectionalArrowRelPos={1}
        backgroundColor="#020617" 
        
        // INTERACTION
        clickTolerance={20} // Makes clicking much easier!
        onNodeClick={handleNodeClick}
        onBackgroundClick={() => {
            onNodeDeselect();
            setHighlightNodes(new Set());
            // Optional: reset zoom on background click if you want
            // if (graphInstance) graphInstance.zoomToFit(500, 50);
        }}
        
        onNodeRightClick={(node: any, event: MouseEvent) => {
             onContextMenu(event.clientX, event.clientY, 'node', node.id);
        }}
        onLinkRightClick={(link: any, event: MouseEvent) => {
             onContextMenu(event.clientX, event.clientY, 'edge', undefined, link.id);
        }}
        onBackgroundRightClick={(event: MouseEvent) => {
             onContextMenu(event.clientX, event.clientY, 'canvas', undefined, undefined);
        }}

        // NODE RENDERING
        nodeCanvasObject={(nodeRaw: any, ctx: CanvasRenderingContext2D, globalScale: number) => {
           const node = nodeRaw as GraphNode;
           const label = node.label || node.id;
           const fontSize = Math.max(3, 12/globalScale);
           const isHighlighted = highlightNodes.has(node.id) || hoverNode === node.id;
           const isDimmed = highlightNodes.size > 0 && !highlightNodes.has(node.id);
           const color = getNodeColor(node.type, isDimmed);

           ctx.font = `bold ${fontSize}px Inter, Sans-Serif`;
           const textWidth = ctx.measureText(label).width;
           const padding = fontSize * 0.6;
           const w = textWidth + padding * 2;
           const h = fontSize + padding;

           if (isHighlighted) { ctx.shadowColor = color; ctx.shadowBlur = 10; }
           else { ctx.shadowBlur = 0; }

           ctx.beginPath();
           ctx.fillStyle = color;
           
           if (node.x !== undefined && node.y !== undefined) {
               const r = h / 2; const x = node.x - w / 2; const y = node.y - h / 2;
               if (ctx.roundRect) ctx.roundRect(x, y, w, h, r); else ctx.rect(x, y, w, h);
               ctx.fill();
               ctx.shadowBlur = 0;
               ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
               ctx.fillStyle = isDimmed ? '#94A3B8' : '#FFFFFF';
               if (isHighlighted || globalScale > 0.6) ctx.fillText(label, node.x, node.y);
           }
        }}
        
        // LINK RENDERING (Fixed Crash)
        linkCanvasObjectMode={() => 'after'}
        linkCanvasObject={(link: any, ctx: CanvasRenderingContext2D, globalScale: number) => {
            const start = link.source;
            const end = link.target;
            
            // CRITICAL FIX: Check if start/end are valid objects with coordinates
            if (!start || !end || typeof start !== 'object' || typeof end !== 'object' || !('x' in start) || !('x' in end)) return;

            if (globalScale > 1.2) {
                const label = link.type; 
                const fontSize = 3; 
                const textPos = Object.assign({}, ...['x', 'y'].map(c => ({ [c]: start[c] + (end[c] - start[c]) / 2 })));
                const relLink = { x: end.x - start.x, y: end.y - start.y };
                let textAngle = Math.atan2(relLink.y, relLink.x);
                if (textAngle > Math.PI / 2) textAngle = -(Math.PI - textAngle);
                if (textAngle < -Math.PI / 2) textAngle = -(-Math.PI - textAngle);
                ctx.save();
                ctx.translate(textPos.x, textPos.y);
                ctx.rotate(textAngle);
                ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
                ctx.font = `${fontSize}px Sans-Serif`;
                const textWidth = ctx.measureText(label).width;
                ctx.fillStyle = 'rgba(2, 6, 23, 0.8)';
                ctx.fillRect(-textWidth / 2 - 1, -fontSize / 2 - 1, textWidth + 2, fontSize + 2);
                ctx.fillStyle = '#94A3B8';
                ctx.fillText(label, 0, 0);
                ctx.restore();
            }
        }}

        onNodeHover={(node: any) => setHoverNode(node ? node.id : null)}
        d3VelocityDecay={0.4} 
        cooldownTicks={100}
        // Removed onEngineStop to prevent view resetting while interacting
      />
    </div>
  );
});

GraphVisualization.displayName = 'GraphVisualization';
export default GraphVisualization;