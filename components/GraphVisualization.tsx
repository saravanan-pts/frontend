"use client";

import { useEffect, useRef, useImperativeHandle, forwardRef, memo } from "react";
import cytoscape, { Core } from "cytoscape";
import fcose from "cytoscape-fcose";
import type { Entity, Relationship } from "@/types";

// 1. REGISTER LAYOUT EXTENSIONS
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
    
    // Refs to prevent unnecessary re-renders
    const prevEntitiesIds = useRef<string>("");
    const prevRelIds = useRef<string>("");

    // =========================================================
    // 2. UPDATED COLOR PALETTE (For 15 Datasets)
    // =========================================================
    const getNodeColor = (type: any) => {
      // Normalize: remove spaces, lowercase
      const t = String(type || "concept").toLowerCase().replace(/\s+/g, '');
      
      switch (t) {
        // --- CORE SUBJECTS (The "Case" Files) ---
        case 'case':          return '#60a5fa'; // Pastel Blue
        case 'claim':         return '#3b82f6'; // Bright Blue
        case 'quote':         return '#818cf8'; // Indigo
        case 'policy':        return '#6366f1'; // Violet
        case 'lead':          return '#a78bfa'; // Light Purple
        case 'complaint':     return '#c084fc'; // Purple
        case 'session':       return '#8b5cf6'; // Darker Violet
        case 'transaction':   return '#2563eb'; // Royal Blue
        case 'investigation': return '#4f46e5'; // Deep Indigo
        case 'endorsement':   return '#7c3aed'; // Deep Purple
        case 'renewal':       return '#9333ea'; // Magenta Purple

        // --- PEOPLE & ACTORS ---
        case 'customer':      return '#f472b6'; // Pastel Pink
        case 'person':        return '#ec4899'; // Bright Pink
        case 'agent':         return '#db2777'; // Deep Pink
        case 'authority':     return '#be185d'; // Maroon Pink
        case 'profession':    return '#fda4af'; // Light Rose
        case 'demographic':   return '#fb7185'; // Rose

        // --- FINANCE & METRICS ---
        case 'amount':        return '#34d399'; // Emerald
        case 'financialvalue':return '#10b981'; // Green
        case 'metric':        return '#2dd4bf'; // Teal
        case 'score':         return '#14b8a6'; // Dark Teal
        case 'deductible':    return '#059669'; // Dark Green
        case 'liability':     return '#047857'; // Forest Green

        // --- RISK & ALERTS ---
        case 'cause':         return '#fb923c'; // Orange
        case 'risk':          return '#f87171'; // Light Red
        case 'accident':      return '#ef4444'; // Red
        case 'flag':          return '#dc2626'; // Dark Red
        case 'alert':         return '#ea580c'; // Burnt Orange
        case 'fraud':         return '#b91c1c'; // Blood Red
        case 'effect':        return '#991b1b'; // Deep Red

        // --- PROCESS & TIME ---
        case 'activity':      return '#22d3ee'; // Bright Cyan
        case 'action':        return '#06b6d4'; // Darker Cyan
        case 'time':          return '#94a3b8'; // Blue Gray
        case 'timestamp':     return '#64748b'; // Slate Gray
        case 'outcome':       return '#0ea5e9'; // Sky Blue
        case 'status':        return '#0284c7'; // Steel Blue

        // --- ASSETS & THINGS ---
        case 'product':       return '#facc15'; // Yellow
        case 'asset':         return '#a3e635'; // Lime
        case 'vehicle':       return '#84cc16'; // Dark Lime
        case 'device':        return '#d9f99d'; // Pale Lime
        case 'document':      return '#fef08a'; // Pale Yellow
        case 'channel':       return '#fbbf24'; // Amber

        // --- LOCATIONS ---
        case 'branch':        return '#d6d3d1'; // Stone Gray
        case 'location':      return '#a8a29e'; // Warm Gray
        case 'state':         return '#78716c'; // Brownish Gray
        case 'region':        return '#57534e'; // Dark Brown

        // --- DEFAULT ---
        case 'concept':       return '#cbd5e1'; // Light Slate
        default:              return '#475569'; // Default Slate
      }
    };

    // =========================================================
    // 3. GLOSSY SVG GENERATOR
    // =========================================================
    const getGlossySvg = () => {
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 100 100">
        <defs>
          <radialGradient id="shine" cx="30%" cy="30%" r="40%">
            <stop offset="0%" stop-color="white" stop-opacity="1"/>
            <stop offset="100%" stop-color="white" stop-opacity="0"/>
          </radialGradient>
        </defs>
        <circle cx="50" cy="50" r="50" fill="url(#shine)"/>
      </svg>`;
      return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
    };

    // =========================================================
    // 4. INITIALIZE CYTOSCAPE ENGINE
    // =========================================================
    useEffect(() => {
      if (!containerRef.current) return;

      cyRef.current = cytoscape({
        container: containerRef.current,
        wheelSensitivity: 0.15,
        maxZoom: 4.0,            
        minZoom: 0.01,          
        style: [
              // --- NODE STYLING (Glossy Bubbles) ---
              {
                selector: "node",
                style: {
                  "shape": "ellipse",
                  "width": 280, 
                  "height": 280,
                  "background-color": (ele: any) => {
                    const d = ele.data();
                    const rawType = String(d.type || "").toLowerCase();
                    return getNodeColor(d.normType || d.type);
                  },
                  "background-opacity": 0.6, 
                  "background-image": getGlossySvg(),
                  "background-width": "100%",
                  "background-height": "100%",
                  "border-width": 8,
                  "border-color": "#ffffff",
                  "border-opacity": 0.5,
                  "label": "data(label)",
                  "text-valign": "center", 
                  "text-halign": "center", 
                  "text-wrap": "wrap", 
                  "text-max-width": 240, 
                  "font-size": 30, 
                  "font-weight": "bold",
                  "color": "#ffffff",
                  "text-outline-width": 6, 
                  "text-outline-color": "#020617",
                  "z-index": 100
                } as any,
              },

              // --- EDGE STYLING (UPDATED FOR CONFIDENCE) ---
              {
                selector: "edge",
                style: {
                  // 1. Dynamic Width based on confidence
                  "width": (ele: any) => {
                    const conf = ele.data('confidence');
                    return conf !== undefined ? 2 + (conf * 10) : 6; 
                  },
                  
                  "curve-style": "bezier",
                  
                  // 2. Dynamic Color
                  "line-color": (ele: any) => {
                    const conf = ele.data('confidence');
                    const type = ele.data('type');
                    if (['CAUSES', 'LED_TO', 'RESULTED_IN'].includes(type)) return "#d50000";
                    return (conf !== undefined && conf < 0.5) ? '#64748b' : '#ffffff';
                  },

                  // 3. Dynamic Opacity
                  "opacity": (ele: any) => {
                    const conf = ele.data('confidence');
                    return conf !== undefined ? 0.3 + (conf * 0.7) : 1.0;
                  },

                  "line-cap": "round",
                  "shadow-blur": 25,
                  "shadow-color": (ele: any) => {
                    const sourceNode = ele.source();
                    const d = sourceNode.data();
                    const rawType = String(d.type || "").toLowerCase();
                    return getNodeColor(d.normType || d.type);
                  },
                  "shadow-opacity": 0.8,
                  
                  "target-arrow-shape": "triangle",
                  "target-arrow-color": (ele: any) => {
                    const conf = ele.data('confidence');
                    const type = ele.data('type');
                    if (['CAUSES', 'LED_TO', 'RESULTED_IN'].includes(type)) return "#d50000";
                    return (conf !== undefined && conf < 0.5) ? '#64748b' : '#ffffff';
                  },
                  "arrow-scale": 2,

                  // 4. Smart Label
                  "label": (ele: any) => {
                    const type = ele.data('type');
                    const conf = ele.data('confidence');
                    return (conf !== undefined && conf < 1.0) 
                        ? `${type} (${Math.round(conf * 100)}%)` 
                        : type;
                  },
                  
                  "font-size": 22, 
                  "font-weight": "bold", 
                  "color": "#ffffff",
                  "text-rotation": "autorotate", 
                  "text-background-opacity": 1, 
                  "text-background-color": "#0f172a", 
                  "text-background-padding": 6,
                  "z-index": 1
                } as any
              },

              // --- CAUSAL EDGES OVERRIDE ---
              {
                selector: "edge[type = 'CAUSES'], edge[type = 'LED_TO'], edge[type = 'RESULTED_IN']",
                style: {
                  "line-color": "#d50000",
                  "target-arrow-color": "#d50000",
                  "shadow-color": "#ff8a80",
                  "color": "#ff8a80"      
                } as any
              },

              // --- INTERACTION STATES ---
              { 
                  selector: ".hovered",
                  style: {
                      "border-width": 12,
                      "border-color": "#ffffff",
                      "shadow-blur": 50,
                      "shadow-color": "#ffffff",
                      "z-index": 999
                  } as any
              },
              { 
                  selector: ".highlighted",
                  style: { 
                      "background-opacity": 1,
                      "border-width": 12, 
                      "border-color": "#ffffff",
                      "shadow-blur": 100,
                      "shadow-color": "#ffffff",
                      "z-index": 1000 
                  } as any 
              },
              { 
                  selector: ".faded",
                  style: { "opacity": 0.05, "z-index": 0 } as any 
              },
              { 
                  selector: ".hidden",
                  style: { "display": "none" } as any 
              },
              { 
                  selector: ":selected",
                  style: { 
                      "border-width": 10, 
                      "border-color": "#ffff00", 
                  } as any 
              },
              {
                selector: "edge.highlighted",
                style: {
                  "width": 10,
                  "line-color": "#00e5ff",
                  "target-arrow-color": "#00e5ff",
                  "z-index": 998
                } as any
              }
        ],
        layout: { name: "preset" } 
      });

      const cy = cyRef.current;
      
      const resizeObserver = new ResizeObserver(() => { 
          if (cy && containerRef.current) { cy.resize(); cy.fit(); } 
      });
      resizeObserver.observe(containerRef.current);

      // --- NODE CLICK ---
      cy.on("tap", "node", (evt) => {
          const node = evt.target;
          onNodeSelect(node.id());
          cy.batch(() => {
              cy.elements().removeClass("highlighted").removeClass("faded");
              const neighborhood = node.closedNeighborhood();
              cy.elements().not(neighborhood).addClass("faded");
              neighborhood.addClass("highlighted");
          });
          
          // ZOOOM UPDATE: 0.40
          cy.animate({ 
              center: { eles: node }, 
              zoom: 0.40, // <--- 40% ZOOM
              duration: 600, 
              easing: 'ease-in-out-cubic' 
          } as any);
      });

      // --- RESET VIEW ---
      cy.on("tap", (evt) => { 
          if (evt.target === cy) { 
              onNodeDeselect(); 
              cy.batch(() => { cy.elements().removeClass("faded").removeClass("highlighted"); }); 
              cy.animate({ fit: { eles: cy.elements(), padding: 100 }, duration: 500, easing: 'ease-out-cubic' } as any); 
          } 
      });

      cy.on('mouseover', 'node', (e) => {
          e.target.addClass('hovered');
          containerRef.current!.style.cursor = 'pointer';
      });
      cy.on('mouseout', 'node', (e) => {
          e.target.removeClass('hovered');
          containerRef.current!.style.cursor = 'default';
      });
      
      cy.on("cxttap", (evt) => {
          const oe = evt.originalEvent as MouseEvent;
          const target = evt.target === cy ? "canvas" : (evt.target.isNode() ? "node" : "edge");
          onContextMenu(oe.clientX, oe.clientY, target, evt.target.id?.(), evt.target.id?.());
      });

      return () => { resizeObserver.disconnect(); cy.destroy(); };
    }, []);

    // =========================================================
    // 5. DATA LOADING & LAYOUT
    // =========================================================
    useEffect(() => {
        if (!cyRef.current) return;
        const currentEntityIds = entities.map(e => e.id).sort().join(",");
        const currentRelIds = relationships.map(r => r.id).sort().join(",");
        if (currentEntityIds === prevEntitiesIds.current && currentRelIds === prevRelIds.current) return;
        prevEntitiesIds.current = currentEntityIds; prevRelIds.current = currentRelIds;

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
                        type: r.type,
                        confidence: r.confidence 
                    } 
                }));
            cy.add([...nodes, ...edges] as any);
        });
        
        cy.layout({ 
            name: 'fcose', 
            quality: "proof", 
            randomize: true, 
            animate: true, 
            animationDuration: 1200, 
            nodeRepulsion: 900000,    
            idealEdgeLength: 450,     
            nodeSeparation: 300,
            gravity: 0.1,             
            numIter: 2500,           
            padding: 100
        } as any).run();

    }, [entities, relationships]);

    // =========================================================
    // 6. PUBLIC API
    // =========================================================
    useImperativeHandle(ref, () => ({
       filterByType: (visibleTypes) => {
        if (!cyRef.current) return;
        cyRef.current.batch(() => {
            cyRef.current?.nodes().removeClass("hidden");
            if (visibleTypes && visibleTypes.length > 0) {
              const lowerVisible = visibleTypes.map(t => t.toLowerCase().replace(/\s+/g, ''));
              cyRef.current?.nodes().filter(n => {
                  const data = n.data();
                  const nType = String(data.normType || data.type || "concept").toLowerCase().replace(/\s+/g, '');
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
            cy.animate({ fit: { eles: neighborhood, padding: 300 }, duration: 800 } as any);
        });
      },
      fit: () => cyRef.current?.fit(),
      resetZoom: () => cyRef.current?.animate({ fit: { eles: cyRef.current.elements(), padding: 50 }, duration: 800 } as any),
      zoomIn: () => cyRef.current?.zoom((cyRef.current.zoom() || 1) * 1.2),
      zoomOut: () => cyRef.current?.zoom((cyRef.current.zoom() || 1) / 1.2),
      exportGraph: (format) => {
          if (!cyRef.current) return;
          const png = cyRef.current.png({ full: true, bg: '#020617' });
          const a = document.createElement('a'); a.href = png; a.download = 'graph.png'; a.click();
      }
    }));

    return (
        <div ref={containerRef} className="w-full h-full bg-[#020617] transition-all duration-300 ease-in-out" 
          style={{ backgroundImage: `radial-gradient(circle at 1px 1px, #1e293b 1px, transparent 0)`, backgroundSize: '40px 40px' }} />
    );
  }
));

GraphVisualization.displayName = "GraphVisualization";
export default GraphVisualization;