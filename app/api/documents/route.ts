import { NextResponse } from "next/server";
import { surrealDB } from "@/lib/surrealdb-client";

export const runtime = "nodejs";

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