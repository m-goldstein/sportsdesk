import { unstable_cache } from "next/cache";
import {
  attachBooks,
  mapLimit,
  normalizeContract,
  publicJson,
  Wire,
} from "./contract-data";
import { normalizePredictionMarket, sameTeam, getBoard } from "./providers";
import { forecast } from "./model";
import { demoBoard } from "./demo";
import { Game } from "./types";
import { RankedOutcome, RankingFeed } from "./rankings";
import { getWeatherBoard, sampleWeatherBoard } from "./weather-data";
import { getElectionBoard, sampleElectionBoard } from "./election-data";
import { addDays } from "./weather-types";
import { ContractEvent, freshBook } from "./market-contracts";
async function sportsOutcomes(
  games: Game[],
  sample = false,
): Promise<RankedOutcome[]> {
  if (sample)
    return games
      .filter((g) => g.state === "pre")
      .flatMap((g) => {
        const f = forecast(g),
          q = g.quotes.find((q) => q.kind === "prediction") ?? g.quotes[0];
        return (["home", "away"] as const).map((side) => ({
          id: `sports:${g.id}:${side}`,
          eventId: `sports:${g.id}`,
          domain: "Sports" as const,
          category: g.league,
          title: `${g.away.name} at ${g.home.name}`,
          outcome: g[side].name,
          date: g.start.slice(0, 10),
          market: q ? 1 / (side === "home" ? q.homePrice : q.awayPrice) : null,
          model: f[side],
          modelLabel: "Uncalibrated season-record baseline",
          evidence: `${f.quality} season coverage · sample`,
          ask: q
            ? Math.min(
                0.999,
                1 / (side === "home" ? q.homePrice : q.awayPrice) + 0.02,
              )
            : null,
          url: "",
          snapshotAt: new Date().toISOString(),
        }));
      });
  const events = await unstable_cache(
    async () => {
      const data = await publicJson(
        "https://gamma-api.polymarket.com/events?tag_id=100639&active=true&closed=false&limit=100&order=id&ascending=false",
      );
      if (!Array.isArray(data)) throw new Error("Invalid sports market feed");
      return data.map((e: Wire) => ({
        id: e.id,
        slug: e.slug,
        title: e.title,
        startTime: e.startTime,
        active: e.active,
        closed: e.closed,
        markets: (e.markets ?? [])
          .filter((m: Wire) => m.sportsMarketType === "moneyline")
          .map((m: Wire) => ({
            id: m.id,
            slug: m.slug,
            question: m.question,
            description: m.description,
            resolutionSource: m.resolutionSource,
            conditionId: m.conditionId,
            sportsMarketType: m.sportsMarketType,
            gameStartTime: m.gameStartTime,
            active: m.active,
            closed: m.closed,
            archived: m.archived,
            acceptingOrders: m.acceptingOrders,
            enableOrderBook: m.enableOrderBook,
            version: m.version,
            clobTokenIds: m.clobTokenIds,
            positionIds: m.positionIds,
            outcomes: m.outcomes,
            outcomePrices: m.outcomePrices,
            updatedAt: m.updatedAt,
            feesEnabled: m.feesEnabled,
            feeSchedule: m.feeSchedule,
          })),
      }));
    },
    ["oracular-ranking-sports-markets-v1"],
    { revalidate: 60 },
  )();
  const upcoming = games.filter(
    (g) =>
      g.state === "pre" &&
      Date.parse(g.start) > Date.now() &&
      g.seasonType !== 1,
  );
  // Bounded, exact-team search supplements the latest-event window. Results still
  // pass the same contract matching and a tighter start-time check below.
  const supplements = await mapLimit(upcoming.slice(0, 8), 3, async (g) => {
    if (
      events.some((e) =>
        e.markets.some((m: Wire) => normalizePredictionMarket(e, m, g)),
      )
    )
      return [];
    try {
      return await unstable_cache(
        async () => {
          const found = await publicJson(
            `https://gamma-api.polymarket.com/public-search?q=${encodeURIComponent(g.away.name + " " + g.home.name)}&limit_per_type=5&events_status=active`,
          );
          return (found.events ?? []).map((e: Wire) => ({
            ...e,
            markets: (e.markets ?? []).filter(
              (m: Wire) => m.sportsMarketType === "moneyline",
            ),
          }));
        },
        ["oracular-ranking-sports-search-v1", g.league, g.id, g.start],
        { revalidate: 60 },
      )();
    } catch {
      return [];
    }
  });
  const scanEvents: Wire[] = [
    ...new Map(
      [...events, ...supplements.flat()].map((e) => [e.id, e]),
    ).values(),
  ];
  const matches: { g: Game; e: Wire; m: Wire; names: string[] }[] = [];
  for (const g of games
    .filter(
      (g) =>
        g.state === "pre" &&
        Date.parse(g.start) > Date.now() &&
        g.seasonType !== 1,
    )
    .slice(0, 60))
    for (const e of scanEvents)
      for (const m of e.markets) {
        if (
          e.closed !== true &&
          e.active !== false &&
          normalizePredictionMarket(e, m, g) &&
          Math.abs(
            Date.parse(m.gameStartTime ?? e.startTime) - Date.parse(g.start),
          ) <=
            30 * 60000
        ) {
          try {
            const names =
              typeof m.outcomes === "string"
                ? JSON.parse(m.outcomes)
                : m.outcomes;
            matches.push({ g, e, m, names });
          } catch {
            /* Malformed metadata is excluded. */
          }
        }
      }
  return (
    await mapLimit(matches.slice(0, 20), 4, async ({ g, e, m, names }) => {
      const contract = normalizeContract(
        { ...m, outcomes: ["Yes", "No"], groupItemTitle: names[0] },
        e,
      );
      if (!contract?.tradable) return [];
      const event: ContractEvent = {
        id: String(e.id),
        slug: e.slug,
        title: e.title,
        date: g.start.slice(0, 10),
        rules: m.description ?? "",
        resolutionSource: m.resolutionSource ?? "",
        active: true,
        negRisk: false,
        augmented: false,
        contracts: [contract],
        fetchedAt: new Date().toISOString(),
        url: `https://polymarket.com/event/${encodeURIComponent(e.slug)}`,
      };
      const attached = await attachBooks(event),
        c = attached.event.contracts[0],
        f = forecast(g);
      return names.map((name, index) => {
        const side = sameTeam(name, g.home) ? "home" : "away",
          book = index === 0 ? c.yesBook : c.noBook,
          market =
            typeof m.outcomePrices === "string"
              ? JSON.parse(m.outcomePrices)
              : m.outcomePrices;
        return {
          id: `sports:${g.id}:${m.id}:${index}`,
          eventId: `sports:${g.id}`,
          domain: "Sports" as const,
          category: g.league,
          title: `${g.away.name} at ${g.home.name}`,
          outcome: name,
          date: g.start,
          market: Number(market[index]),
          model: f[side],
          modelLabel: "Uncalibrated season-record baseline",
          evidence: `${f.quality} season coverage${g.league === "NFL" ? " · conditional on no tie" : ""}`,
          ask:
            c.tradable && freshBook(book)
              ? (book?.asks[0]?.price ?? null)
              : null,
          url: event.url,
          snapshotAt: book?.timestamp ?? event.fetchedAt,
        };
      });
    })
  ).flat();
}
export async function getRankingFeed(
  date: string,
  mode: "live" | "demo",
): Promise<RankingFeed> {
  if (mode === "demo") {
    const b = demoBoard(date);
    return {
      mode,
      fetchedAt: new Date().toISOString(),
      sports: await sportsOutcomes(b.games, true),
      weather: sampleWeatherBoard(addDays(date, 1)),
      elections: sampleElectionBoard(),
      warnings: [
        "All sample rankings are illustrative, including probabilities and prices.",
      ],
    };
  }
  const warnings: string[] = [];
  const [sports, weather, elections] = await Promise.allSettled([
    (async () => sportsOutcomes((await getBoard(date)).games))(),
    getWeatherBoard(addDays(date, 1)),
    getElectionBoard(),
  ]);
  if (sports.status === "rejected")
    warnings.push(
      "Sports market scan failed; missing sports contracts are excluded.",
    );
  if (sports.status === "fulfilled" && !sports.value.length)
    warnings.push(
      "No exact upcoming, non-preseason sports moneyline contracts matched this scan. Sports coverage is partial; other domains remain available.",
    );
  if (weather.status === "rejected")
    warnings.push(
      "Weather scan failed; missing weather contracts are excluded.",
    );
  if (elections.status === "rejected")
    warnings.push(
      "Election scan failed; missing election contracts are excluded.",
    );
  return {
    mode,
    fetchedAt: new Date().toISOString(),
    sports: sports.status === "fulfilled" ? sports.value : [],
    weather:
      weather.status === "fulfilled"
        ? weather.value
        : {
            mode,
            date: addDays(date, 1),
            rows: [],
            fetchedAt: new Date().toISOString(),
            warnings: [],
          },
    elections:
      elections.status === "fulfilled"
        ? elections.value
        : {
            mode,
            rows: [],
            fetchedAt: new Date().toISOString(),
            configured: !!process.env.OPENAI_API_KEY,
          },
    warnings,
  };
}
