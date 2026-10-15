import { NextRequest, NextResponse } from "next/server";
import { demoBoard } from "@/lib/demo";
import { getBoard, today, validDate } from "@/lib/providers";
import { isLeague } from "@/lib/types";
export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams,
    date = q.get("date") ?? today(),
    league = q.get("league");
  if (!validDate(date) || (league && !isLeague(league)))
    return NextResponse.json(
      { error: "Use a valid YYYY-MM-DD date and supported league." },
      { status: 400 },
    );
  const board =
    q.get("mode") === "demo"
      ? demoBoard(date)
      : await getBoard(date, league && isLeague(league) ? league : undefined);
  return NextResponse.json(board, { headers: { "Cache-Control": "no-store" } });
}
