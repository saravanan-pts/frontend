import { NextRequest, NextResponse } from "next/server";
import { surrealDB } from "@/lib/surrealdb-client";
import { azureOpenAI } from "@/services/azure-openai";
import { graphOps } from "@/services/graph-operations";

// --- IMPORTANT: Allow Large Files ---
export const runtime = "nodejs";
export const maxDuration = 300; 
export const config = {
  api: {
    bodyParser: {
      sizeLimit: '50mb',
    },
  },
};

// --- HELPER: Smart CSV Parser (Handles , ; and Tabs) ---
const parseCSVRow = (row: string, delimiter: string): string[] => {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < row.length; i++) {
        const char = row[i];
        if (char === '"') {
            inQuotes = !inQuotes;
        } else if (char === delimiter && !inQuotes) {
            result.push(current.trim().replace(/^"|"$/g, ''));
            current = '';
        } else {
            current += char;
        }
    }
    result.push(current.trim().replace(/^"|"$/g, ''));
    return result;
};

// Detect the delimiter from the first header line
const detectDelimiter = (line: string): string => {
    if (line.includes(';') && line.split(';').length > line.split(',').length) return ';';
    if (line.includes('\t') && line.split('\t').length > line.split(',').length) return '\t';
    return ',';
};

// --- HELPER: Normalize Types ---
const normalizeType = (rawType: string, label: string): string => {
    const t = (rawType || "").toLowerCase();
    const l = (label || "").toLowerCase();
    if (t.includes("event") || t.includes("activity") || l.includes("call")) return "Event";
    if (t.includes("time") || t.includes("date") || l.match(/\d{4}-\d{2}/)) return "Time";
    if (t.includes("loc") || t.includes("city") || t.includes("country")) return "Location";
    if (t.includes("person") || t.includes("user") || t.includes("agent")) return "Person";
    if (t.includes("org") || t.includes("company") || t.includes("business")) return "Organization";
    return "Concept";
};

// --- HELPER: Sanitize IDs (Make them safe for DB) ---
const sanitizeId = (label: string) => {
    if (!label) return "unknown";
    // Keep it simple: alphanumeric and underscores only
    return label.trim().replace(/[^a-zA-Z0-9_]/g, '_').toLowerCase();
};

export async function POST(request: NextRequest) {
  try {
    console.log("[Process] Connecting to DB...");
    await surrealDB.connect();
    const db = surrealDB.getClient();
    if (!db) throw new Error("Database connection failed");

    // 1. Read Text
    let body;
    try { 
        body = await request.json(); 
    } catch (e) { 
        return NextResponse.json({ error: "Invalid JSON or File too large" }, { status: 400 }); 
    }

    const { textContent, fileName, filename } = body;
    const finalFileName = fileName || filename || "input.txt";

    if (!textContent) return NextResponse.json({ error: "No text content" }, { status: 400 });

    console.log(`[Process] Starting: ${finalFileName}`);

    // 2. Create Document Record
    const document = await graphOps.createDocument({
        filename: finalFileName,
        content: textContent.substring(0, 1000) + "...", 
        fileType: "text",
    });

    const lines = textContent.split('\n').filter((line: string) => line.trim().length > 0);
    
    // 3. Header & Delimiter Detection
    let csvHeaders: string[] = [];
    let delimiter = ',';

    if (lines.length > 0) {
        delimiter = detectDelimiter(lines[0]);
        console.log(`[Process] Detected Delimiter: '${delimiter}'`);
        
        csvHeaders = parseCSVRow(lines[0], delimiter);
        lines.shift(); // Remove header row
    } 

    const BATCH_SIZE = 50; 
    let entitiesInserted = 0;
    let relsInserted = 0;
    let lastEventId: string | null = null; 
    let lastCaseId: string | null = null;

    // 4. Batch Processing
    for (let i = 0; i < lines.length; i += BATCH_SIZE) {
        const batch = lines.slice(i, i + BATCH_SIZE);
        
        for (const row of batch) {
            let result = { entities: [] as any[], relationships: [] as any[] };

            // Parse Logic
            if (csvHeaders.length > 0) {
                const values = parseCSVRow(row, delimiter);
                const caseId = values[0]; // Assume first column is the "Key"

                // Create Nodes
                values.forEach((val, index) => {
                    if (val && csvHeaders[index]) {
                        const header = csvHeaders[index].trim();
                        // Truncate label if it's too long (prevents the huge bubbles)
                        const cleanLabel = val.length > 50 ? val.substring(0, 47) + "..." : val;
                        
                        result.entities.push({
                            label: cleanLabel,
                            type: normalizeType(header, val), 
                            properties: { 
                                fullName: val, // Keep full text in properties
                                original_column: header, 
                                source: "csv_strict" 
                            }
                        });
                    }
                });

                // Create Relationships (Star Schema: Col 0 -> Col 1, Col 0 -> Col 2...)
                if (values.length > 1 && values[0]) {
                    const subject = values[0].length > 50 ? values[0].substring(0, 47) + "..." : values[0];
                    
                    for (let j = 1; j < values.length; j++) {
                        if (values[j]) {
                            const target = values[j].length > 50 ? values[j].substring(0, 47) + "..." : values[j];
                            result.relationships.push({
                                from: subject,
                                to: target,
                                type: "HAS_" + csvHeaders[j].replace(/[^a-zA-Z0-9_]/g, '_').toUpperCase(),
                                source: "csv_strict"
                            });
                        }
                    }
                }

                // Sequence Logic
                if (lastCaseId === caseId && lastEventId) {
                    const currentEvent = result.entities.find(e => e.type === 'Event');
                    if (currentEvent) {
                        result.relationships.push({
                             fromId: lastEventId, 
                             toId: `entity:${sanitizeId(currentEvent.label)}`,
                             type: "NEXT",
                             isSequence: true
                        });
                    }
                }
                lastCaseId = caseId;
            } 
            
            // Database Writes
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
                } catch (err) { try { await db.merge(id, { updatedAt: now }); } catch(e){} }
            }

            for (const rel of result.relationships) {
                try {
                    if (rel.isSequence) {
                         await db.query(`RELATE ${rel.fromId}->NEXT->${rel.toId} SET type='Sequence', source=$doc`, { doc: document.id });
                         relsInserted++;
                    } else if(rel.from && rel.to) {
                        const fromId = `entity:${sanitizeId(rel.from)}`;
                        const toId = `entity:${sanitizeId(rel.to)}`;
                        
                        // Ensure nodes exist
                        try { await db.create(fromId, { label: rel.from, type: "Concept" }); } catch(e){}
                        try { await db.create(toId, { label: rel.to, type: "Concept" }); } catch(e){}
                        
                        const relType = (rel.type || "RELATED").replace(/[^a-zA-Z0-9_]/g, '_').toUpperCase();
                        
                        // Create Edge
                        await db.query(`RELATE ${fromId}->${relType}->${toId} SET source=$doc`, { doc: document.id });
                        relsInserted++;
                    }
                } catch (e) {}
            }
            if (currentEventId) lastEventId = currentEventId;
        }
    }

    await graphOps.updateDocument(document.id, { entityCount: entitiesInserted, relationshipCount: relsInserted });
    console.log(`[Success] Processed. Entities: ${entitiesInserted}, Rels: ${relsInserted}`);

    return NextResponse.json({ success: true });

  } catch (error: any) {
    console.error("CRITICAL ERROR:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}