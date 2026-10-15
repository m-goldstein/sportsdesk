import test from "node:test";
import assert from "node:assert/strict";
import { demoBoard } from "../src/lib/demo";
import { forecast } from "../src/lib/model";
import {
  bracketOdds,
  canRecord,
  defaultScenario,
  journalStats,
  parseJournal,
  playBracket,
  Prediction,
  resolvePrediction,
  scenarioForecast,
  xmlEscape,
} from "../src/lib/decision-lab";
const game = () => structuredClone(demoBoard("2099-10-15").games[0]);
const entry = (): Prediction => {
  const g = game();
  g.demo = false;
  return {
    version: 1,
    id: "test",
    game: g,
    createdAt: "2099-10-15T10:00:00Z",
    probability: 0.7,
    baseline: 0.6,
    scenario: defaultScenario(g),
    thesis: "An explicit pregame thesis",
  };
};
test("scenario baseline is preserved and equal impacts cancel; venue and home/away impacts are directional", () => {
  const g = game(),
    initial = defaultScenario(g),
    base = forecast(g).home!;
  assert.ok(Math.abs(scenarioForecast(g, initial)!.probability - base) < 1e-12);
  assert.ok(
    Math.abs(
      scenarioForecast(g, { ...initial, homeImpact: 4, awayImpact: 4 })!
        .probability - base,
    ) < 1e-12,
  );
  assert.ok(
    scenarioForecast(g, { ...initial, homeImpact: 4 })!.probability > base,
  );
  assert.ok(
    scenarioForecast(g, { ...initial, awayImpact: 4 })!.probability < base,
  );
  assert.ok(
    scenarioForecast(g, { ...initial, neutral: true })!.probability < base,
  );
  g.state = "in";
  assert.equal(scenarioForecast(g, initial), null);
});
test("hypothetical EV, user uncertainty and extreme bounds stay coherent", () => {
  const g = game(),
    initial = defaultScenario(g),
    r = scenarioForecast(g, { ...initial, price: 2.5, uncertainty: 25 })!;
  assert.equal(r.breakEven, 0.4);
  assert.equal(r.ev, r.probability * 2.5 - 1);
  assert.ok(r.low <= r.probability && r.high >= r.probability);
  assert.ok(r.low >= 0.01 && r.high <= 0.99);
  assert.equal(scenarioForecast(g, { ...initial, price: 1 })!.ev, null);
  assert.equal(
    scenarioForecast(g, { ...initial, homeImpact: 1200 })!.probability,
    scenarioForecast(g, { ...initial, homeImpact: 12 })!.probability,
  );
});
test("exact bracket advancement conserves probability with equal and asymmetric fields", () => {
  const template = game().home;
  for (const count of [2, 4, 8]) {
    const teams = Array.from({ length: count }, (_, i) => ({
      ...template,
      id: String(i),
    }));
    const odds = bracketOdds(teams, "NBA")!;
    for (const o of odds) assert.ok(Math.abs(o.champion - 1 / count) < 1e-12);
    for (let r = 0; r < Math.log2(count); r++)
      assert.ok(
        Math.abs(
          odds.reduce((s, o) => s + o.rounds[r], 0) - count / 2 ** (r + 1),
        ) < 1e-12,
      );
  }
  const teams = demoBoard()
    .games.filter((g) => g.league === "NBA")
    .flatMap((g) => [g.home, g.away]);
  assert.ok(
    Math.abs(
      bracketOdds(teams, "NBA")!.reduce((s, o) => s + o.champion, 0) - 1,
    ) < 1e-12,
  );
  assert.equal(bracketOdds([teams[0], teams[0]], "NBA"), null);
  assert.equal(
    bracketOdds([{ ...teams[0], wins: null }, teams[1]], "NBA"),
    null,
  );
});
test("one-universe brackets are reproducible and only advance prior winners", () => {
  const teams = demoBoard()
    .games.filter((g) => g.league === "NBA")
    .flatMap((g) => [g.home, g.away]);
  const rounds = playBracket(teams, "NBA", 42);
  assert.deepEqual(rounds, playBracket(teams, "NBA", 42));
  assert.deepEqual(
    rounds.map((r) => r.length),
    [4, 2, 1],
  );
  for (let i = 1; i < rounds.length; i++)
    assert.deepEqual(
      rounds[i].flatMap((m) => [m.home.id, m.away.id]),
      rounds[i - 1].map((m) => m.winner.id),
    );
  assert.notDeepEqual(rounds, playBracket(teams, "NBA", 43));
});
test("live predictions only record before kickoff; sample records are explicitly permitted", () => {
  const g = game();
  g.demo = false;
  assert.equal(canRecord(g, Date.parse(g.start) - 1), true);
  assert.equal(canRecord(g, Date.parse(g.start)), false);
  g.demo = true;
  assert.equal(canRecord(g, Date.parse(g.start) + 1), true);
  g.statusName = "STATUS_POSTPONED";
  assert.equal(canRecord(g), false);
});
test("settlement requires exact final event, teams, kickoff, mode and pregame timestamp; ties void", () => {
  const p = entry(),
    now = Date.parse(p.game.start) + 24 * 3600000;
  const result = {
    ...p.game,
    state: "post" as const,
    statusName: "STATUS_FINAL",
    home: { ...p.game.home, score: 100 },
    away: { ...p.game.away, score: 98 },
  };
  const resolved = resolvePrediction(p, result, now);
  assert.equal(resolved.resolution!.outcome, 1);
  assert.equal(
    resolvePrediction(
      resolved,
      { ...result, home: { ...result.home, score: 0 } },
      now,
    ),
    resolved,
  );
  for (const wrong of [
    { ...result, id: "other" },
    { ...result, demo: true },
    { ...result, state: "in" as const },
    { ...result, statusName: "STATUS_POSTPONED" },
    { ...result, start: "2100-01-01T00:00Z" },
    { ...result, home: { ...result.home, id: "other" } },
  ])
    assert.equal(resolvePrediction(p, wrong, now), p);
  assert.equal(
    resolvePrediction({ ...p, createdAt: p.game.start }, result, now)
      .resolution,
    undefined,
  );
  assert.equal(resolvePrediction(p, result, Date.parse(p.game.start) - 1), p);
  assert.equal(
    resolvePrediction(
      p,
      { ...result, away: { ...result.away, score: 100 } },
      now,
    ).resolution!.outcome,
    null,
  );
});
test("Brier and calibration score only resolved binary outcomes, using the same baseline sample", () => {
  const a = entry();
  const entries: Prediction[] = [
    {
      ...a,
      resolution: {
        outcome: 1,
        homeScore: 1,
        awayScore: 0,
        resolvedAt: "",
        source: "feed",
      },
    },
    {
      ...a,
      id: "b",
      probability: 0.3,
      resolution: {
        outcome: 0,
        homeScore: 0,
        awayScore: 1,
        resolvedAt: "",
        source: "feed",
      },
    },
    {
      ...a,
      id: "void",
      resolution: {
        outcome: null,
        homeScore: 0,
        awayScore: 0,
        resolvedAt: "",
        source: "feed",
      },
    },
    { ...a, id: "pending" },
  ];
  const stats = journalStats(entries);
  assert.equal(stats.settled, 2);
  assert.ok(Math.abs(stats.brier! - 0.09) < 1e-12);
  assert.ok(Math.abs(stats.baselineBrier! - 0.26) < 1e-12);
  assert.equal(
    stats.bins.reduce((s, b) => s + b.count, 0),
    2,
  );
  assert.equal(journalStats([]).brier, null);
});
test("journal storage rejects malformed numeric snapshots, duplicates and unsupported versions", () => {
  const e = entry();
  assert.deepEqual(
    parseJournal([
      e,
      e,
      { ...e, id: "nan", probability: NaN },
      { ...e, id: "v2", version: 2 },
      { ...e, id: "bad", scenario: { homeImpact: {} } },
    ]),
    [e],
  );
  assert.deepEqual(parseJournal({}), []);
  assert.equal(
    xmlEscape('<script a="x">&'),
    "&lt;script a=&quot;x&quot;&gt;&amp;",
  );
});
