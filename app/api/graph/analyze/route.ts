import { NextResponse } from "next/server";
import { graphAnalytics } from "@/services/graph-analytics";
import { surrealDB } from "@/lib/surrealdb-client";

export const maxDuration = 300; // Allow 5 minutes for AI processing
export const dynamic = "force-dynamic";

export async function POST() {
  try {
    await surrealDB.connect();
    
    console.log("[API] Starting Graph Analysis...");
    
    // Trigger the heavy analytics process
    await graphAnalytics.detectAndSummarizeCommunities();
    
    return NextResponse.json({ 
        success: true, 
        message: "Graph analysis complete. Communities detected and summarized." 
    });

  } catch (error: any) {
    console.error("[API] Analysis Failed:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}