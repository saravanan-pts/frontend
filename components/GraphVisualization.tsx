"use client";

import { useEffect, useRef, useImperativeHandle, forwardRef, memo } from "react";
import cytoscape, { Core } from "cytoscape";
import cola from "cytoscape-cola";
import dagre from "cytoscape-dagre";
import fcose from "cytoscape-fcose";
import type { Entity, Relationship } from "@/types";

if (typeof window !== "undefined") {
  cytoscape.use(cola);
  cytoscape.use(dagre);
  cytoscape.use(fcose);
}

export interface GraphVisualizationRef {
  addNode: (entity: Entity) => void;
  addEdge: (relationship: Relationship) => void;
  updateNode: (entity: Entity) => void;
  updateEdge: (relationship: Relationship) => void;
  removeNode: (id: string) => void;
  removeEdge: (id: string) => void;
  highlightNode: (id: string) => void;
  highlightEdge: (id: string) => void;
  filterByType: (types: string[]) => void;
  filterByRelationship: (types: string[]) => void;
  exportGraph: (format: "png" | "json") => void;
  fit: () => void;
  resetZoom: () => void;
  zoomIn: () => void;
  zoomOut: () => void;
  searchAndHighlight: (query: string) => void;
  loadGraphData: (entities: Entity[], relationships: Relationship[]) => void;
}

interface GraphVisualizationProps {
  entities: Entity[];          
  relationships: Relationship[]; 
  onNodeSelect?: (entityId: string) => void;
  onNodeDeselect?: () => void;
  onEdgeSelect?: (edgeId: string) => void;
  onEdgeDeselect?: () => void;
  onContextMenu?: (x: number, y: number, target: "canvas" | "node" | "edge", nodeId?: string, edgeId?: string) => void;
  onCreateNode?: (x: number, y: number) => void;
  onCreateRelationship?: (fromId: string, toId: string) => void;
}

