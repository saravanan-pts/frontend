import { NextRequest, NextResponse } from "next/server"; // Added NextRequest
import { surrealDB } from "@/lib/surrealdb-client";
import { graphOps } from "@/services/graph-operations"; // Added graphOps service

export const runtime = "nodejs";

// --- YOUR TEAM'S EXISTING GET FUNCTION (UNTOUCHED) ---
export async function GET() {
  try {
    await surrealDB.connect();
    const db = surrealDB.getClient();

    // Fetch documents
    const result = await db.query(`
      SELECT 
        id, 
        filename, 
        fileType, 
        entityCount, 
        relationshipCount, 
        createdAt,
        processedAt
      FROM document 
      ORDER BY createdAt DESC
    `);

    // FIX: Safely extract the inner array from the SurrealDB response object
    // @ts-ignore
    const documents = result[0]?.result || [];

    return NextResponse.json(documents);
    
  } catch (error: any) {
    console.error("Fetch Documents Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// --- NEW: DELETE FUNCTION ADDED HERE ---
export async function DELETE(request: NextRequest) {
  try {
    await surrealDB.connect();
    const body = await request.json();
    const { filename } = body;

    if (!filename) {
      return NextResponse.json({ error: "Filename is required" }, { status: 400 });
    }

    console.log(`[API] Deleting document: ${filename}`);
    
    // Uses the helper we added to graph-operations.ts earlier
    await graphOps.deleteDocumentByFilename(filename);

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("[API Delete Error]:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}