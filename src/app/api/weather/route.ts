import { NextRequest, NextResponse } from "next/server";
import { getWeatherBoard, sampleWeatherBoard } from "@/lib/weather-data";
import { WEATHER_CITIES } from "@/lib/weather-types";
import { validDate } from "@/lib/providers";
export const runtime = "nodejs";
export const maxDuration = 120;
export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams,
    date = q.get("date") ?? "",
    city = q.get("city") ?? "all",
    mode = q.get("mode") ?? "live";
  if (
    !validDate(date) ||
    !["live", "demo"].includes(mode) ||
    (city !== "all" && !WEATHER_CITIES.some((c) => c.id === city))
  )
    return NextResponse.json(
      { error: "Provide a valid date, supported city and live/demo mode." },
      { status: 400 },
    );
  const delta = Date.parse(date + "T12:00Z") - Date.now();
  if (mode === "live" && (delta < -2 * 86400000 || delta > 8 * 86400000))
    return NextResponse.json(
      {
        error:
          "Live weather scans support today and the next seven days, not historical forecasts.",
      },
      { status: 400 },
    );
  const data =
    mode === "demo"
      ? sampleWeatherBoard(date)
      : await getWeatherBoard(date, city);
  if (mode === "demo" && city !== "all")
    data.rows = data.rows.filter((r) => r.city.id === city);
  return NextResponse.json(data, { headers: { "Cache-Control": "no-store" } });
}
