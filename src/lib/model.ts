import { Forecast, Game, LEAGUES, Quote, Team } from "./types";
export const clamp = (v: number, min: number, max: number) =>
  Math.max(min, Math.min(max, v));
export function decimalToImplied(price: number) {
  return Number.isFinite(price) && price > 1 ? 1 / price : null;
}
export function americanToDecimal(price: number): number | null {
  if (!Number.isFinite(price) || Math.abs(price) < 100) return null;
  return price > 0 ? 1 + price / 100 : 1 + 100 / -price;
}
export function decimalToAmerican(price: number): string {
  if (!Number.isFinite(price) || price <= 1) return "—";
  const n =
    price >= 2 ? Math.round((price - 1) * 100) : Math.round(-100 / (price - 1));
  return n > 0 ? `+${n}` : String(n);
}
export function noVig(quote: Quote) {
  const h = decimalToImplied(quote.homePrice),
    a = decimalToImplied(quote.awayPrice);
  if (h === null || a === null) return null;
  return { home: h / (h + a), away: a / (h + a), overround: h + a - 1 };
}
export function quoteFresh(quote: Quote, now = Date.now()) {
  if (!quote.updatedAt) return false;
  const age = now - Date.parse(quote.updatedAt);
  return Number.isFinite(age) && age >= -60000 && age <= 15 * 60 * 1000;
}
export function opportunity(game: Game, forecast: Forecast, now = Date.now()) {
  if (
    game.demo ||
    forecast.home === null ||
    game.state !== "pre" ||
    game.seasonType === 1 ||
    Date.parse(game.start) <= now
  )
    return null;
  const candidates = game.quotes
    .filter((q) => quoteFresh(q, now))
    .flatMap((q) => {
      const fair = noVig(q);
      if (!fair) return [];
      return (["home", "away"] as const).map((side) => {
        const probability =
          side === "home" ? forecast.home! : 1 - forecast.home!;
        const price = side === "home" ? q.homePrice : q.awayPrice;
        return {
          side,
          quote: q,
          edge: probability - fair[side],
          ev: probability * price - 1,
        };
      });
    });
  return candidates.sort((a, b) => b.ev - a.ev)[0] ?? null;
}
function smoothed(team: Team) {
  if (team.wins === null || team.losses === null) return null;
  const n = team.wins + team.losses + team.ties;
  return { n, p: (team.wins + team.ties * 0.5 + 5) / (n + 10) };
}
/** Transparent, uncalibrated v1 baseline. Market prices never enter this calculation. */
export function forecast(game: Game): Forecast {
  const h = smoothed(game.home),
    a = smoothed(game.away),
    rules = LEAGUES[game.league];
  const limitations = [
    "Uncalibrated baseline; no historical accuracy claim.",
    "Player availability, starting lineups, rest and opponent strength are research context, not model inputs.",
  ];
  if (game.state === "post")
    return {
      home: null,
      away: null,
      favorite: null,
      quality: "Limited",
      factors: [],
      reasons: [
        "This game has finished. No retrospective prediction is generated.",
      ],
      limitations,
      label: "Final result",
    };
  if (game.state === "in")
    return {
      home: null,
      away: null,
      favorite: null,
      quality: "Limited",
      factors: [],
      reasons: [
        "Live score available. Open the research packet for ESPN's in-game probability when provided.",
      ],
      limitations,
      label: "Live research",
    };
  if (/POSTPONED|CANCELED|CANCELLED|DELAYED|SUSPENDED/i.test(game.statusName))
    return {
      home: null,
      away: null,
      favorite: null,
      quality: "Limited",
      factors: [],
      reasons: ["The event is not currently scheduled to proceed normally."],
      limitations,
      label: "On hold",
    };
  if (!h || !a)
    return {
      home: null,
      away: null,
      favorite: null,
      quality: "Limited",
      factors: [],
      reasons: [
        "Both teams need a season record before a baseline can be estimated.",
      ],
      limitations,
      label: "Insufficient data",
    };
  const record = Math.log(h.p / (1 - h.p)) - Math.log(a.p / (1 - a.p));
  const hasScoring = [
    game.home.averageFor,
    game.home.averageAgainst,
    game.away.averageFor,
    game.away.averageAgainst,
  ].every((v) => v !== null && Number.isFinite(v));
  const shrinkage = Math.min(h.n, a.n) / (Math.min(h.n, a.n) + 10);
  const differential = hasScoring
    ? clamp(
        (game.home.averageFor! -
          game.home.averageAgainst! -
          (game.away.averageFor! - game.away.averageAgainst!)) /
          rules.scale,
        -1.5,
        1.5,
      ) * shrinkage
    : 0;
  const home = game.neutral ? 0 : rules.home / rules.scale;
  const factors = [
    {
      name: "Season record",
      value: record * 0.65,
      detail: `${game.home.abbr} ${game.home.record} · ${game.away.abbr} ${game.away.record}. Records shrink toward 50% with ten prior games.`,
    },
    {
      name: "Scoring differential",
      value: differential * 0.35,
      detail: hasScoring
        ? `Season scoring margin, sample-adjusted; ${rules.unit.toLowerCase()} per game.`
        : "Scoring averages unavailable; this input is neutral.",
    },
    {
      name: "Home advantage",
      value: home,
      detail: game.neutral
        ? "Neutral venue; no home adjustment."
        : `${game.home.shortName} receive a fixed ${rules.home} ${rules.unit.toLowerCase()} baseline adjustment.`,
    },
  ];
  const probability = clamp(
    1 / (1 + Math.exp(-factors.reduce((s, f) => s + f.value, 0))),
    0.15,
    0.85,
  );
  const n = Math.min(h.n, a.n);
  if (n < 10)
    limitations.push(
      "Small season sample; estimates are heavily shrunk toward an even matchup.",
    );
  if (game.seasonType === 1)
    limitations.push(
      "Preseason rotations are unstable; market signals are withheld.",
    );
  if (game.league === "NFL")
    limitations.push(
      "Two-outcome estimate conditional on no tie; NFL ties are not modeled.",
    );
  return {
    home: probability,
    away: 1 - probability,
    favorite: probability >= 0.5 ? "home" : "away",
    quality:
      n >= 20 && hasScoring ? "Established" : n >= 8 ? "Developing" : "Limited",
    factors,
    limitations,
    label: "Pregame baseline",
    reasons: [
      `${probability >= 0.5 ? game.home.name : game.away.name} lead the baseline at ${(Math.max(probability, 1 - probability) * 100).toFixed(1)}%.`,
      `${hasScoring ? "Season record, scoring margin and venue" : "Season record and venue"} drive this estimate. Player and tournament context remain visible in the evidence packet.`,
    ],
  };
}
