"use client";

import { useEffect, useRef, useImperativeHandle, forwardRef, memo } from "react";
import cytoscape, { Core, NodeSingular, EdgeSingular } from "cytoscape";
import cola from "cytoscape-cola";
import dagre from "cytoscape-dagre";
import fcose from "cytoscape-fcose";
import type { Entity, Relationship } from "@/types";

if (typeof window !== "undefined") {
  try {
    cytoscape.use(cola);
    cytoscape.use(dagre);
    cytoscape.use(fcose);
  } catch (e) {
    console.warn("Cytoscape extensions already registered");
  }
}

// --- STRICT COLOR PALETTE ---
const getEntityColor = (type: string) => {
    const t = (type || "Concept");
    
    // 1. Time/Date: Grey (Requested)
    if (t === "Time" || t === "Date") return "#6b7280"; 
    
    // 2. Location: Yellow (Updated to specific hex)
    if (t === "Location" || t === "Region") return "#F8AE25"; 
    
    // 3. Events: Orange (Requested)
    if (t === "Event" || t === "Activity") return "#f97316"; 
    
    // 4. People: Blue (Requested)
    if (t === "Person" || t === "Agent") return "#3b82f6"; 

    // 5. Organization: Green (Requested)
    if (t === "Organization" || t === "Company" || t === "Department") return "#10b981";
    
    // 6. Concepts: Purple (Requested)
    return "#8b5cf6"; 
};

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

      try {
        cyRef.current = cytoscape({
          container: containerRef.current,
          style: [
             {
                selector: "node",
                style: {
                  "background-color": (ele: NodeSingular) => {
                    return getEntityColor(ele.data("type"));
                  },
                  "label": (ele: NodeSingular) => {
                    const type = ele.data("type");
                    if ((type as string) === 'Community') return ''; 
                    return ele.data("label") || ele.data("id");
                  },
                  "shape": "ellipse",
                  // Events are bigger
                  "width": (ele: any) => (ele.data("type") === 'Event' ? "80px" : "60px"),   
                  "height": (ele: any) => (ele.data("type") === 'Event' ? "80px" : "60px"), 
                  "padding": "0px",
                  "text-wrap": "wrap",
                  "text-max-width": "55px", 
                  "font-size": "9px",
                  "color": "#fff",
                  "text-valign": "center", 
                  "text-halign": "center",
                  "text-justification": "center",
                  "text-outline-width": 1.5,
                  "text-outline-color": "#555"
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
                  "width": (ele: EdgeSingular) => {
                     const type = ele.data("type");
                     return (type === 'NEXT' || type === 'Sequence') ? 3 : 1.5;
                  },
                  "line-color": (ele: EdgeSingular) => {
                     const type = ele.data("type");
                     return (type === 'NEXT' || type === 'Sequence') ? "#3b82f6" : "#cbd5e1";
                  },
                  "target-arrow-color": (ele: EdgeSingular) => {
                     const type = ele.data("type");
                     return (type === 'NEXT' || type === 'Sequence') ? "#3b82f6" : "#cbd5e1";
                  },
                  "target-arrow-shape": "triangle", 
                  "curve-style": "bezier",
                  "label": "data(type)", 
                  "font-size": "8px", 
                  "text-rotation": "autorotate"
                }
              },
              { 
                selector: ".hidden", 
                style: { "display": "none" } 
              },
              { 
                selector: ".highlighted", 
                style: { 
                  "border-width": 4, 
                  "border-color": "#FBBF24", 
                  "width": 65, 
                  "height": 65, 
                  "z-index": 999 
                } 
              }
          ],
          layout: { name: "fcose" } as any,
          minZoom: 0.1, maxZoom: 3,
        });

        // Event Listeners
        cyRef.current.on("tap", "node", (evt) => {
            const node = evt.target;
            const cy = cyRef.current;
            onNodeSelect?.(node.data("id"));
            if (!cy) return;

            cy.batch(() => {
                cy.elements().removeClass("hidden").removeClass("highlighted");
                const neighborhood = node.neighborhood().add(node);
                cy.elements().not(neighborhood).addClass("hidden");
                node.addClass("highlighted");
            });

            cy.animate({
                fit: { eles: node.neighborhood().add(node), padding: 50 },
                duration: 500, 
                easing: 'ease-in-out-cubic' 
            } as any);
        });

        cyRef.current.on("tap", "edge", (evt) => onEdgeSelect?.(evt.target.data("id")));
        
        cyRef.current.on("tap", (evt) => { 
            if (evt.target === cyRef.current) { 
                onNodeDeselect?.(); 
                onEdgeDeselect?.(); 
                const cy = cyRef.current;
                if(cy) {
                    cy.batch(() => {
                        cy.elements().removeClass("hidden").removeClass("highlighted");
                    });
                    cy.animate({ fit: { eles: cy.elements(), padding: 20 }, duration: 500 } as any);
                }
            } 
        });

        cyRef.current.on("cxttap", (evt) => {
            const oe = evt.originalEvent as MouseEvent;
            const target = evt.target === cyRef.current ? "canvas" : (evt.target.isNode() ? "node" : "edge");
            // @ts-ignore
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
            const communityIds = new Set(entities.filter(e => (e.type as string) === "Community").map(e => String(e.id)));

            relationships.forEach(rel => {
                if ((rel.type as string) === "BELONGS_TO" && communityIds.has(String(rel.to))) {
                    parentMap.set(String(rel.from), String(rel.to));
                }
            });

            const nodes = entities.map(e => ({
                group: "nodes",
                data: { 
                    id: String(e.id), 
                    label: e.label || e.id, 
                    type: e.type, 
                    parent: parentMap.get(String(e.id)), 
                    ...e.properties 
                }
            }));

            const validIds = new Set(nodes.map(n => n.data.id));
            
            const edges = relationships
                .filter(r => {
                    const fromId = String(r.from);
                    const toId = String(r.to);
                    return validIds.has(fromId) && validIds.has(toId);
                })
                .filter(r => (r.type as string) !== "BELONGS_TO") 
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
            animate: true, 
            animationDuration: 500,
            nodeRepulsion: 5000, 
            idealEdgeLength: 60, 
            padding: 20
        } as any).run();

    }, [entities, relationships]);

    // 3. Expose Methods
    useImperativeHandle(ref, () => ({
      addNode: () => {}, addEdge: () => {}, updateNode: () => {}, updateEdge: () => {},
      removeNode: () => {}, removeEdge: () => {}, highlightNode: () => {}, highlightEdge: () => {},
      
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

      filterByRelationship: (visibleTypes: string[]) => {
        if (!cyRef.current) return;
        const cy = cyRef.current;
        cy.batch(() => {
            cy.edges().addClass("hidden");
            if (visibleTypes.length > 0) {
              const selector = visibleTypes.map(t => `[type = "${t}"]`).join(", ");
              cy.edges(selector).removeClass("hidden");
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