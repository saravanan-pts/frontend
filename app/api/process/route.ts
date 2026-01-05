import { NextRequest, NextResponse } from "next/server";
import { surrealDB } from "@/lib/surrealdb-client";
import { azureOpenAI } from "@/services/azure-openai";
import { TABLES } from "@/lib/schema";
import { graphOps } from "@/services/graph-operations";

export const runtime = "nodejs";
export const maxDuration = 300;

// --- HELPER: Normalize Types for Clean Filters ---
const normalizeType = (rawType: string, label: string): string => {
    const t = (rawType || "").toLowerCase();
    const l = (label || "").toLowerCase();

    // 1. Events (Orange)
    if (t.includes("event") || t.includes("activity") || t.includes("action") || l.includes("call")) return "Event";
    
    // 2. Time (Grey)
    if (t.includes("time") || t.includes("date") || l.match(/\d{4}-\d{2}/)) return "Time";
    
    // 3. Location (Yellow)
    if (t.includes("loc") || t.includes("city") || t.includes("region") || t.includes("country")) return "Location";
    
    // 4. Person (Blue)
    if (t.includes("person") || t.includes("user") || t.includes("agent") || t.includes("customer")) return "Person";

    // 5. Organization (Green) <--- NEW: Added this check
    if (t.includes("org") || t.includes("company") || t.includes("dept") || t.includes("agency") || t.includes("business")) return "Organization";
    
    // 6. Everything else -> Concept (Purple)
    return "Concept";
};

// --- HELPER: Sanitize IDs ---
const sanitizeId = (label: string) => {
    if (!label) return "unknown";
    return label.trim().replace(/[^a-zA-Z0-9_]/g, '_').toLowerCase();
};

export async function POST(request: NextRequest) {
  try {
    await surrealDB.connect();
    const db = surrealDB.getClient();

    let body;
    try { body = await request.json(); } 
    catch (e) { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

    const { textContent, fileName, filename, approvedMapping } = body;
    const finalFileName = fileName || filename || "input.txt";

    if (!textContent) return NextResponse.json({ error: "No text content" }, { status: 400 });

    const document = await graphOps.createDocument({
        filename: finalFileName,
        content: textContent,
        fileType: "text",
    });

    const lines = textContent.split('\n').filter((line: string) => line.trim().length > 0);
    
    // Header logic
    let csvHeaders: string[] = [];
    if (lines.length > 0 && (!approvedMapping || approvedMapping.length === 0)) {
        csvHeaders = lines[0].split(',').map((h: string) => h.trim().replace(/"/g, ''));
        lines.shift(); 
    } 

    const rowsToProcess = lines; 
    console.log(`Processing ${rowsToProcess.length} rows...`);

    let entitiesInserted = 0;
    let relsInserted = 0;
    let lastEventId: string | null = null; 
    let lastCaseId: string | null = null;

    for (const row of rowsToProcess) {
        let result = { entities: [] as any[], relationships: [] as any[] };

        // --- STRATEGY: MANUAL CSV PARSING (Guarantees Connections) ---
        if (csvHeaders.length > 0) {
            const values = row.split(',').map((v: string) => v.trim().replace(/"/g, ''));
            const caseId = values[0]; 

            // 1. Create Nodes (Apply normalizeType here to fix Filters)
            values.forEach((val, index) => {
                if (val && csvHeaders[index]) {
                    const headerName = csvHeaders[index].trim();
                    const cleanType = normalizeType(headerName, val); // <--- FORCE "Organization", "Concept", etc.

                    result.entities.push({
                        label: val,
                        type: cleanType, 
                        properties: { original_column: headerName, source: "csv_strict" }
                    });
                }
            });

            // 2. Link Column 0 (Subject) to all other columns
            if (values.length > 1 && values[0]) {
                const subject = values[0]; 
                for (let i = 1; i < values.length; i++) {
                    if (values[i]) {
                        result.relationships.push({
                            from: subject,
                            to: values[i],
                            type: "HAS_" + csvHeaders[i].replace(/[^a-zA-Z0-9_]/g, '_').toUpperCase(),
                            source: "csv_strict"
                        });
                    }
                }
            }

            // 3. Sequence Logic (Event -> Next Event)
            if (lastCaseId === caseId && lastEventId) {
                const currentEventNode = result.entities.find(e => e.type === 'Event');
                if (currentEventNode) {
                    const currentEventId = `entity:${sanitizeId(currentEventNode.label)}`;
                    result.relationships.push({
                         fromId: lastEventId, 
                         toId: currentEventId,
                         type: "NEXT",
                         isSequence: true
                    });
                }
            }
            lastCaseId = caseId;
        } 
        else {
             // Fallback to AI
             const aiResult = await azureOpenAI.extractEntitiesAndRelationships(row);
             result.entities.push(...(aiResult.entities || []));
             result.relationships.push(...(aiResult.relationships || []));
        }
        
        // --- INSERTION LOGIC ---
        const now = new Date().toISOString(); 
        let currentEventId: string | null = null;

        for (const entity of result.entities) {
            if(!entity.label) continue;
            const id = `entity:${sanitizeId(entity.label)}`;
            if (entity.type === 'Event') currentEventId = id;

            try {
                await db.create(id, {
                    label: entity.label,
                    type: entity.type, 
                    properties: entity.properties || {}, 
                    metadata: { source: document.id },
                    createdAt: now,
                    updatedAt: now
                });
                entitiesInserted++;
            } catch (err) {
                await db.merge(id, { updatedAt: now });
            }
        }

        for (const rel of result.relationships) {
            if (rel.isSequence) {
                try {
                     await db.query(`RELATE ${rel.fromId}->NEXT->${rel.toId} SET type='Sequence', source=$doc`, { doc: document.id });
                     relsInserted++;
                } catch(e) {}
                continue;
            }

            if(!rel.from || !rel.to) continue;
            const fromId = `entity:${sanitizeId(rel.from)}`;
            const toId = `entity:${sanitizeId(rel.to)}`;
            
            // Ensure nodes exist as Concepts if missing
            try { await db.create(fromId, { label: rel.from, type: "Concept", metadata: { source: document.id }, createdAt: now, updatedAt: now }); } catch(e) {}
            try { await db.create(toId, { label: rel.to, type: "Concept", metadata: { source: document.id }, createdAt: now, updatedAt: now }); } catch(e) {}

            const relType = (rel.type || "RELATED_TO").replace(/[^a-zA-Z0-9_]/g, '_').toUpperCase();

            try { 
                await db.query(`DEFINE TABLE IF NOT EXISTS ${relType} SCHEMALESS PERMISSIONS FULL`); 
                await db.query(`
                    RELATE ${fromId}->${relType}->${toId} 
                    SET confidence=1.0, source=$doc, createdAt='${now}'
                `, { doc: document.id });
                relsInserted++;
            } catch (e: any) {}
        }
        if (currentEventId) lastEventId = currentEventId;
    }

    await graphOps.updateDocument(document.id, { entityCount: entitiesInserted, relationshipCount: relsInserted });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Processing Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}