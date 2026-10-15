import { NextRequest, NextResponse } from "next/server";
import { demoBoard, demoResearch } from "@/lib/demo";
import { getResearch } from "@/lib/providers";
import { isLeague } from "@/lib/types";
export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams,
    id = q.get("id") ?? "",
    league = q.get("league") ?? "";
  if (!isLeague(league) || !/^(\d{6,12}|demo-\d{1,2})$/.test(id))
    return NextResponse.json(
      { error: "Invalid league or event ID." },
      { status: 400 },
    );
  if (id.startsWith("demo-")) {
    const game = demoBoard().games.find(
      (g) => g.id === id && g.league === league,
    );
    return game
      ? NextResponse.json(demoResearch(game))
      : NextResponse.json(
          { error: "Sample matchup not found." },
          { status: 404 },
        );
  }
  try {
    return NextResponse.json(await getResearch(league, id));
  } catch {
    return NextResponse.json(
      {
        error:
          "Matchup research is temporarily unavailable. Try again shortly.",
      },
      { status: 502 },
    );
  }
}
