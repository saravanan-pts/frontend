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
      case "deleteDocument":
        result = await graphOps.deleteDocument(payload.id);
        break;
      case "deleteDocumentByFilename":
        result = await graphOps.deleteDocumentByFilename(payload.filename);
        break;
      default:
        return NextResponse.json({ error: "Invalid Document Action" }, { status: 400 });
    }
    return NextResponse.json(result);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}