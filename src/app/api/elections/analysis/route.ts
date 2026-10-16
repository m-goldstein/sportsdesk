import { NextRequest, NextResponse } from "next/server";
import { ELECTION_RACES } from "@/lib/election-types";
import {
  getElectionRow,
  researchElection,
  sampleElectionBoard,
  sampleElectionReport,
} from "@/lib/election-data";
export const runtime = "nodejs";
export const maxDuration = 180;
export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin"),
    host =
      request.headers.get("x-forwarded-host")?.split(",")[0]?.trim() ||
      request.headers.get("host") ||
      request.nextUrl.host;
  if (origin) {
    try {
      const u = new URL(origin);
      if (!["http:", "https:"].includes(u.protocol) || u.host !== host)
        return NextResponse.json(
          { error: "Use this workspace to request research." },
          { status: 403 },
        );
    } catch {
      return NextResponse.json({ error: "Invalid origin." }, { status: 403 });
    }
  }
  if (!request.headers.get("content-type")?.includes("application/json"))
    return NextResponse.json(
      { error: "Use application/json." },
      { status: 415 },
    );
  try {
    const text = await request.text();
    if (text.length > 1024)
      return NextResponse.json(
        { error: "Request is too large." },
        { status: 413 },
      );
    const body = JSON.parse(text);
    if (
      !body ||
      Object.keys(body).some((k) => !["raceId", "mode"].includes(k)) ||
      !["live", "demo"].includes(body.mode)
    )
      return NextResponse.json(
        { error: "Provide only raceId and mode." },
        { status: 400 },
      );
    const race = ELECTION_RACES.find((r) => r.id === body.raceId);
    if (!race)
      return NextResponse.json(
        { error: "Unsupported election." },
        { status: 400 },
      );
    const row =
      body.mode === "demo"
        ? sampleElectionBoard().rows.find((r) => r.race.id === race.id)!
        : await getElectionRow(race);
    const result =
      body.mode === "demo"
        ? sampleElectionReport(row)
        : await researchElection(row);
    return NextResponse.json(result, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    if (error instanceof Error)
      console.error("Election research failed", {
        name: error.name,
        message: error.message.slice(0, 500),
      });
    const code = error instanceof Error ? error.message : "";
    return NextResponse.json(
      {
        error:
          code === "MISSING_KEY"
            ? "Add OPENAI_API_KEY to enable cited election research."
            : code === "BUSY"
              ? "Election research is busy. Retry shortly."
              : code === "CLOSED_RACE"
                ? "This race is closed or voting has begun. Retrospective forecasts are disabled."
                : code === "NO_CANDIDATES"
                  ? "No supported candidate contracts are available."
                  : error instanceof SyntaxError
                    ? "Invalid JSON."
                    : "Election research could not finish. No unsourced prediction was substituted; retry shortly.",
      },
      {
        status:
          code === "MISSING_KEY"
            ? 503
            : code === "BUSY"
              ? 429
              : code === "CLOSED_RACE"
                ? 409
                : error instanceof SyntaxError
                  ? 400
                  : 502,
        headers: { "Cache-Control": "no-store" },
      },
    );
  }
}
