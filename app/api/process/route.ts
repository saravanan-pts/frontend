import { NextRequest, NextResponse } from "next/server";
import { surrealDB } from "@/lib/surrealdb-client";
import { azureOpenAI } from "@/services/azure-openai";
import { TABLES } from "@/lib/schema";
import { graphOps } from "@/services/graph-operations";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(request: NextRequest) {
  try {
    // 1. Connect
    await surrealDB.connect();
    const db = surrealDB.getClient();

    let body;
    try { body = await request.json(); } 
    catch (e) { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

    const { textContent, fileName, approvedMapping } = body;
    if (!textContent) return NextResponse.json({ error: "No text content" }, { status: 400 });

    // 2. Create Document Record
    const document = await graphOps.createDocument({
        filename: fileName || "input.txt",
        content: textContent,
        fileType: "text",
    });

    // 3. Process Sequentially
    const lines = textContent.split('\n').filter((line: string) => line.trim().length > 0);
    
    // --- PRODUCTION FIX: Smart CSV Handling ---
    let csvHeaders: string[] = [];
    if (lines.length > 0 && (!approvedMapping || approvedMapping.length === 0)) {
        // If no mapping, we assume the first row is a Header.
        // We will use this to give the AI context for "Smart Extraction".
        csvHeaders = lines[0].split(',').map((h: string) => h.trim().replace(/"/g, ''));
        lines.shift(); // Remove header from data rows
    } else if (approvedMapping && approvedMapping.length > 0 && lines[0].includes(approvedMapping[0]?.header_column)) {
        lines.shift(); // Skip Header if mapping is provided
    }

    const BATCH_SIZE = 100; 
    const rowsToProcess = lines.slice(0, BATCH_SIZE); 
    
    console.log(`Processing ${rowsToProcess.length} rows...`);

    let entitiesInserted = 0;
    let relsInserted = 0;
    let lastEventId: string | null = null; 

    for (const row of rowsToProcess) {
        let result;

        // STRATEGY A: Strict Mapping (User defined schema)
        if (approvedMapping && approvedMapping.length > 0) {
             result = await azureOpenAI.extractGraphWithMapping(row, approvedMapping);
        } 
        // STRATEGY B: Smart Extraction (Infer precise verbs from context)
        else {
             // Construct a context-rich string: "ColumnName: Value, ColumnName: Value"
             // This helps the AI understand the data without forcing generic "RELATED_TO" edges.
             let contextRow = row;
             if (csvHeaders.length > 0) {
                 const values = row.split(',').map((v: string) => v.trim().replace(/"/g, ''));
                 contextRow = csvHeaders.map((h, i) => `${h}: ${values[i] || ''}`).join(', ');
             }
             // Use the advanced extractor which prompts for "Precise Verbs"
             result = await azureOpenAI.extractEntitiesAndRelationships(contextRow);
        }
        
        // SAFEGUARDS
        result.entities = result.entities || [];
        result.relationships = result.relationships || [];

        // --- DETERMINISTIC BACKFILL (Fixes "Entities: 0" issue) ---
        const existingLabels = new Set(result.entities.map(e => e.label));
        for (const rel of result.relationships) {
            if (rel.from && !existingLabels.has(rel.from)) {
                result.entities.push({ 
                    label: rel.from, 
                    type: "Concept", 
                    properties: { source: "inferred", description: `Inferred node from relationship: ${rel.type}` } 
                });
                existingLabels.add(rel.from);
            }
            if (rel.to && !existingLabels.has(rel.to)) {
                result.entities.push({ 
                    label: rel.to, 
                    type: "Concept", 
                    properties: { source: "inferred", description: `Inferred node from relationship: ${rel.type}` } 
                });
                existingLabels.add(rel.to);
            }
        }
        // -----------------------------------------------------------

        let currentEventId: string | null = null;
        const sanitizeId = (label: string) => label ? label.trim().replace(/[^a-zA-Z0-9_]/g, '_').toLowerCase() : "unknown";
        const now = new Date().toISOString(); 

        // A. Insert Entities
        for (const entity of result.entities) {
            if(!entity.label) continue;
            const id = `entity:${sanitizeId(entity.label)}`;
            
            if (['Event', 'Activity', 'Transaction', 'Log'].includes(entity.type)) {
                currentEventId = id;
            }

            try {
                await db.create(id, {
                    label: entity.label,
                    type: entity.type || "Concept",
                    properties: entity.properties || {}, 
                    metadata: { source: document.id },
                    createdAt: now,
                    updatedAt: now
                });
                entitiesInserted++;
            } catch (err) {
                await db.merge(id, {
                    properties: entity.properties || {},
                    updatedAt: now
                });
            }
        }

        // B. Insert Relationships
        for (const rel of result.relationships) {
            if(!rel.from || !rel.to) continue;
            const fromId = `entity:${sanitizeId(rel.from)}`;
            const toId = `entity:${sanitizeId(rel.to)}`;
            
            // Fail-safe creation (though backfill should have handled this)
            try { await db.create(fromId, { label: rel.from, type: "Implicit", metadata: { source: document.id }, createdAt: now, updatedAt: now }); } catch(e) { /* Exists */ }
            try { await db.create(toId, { label: rel.to, type: "Implicit", metadata: { source: document.id }, createdAt: now, updatedAt: now }); } catch(e) { /* Exists */ }

            // Ensure we don't have empty types
            const relType = (rel.type || "RELATED_TO").replace(/[^a-zA-Z0-9_]/g, '_').toUpperCase();

            try { 
                await db.query(`DEFINE TABLE ${relType} SCHEMALESS PERMISSIONS FULL`); 
                await db.query(`
                    RELATE ${fromId}->${relType}->${toId} 
                    SET confidence=1.0, 
                        source=$doc,
                        createdAt='${now}'
                `, { doc: document.id });
                relsInserted++;
            } catch (e) { console.error(e); }
        }

        // C. Insert Timeline Chain
        if (lastEventId && currentEventId) {
            try {
                await db.query(`DEFINE TABLE NEXT SCHEMALESS PERMISSIONS FULL`);
                await db.query(`
                    RELATE ${lastEventId}->NEXT->${currentEventId} 
                    SET type='Sequence', 
                        source=$doc,
                        createdAt='${now}'
                `, { doc: document.id });
                relsInserted++;
            } catch (e) {}
        }

        if (currentEventId) lastEventId = currentEventId;
    }

    await graphOps.updateDocument(document.id, { entityCount: entitiesInserted, relationshipCount: relsInserted });

    return NextResponse.json({
      success: true,
      stats: { entitiesInserted, relsInserted },
      entities: [], relationships: []
    });

  } catch (error: any) {
    console.error("Processing Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}