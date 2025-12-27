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
    // Note: graphOps.createDocument now handles createdAt automatically
    const document = await graphOps.createDocument({
        filename: fileName || "input.txt",
        content: textContent,
        fileType: "text",
    });

    // 3. Process Sequentially
    const lines = textContent.split('\n').filter(line => line.trim().length > 0);
    if(approvedMapping && lines.length > 0 && lines[0].includes(approvedMapping[0]?.header_column)) {
        lines.shift(); // Skip Header
    }

    const BATCH_SIZE = 100; 
    const rowsToProcess = lines.slice(0, BATCH_SIZE); 
    
    console.log(`Processing ${rowsToProcess.length} rows...`);

    let entitiesInserted = 0;
    let relsInserted = 0;
    let lastEventId: string | null = null; 

    for (const row of rowsToProcess) {
        const result = await azureOpenAI.extractGraphWithMapping(row, approvedMapping || []);
        
        let currentEventId: string | null = null;
        const sanitizeId = (label: string) => label ? label.trim().replace(/[^a-zA-Z0-9_]/g, '_').toLowerCase() : "unknown";
        
        // FIX: Shared timestamp for this batch row
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
                    // FIX: Mandatory fields
                    createdAt: now,
                    updatedAt: now
                });
            } catch (err) {
                await db.merge(id, {
                    properties: entity.properties || {},
                    updatedAt: now
                });
            }
            entitiesInserted++;
        }

        // B. Insert Relationships (With SELF-HEALING)
        for (const rel of result.relationships) {
            if(!rel.from || !rel.to) continue;
            const fromId = `entity:${sanitizeId(rel.from)}`;
            const toId = `entity:${sanitizeId(rel.to)}`;
            
            // Self-Healing with createdAt
            try { await db.create(fromId, { label: rel.from, type: "Implicit", metadata: { source: document.id }, createdAt: now, updatedAt: now }); } catch(e) { /* Exists */ }
            try { await db.create(toId, { label: rel.to, type: "Implicit", metadata: { source: document.id }, createdAt: now, updatedAt: now }); } catch(e) { /* Exists */ }

            const relType = (rel.type || "RELATED_TO").replace(/[^a-zA-Z0-9_]/g, '_').toUpperCase();

            // Unlock Table & Insert (Adding createdAt)
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

        // C. Insert Timeline Chain (Adding createdAt)
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