const GraphVisualization = memo(forwardRef<GraphVisualizationRef, GraphVisualizationProps>(
  ({ entities, relationships, onNodeSelect, onNodeDeselect, onEdgeSelect, onEdgeDeselect, onContextMenu }, ref) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const cyRef = useRef<Core | null>(null);

    // 1. Initialize Cytoscape
    useEffect(() => {
      if (!containerRef.current) return;

      const entityColors: Record<string, string> = {
          Person: "#3b82f6", Organization: "#10b981", Location: "#f59e0b",
          Concept: "#8b5cf6", Technology: "#06b6d4",
          Event: "#ef4444", Activity: "#ef4444", Transaction: "#f97316",
          Community: "#e0e7ff"
      };

      try {
        cyRef.current = cytoscape({
          container: containerRef.current,
          style: [
             {
                selector: "node",
                style: {
                  "background-color": (ele) => {
                    const type = ele.data("type") || "Concept";
                    return entityColors[type] || "#6b7280";
                  },
                  "label": (ele) => {
                    const type = ele.data("type");
                    if (type === 'Community') return ''; 
                    const lbl = ele.data("label") || ele.data("id");
                    return lbl.length > 15 ? lbl.substring(0, 15) + "..." : lbl;
                  },
                  "width": 30, "height": 30,
                  "font-size": "9px", "color": "#fff",
                  "text-valign": "center", "text-halign": "center"
                },
              },
              {
                selector: "node[type='Community']",
                style: {
                  "background-color": "#f3f4f6", "background-opacity": 0.5,
                  "border-width": 2, "border-color": "#8b5cf6", "border-style": "dashed",
                  "label": "data(label)", "color": "#6d28d9", "font-size": "14px", "font-weight": "bold",
                  "text-valign": "top", "text-halign": "center"
                }
              },
              {
                selector: "edge",
                style: {
                  "width": 1.5, "line-color": "#cbd5e1", "target-arrow-color": "#cbd5e1",
                  "target-arrow-shape": "triangle", "curve-style": "bezier",
                  "label": "data(type)", "font-size": "8px", "text-rotation": "autorotate"
                }
              },
              // --- CRITICAL FIX: Use display: none ---
              // This ensures edges connected to hidden nodes are AUTOMATICALLY hidden
              { 
                selector: ".hidden", 
                style: { 
                  "display": "none" 
                } 
              },
              { 
                selector: ".highlighted", 
                style: { 
                  "border-width": 4, 
                  "border-color": "#FBBF24", 
                  "width": 40, 
                  "height": 40, 
                  "z-index": 999 
                } 
              }
          ],
          layout: { name: "fcose" } as any,
          minZoom: 0.1, maxZoom: 3,
        });

        // Event Listeners
        cyRef.current.on("tap", "node", (evt) => onNodeSelect?.(evt.target.data("id")));
        cyRef.current.on("tap", "edge", (evt) => onEdgeSelect?.(evt.target.data("id")));
        cyRef.current.on("tap", (evt) => { if (evt.target === cyRef.current) { onNodeDeselect?.(); onEdgeDeselect?.(); } });
        cyRef.current.on("cxttap", (evt) => {
            const oe = evt.originalEvent as MouseEvent;
            const target = evt.target === cyRef.current ? "canvas" : (evt.target.isNode() ? "node" : "edge");
            onContextMenu?.(oe.clientX, oe.clientY, target, evt.target.id?.(), evt.target.id?.());
        });

      } catch (error) { console.error("Cytoscape Init Error:", error); }

      return () => {
          if (cyRef.current) cyRef.current.destroy();
      };
    }, []);

    // 2. Handle Data Updates
    useEffect(() => {
        if (!cyRef.current || entities.length === 0) return;
        
        const cy = cyRef.current;
        
        cy.batch(() => {
            cy.elements().remove(); 

            const parentMap = new Map<string, string>(); 
            const communityIds = new Set(entities.filter(e => e.type === "Community").map(e => e.id));

            relationships.forEach(rel => {
                if (rel.type === "BELONGS_TO" && communityIds.has(rel.to)) {
                    parentMap.set(rel.from, rel.to);
                }
            });

            const nodes = entities.map(e => ({
                group: "nodes",
                data: { 
                    id: e.id, 
                    label: e.label || e.id, 
                    type: e.type, 
                    parent: parentMap.get(e.id), 
                    ...e.properties 
                }
            }));

            const validIds = new Set(entities.map(e => e.id));
            const edges = relationships
                .filter(r => validIds.has(r.from) && validIds.has(r.to))
                .filter(r => r.type !== "BELONGS_TO") 
                .map(r => ({ 
                    group: "edges",
                    data: { id: r.id, source: r.from, target: r.to, type: r.type } 
                }));

            cy.add([...nodes, ...edges] as any);
        });

        cy.layout({ 
            name: 'fcose', animate: true, animationDuration: 500,
            nodeRepulsion: 5000, idealEdgeLength: 60, padding: 20
        } as any).run();

    }, [entities, relationships]);

    // 3. Expose Methods
    useImperativeHandle(ref, () => ({
      addNode: () => {}, addEdge: () => {}, updateNode: () => {}, updateEdge: () => {},
      removeNode: () => {}, removeEdge: () => {}, highlightNode: () => {}, highlightEdge: () => {},
      
      // Filter Nodes (Hides connected edges automatically via display: none)
      filterByType: (visibleTypes: string[]) => {
        if (!cyRef.current) return;
        const cy = cyRef.current;
        cy.batch(() => {
          cy.nodes().removeClass("hidden");
          if (visibleTypes.length > 0) {
             const selector = visibleTypes.map(t => `[type != "${t}"]`).join("");
             cy.nodes(selector).addClass("hidden");
          }
        });
      },

      // Filter Relationships
      filterByRelationship: (visibleTypes: string[]) => {
        if (!cyRef.current) return;
        const cy = cyRef.current;
        cy.batch(() => {
           cy.edges().removeClass("hidden");
           if (visibleTypes.length > 0) {
              const selector = visibleTypes.map(t => `[type != "${t}"]`).join("");
              cy.edges(selector).addClass('hidden');
           }
        });
      },

      exportGraph: (format) => { 
        if(format === 'json') {
            const blob = new Blob([JSON.stringify(cyRef.current?.json())], {type: "application/json"});
            const a = document.createElement('a'); a.href=URL.createObjectURL(blob); a.download='graph.json'; a.click();
        } else {
            const png = cyRef.current?.png({ full: true });
            if(png) { const a = document.createElement('a'); a.href=png; a.download='graph.png'; a.click(); }
        }
      },
      
      loadGraphData: (ents, rels) => { },

      fit: () => cyRef.current?.fit(),
      
      resetZoom: () => {
          cyRef.current?.elements().removeClass("hidden").removeClass("highlighted");
          cyRef.current?.fit();
      },
      
      zoomIn: () => {
        cyRef.current?.zoom({ level: (cyRef.current.zoom() || 1) * 1.2, position: { x: cyRef.current.width() / 2, y: cyRef.current.height() / 2 } });
      },
      
      zoomOut: () => {
        cyRef.current?.zoom({ level: (cyRef.current.zoom() || 1) / 1.2, position: { x: cyRef.current.width() / 2, y: cyRef.current.height() / 2 } });
      },
      
      searchAndHighlight: (query: string) => {
        if (!cyRef.current) return;
        const cy = cyRef.current;
        const term = query.toLowerCase().trim();

        cy.batch(() => {
            cy.elements().removeClass("hidden").removeClass("highlighted");
            if (!term) { cy.fit(); return; }

            const matches = cy.nodes().filter((node) => {
                const d = node.data();
                return (d.label || "").toLowerCase().includes(term) || (d.type || "").toLowerCase().includes(term);
            });

            if (matches.length === 0) return;
            const neighborhood = matches.neighborhood().add(matches);
            cy.elements().not(neighborhood).addClass("hidden");
            matches.addClass("highlighted");
            cy.fit(neighborhood, 50);
        });
      }
    }));

    return <div ref={containerRef} className="w-full h-full border border-gray-300 rounded-lg" style={{ minHeight: "600px" }} />;
  }
));

GraphVisualization.displayName = "GraphVisualization";
export default GraphVisualization;