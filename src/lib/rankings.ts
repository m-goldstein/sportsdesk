import { Contract, ContractEvent, freshBook } from "./market-contracts";
import { WeatherBoard, DEFAULT_WEATHER_SETTINGS } from "./weather-types";
import { weatherSignals } from "./weather-model";
import { ElectionBoard, ElectionReport } from "./election-types";
import { candidateContracts, electionForecast } from "./election-model";
export type RankedOutcome = {
  id: string;
  eventId: string;
  domain: "Sports" | "Weather" | "Elections";
  category: string;
  title: string;
  outcome: string;
  date: string;
  market: number | null;
  model: number | null;
  modelLabel: string;
  evidence: string;
  ask: number | null;
  url: string;
  snapshotAt: string;
};
export type RankingFeed = {
  mode: "live" | "demo";
  fetchedAt: string;
  sports: RankedOutcome[];
  weather: WeatherBoard;
  elections: ElectionBoard;
  warnings: string[];
};
export function contractAsk(c: Contract, side: "YES" | "NO", now = Date.now()) {
  const book = side === "YES" ? c.yesBook : c.noBook;
  return c.tradable && freshBook(book, now)
    ? (book?.asks[0]?.price ?? null)
    : null;
}
export function buildRankings(
  feed: RankingFeed,
  reports: ElectionReport[],
  basis: "market" | "model",
  domain = "All domains",
  onePerEvent = true,
  now = Date.now(),
) {
  const rows: RankedOutcome[] = [
    ...feed.sports.map((r) => ({
      ...r,
      ask: now - Date.parse(r.snapshotAt) > 90000 ? null : r.ask,
    })),
  ];
  for (const row of feed.weather.rows.filter((r) => r.event?.active))
    for (const signal of weatherSignals(row, DEFAULT_WEATHER_SETTINGS, now)) {
      const c = signal.contract;
      if (!c?.tradable) continue;
      rows.push({
        id: `weather:${c.id}`,
        eventId: `weather:${row.event!.id}`,
        domain: "Weather",
        category: "Daily high",
        title: `${row.city.name} daily high`,
        outcome: c.label,
        date: row.date,
        market: c.indicative,
        model: signal.probability,
        modelLabel: "NOAA + assumed 3°F normal error",
        evidence:
          row.rulesVerified && row.forecast?.completeDay
            ? "Station/date matched · full forecast day"
            : "Incomplete forecast / rule coverage",
        ask: contractAsk(c, "YES", now),
        url: row.event!.url,
        snapshotAt: c.yesBook?.timestamp ?? row.event!.fetchedAt,
      });
    }
  for (const row of feed.elections.rows.filter((r) => r.event?.active)) {
    const report =
        reports.find((r) => r.raceId === row.race.id && r.mode === feed.mode) ??
        null,
      forecast = electionForecast(row, report, false, now);
    for (const c of candidateContracts(row).filter((c) => c.tradable)) {
      rows.push({
        id: `election:${c.id}`,
        eventId: `election:${row.event!.id}`,
        domain: "Elections",
        category: row.race.office,
        title: `${row.race.state} ${row.race.office}`,
        outcome: c.label,
        date: row.race.date,
        market: c.indicative,
        model:
          forecast?.candidates.find((p) => p.contract.id === c.id)
            ?.probability ?? null,
        modelLabel: "Recency-weighted polling baseline",
        evidence: forecast
          ? `${forecast.pollCount} independent pollsters`
          : "No eligible polling forecast · market reference only",
        ask: contractAsk(c, "YES", now),
        url: row.event!.url,
        snapshotAt: c.yesBook?.timestamp ?? row.event!.fetchedAt,
      });
    }
  }
  const sorted = rows
    .filter(
      (r) =>
        (domain === "All domains" || r.domain === domain) &&
        typeof r[basis] === "number" &&
        Number.isFinite(r[basis]) &&
        r[basis]! > 0 &&
        r[basis]! < 1,
    )
    .sort((a, b) => b[basis]! - a[basis]! || a.id.localeCompare(b.id));
  const seen = new Set<string>();
  return sorted.filter((r) => {
    if (onePerEvent && seen.has(r.eventId)) return false;
    seen.add(r.eventId);
    return true;
  });
}
