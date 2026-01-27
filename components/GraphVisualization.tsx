"use client";

import { useEffect, useRef, useImperativeHandle, forwardRef, memo } from "react";
import cytoscape, { Core } from "cytoscape";
import fcose from "cytoscape-fcose";
import type { Entity, Relationship } from "@/types";

// 1. REGISTER LAYOUT
if (typeof window !== "undefined") {
  try { cytoscape.use(fcose); } catch (e) { console.warn("Ext already reg"); }
}

export interface GraphVisualizationRef {
  filterByType: (types: string[]) => void;
  filterByRelationship: (types: string[]) => void;
  searchAndHighlight: (query: string) => void;
  fit: () => void;
  resetZoom: () => void;
  zoomIn: () => void;
  zoomOut: () => void;
  exportGraph: (format: "png" | "json") => void;
}

interface GraphVisualizationProps {
  entities: Entity[];
  relationships: Relationship[];
  selectedDocumentId?: string | null;
  onNodeSelect: (id: string, parentId?: string) => void;
  onNodeDeselect: () => void;
  onContextMenu: (x: number, y: number, target: any, nodeId?: string, edgeId?: string) => void;
  onCreateNode: (x: number, y: number) => void;
  onCreateRelationship: (from: string, to: string) => void;
}

const GraphVisualization = memo(forwardRef<GraphVisualizationRef, GraphVisualizationProps>(
  ({ entities, relationships, selectedDocumentId, onNodeSelect, onNodeDeselect, onContextMenu }, ref) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const cyRef = useRef<Core | null>(null);
    const prevEntitiesIds = useRef<string>("");

    // --- COLOR PALETTE ---
    const getNodeColor = (type: any) => {
      const t = String(type || "concept").toLowerCase();
      if(t.includes('case')) return '#3b82f6'; // Blue
      if(t.includes('event')) return '#94a3b8'; // Grey (Hub)
      if(t.includes('activity')) return '#06b6d4'; // Cyan
      if(t.includes('branch')) return '#f59e0b'; // Amber
      if(t.includes('customer')) return '#ec4899'; // Pink
      if(t.includes('product')) return '#84cc16'; // Lime
      if(t.includes('risk') || t.includes('fraud')) return '#ef4444'; // Red
      return '#475569';
    };

    // --- GLOSSY SVG ---
    const getGlossySvg = () => {
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 100 100"><defs><radialGradient id="shine" cx="30%" cy="30%" r="40%"><stop offset="0%" stop-color="white" stop-opacity="1"/><stop offset="100%" stop-color="white" stop-opacity="0"/></radialGradient></defs><circle cx="50" cy="50" r="50" fill="url(#shine)"/></svg>`;
      return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
    };

    // --- INIT CYTOSCAPE ---
    useEffect(() => {
      if (!containerRef.current) return;

      cyRef.current = cytoscape({
        container: containerRef.current,
        wheelSensitivity: 0.2,
        maxZoom: 3.0, minZoom: 0.05,          
        style: [
              {
                selector: "node",
                style: {
                  "shape": "ellipse",
                  // Bigger Hubs so text fits inside
                  "width": (ele: any) => ['Branch', 'Customer', 'Product', 'Activity'].includes(ele.data('type')) ? 160 : 120,
                  "height": (ele: any) => ['Branch', 'Customer', 'Product', 'Activity'].includes(ele.data('type')) ? 160 : 120,
                  "background-color": (ele: any) => getNodeColor(ele.data('normType') || ele.data('type')),
                  "background-opacity": 0.9, 
                  "background-image": getGlossySvg(),
                  "background-width": "100%", "background-height": "100%",
                  "border-width": 3, "border-color": "#ffffff", "border-opacity": 0.8,
                  
                  // --- TEXT INSIDE NODE FIX ---
                  "label": "data(label)",
                  "text-valign": "center", 
                  "text-halign": "center",
                  "text-wrap": "wrap", 
                  "text-max-width": 100, 
                  "font-size": 18, 
                  "font-weight": "bold", 
                  "color": "#ffffff", // White text
                  "text-outline-width": 2, // Black outline for readability
                  "text-outline-color": "#000000",
                  "z-index": 100
                } as any,
              },
              {
                selector: "edge",
                style: {
                  "width": 3, "curve-style": "bezier", "line-color": "#64748b", "opacity": 0.6,
                  "target-arrow-shape": "triangle", "target-arrow-color": "#64748b", "arrow-scale": 1.2,
                  "label": (ele: any) => ele.data('type') === 'NEXT_STEP' ? '' : ele.data('type'),
                  "font-size": 14, "color": "#cbd5e1", "text-background-opacity": 1, "text-background-color": "#020617"
                } as any
              },
              // SEQUENCE
              {
                selector: "edge[type='NEXT_STEP']",
                style: { "width": 5, "line-style": "dashed", "line-color": "#22d3ee", "target-arrow-color": "#22d3ee", "opacity": 1 } as any
              },
              // HUBS
              {
                selector: "edge[type='HAS_EVENT'], edge[type='INVOLVES']",
                style: { "width": 2, "line-color": "#94a3b8", "opacity": 0.4 } as any
              },
              // STATES
              { selector: ":selected", style: { "border-width": 6, "border-color": "#F59E0B" } as any },
              { selector: ".faded", style: { "opacity": 0.1, "z-index": 0 } as any },
              { selector: ".highlighted", style: { "background-opacity": 1, "border-width": 8, "border-color": "#fff", "z-index": 1000 } as any }
        ],
        layout: { name: "preset" } 
      });

      const cy = cyRef.current;
      const resizeObserver = new ResizeObserver(() => { if (cy && containerRef.current) { cy.resize(); cy.fit(); } });
      resizeObserver.observe(containerRef.current);

      cy.on("tap", "node", (evt) => {
          const node = evt.target;
          onNodeSelect(node.id(), node.data('parentId'));
          
          cy.batch(() => {
              cy.elements().removeClass("highlighted").removeClass("faded");
              const neighborhood = node.closedNeighborhood();
              if(['Branch', 'Customer', 'Product'].includes(node.data('type'))) {
                  const extended = neighborhood.union(neighborhood.connectedNodes());
                  cy.elements().not(extended).addClass("faded");
                  extended.addClass("highlighted");
              } else {
                  cy.elements().not(neighborhood).addClass("faded");
                  neighborhood.addClass("highlighted");
              }
          });
          cy.animate({ fit: { eles: cy.elements().not(".faded"), padding: 50 }, duration: 800, easing: 'ease-out-cubic' } as any);
      });

      cy.on("tap", (evt) => { 
          if (evt.target === cy) { 
              onNodeDeselect(); 
              cy.batch(() => { cy.elements().removeClass("faded").removeClass("highlighted"); }); 
              cy.animate({ fit: { eles: cy.elements(), padding: 50 }, duration: 700 } as any); 
          } 
      });

      return () => { resizeObserver.disconnect(); cy.destroy(); };
    }, []);

    // --- DATA LOADING ---
    useEffect(() => {
        if (!cyRef.current) return;
        const currentIds = entities.map(e => e.id).sort().join(",");
        if (currentIds === prevEntitiesIds.current) return;
        prevEntitiesIds.current = currentIds;

        const cy = cyRef.current;
        cy.batch(() => {
            cy.elements().remove(); 
            const nodes = entities.map(e => ({
                group: "nodes",
                data: { 
                    id: String(e.id), 
                    label: e.label || e.id, 
                    type: e.type || "Concept", 
                    normType: e.properties?.normType 
                }
            }));
            const edges = relationships.map(r => ({
                group: "edges",
                data: { id: String(r.id), source: String(r.from), target: String(r.to), type: r.type || "RELATED" }
            }));
            cy.add([...nodes, ...edges] as any);
        });
        
        cy.layout({ 
            name: 'fcose', quality: "proof", randomize: true, animate: true, 
            nodeRepulsion: 4000000, idealEdgeLength: 200, nodeSeparation: 300, padding: 50 
        } as any).run();

    }, [entities, relationships]);

    useImperativeHandle(ref, () => ({
       filterByType: () => {}, filterByRelationship: () => {}, searchAndHighlight: () => {}, fit: () => cyRef.current?.fit(), resetZoom: () => {}, zoomIn: () => {}, zoomOut: () => {}, exportGraph: () => {}
    }));

    return <div ref={containerRef} className="w-full h-full bg-[#020617]" style={{ backgroundImage: `radial-gradient(circle at 1px 1px, #1e293b 1px, transparent 0)`, backgroundSize: '40px 40px' }} />;
  }
));

GraphVisualization.displayName = "GraphVisualization";
export default GraphVisualization;