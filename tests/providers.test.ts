import test from "node:test";
import assert from "node:assert/strict";
import { slateDate } from "../src/lib/dates";
import { demoBoard } from "../src/lib/demo";
test("late-night UTC games resolve to the correct Eastern slate date", () => {
  assert.equal(slateDate("2026-10-16T02:30:00Z"), "2026-10-15");
  assert.equal(slateDate("2026-01-16T04:30:00Z"), "2026-01-15");
  assert.equal(slateDate("2026-10-16T12:00:00Z"), "2026-10-16");
});
import {
  matchOddsEvent,
  normalizeEspnQuotes,
  normalizeEvent,
  normalizePredictionMarket,
  validDate,
} from "../src/lib/providers";
test("dates reject impossible days and injection-shaped inputs", () => {
  assert.equal(validDate("2026-10-15"), true);
  assert.equal(validDate("2026-02-30"), false);
  assert.equal(validDate("2026-1-1"), false);
  assert.equal(validDate("2026-10-15&x=1"), false);
});
test("ESPN adapter resolves home and away by role, not array order", () => {
  const event = {
    id: "401908945",
    date: "2026-10-15T23:30Z",
    season: { type: 1 },
    competitions: [
      {
        competitors: [
          {
            homeAway: "away",
            team: { id: "a", displayName: "Away", abbreviation: "AWY" },
            score: "78",
            records: [{ type: "total", summary: "2-1" }],
          },
          {
            homeAway: "home",
            team: { id: "h", displayName: "Home", abbreviation: "HME" },
            score: "80",
            records: [{ type: "total", summary: "1-2" }],
          },
        ],
        status: { type: { state: "in", name: "STATUS_IN_PROGRESS" } },
      },
    ],
  };
  const g = normalizeEvent(event, "NBA", [], "2026-27")!;
  assert.equal(g.home.name, "Home");
  assert.equal(g.away.wins, 2);
  assert.equal(g.home.score, 80);
  assert.equal(g.state, "in");
  assert.equal(normalizeEvent({ competitions: [] }, "NBA", [], "season"), null);
});
test("ESPN moneyline reference prices cannot claim update freshness", () => {
  const quotes = normalizeEspnQuotes([
    {
      provider: { name: "Example" },
      moneyline: {
        home: { close: { odds: "-200" } },
        away: { close: { odds: "+170" } },
      },
    },
  ]);
  assert.equal(quotes.length, 1);
  assert.equal(quotes[0].homePrice, 1.5);
  assert.equal(quotes[0].updatedAt, null);
  assert.equal(
    normalizeEspnQuotes([{ homeTeamOdds: { moneyLine: 0 } }]).length,
    0,
  );
});
test("bookmaker matches require both complete team names and a matching start time", () => {
  const game = demoBoard().games[0],
    event = {
      home_team: game.home.name,
      away_team: game.away.name,
      commence_time: game.start,
    };
  assert.equal(matchOddsEvent(event, game), true);
  assert.equal(
    matchOddsEvent({ ...event, away_team: "New York Jets" }, game),
    false,
  );
  assert.equal(
    matchOddsEvent({ ...event, commence_time: "2025-01-01" }, game),
    false,
  );
});
test("prediction adapter only accepts exact two-team moneyline contracts for that game", () => {
  const game = demoBoard().games[0],
    event = { slug: "test-matchup", startTime: game.start };
  const market = {
    id: 1,
    active: true,
    closed: false,
    sportsMarketType: "moneyline",
    outcomes: JSON.stringify([game.away.name, game.home.name]),
    outcomePrices: '["0.4","0.6"]',
    updatedAt: "2026-10-15T17:00Z",
  };
  assert.equal(
    normalizePredictionMarket(event, market, game)?.homePrice,
    1 / 0.6,
  );
  for (const invalid of [
    { ...market, sportsMarketType: "spreads" },
    { ...market, closed: true },
    { ...market, outcomes: '["Yes","No"]' },
    { ...market, outcomePrices: '["NaN","0.6"]' },
    { ...market, outcomePrices: '["0","1"]' },
  ])
    assert.equal(normalizePredictionMarket(event, invalid, game), null);
  assert.equal(
    normalizePredictionMarket({ ...event, startTime: "invalid" }, market, game),
    null,
  );
  assert.equal(
    normalizePredictionMarket(
      { ...event, startTime: "2027-01-01" },
      market,
      game,
    ),
    null,
  );
});
