import { NextRequest, NextResponse } from "next/server";
import { getRankingFeed } from "@/lib/ranking-data";
import { validDate } from "@/lib/providers";
export const runtime = "nodejs";
export const maxDuration = 180;
export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams,
    date = q.get("date") ?? "",
    mode = q.get("mode") ?? "live";
  if (!validDate(date) || !["live", "demo"].includes(mode))
    return NextResponse.json(
      { error: "Invalid date or mode." },
      { status: 400 },
    );
  if (
    mode === "live" &&
    Math.abs(Date.parse(date + "T12:00Z") - Date.now()) > 7 * 86400000
  )
    return NextResponse.json(
      { error: "Live rankings support current and near-term slates only." },
      { status: 400 },
    );
  return NextResponse.json(
    await getRankingFeed(date, mode as "live" | "demo"),
    { headers: { "Cache-Control": "no-store" } },
  );
}
