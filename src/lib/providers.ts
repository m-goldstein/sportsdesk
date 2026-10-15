import { americanToDecimal } from "./model";
import { unstable_cache } from "next/cache";
import {
  Board,
  Game,
  Injury,
  LEAGUES,
  League,
  Player,
  Quote,
  Research,
  Source,
  Team,
} from "./types";

// Wire formats belong at the adapter boundary. Every field used by the app is normalized below.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Wire = Record<string, any>;
const SITE = "https://site.api.espn.com/apis/site/v2/sports";
const STANDINGS = "https://site.api.espn.com/apis/v2/sports";
const num = (v: unknown): number | null =>
  v !== null && v !== undefined && v !== "" && Number.isFinite(Number(v))
    ? Number(v)
    : null;
export function today() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
  }).format(new Date());
}
export function validDate(value: string) {
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    !Number.isNaN(Date.parse(value)) &&
    new Date(value).toISOString().slice(0, 10) === value
  );
}
async function read(url: string, ttl = 60): Promise<Wire> {
  // Cache useful fields instead of multi-megabyte provider payloads.
  return unstable_cache(
    async () => {
      const response = await fetch(url, {
        cache: "no-store",
        signal: AbortSignal.timeout(12000),
        headers: { Accept: "application/json" },
      });
      if (!response.ok)
        throw new Error(`Provider responded ${response.status}`);
      const data = compactProviderData(url, await response.json());
      if (!Array.isArray(data))
        data._sportsdeskFetchedAt = new Date().toISOString();
      return data;
    },
    ["sportsdesk-providers-v1", url],
    { revalidate: ttl },
  )();
}
function source(
  name: string,
  url: string,
  note?: string,
  fetchedAt = new Date().toISOString(),
): Source {
  return { name, url, fetchedAt, note };
}
export function compactProviderData(url: string, data: Wire): Wire {
  const slimTeam = (t: Wire) => ({
    id: t.id,
    displayName: t.displayName,
    shortDisplayName: t.shortDisplayName,
    name: t.name,
    abbreviation: t.abbreviation,
    color: t.color,
  });
  if (url.includes("/standings")) {
    const trim = (g: Wire): Wire => ({
      name: g.name,
      standings: g.standings
        ? {
            season: g.standings.season,
            seasonType: g.standings.seasonType,
            entries: (g.standings.entries ?? []).map((e: Wire) => ({
              team: slimTeam(e.team),
              stats: (e.stats ?? []).map((s: Wire) => ({
                name: s.name,
                value: s.value,
                displayValue: s.displayValue,
                summary: s.summary,
              })),
            })),
          }
        : undefined,
      children: (g.children ?? []).map(trim),
    });
    return trim(data);
  }
  if (url.includes("gamma-api.polymarket.com"))
    return (data as unknown as Wire[]).map((e) => ({
      slug: e.slug,
      startTime: e.startTime,
      markets: (e.markets ?? [])
        .filter((m: Wire) => m.sportsMarketType === "moneyline")
        .map((m: Wire) => ({
          id: m.id,
          active: m.active,
          closed: m.closed,
          sportsMarketType: m.sportsMarketType,
          gameStartTime: m.gameStartTime,
          outcomes: m.outcomes,
          outcomePrices: m.outcomePrices,
          updatedAt: m.updatedAt,
          volumeNum: m.volumeNum,
        })),
    })) as unknown as Wire;
  if (url.includes("/scoreboard"))
    return {
      season: data.season,
      leagues: (data.leagues ?? []).map((l: Wire) => ({ season: l.season })),
      events: (data.events ?? []).map((e: Wire) => ({
        id: e.id,
        date: e.date,
        season: e.season,
        status: e.status,
        competitions: (e.competitions ?? []).map((c: Wire) => ({
          status: c.status,
          neutralSite: c.neutralSite,
          venue: { fullName: c.venue?.fullName },
          notes: c.notes,
          competitors: (c.competitors ?? []).map((t: Wire) => ({
            team: slimTeam(t.team ?? {}),
            homeAway: t.homeAway,
            records: t.records,
            score: t.score,
          })),
          odds: (c.odds ?? []).map((o: Wire) => ({
            provider: { name: o.provider?.name },
            homeTeamOdds: { moneyLine: o.homeTeamOdds?.moneyLine },
            awayTeamOdds: { moneyLine: o.awayTeamOdds?.moneyLine },
            moneyline: {
              home: { close: { odds: o.moneyline?.home?.close?.odds } },
              away: { close: { odds: o.moneyline?.away?.close?.odds } },
            },
          })),
        })),
      })),
    };
  return data;
}
function stat(stats: Wire[], name: string) {
  return stats.find((s) => s.name === name);
}
function normalizeTeam(raw: Wire, stats: Wire[] = [], record?: string): Team {
  const summary =
    record ??
    stat(stats, "overall")?.summary ??
    stat(stats, "overall")?.displayValue ??
    "—";
  const parsed = /^(\d+)-(\d+)(?:-(\d+))?$/.exec(summary);
  const wins =
    num(stat(stats, "wins")?.value) ?? (parsed ? Number(parsed[1]) : null);
  const losses =
    num(stat(stats, "losses")?.value) ?? (parsed ? Number(parsed[2]) : null);
  const games = (wins ?? 0) + (losses ?? 0) + Number(parsed?.[3] ?? 0);
  const totalFor = num(stat(stats, "pointsFor")?.value),
    totalAgainst = num(stat(stats, "pointsAgainst")?.value);
  return {
    id: String(raw.id),
    name: raw.displayName ?? raw.name ?? "Unknown team",
    shortName: raw.shortDisplayName ?? raw.name ?? raw.displayName,
    abbr: raw.abbreviation ?? "?",
    color: /^[0-9a-f]{6}$/i.test(raw.color ?? "") ? `#${raw.color}` : "#59667e",
    record: summary,
    wins,
    losses,
    ties: Number(parsed?.[3] ?? 0),
    score: 0,
    averageFor:
      num(stat(stats, "avgPointsFor")?.value) ??
      (totalFor !== null && games > 0 ? totalFor / games : null),
    averageAgainst:
      num(stat(stats, "avgPointsAgainst")?.value) ??
      (totalAgainst !== null && games > 0 ? totalAgainst / games : null),
    rank: num(stat(stats, "playoffSeed")?.value) ?? undefined,
    streak: stat(stats, "streak")?.displayValue,
  };
}
function collectTeams(data: Wire, group = ""): Team[] {
  const entries: Team[] = (data.standings?.entries ?? []).map((e: Wire) => ({
    ...normalizeTeam(e.team, e.stats),
    group,
  }));
  return [
    ...entries,
    ...(data.children ?? []).flatMap((child: Wire) =>
      collectTeams(child, child.name ?? group),
    ),
  ];
}
export function normalizeEvent(
  event: Wire,
  league: League,
  teams: Team[],
  season: string,
  fetchedAt?: string,
): Game | null {
  const c = event.competitions?.[0];
  const home = c?.competitors?.find((t: Wire) => t.homeAway === "home"),
    away = c?.competitors?.find((t: Wire) => t.homeAway === "away");
  if (!home?.team || !away?.team || !event.id || !event.date) return null;
  const make = (t: Wire) => {
    const standing = teams.find((s) => s.id === String(t.team.id));
    const record = t.records?.find((r: Wire) => r.type === "total")?.summary;
    return {
      ...normalizeTeam(t.team, [], record),
      ...standing,
      score: num(t.score?.value ?? t.score) ?? 0,
    };
  };
  const status = c.status ?? event.status ?? {};
  const type = status.type ?? {};
  return {
    id: String(event.id),
    league,
    start: event.date,
    state:
      type.state === "in"
        ? "in"
        : type.completed || type.state === "post"
          ? "post"
          : "pre",
    status: type.shortDetail ?? type.description ?? "Scheduled",
    statusName: type.name ?? "STATUS_SCHEDULED",
    period: Number(status.period ?? 0),
    clock: status.displayClock ?? "",
    home: make(home),
    away: make(away),
    venue: c.venue?.fullName ?? "Venue unconfirmed",
    neutral: Boolean(c.neutralSite),
    season,
    seasonType: Number(event.season?.type ?? 2),
    context:
      c.notes
        ?.map((n: Wire) => n.headline)
        .filter(Boolean)
        .join(" · ") ||
      event.season?.slug ||
      season,
    // ESPN quotes do not expose a reliable quote timestamp. They remain reference-only.
    quotes: normalizeEspnQuotes(c.odds ?? []),
    source: source(
      "ESPN scoreboard",
      `https://www.espn.com/${LEAGUES[league].slug === "mens-college-basketball" ? "mens-college-basketball" : LEAGUES[league].slug}/game/_/gameId/${event.id}`,
      "Public feed; may be delayed. Retrieved time is not the provider's update time.",
      fetchedAt,
    ),
    demo: false,
  };
}
export function normalizeEspnQuotes(rows: Wire[]): Quote[] {
  return rows.flatMap((o: Wire, i: number) => {
    const home = americanToDecimal(
      Number(o.moneyline?.home?.close?.odds ?? o.homeTeamOdds?.moneyLine),
    );
    const away = americanToDecimal(
      Number(o.moneyline?.away?.close?.odds ?? o.awayTeamOdds?.moneyLine),
    );
    if (home === null || away === null) return [];
    return [
      {
        id: `espn-${i}`,
        provider: `${o.provider?.name ?? "Bookmaker"} via ESPN`,
        kind: "sportsbook" as const,
        homePrice: home,
        awayPrice: away,
        updatedAt: null,
        url: "https://www.espn.com/espn/betting/",
        note: "Reference quote; update time unavailable. Excluded from fresh market signals.",
      },
    ];
  });
}
export async function getBoard(date: string, league?: League): Promise<Board> {
  const selected = league ? [league] : (Object.keys(LEAGUES) as League[]);
  const warnings: string[] = [];
  const parts = await Promise.all(
    selected.map(async (key) => {
      const l = LEAGUES[key];
      try {
        const [scoreboard, standings] = await Promise.allSettled([
          read(
            `${SITE}/${l.sport}/${l.slug}/scoreboard?dates=${date.replaceAll("-", "")}&limit=200${key === "NCAAM" ? "&groups=50" : ""}`,
          ),
          read(`${STANDINGS}/${l.sport}/${l.slug}/standings`, 300),
        ]);
        if (scoreboard.status === "rejected") throw scoreboard.reason;
        const s = scoreboard.value,
          season = s.leagues?.[0]?.season?.displayName ?? "Current season";
        // Avoid applying current season statistics to historical seasons or preseason snapshots.
        const standingsSeason =
          standings.status === "fulfilled"
            ? Number(
                standings.value.children?.[0]?.standings?.season ??
                  standings.value.standings?.season,
              )
            : null;
        const standingsType =
          standings.status === "fulfilled"
            ? Number(
                standings.value.children?.[0]?.standings?.seasonType ??
                  standings.value.standings?.seasonType,
              )
            : null;
        const boardSeason = s.season ??
          s.events?.[0]?.season ?? {
            year: s.leagues?.[0]?.season?.year,
            type: s.leagues?.[0]?.season?.type?.type,
          };
        const compatible =
          standings.status === "fulfilled" &&
          standingsSeason === Number(boardSeason.year) &&
          standingsType === Number(boardSeason.type) &&
          date >= today();
        const teams =
          compatible && standings.status === "fulfilled"
            ? collectTeams(standings.value).map((t) => ({ ...t, league: key }))
            : [];
        if (standings.status === "rejected")
          warnings.push(
            `${key}: standings unavailable; using scoreboard records.`,
          );
        const games = (s.events ?? [])
          .map((e: Wire) =>
            normalizeEvent(e, key, teams, season, s._sportsdeskFetchedAt),
          )
          .filter(Boolean) as Game[];
        return { games, teams, meta: { league: key, season } };
      } catch {
        warnings.push(
          `${key}: score feed unavailable. Retry or explore the sample desk.`,
        );
        return {
          games: [],
          teams: [],
          meta: {
            league: key,
            season: "Unavailable",
            error: "Feed unavailable",
          },
        };
      }
    }),
  );
  const games = parts
    .flatMap((p) => p.games)
    .sort((a, b) => Date.parse(a.start) - Date.parse(b.start));
  return {
    games,
    teams: parts.flatMap((p) => p.teams),
    leagues: parts.map((p) => p.meta),
    fetchedAt: new Date().toISOString(),
    mode: "live",
    warnings,
  };
}
export async function getResearch(
  league: League,
  id: string,
): Promise<Research> {
  const l = LEAGUES[league],
    data = await read(`${SITE}/${l.sport}/${l.slug}/summary?event=${id}`);
  const warnings: string[] = [],
    players: Player[] = [],
    injuries: Injury[] = [];
  const homeId = String(
    data.header?.competitions?.[0]?.competitors?.find(
      (c: Wire) => c.homeAway === "home",
    )?.id,
  );
  for (const group of data.leaders ?? [])
    for (const category of group.leaders ?? [])
      for (const p of category.leaders ?? []) {
        players.push({
          id: String(p.athlete?.id),
          name: p.athlete?.displayName ?? "Unknown",
          team: group.team?.abbreviation ?? "",
          position: p.athlete?.position?.abbreviation ?? "",
          value: p.displayValue ?? String(p.value ?? "—"),
          metric: category.displayName ?? category.name,
          url:
            p.athlete?.links?.find((link: Wire) =>
              link.href?.startsWith("https://"),
            )?.href ?? "https://www.espn.com/",
        });
      }
  // In-game and completed box scores provide actual current-game player statistics.
  for (const group of data.boxscore?.players ?? [])
    for (const category of group.statistics ?? []) {
      const labels = category.labels ?? category.names ?? [];
      for (const p of (category.athletes ?? [])
        .filter((p: Wire) => !p.didNotPlay)
        .slice(0, 8)) {
        const target = labels.indexOf("PTS") >= 0 ? labels.indexOf("PTS") : 0;
        players.push({
          id: String(p.athlete?.id),
          name: p.athlete?.displayName ?? "Unknown",
          team: group.team?.abbreviation ?? "",
          position: p.athlete?.position?.abbreviation ?? "",
          value: p.stats?.[target] ?? "—",
          metric: `Game ${labels[target] ?? "stat"}`,
          url: p.athlete?.links?.[0]?.href ?? "https://www.espn.com/",
        });
      }
    }
  for (const group of data.injuries ?? [])
    for (const i of group.injuries ?? [])
      injuries.push({
        name: i.athlete?.displayName ?? "Unknown",
        team: group.team?.abbreviation ?? "",
        status: i.status ?? "Unconfirmed",
        detail:
          i.shortComment ??
          i.type?.description ??
          i.details?.type ??
          "Details not provided",
        date: i.date ?? "",
      });
  const recent = (data.lastFiveGames ?? []).flatMap((group: Wire) =>
    (group.events ?? []).map((e: Wire) => ({
      team: group.team?.abbreviation ?? "",
      opponent:
        e.opponent?.displayName ?? e.opponent?.abbreviation ?? "Opponent",
      date: e.gameDate ?? e.date ?? "",
      result: e.gameResult ?? "—",
      score: e.score ?? "—",
    })),
  );
  const statGroups: Wire[] = data.boxscore?.teams ?? [];
  const homeStats =
    statGroups.find((g) => String(g.team?.id) === homeId)?.statistics ?? [];
  const awayStats =
    statGroups.find((g) => String(g.team?.id) !== homeId)?.statistics ?? [];
  const stats = homeStats.map((s: Wire) => ({
    label: s.label ?? s.displayName ?? s.name,
    home: s.displayValue ?? "—",
    away: awayStats.find((a: Wire) => a.name === s.name)?.displayValue ?? "—",
  }));
  const probabilities = data.winprobability ?? [];
  const latest = probabilities.length
    ? probabilities[probabilities.length - 1]
    : null;
  const probability = num(latest?.homeWinPercentage);
  if (!players.length)
    warnings.push(
      "Player leader statistics are not available for this matchup yet.",
    );
  if (!data.injuries?.length)
    warnings.push(
      "Availability feed absent; absence of an injury report does not confirm a healthy lineup.",
    );
  const url = `https://www.espn.com/${l.slug}/game/_/gameId/${id}`;
  return {
    gameId: id,
    fetchedAt: data._sportsdeskFetchedAt ?? new Date().toISOString(),
    players,
    injuries,
    recent,
    stats,
    headlines: (data.news?.articles ?? []).map((a: Wire) => ({
      title: a.headline,
      url: a.links?.web?.href ?? url,
    })),
    sources: [
      source(
        "ESPN matchup summary",
        url,
        "Player leaders, recent results, availability, box score and provider probability when available.",
        data._sportsdeskFetchedAt,
      ),
    ],
    warnings,
    liveHomeProbability:
      probability !== null && probability >= 0 && probability <= 1
        ? probability
        : null,
  };
}
function canonical(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}
export function sameTeam(name: string, team: Team) {
  return canonical(name) === canonical(team.name);
}
export function matchOddsEvent(event: Wire, game: Game) {
  return (
    sameTeam(event.home_team ?? "", game.home) &&
    sameTeam(event.away_team ?? "", game.away) &&
    Math.abs(Date.parse(event.commence_time) - Date.parse(game.start)) <
      4 * 3600000
  );
}
export async function getMarkets(
  game: Game,
): Promise<{ quotes: Quote[]; warnings: string[] }> {
  const warnings: string[] = [],
    quotes = [...game.quotes];
  await Promise.all([
    (async () => {
      if (!process.env.ODDS_API_KEY) {
        warnings.push(
          "The Odds API is not configured. ESPN reference lines remain available when supplied.",
        );
        return;
      }
      try {
        const data = await read(
          `https://api.the-odds-api.com/v4/sports/${LEAGUES[game.league].odds}/odds?apiKey=${encodeURIComponent(process.env.ODDS_API_KEY)}&regions=us&markets=h2h&oddsFormat=decimal`,
          300,
        );
        const event = (data as unknown as Wire[]).find((e) =>
          matchOddsEvent(e, game),
        );
        for (const b of event?.bookmakers ?? []) {
          const market = b.markets?.find((m: Wire) => m.key === "h2h");
          if (market?.outcomes?.length !== 2) continue;
          const h = market.outcomes.find((o: Wire) =>
              sameTeam(o.name, game.home),
            ),
            a = market.outcomes.find((o: Wire) => sameTeam(o.name, game.away));
          if (Number(h?.price) > 1 && Number(a?.price) > 1)
            quotes.push({
              id: b.key,
              provider: b.title,
              kind: "sportsbook",
              homePrice: Number(h.price),
              awayPrice: Number(a.price),
              updatedAt: market.last_update ?? b.last_update ?? null,
              url: "https://the-odds-api.com/",
            });
        }
        if (!event)
          warnings.push(
            "No exact team-and-start-time match from The Odds API.",
          );
      } catch {
        warnings.push(
          "The Odds API is unavailable or the key has no quota/access.",
        );
      }
    })(),
    (async () => {
      try {
        const data = await read(
          "https://gamma-api.polymarket.com/events?tag_id=100639&active=true&closed=false&limit=100&order=id&ascending=false",
          120,
        );
        for (const event of data as unknown as Wire[])
          for (const market of event.markets ?? []) {
            const quote = normalizePredictionMarket(event, market, game);
            if (quote) quotes.push(quote);
          }
        if (!quotes.some((q) => q.kind === "prediction"))
          warnings.push(
            "No verified Polymarket moneyline match in the latest 100 sports events. Coverage is partial.",
          );
      } catch {
        warnings.push(
          "Polymarket's public feed could not be reached from this region. No price has been substituted.",
        );
      }
    })(),
  ]);
  return { quotes, warnings };
}
export function normalizePredictionMarket(
  event: Wire,
  market: Wire,
  game: Game,
): Quote | null {
  // Do not equate props, handicaps, yes/no markets or championship futures with a game winner.
  if (
    market.closed ||
    !market.active ||
    market.sportsMarketType !== "moneyline"
  )
    return null;
  const start = market.gameStartTime ?? event.startTime;
  if (
    !start ||
    Math.abs(Date.parse(start) - Date.parse(game.start)) > 4 * 3600000 ||
    !Number.isFinite(Date.parse(start))
  )
    return null;
  try {
    const outcomes: string[] =
      typeof market.outcomes === "string"
        ? JSON.parse(market.outcomes)
        : market.outcomes;
    const prices: number[] = (
      typeof market.outcomePrices === "string"
        ? JSON.parse(market.outcomePrices)
        : market.outcomePrices
    ).map(Number);
    if (
      outcomes?.length !== 2 ||
      prices?.length !== 2 ||
      prices.some((p) => !Number.isFinite(p) || p <= 0 || p >= 1)
    )
      return null;
    const h = outcomes.findIndex((o) => sameTeam(o, game.home)),
      a = outcomes.findIndex((o) => sameTeam(o, game.away));
    if (h < 0 || a < 0 || h === a) return null;
    return {
      id: `poly-${market.id}`,
      provider: "Polymarket",
      kind: "prediction",
      homePrice: 1 / prices[h],
      awayPrice: 1 / prices[a],
      updatedAt: market.updatedAt ?? null,
      url: `https://polymarket.com/event/${encodeURIComponent(event.slug)}`,
      volume: num(market.volumeNum ?? market.volume) ?? undefined,
      note: "Indicative outcome price, not an executable ask. Fees, slippage and settlement rules are excluded.",
    };
  } catch {
    return null;
  }
}
