import { unstable_cache } from "next/cache";
import { addEvidence, addSource, completeCoverage } from "./analysis-packet";
import type { AnalysisPacket } from "./analysis-contract";
import type { Game } from "./types";

// Provider JSON is normalized at this boundary; no provider URLs come from a visitor.
type Wire = Record<string, any>;
type Context = {
  observedAt: string;
  roster: Record<string, unknown>[];
  rosterTotal: number;
  coaches: { id: string; name: string }[];
  stats: Record<string, unknown>[];
  statsScope: string | null;
  recent: Record<string, unknown>[];
  next: Record<string, unknown> | null;
  news: { title: string; summary: string; url: string; publishedAt: string }[];
  warnings: string[];
};
const base = "https://site.api.espn.com/apis/site/v2/sports";
import { LEAGUES } from "./types";
const clean = (value: unknown, limit = 600) =>
  typeof value === "string"
    ? value
        .replace(/<[^>]*>/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, limit)
    : "";
async function fetchJson(url: string): Promise<Wire> {
  const response = await fetch(url, {
    cache: "no-store",
    signal: AbortSignal.timeout(9000),
    headers: { Accept: "application/json" },
  });
  if (!response.ok) throw new Error(`Sports feed ${response.status}`);
  return response.json();
}
export function seasonYear(game: Game) {
  const m = /\b(20\d{2})(?:-(\d{2}))?\b/.exec(game.season);
  return m
    ? m[2]
      ? Number(`${m[1].slice(0, 2)}${m[2]}`)
      : Number(m[1])
    : new Date(game.start).getUTCFullYear();
}
export function flattenRoster(data: Wire): Wire[] {
  return (data.athletes ?? []).flatMap((entry: Wire) =>
    Array.isArray(entry.items) ? entry.items : [entry],
  );
}
export function normalizeTeamContext(
  raw: { roster?: Wire; stats?: Wire; schedule?: Wire; news?: Wire },
  game: Game,
  side: "home" | "away",
  observedAt = new Date().toISOString(),
): Context {
  const team = game[side],
    year = seasonYear(game),
    warnings: string[] = [];
  const rosterScope = raw.roster?.season?.year;
  const rosterValid = Number(rosterScope) === year;
  const all = rosterValid && raw.roster ? flattenRoster(raw.roster) : [];
  const cap =
    game.league === "NFL"
      ? 72
      : game.league === "MLB"
        ? 40
        : game.league === "NHL"
          ? 32
          : 22;
  const roster = all
    .sort(
      (a, b) =>
        Number(b.position?.abbreviation === "QB") -
        Number(a.position?.abbreviation === "QB"),
    )
    .slice(0, cap)
    .map((p: Wire) => ({
      id: String(p.id),
      name: clean(p.displayName ?? p.fullName, 100),
      position: clean(p.position?.abbreviation, 20),
      age: p.age ?? null,
      experienceYears: p.experience?.years ?? null,
      rosterStatus: clean(p.status?.name ?? p.status?.type, 80) || "Unknown",
      injuries: (p.injuries ?? [])
        .slice(0, 3)
        .map((i: Wire) => ({
          status: clean(i.status ?? i.type?.description, 100),
          date: i.date ?? null,
        })),
    }));
  if (!roster.length)
    warnings.push(
      `${team.name}: a roster for the target season could not be verified.`,
    );
  const coaches = rosterValid
    ? (raw.roster?.coach ?? raw.roster?.coaches ?? [])
        .slice(0, 3)
        .map((c: Wire) => ({
          id: String(c.id),
          name: clean(
            c.displayName ?? `${c.firstName ?? ""} ${c.lastName ?? ""}`,
            100,
          ),
        }))
    : [];
  if (!coaches.length)
    warnings.push(
      `${team.name}: coaching identity needs independent confirmation.`,
    );
  const scope = raw.stats?.season;
  const statsValid =
    Number(scope?.year) === year &&
    Number(scope?.type?.type ?? scope?.type) === game.seasonType;
  const stats = statsValid
    ? (raw.stats?.results?.stats?.categories ?? [])
        .flatMap((c: Wire) =>
          (c.stats ?? []).map((s: Wire) => ({
            category: clean(c.displayName ?? c.name, 80),
            name: clean(s.name, 80),
            label: clean(s.displayName ?? s.abbreviation, 120),
            value:
              typeof s.value === "number" && Number.isFinite(s.value)
                ? s.value
                : null,
            display: clean(s.displayValue, 80),
          })),
        )
        .slice(0, 48)
    : [];
  if (!stats.length)
    warnings.push(
      `${team.name}: team statistics matching the target season and competition phase were unavailable; prior-season numbers were excluded.`,
    );
  const cutoff = Math.min(Date.parse(observedAt), Date.parse(game.start));
  const events: Wire[] = (raw.schedule?.events ?? []).filter(
    (e: Wire) => e.id !== game.id,
  );
  const previous = events
    .filter(
      (e) =>
        Date.parse(e.date) < cutoff &&
        e.competitions?.[0]?.status?.type?.completed,
    )
    .sort((a, b) => Date.parse(b.date) - Date.parse(a.date));
  const recent = previous.slice(0, 5).map((e: Wire) => {
    const c = e.competitions?.[0],
      own = c?.competitors?.find(
        (t: Wire) => String(t.id ?? t.team?.id) === team.id,
      ),
      other = c?.competitors?.find(
        (t: Wire) => String(t.id ?? t.team?.id) !== team.id,
      );
    return {
      eventId: e.id,
      startsAt: e.date,
      opponent: other?.team?.displayName ?? "Unknown",
      ownScore:
        own?.score?.displayValue ?? own?.score?.value ?? own?.score ?? null,
      opponentScore:
        other?.score?.displayValue ??
        other?.score?.value ??
        other?.score ??
        null,
      homeAway: own?.homeAway ?? null,
      result:
        own?.winner === true
          ? "W"
          : other?.winner === true
            ? "L"
            : "Unconfirmed",
      seasonType: e.seasonType?.name ?? e.season?.slug ?? "Unconfirmed",
      venue: c?.venue?.fullName ?? null,
    };
  });
  const nextEvent = events
    .filter((e) => Date.parse(e.date) > Date.parse(game.start))
    .sort((a, b) => Date.parse(a.date) - Date.parse(b.date))[0];
  const news = (raw.news?.articles ?? [])
    .filter(
      (a: Wire) =>
        articleRelevant(
          a,
          team.id,
          team.name,
          all.map((p) => String(p.id)),
        ) &&
        Number.isFinite(Date.parse(a.published)) &&
        Date.parse(a.published) <= Date.parse(observedAt) &&
        Date.parse(observedAt) - Date.parse(a.published) < 7 * 86400000,
    )
    .slice(0, 6)
    .map((a: Wire) => ({
      title: clean(a.headline, 180),
      summary: clean(a.description, 700),
      url: a.links?.web?.href ?? "",
      publishedAt: a.published,
    }));
  return {
    observedAt,
    roster,
    rosterTotal: all.length,
    coaches,
    stats,
    statsScope: statsValid ? `${year} / season type ${game.seasonType}` : null,
    recent,
    next: nextEvent
      ? { startsAt: nextEvent.date, name: clean(nextEvent.name, 200) }
      : null,
    news,
    warnings,
  };
}
export function articleRelevant(
  article: Wire,
  teamId: string,
  teamName: string,
  athleteIds: string[],
) {
  return (
    (article.categories ?? []).some(
      (c: Wire) =>
        String(c.teamId ?? c.team?.id ?? "") === teamId ||
        athleteIds.includes(String(c.athleteId ?? "")),
    ) ||
    `${article.headline ?? ""} ${article.description ?? ""}`
      .toLowerCase()
      .includes(teamName.toLowerCase())
  );
}
export async function getTeamContext(
  game: Game,
  side: "home" | "away",
): Promise<Context> {
  const l = LEAGUES[game.league],
    id = game[side].id,
    year = seasonYear(game);
  if (!/^\d{1,10}$/.test(id))
    throw new Error("Invalid provider team identifier.");
  return unstable_cache(
    async () => {
      const root = `${base}/${l.sport}/${l.slug}`;
      const urls = [
        `${root}/teams/${id}/roster?season=${year}`,
        `${root}/teams/${id}/statistics?season=${year}&seasontype=${game.seasonType}`,
        `${root}/teams/${id}/schedule?season=${year}&seasontype=${game.seasonType}`,
        `${root}/news?team=${id}&limit=20`,
      ];
      const results = await Promise.allSettled(urls.map(fetchJson));
      const raw = Object.fromEntries(
        ["roster", "stats", "schedule", "news"].map((key, i) => [
          key,
          results[i].status === "fulfilled" ? results[i].value : undefined,
        ]),
      );
      return normalizeTeamContext(raw, game, side);
    },
    [
      "oracular-team-context-v1",
      game.league,
      id,
      String(year),
      String(game.seasonType),
      game.id,
    ],
    { revalidate: 120 },
  )();
}
export async function appendTeamContexts(packet: AnalysisPacket) {
  const sides = ["home", "away"] as const;
  const results = await Promise.allSettled(
    sides.map((side) => getTeamContext(packet.game, side)),
  );
  results.forEach((result, i) => {
    const side = sides[i],
      team = packet.game[side],
      league = LEAGUES[packet.game.league].slug;
    if (result.status !== "fulfilled") {
      packet.gaps.push(`${team.name}: extended team research is unavailable.`);
      return;
    }
    const c = result.value;
    packet.gaps.push(...c.warnings);
    const src = (section: string) =>
      addSource(packet, {
        name: `ESPN ${team.name} ${section}`,
        url: `https://www.espn.com/${league}/team/${section === "statistics" ? "stats/" : section === "schedule" ? "schedule/" : section === "roster" ? "roster/" : ""}_/id/${team.id}`,
        fetchedAt: c.observedAt,
        kind: "sports-feed",
      });
    const add = (
      category: "players" | "coaching" | "statistics" | "schedule",
      title: string,
      data: Record<string, unknown>,
      section: string,
    ) =>
      addEvidence(packet, {
        category,
        side,
        title: `${team.name}: ${title}`,
        data,
        sourceId: src(section),
        observedAt: c.observedAt,
        publishedAt: null,
        scope: category === "statistics" ? c.statsScope! : packet.game.season,
      });
    if (c.roster.length)
      add(
        "players",
        "roster overview",
        {
          roster: c.roster,
          included: c.roster.length,
          listed: c.rosterTotal,
          note: "Roster membership/active status does not confirm starting lineup, game availability or expected minutes.",
        },
        "roster",
      );
    if (c.coaches.length)
      add(
        "coaching",
        "listed coaching staff",
        {
          coaches: c.coaches,
          background:
            "Tenure, prior roles, scheme and recent changes must be corroborated by cited web research; do not fill them from model memory.",
        },
        "roster",
      );
    if (c.stats.length)
      add(
        "statistics",
        "season statistics",
        { statistics: c.stats, sampleScope: c.statsScope },
        "statistics",
      );
    if (c.recent.length) {
      const lastStart = String(c.recent[0].startsAt),
        startGap =
          (Date.parse(packet.game.start) - Date.parse(lastStart)) / 3600000;
      add(
        "schedule",
        "recent form and schedule spacing",
        {
          recent: c.recent,
          hoursBetweenGameStarts: Math.round(startGap * 10) / 10,
          nextGame: c.next,
          note: "Gap is between game start times, not actual rest after the previous game's finish. Competition phases may differ. Travel distance is not supplied.",
        },
        "schedule",
      );
    }
    for (const news of c.news) {
      const sourceId = addSource(packet, {
        name: news.title,
        url: news.url,
        fetchedAt: c.observedAt,
        kind: "sports-feed",
      });
      addEvidence(packet, {
        category: "news",
        side,
        title: news.title,
        data: { summary: news.summary },
        sourceId,
        observedAt: c.observedAt,
        publishedAt: news.publishedAt,
        scope:
          "Relevant team/player article published within seven days; headline/description only, not full text",
      });
    }
  });
  return completeCoverage(packet);
}
