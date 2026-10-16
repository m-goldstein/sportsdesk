import { NextRequest, NextResponse } from "next/server";
import { getElectionBoard, sampleElectionBoard } from "@/lib/election-data";
export const runtime = "nodejs";
export const maxDuration = 120;
export async function GET(request: NextRequest) {
  const mode = request.nextUrl.searchParams.get("mode") ?? "live";
  if (!["live", "demo"].includes(mode))
    return NextResponse.json({ error: "Invalid mode." }, { status: 400 });
  return NextResponse.json(
    mode === "demo" ? sampleElectionBoard() : await getElectionBoard(),
    { headers: { "Cache-Control": "no-store" } },
  );
}
