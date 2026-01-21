"use client";

import { useEffect, useRef, useImperativeHandle, forwardRef, memo } from "react";
import cytoscape, { Core } from "cytoscape";
import fcose from "cytoscape-fcose";
import type { Entity, Relationship } from "@/types";
import { normalizeType } from "@/lib/graphUtils";

// Register Layout Extensions
if (typeof window !== "undefined") {
  try {
    cytoscape.use(fcose);
  } catch (e) {
    console.warn("Cytoscape extension already registered");
  }
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
  onNodeSelect: (id: string) => void;
  onNodeDeselect: () => void;
  onContextMenu: (x: number, y: number, target: any, nodeId?: string, edgeId?: string) => void;
  onCreateNode: (x: number, y: number) => void;
  onCreateRelationship: (from: string, to: string) => void;
}

const GraphVisualization = memo(forwardRef<GraphVisualizationRef, GraphVisualizationProps>(
  ({ entities, relationships, selectedDocumentId, onNodeSelect, onNodeDeselect, onContextMenu }, ref) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const cyRef = useRef<Core | null>(null);
    
    // REFS TO PREVENT UNNECESSARY RELOADS
    const prevEntitiesIds = useRef<string>("");
    const prevRelIds = useRef<string>("");

    // --- COLOR LOGIC (FIXED CRASH HERE) ---
    const getNodeColor = (type: any) => {
      // FIX: Force String() conversion to prevent crash if type is a number or object
      const t = String(type || "concept").toLowerCase();
      
      switch (t) {
        case 'case': return '#f472b6';      // Pink
        case 'activity': return '#22d3ee';  // Cyan
        case 'job': return '#fbbf24';       // Amber
        case 'status': return '#a78bfa';    // Purple
        case 'time': return '#9ca3af';      // Gray
        case 'product': return '#34d399';   // Emerald
        case 'branch': return '#f87171';    // Red
        case 'amount': return '#818cf8';    // Indigo
        case 'document': return '#64748b';  // Slate
        case 'concept': return '#60a5fa';   // Blue (Default)
        default: return '#60a5fa';
      }
    };

    // 1. INITIALIZE CYTOSCAPE CONFIGURATION
    useEffect(() => {
      if (!containerRef.current) return;

      cyRef.current = cytoscape({
        container: containerRef.current,
        wheelSensitivity: 0.2, 
        maxZoom: 2.5,
        minZoom: 0.1,
        style: [
             // --- NODE STYLING ---
             {
               selector: "node",
               style: {
                 "background-color": (ele: any) => {
                    const data = ele.data();
                    // Priority: Explicit normType > type > label fallback
                    const type = data.normType || data.type || "Concept";
                    return getNodeColor(type);
                 },
                 "label": "data(label)",
                 "shape": "round-rectangle",
                 "width": "160px",   
                 "height": "50px", 
                 "text-valign": "center", 
                 "text-halign": "center",
                 "text-wrap": "wrap",
                 "text-max-width": "140px", 
                 "font-size": "11px",        
                 "font-weight": "bold",      
                 "color": "#ffffff",
                 "text-outline-width": 2,  
                 "text-outline-color": "#1e293b", 
                 "z-index": 10
               },
             },
             // --- EDGE STYLING ---
             {
               selector: "edge",
               style: {
                 "width": 3, 
                 "line-color": "#cbd5e1", 
                 "target-arrow-color": "#cbd5e1",
                 "target-arrow-shape": "triangle", 
                 "curve-style": "bezier",
                 "label": "data(type)", 
                 "font-size": "10px",
                 "font-weight": "bold",
                 "text-rotation": "autorotate",
                 "text-background-opacity": 1,
                 "text-background-color": "#020617", 
                 "text-background-padding": "4px",
                 "text-background-shape": "roundrectangle",
                 "color": "#94a3b8",
                 "z-index": 1
               }
             },
             // --- INTERACTION STATES ---
             { 
               selector: ".hidden", 
               style: { 
                   "display": "none"
               } 
             },
             { 
               selector: ".faded", 
               style: { 
                   "opacity": 0.1, 
                   "z-index": 0 
               } 
             },
             { 
               selector: ".highlighted", 
               style: { 
                 "border-width": 4, 
                 "border-color": "#FBBF24", // Gold Border
                 "z-index": 999             
               } 
             },
             {
               selector: "edge.highlighted",
               style: {
                 "width": 4,
                 "line-color": "#FBBF24",
                 "target-arrow-color": "#FBBF24",
                 "opacity": 1,
                 "z-index": 998
               }
             },
             {
               selector: ":selected",
               style: {
                 "border-width": 4,
                 "border-color": "#3b82f6", 
               }
             }
        ],
        layout: { name: "preset" } 
      });

      const cy = cyRef.current;

      // --- CLICK TO FOCUS LOGIC ---
      cy.on("tap", "node", (evt) => {
          const node = evt.target;
          onNodeSelect(node.id());
          
          cy.batch(() => {
              cy.elements().removeClass("highlighted").removeClass("faded");
              const neighborhood = node.closedNeighborhood();
              const others = cy.elements().not(neighborhood);
              others.addClass("faded");
              neighborhood.addClass("highlighted");
          });

          cy.animate({
              fit: {
                  eles: node.closedNeighborhood(),
                  padding: 80
              },
              duration: 700, 
              easing: 'ease-out-cubic'
          } as any);
      });

      // --- CLICK BACKGROUND TO RESET ---
      cy.on("tap", (evt) => { 
          if (evt.target === cy) { 
              onNodeDeselect(); 
              cy.batch(() => {
                  cy.elements().removeClass("faded").removeClass("highlighted");
              });
          } 
      });

      cy.on("cxttap", (evt) => {
          const oe = evt.originalEvent as MouseEvent;
          const target = evt.target === cy ? "canvas" : (evt.target.isNode() ? "node" : "edge");
          onContextMenu(oe.clientX, oe.clientY, target, evt.target.id?.(), evt.target.id?.());
      });

      return () => { cy.destroy(); };
    }, []);

    // 2. LOAD DATA
    useEffect(() => {
        if (!cyRef.current) return;
        
        const currentEntityIds = entities.map(e => e.id).sort().join(",");
        const currentRelIds = relationships.map(r => r.id).sort().join(",");

        if (currentEntityIds === prevEntitiesIds.current && currentRelIds === prevRelIds.current) {
            return;
        }

        prevEntitiesIds.current = currentEntityIds;
        prevRelIds.current = currentRelIds;

        const cy = cyRef.current;

        cy.batch(() => {
            cy.elements().remove(); 

            const nodes = entities.map(e => ({
                group: "nodes",
                data: { 
                    id: String(e.id), 
                    label: e.label || e.id, 
                    type: e.type, 
                    normType: e.properties?.normType, 
                    ...e.properties 
                }
            }));

            const validIds = new Set(nodes.map(n => n.data.id));
            const edges = relationships
                .filter(r => validIds.has(String(r.from)) && validIds.has(String(r.to)))
                .map(r => ({ 
                    group: "edges",
                    data: { 
                        id: String(r.id), 
                        source: String(r.from), 
                        target: String(r.to), 
                        type: r.type 
                    } 
                }));

            cy.add([...nodes, ...edges] as any);
        });

        cy.layout({ 
            name: 'fcose', 
            quality: "proof",
            randomize: true, 
            animate: true, 
            animationDuration: 800,
            nodeRepulsion: 18000, 
            idealEdgeLength: 180,    
            nodeSeparation: 120,    
            gravity: 0.25,
            numIter: 2500,
            padding: 40
        } as any).run();

    }, [entities, relationships]);

    // 3. EXPOSE API
    useImperativeHandle(ref, () => ({
      filterByType: (visibleTypes) => {
        if (!cyRef.current) return;
        cyRef.current.batch(() => {
            cyRef.current?.nodes().removeClass("hidden");
            
            if (visibleTypes && visibleTypes.length > 0) {
              const lowerVisible = visibleTypes.map(t => t.toLowerCase());
              
              cyRef.current?.nodes().filter(n => {
                  const data = n.data();
                  // Use same logic as color to determine type
                  const nType = String(data.normType || data.type || "concept").toLowerCase();
                  return !lowerVisible.includes(nType);
              }).addClass("hidden");
            }
        });
      },
      
      filterByRelationship: (visibleTypes) => {
         if (!cyRef.current) return;
         cyRef.current.batch(() => {
            cyRef.current?.edges().removeClass("hidden");
            
            if (visibleTypes && visibleTypes.length > 0) {
              const lowerVisible = visibleTypes.map(t => t.toLowerCase());

              cyRef.current?.edges().filter(e => {
                  const eType = String(e.data('type') || "").toLowerCase();
                  return !lowerVisible.includes(eType);
              }).addClass("hidden");
            }
         });
      },
      
      searchAndHighlight: (query) => {
        if (!cyRef.current) return;
        const cy = cyRef.current;
        const term = query.toLowerCase();
        cy.batch(() => {
            cy.elements().removeClass("hidden faded highlighted");
            if (!term) return;
            const matches = cy.nodes().filter(n => String(n.data('label')).toLowerCase().includes(term));
            const neighborhood = matches.neighborhood().add(matches);
            cy.elements().not(neighborhood).addClass("faded"); 
            matches.addClass("highlighted");
            cy.animate({ fit: { eles: neighborhood, padding: 50 }, duration: 600 } as any);
        });
      },
      fit: () => cyRef.current?.fit(),
      resetZoom: () => { 
          cyRef.current?.elements().removeClass("hidden faded highlighted"); 
          cyRef.current?.fit(); 
      },
      zoomIn: () => cyRef.current?.zoom((cyRef.current.zoom() || 1) * 1.2),
      zoomOut: () => cyRef.current?.zoom((cyRef.current.zoom() || 1) / 1.2),
      exportGraph: (format) => {
          if (!cyRef.current) return;
          const png = cyRef.current.png({ full: true, bg: '#020617' });
          const a = document.createElement('a'); a.href = png; a.download = 'graph.png'; a.click();
      }
    }));

    return <div ref={containerRef} className="w-full h-full bg-[#020617]" />;
  }
));

GraphVisualization.displayName = "GraphVisualization";
export default GraphVisualization;