import { NextRequest, NextResponse } from "next/server";
import { surrealDB } from "@/lib/surrealdb-client";
import { azureOpenAI } from "@/services/azure-openai";
import { graphOps } from "@/services/graph-operations";
import { entityResolver } from "@/services/entity-resolver";

export const runtime = "nodejs";
export const maxDuration = 300; // 5 Minutes Timeout

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

    const lines = textContent.split('\n').filter((line: string) => line.trim().length > 0);
    
    // Smart Header Handling (for Context)
    let csvHeaders: string[] = [];
    if (lines.length > 0 && (!approvedMapping || approvedMapping.length === 0)) {
        csvHeaders = lines[0].split(',').map((h: string) => h.trim().replace(/"/g, ''));
    } 
    if (approvedMapping && approvedMapping.length > 0 && lines[0].includes(approvedMapping[0]?.header_column)) {
        lines.shift(); // Skip header if strictly mapped
    }

    console.log(`Processing ${lines.length} rows...`);

    const BATCH_SIZE = 10; 
    let entitiesInserted = 0;
    let relsInserted = 0;

    // 3. PHASE 1: PARALLEL INGESTION (Speed)
    // We insert nodes and local relationships, but we DO NOT link the timeline yet.
    for (let i = 0; i < lines.length; i += BATCH_SIZE) {
        const batch = lines.slice(i, i + BATCH_SIZE);
        
        await Promise.all(batch.map(async (row) => {
            try {
                let result;
                if (approvedMapping && approvedMapping.length > 0) {
                     result = await azureOpenAI.extractGraphWithMapping(row, approvedMapping);
                } else {
                     let contextRow = row;
                     if (csvHeaders.length > 0) {
                         const values = row.split(',').map((v: string) => v.trim().replace(/"/g, ''));
                         if (values.length >= csvHeaders.length - 1) {
                            contextRow = csvHeaders.map((h, idx) => `${h}: ${values[idx] || ''}`).join(', ');
                         }
                     }
                     result = await azureOpenAI.extractEntitiesAndRelationships(contextRow);
                }

                if (!result || !result.entities) return;

                // Resolution & Insertion
                const createdEntityIds: Record<string, string> = {}; 
                const normalize = (s: string) => s ? s.toLowerCase().trim() : "";
                
                for (const extracted of result.entities) {
                    if (!extracted.label) continue;
                    
                    const entity = await entityResolver.resolveAndCreate(extracted, document.id);
                    createdEntityIds[extracted.label] = entity.id;
                    createdEntityIds[normalize(extracted.label)] = entity.id;
                    entitiesInserted++;
                }

                for (const rel of result.relationships) {
                    if (!rel.from || !rel.to) continue;

                    let fromId = createdEntityIds[rel.from] || createdEntityIds[normalize(rel.from)];
                    let toId = createdEntityIds[rel.to] || createdEntityIds[normalize(rel.to)];

                    if (!fromId) {
                        const e = await entityResolver.resolveAndCreate({ label: rel.from, type: "Concept", confidence: 0.8 }, document.id);
                        fromId = e.id;
                    }
                    if (!toId) {
                        const e = await entityResolver.resolveAndCreate({ label: rel.to, type: "Concept", confidence: 0.8 }, document.id);
                        toId = e.id;
                    }

                    const relType = (rel.type || "RELATED_TO").replace(/[^a-zA-Z0-9_]/g, '_').toUpperCase();
                    const now = new Date().toISOString();

                    try {
                        await db.query(`DEFINE TABLE ${relType} SCHEMALESS PERMISSIONS FULL`);
                        await db.query(`
                            RELATE ${fromId}->${relType}->${toId} 
                            SET confidence=${rel.confidence || 1.0}, 
                                source=$doc,
                                createdAt='${now}'
                        `, { doc: document.id });
                        relsInserted++;
                    } catch (e) { console.error(e); }
                }
            } catch (err) { console.error("Row Error:", err); }
        }));
    }

    // 4. PHASE 2: CHRONOLOGICAL LINKING (Logic)
    // Now we sort by timestamp and build the event chain
    console.log("Linking Events by Timestamp...");
    
    try {
        // Find all events from this document that have timestamps
        // We order them by TIME, not by when they were inserted
        const query = `
            SELECT id, properties.timestamp as time 
            FROM entity 
            WHERE metadata.source = $doc 
              AND (
                 type IN ['Event', 'Activity', 'Log', 'Transaction', 'Step', 'Action'] 
                 OR properties.timestamp != NONE
              )
            ORDER BY time ASC;
        `;
        
        const events = await db.query(query, { doc: document.id });
        // @ts-ignore
        const sortedEvents = events[0]?.result || [];

        if (sortedEvents.length > 1) {
            for (let i = 0; i < sortedEvents.length - 1; i++) {
                const current = sortedEvents[i];
                const next = sortedEvents[i+1];
                
                // Only link if they actually have times, or if we trust the sort order
                // If time is missing, they will be at the bottom/top, so checking != NONE is safer but optional
                
                await db.query(`DEFINE TABLE NEXT SCHEMALESS PERMISSIONS FULL`);
                await db.query(`
                    RELATE ${current.id}->NEXT->${next.id}
                    SET type='Sequence', source=$doc, confidence=1.0
                `, { doc: document.id });
                relsInserted++;
            }
            console.log(`Linked ${sortedEvents.length} events chronologically.`);
        }
    } catch (e) {
        console.error("Timeline Linking Failed:", e);
    }

    await graphOps.updateDocument(document.id, { entityCount: entitiesInserted, relationshipCount: relsInserted });

    return NextResponse.json({
      success: true,
      stats: { entitiesInserted, relsInserted },
      message: `Processed and chronologically linked ${lines.length} rows.`
    });

  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}