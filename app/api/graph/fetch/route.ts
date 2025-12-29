import { NextRequest, NextResponse } from "next/server";
import { graphOps } from "@/services/graph-operations";
import { surrealDB } from "@/lib/surrealdb-client";

export async function POST(request: NextRequest) {
  try {
    await surrealDB.connect();
    const body = await request.json();
    const { payload } = body;
    
    // Handles Initial Graph Loading
    const result = await graphOps.getGraphData(payload?.documentId);
    
    return NextResponse.json(result);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}