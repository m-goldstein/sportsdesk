import { NextRequest, NextResponse } from "next/server";
import { demoBoard } from "@/lib/demo";
import { getBoard, getMarkets, today, validDate } from "@/lib/providers";
import { isLeague } from "@/lib/types";
export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams,
    id = q.get("id") ?? "",
    league = q.get("league") ?? "",
    date = q.get("date") ?? today();
  if (
    !isLeague(league) ||
    !validDate(date) ||
    !/^(\d{6,12}|demo-\d{1,2})$/.test(id)
  )
    return NextResponse.json(
      { error: "Invalid market request." },
      { status: 400 },
    );
  const board = id.startsWith("demo-")
    ? demoBoard(date)
    : await getBoard(date, league);
  const game = board.games.find((g) => g.id === id && g.league === league);
  if (!game)
    return NextResponse.json(
      { error: "Matchup not found on the selected date." },
      { status: 404 },
    );
  if (game.demo)
    return NextResponse.json({
      quotes: game.quotes,
      warnings: ["Illustrative prices. Live market signals are disabled."],
    });
  return NextResponse.json(await getMarkets(game));
}
