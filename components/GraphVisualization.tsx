"use client";

import { useEffect, useRef, useImperativeHandle, forwardRef, memo } from "react";
import cytoscape, { Core } from "cytoscape";
import cola from "cytoscape-cola";
import dagre from "cytoscape-dagre";
import fcose from "cytoscape-fcose"; // <--- Make sure this is installed
import type { Entity, Relationship } from "@/types";

if (typeof window !== "undefined") {
  cytoscape.use(cola);
  cytoscape.use(dagre);
  cytoscape.use(fcose);
}

export interface GraphVisualizationRef {
  loadGraphData: (entities: Entity[], relationships: Relationship[]) => void;
  // ... other methods ...
  addNode: (entity: Entity) => void;
  addEdge: (relationship: Relationship) => void;
  updateNode: (entity: Entity) => void;
  updateEdge: (relationship: Relationship) => void;
  removeNode: (id: string) => void;
  removeEdge: (id: string) => void;
  highlightNode: (id: string) => void;
  highlightEdge: (id: string) => void;
  filterByType: (types: string[]) => void;
  exportGraph: (format: "png" | "json") => void;
  fit: () => void;
  resetZoom: () => void;
}

interface GraphVisualizationProps {
  onNodeSelect?: (entityId: string) => void;
  onNodeDeselect?: () => void;
  onEdgeSelect?: (edgeId: string) => void;
  onEdgeDeselect?: () => void;
  onContextMenu?: (x: number, y: number, target: "canvas" | "node" | "edge", nodeId?: string, edgeId?: string) => void;
  onCreateNode?: (x: number, y: number) => void;
  onCreateRelationship?: (fromId: string, toId: string) => void;
}

