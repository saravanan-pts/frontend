import { NextResponse } from "next/server";
import { surrealDB } from "@/lib/surrealdb-client";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    // 1. Check connection
    const isConnected = await surrealDB.healthCheck();
    
    if (!isConnected) {
      return NextResponse.json({ status: "error", message: "Database unreachable" }, { status: 503 });
    }

    return NextResponse.json({ 
        status: "ok", 
        timestamp: new Date().toISOString(),
        service: "SurrealDB Graph" 
    });

  } catch (error: any) {
    return NextResponse.json({ status: "error", error: error.message }, { status: 500 });
  }
}