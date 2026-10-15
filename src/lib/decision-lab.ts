import { clamp, forecast } from "./model";
import { Game, League, LEAGUES, Team } from "./types";

export type Scenario = {
  homeImpact: number;
  awayImpact: number;
  neutral: boolean;
  uncertainty: number;
  price: number;
};
export function defaultScenario(game: Game): Scenario {
  return {
    homeImpact: 0,
    awayImpact: 0,
    neutral: game.neutral,
    uncertainty: 5,
    price: 2,
  };
}
/** A sensitivity experiment, not an injury model. User margin changes map to log odds. */
export function scenarioForecast(game: Game, input: Scenario) {
  const baseline = forecast(game).home;
  if (baseline === null) return null;
  const rules = LEAGUES[game.league];
  const margin =
    clamp(input.homeImpact, -rules.scale, rules.scale) -
    clamp(input.awayImpact, -rules.scale, rules.scale);
  const venue =
    ((input.neutral ? 0 : rules.home) - (game.neutral ? 0 : rules.home)) /
    rules.scale;
  const probability = clamp(
    1 /
      (1 +
        Math.exp(
          -(Math.log(baseline / (1 - baseline)) + margin / rules.scale + venue),
        )),
    0.01,
    0.99,
  );
  const width = clamp(input.uncertainty, 0, 25) / 100;
  const low = clamp(probability - width, 0.01, 0.99),
    high = clamp(probability + width, 0.01, 0.99);
  const price =
    Number.isFinite(input.price) && input.price > 1 ? input.price : null;
  return {
    baseline,
    probability,
    low,
    high,
    delta: probability - baseline,
    breakEven: price ? 1 / price : null,
    ev: price ? probability * price - 1 : null,
    lowEv: price ? low * price - 1 : null,
    highEv: price ? high * price - 1 : null,
  };
}
export function sandboxGame(home: Team, away: Team, league: League): Game {
  return {
    id: "sandbox",
    league,
    home,
    away,
    start: "2099-01-01T00:00:00Z",
    state: "pre",
    status: "Hypothetical",
    statusName: "STATUS_SCHEDULED",
    period: 0,
    clock: "",
    venue: "Neutral sandbox",
    neutral: true,
    season: "Sandbox",
    seasonType: 2,
    context: "Hypothetical bracket",
    quotes: [],
    demo: true,
    source: { name: "Selected team records", url: "", fetchedAt: "" },
  };
}
export type BracketMatch = {
  home: Team;
  away: Team;
  probability: number;
  winner: Team;
};
/** Exact dynamic programming over a fixed single-elimination bracket; no Monte Carlo noise. */
export function bracketOdds(teams: Team[], league: League) {
  if (
    ![2, 4, 8].includes(teams.length) ||
    new Set(teams.map((t) => t.id)).size !== teams.length
  )
    return null;
  const odds = (h: Team, a: Team) => forecast(sandboxGame(h, a, league)).home;
  if (teams.some((t) => t.wins === null || t.losses === null)) return null;
  let groups = teams.map((t) => new Map([[t.id, 1]]));
  const stages: Map<string, number>[] = [];
  const byId = new Map(teams.map((t) => [t.id, t]));
  while (groups.length > 1) {
    const next: Map<string, number>[] = [];
    for (let i = 0; i < groups.length; i += 2) {
      const left = groups[i],
        right = groups[i + 1],
        merged = new Map<string, number>();
      for (const [h, hp] of left)
        for (const [a, ap] of right) {
          const p = odds(byId.get(h)!, byId.get(a)!)!;
          merged.set(h, (merged.get(h) ?? 0) + hp * ap * p);
          merged.set(a, (merged.get(a) ?? 0) + hp * ap * (1 - p));
        }
      next.push(merged);
    }
    stages.push(new Map(next.flatMap((m) => [...m])));
    groups = next;
  }
  return teams.map((team) => ({
    team,
    rounds: stages.map((s) => s.get(team.id) ?? 0),
    champion: groups[0].get(team.id) ?? 0,
  }));
}
export function playBracket(
  teams: Team[],
  league: League,
  seed: number,
): BracketMatch[][] {
  if (!bracketOdds(teams, league)) return [];
  let state = seed >>> 0;
  const random = () => {
    state += 0x6d2b79f5;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  let field = teams;
  const rounds: BracketMatch[][] = [];
  while (field.length > 1) {
    const round: BracketMatch[] = [];
    for (let i = 0; i < field.length; i += 2) {
      const home = field[i],
        away = field[i + 1],
        probability = forecast(sandboxGame(home, away, league)).home!;
      round.push({
        home,
        away,
        probability,
        winner: random() < probability ? home : away,
      });
    }
    rounds.push(round);
    field = round.map((m) => m.winner);
  }
  return rounds;
}
export type Prediction = {
  version: 1;
  id: string;
  game: Game;
  createdAt: string;
  probability: number;
  baseline: number;
  scenario: Scenario;
  thesis: string;
  resolution?: {
    outcome: 0 | 1 | null;
    homeScore: number;
    awayScore: number;
    resolvedAt: string;
    source: "feed" | "sample";
  };
};
export function canRecord(game: Game, now = Date.now()) {
  return (
    game.state === "pre" &&
    !/POSTPONED|CANCELED|CANCELLED|DELAYED|SUSPENDED/i.test(game.statusName) &&
    (game.demo || Date.parse(game.start) > now)
  );
}
export function resolvePrediction(
  prediction: Prediction,
  result: Game,
  now = Date.now(),
): Prediction {
  if (
    prediction.resolution ||
    prediction.game.demo ||
    result.demo ||
    result.id !== prediction.game.id ||
    result.league !== prediction.game.league ||
    result.start !== prediction.game.start ||
    result.home.id !== prediction.game.home.id ||
    result.away.id !== prediction.game.away.id ||
    Date.parse(result.start) > now ||
    result.state !== "post" ||
    !/FINAL/i.test(result.statusName) ||
    Date.parse(prediction.createdAt) >= Date.parse(prediction.game.start) ||
    !Number.isFinite(result.home.score) ||
    !Number.isFinite(result.away.score) ||
    result.home.score < 0 ||
    result.away.score < 0
  )
    return prediction;
  return {
    ...prediction,
    resolution: {
      outcome:
        result.home.score === result.away.score
          ? null
          : result.home.score > result.away.score
            ? 1
            : 0,
      homeScore: result.home.score,
      awayScore: result.away.score,
      resolvedAt: new Date(now).toISOString(),
      source: "feed",
    },
  };
}
export function journalStats(entries: Prediction[]) {
  const settled = entries.filter(
    (e) => e.resolution?.outcome === 0 || e.resolution?.outcome === 1,
  );
  const brier = settled.length
    ? settled.reduce(
        (s, e) => s + (e.probability - e.resolution!.outcome!) ** 2,
        0,
      ) / settled.length
    : null;
  const baselineBrier = settled.length
    ? settled.reduce(
        (s, e) => s + (e.baseline - e.resolution!.outcome!) ** 2,
        0,
      ) / settled.length
    : null;
  const bins = Array.from({ length: 5 }, (_, i) => {
    const rows = settled.filter(
      (e) => Math.min(4, Math.floor(e.probability * 5)) === i,
    );
    return {
      start: i * 20,
      count: rows.length,
      predicted: rows.length
        ? rows.reduce((s, e) => s + e.probability, 0) / rows.length
        : null,
      observed: rows.length
        ? rows.reduce((s, e) => s + e.resolution!.outcome!, 0) / rows.length
        : null,
    };
  });
  return { settled: settled.length, brier, baselineBrier, bins };
}
export function parseJournal(value: unknown): Prediction[] {
  if (!Array.isArray(value)) return [];
  const ids = new Set<string>();
  return value.slice(0, 300).filter((e): e is Prediction => {
    if (
      !e ||
      e.version !== 1 ||
      typeof e.id !== "string" ||
      ids.has(e.id) ||
      !e.game ||
      typeof e.game.id !== "string" ||
      !Object.hasOwn(LEAGUES, e.game.league) ||
      typeof e.game.home?.abbr !== "string" ||
      typeof e.game.away?.abbr !== "string" ||
      !Number.isFinite(Date.parse(e.game.start)) ||
      !Number.isFinite(Date.parse(e.createdAt)) ||
      typeof e.game.demo !== "boolean" ||
      !Number.isFinite(e.probability) ||
      e.probability < 0.01 ||
      e.probability > 0.99 ||
      !Number.isFinite(e.baseline) ||
      e.baseline < 0 ||
      e.baseline > 1 ||
      typeof e.thesis !== "string" ||
      !e.scenario ||
      !Number.isFinite(e.scenario.homeImpact) ||
      !Number.isFinite(e.scenario.awayImpact) ||
      !Number.isFinite(e.scenario.uncertainty) ||
      !Number.isFinite(e.scenario.price) ||
      typeof e.scenario.neutral !== "boolean" ||
      typeof e.game.home.name !== "string" ||
      typeof e.game.away.name !== "string"
    )
      return false;
    if (
      e.resolution &&
      (![0, 1, null].includes(e.resolution.outcome) ||
        !["feed", "sample"].includes(e.resolution.source) ||
        !Number.isFinite(e.resolution.homeScore) ||
        !Number.isFinite(e.resolution.awayScore))
    )
      return false;
    ids.add(e.id);
    return true;
  });
}
export const xmlEscape = (s: string) =>
  s.replace(
    /[<>&"']/g,
    (c) =>
      ({
        "<": "&lt;",
        ">": "&gt;",
        "&": "&amp;",
        '"': "&quot;",
        "'": "&apos;",
      })[c]!,
  );