const GraphVisualization = memo(forwardRef<GraphVisualizationRef, GraphVisualizationProps>(
  ({ onNodeSelect, onNodeDeselect, onEdgeSelect, onEdgeDeselect, onContextMenu }, ref) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const cyRef = useRef<Core | null>(null);

    useEffect(() => {
      if (!containerRef.current) return;
      
      const initCytoscape = () => {
        if (!containerRef.current) return;
        
        const rect = containerRef.current.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) {
          setTimeout(initCytoscape, 100);
          return;
        }

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
              // 1. STANDARD NODES
              {
                selector: "node",
                style: {
                  "background-color": (ele) => {
                    const type = ele.data("type") || "Concept";
                    return entityColors[type] || "#6b7280";
                  },
                  "label": (ele) => {
                    const type = ele.data("type");
                    // HIDE LABEL if inside a box (too cluttered), show if standalone
                    if (type === 'Community') return ''; 
                    const lbl = ele.data("label");
                    return lbl && lbl.length > 15 ? lbl.substring(0, 15) + "..." : lbl;
                  },
                  "width": 30, "height": 30,
                  "font-size": "9px", "color": "#fff",
                  "text-valign": "center", "text-halign": "center"
                },
              },
              // 2. COMMUNITY BOXES (The "Big Nodes")
              {
                selector: "node[type='Community']",
                style: {
                  "background-color": "#f3f4f6",
                  "background-opacity": 0.5,
                  "border-width": 2,
                  "border-color": "#8b5cf6",
                  "border-style": "dashed",
                  "label": "data(label)",
                  "color": "#6d28d9",
                  "font-size": "14px",
                  "font-weight": "bold",
                  "text-valign": "top",
                  "text-halign": "center"
                }
              },
              // 3. EDGES
              {
                selector: "edge",
                style: {
                  "width": 1.5,
                  "line-color": "#cbd5e1",
                  "target-arrow-color": "#cbd5e1",
                  "target-arrow-shape": "triangle",
                  "curve-style": "bezier",
                  "label": "data(type)",
                  "font-size": "8px",
                  "text-rotation": "autorotate"
                }
              },
              { selector: ".hidden", style: { "display": "none" } }
            ],
            layout: { name: "fcose" } as any, // Use default initially
            minZoom: 0.1, maxZoom: 3,
          });
        } catch (error) { console.error(error); }

        // Events
        cyRef.current?.on("tap", "node", (evt) => onNodeSelect?.(evt.target.data("id")));
        cyRef.current?.on("tap", "edge", (evt) => onEdgeSelect?.(evt.target.data("id")));
        cyRef.current?.on("tap", (evt) => { if (evt.target === cyRef.current) { onNodeDeselect?.(); onEdgeDeselect?.(); } });
        cyRef.current?.on("cxttap", (evt) => {
            const oe = evt.originalEvent as MouseEvent;
            const target = evt.target === cyRef.current ? "canvas" : (evt.target.isNode() ? "node" : "edge");
            onContextMenu?.(oe.clientX, oe.clientY, target, evt.target.id?.(), evt.target.id?.());
        });
      };
      
      const t = setTimeout(initCytoscape, 0);
      return () => clearTimeout(t);
    }, []);

    useImperativeHandle(ref, () => ({
      loadGraphData: (entities: Entity[], relationships: Relationship[]) => {
        if (!cyRef.current || cyRef.current.destroyed()) return;

        try {
          const cy = cyRef.current;
          cy.elements().remove();

          // --- LOGIC: CONVERT 'BELONGS_TO' INTO PARENT CONTAINERS ---
          const parentMap = new Map<string, string>(); 
          const communityIds = new Set(entities.filter(e => e.type === "Community").map(e => e.id));

          relationships.forEach(rel => {
             // If X belongs to Community Y, tell Cytoscape "Y is parent of X"
             if (rel.type === "BELONGS_TO" && communityIds.has(rel.to)) {
                 parentMap.set(rel.from, rel.to);
             }
          });

          // Add Nodes (Assigning 'parent' property)
          const nodes = entities.map(e => ({
            group: "nodes",
            data: { 
                id: e.id, 
                label: e.label, 
                type: e.type, 
                parent: parentMap.get(e.id), // <--- THIS MAKES THEM GO INSIDE
                ...e.properties 
            }
          }));

          // Add Edges (Hide BELONGS_TO lines because the box shows it)
          const validIds = new Set(entities.map(e => e.id));
          const edges = relationships
            .filter(r => validIds.has(r.from) && validIds.has(r.to))
            .filter(r => r.type !== "BELONGS_TO") 
            .map(r => ({ 
                group: "edges",
                data: { id: r.id, source: r.from, target: r.to, type: r.type } 
            }));

          cy.add([...nodes, ...edges] as any);
          
          // RUN LAYOUT
          cy.layout({ 
              name: 'fcose', 
              animate: true,
              animationDuration: 800,
              quality: "default",
              nodeRepulsion: 5000,
              idealEdgeLength: 60,
              nestingFactor: 0.1, // Tight nesting
              padding: 20
          } as any).run();

        } catch (e) { console.error("Graph Load Error:", e); }
      },

      // ... Rest of the methods (addNode, filterByType, etc.) ...
      addNode: () => {}, addEdge: () => {}, updateNode: () => {}, updateEdge: () => {},
      removeNode: () => {}, removeEdge: () => {}, highlightNode: () => {}, highlightEdge: () => {},
      filterByType: (types: string[]) => {
        if (!cyRef.current) return;
        const cy = cyRef.current;
        cy.batch(() => {
          cy.elements().removeClass("hidden");
          if (types.length > 0) {
             const selector = types.map(t => `[type != "${t}"]`).join("");
             cy.nodes(selector).addClass("hidden");
             cy.edges().forEach(edge => {
               if (edge.source().hasClass("hidden") || edge.target().hasClass("hidden")) {
                 edge.addClass("hidden");
               }
             });
          }
        });
      },
      exportGraph: (format) => { 
          if(format === 'json') {
              const json = cyRef.current?.json();
              const blob = new Blob([JSON.stringify(json)], {type: "application/json"});
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a'); a.href=url; a.download='graph.json'; a.click();
          } else {
              const png = cyRef.current?.png({ full: true });
              if(png) { const a = document.createElement('a'); a.href=png; a.download='graph.png'; a.click(); }
          }
      },
      fit: () => cyRef.current?.fit(),
      resetZoom: () => cyRef.current?.resetZoom()
    }));

    return <div ref={containerRef} className="w-full h-full border border-gray-300 rounded-lg" style={{ minHeight: "400px" }} />;
  }
));

GraphVisualization.displayName = "GraphVisualization";
export default GraphVisualization;