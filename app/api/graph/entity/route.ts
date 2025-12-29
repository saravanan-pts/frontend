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
      case "createEntity":
        result = await graphOps.createEntity(payload);
        break;
      case "updateEntity":
        result = await graphOps.updateEntity(payload.id, payload.updates);
        break;
      case "deleteEntity":
        await graphOps.deleteEntity(payload.id);
        result = { success: true };
        break;
      default:
        return NextResponse.json({ error: "Invalid Entity Action" }, { status: 400 });
    }
    return NextResponse.json(result);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}