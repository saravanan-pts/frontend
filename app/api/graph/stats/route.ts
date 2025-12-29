import { NextResponse } from "next/server";
import { graphOps } from "@/services/graph-operations";
import { surrealDB } from "@/lib/surrealdb-client";

export const dynamic = "force-dynamic"; // Never cache this

export async function GET() {
  try {
    await surrealDB.connect();
    const stats = await graphOps.getStats();
    return NextResponse.json(stats);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}