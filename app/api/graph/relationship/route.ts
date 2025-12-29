import { NextRequest, NextResponse } from "next/server";
import { graphOps } from "@/services/graph-operations";
import { surrealDB } from "@/lib/surrealdb-client";

export async function POST(request: NextRequest) {
  try {
    await surrealDB.connect();
    const body = await request.json();
    const { action, payload } = body;
    let result;

    switch (action) {
      case "createRelationship":
        result = await graphOps.createRelationship(payload.from, payload.to, payload.type, payload.properties, payload.confidence);
        break;
      case "updateRelationship":
        result = await graphOps.updateRelationship(payload.id, payload.updates);
        break;
      case "deleteRelationship":
        await graphOps.deleteRelationship(payload.id);
        result = { success: true };
        break;
      default:
        return NextResponse.json({ error: "Invalid Relationship Action" }, { status: 400 });
    }
    return NextResponse.json(result);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}