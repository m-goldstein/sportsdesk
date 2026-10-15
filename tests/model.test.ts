import test from "node:test";
import assert from "node:assert/strict";
import { demoBoard } from "../src/lib/demo";
import {
  americanToDecimal,
  decimalToAmerican,
  decimalToImplied,
  forecast,
  noVig,
  opportunity,
  quoteFresh,
} from "../src/lib/model";
const game = () => structuredClone(demoBoard("2099-10-15").games[0]);
test("moneyline conversion, invalid prices and two-sided margin", () => {
  assert.equal(americanToDecimal(-200), 1.5);
  assert.equal(americanToDecimal(150), 2.5);
  assert.equal(americanToDecimal(0), null);
  assert.equal(americanToDecimal(Number.NaN), null);
  assert.equal(decimalToImplied(1), null);
  assert.equal(decimalToAmerican(2.5), "+150");
  assert.equal(decimalToAmerican(1.5), "-200");
  const fair = noVig({
    ...game().quotes[0],
    homePrice: 1.91,
    awayPrice: 1.91,
  })!;
  assert.equal(fair.home, 0.5);
  assert.equal(fair.home + fair.away, 1);
  assert.ok(fair.overround > 0);
});
test("forecast is independent of all market prices", () => {
  const g = game(),
    before = forecast(g);
  g.quotes = [{ ...g.quotes[0], homePrice: 12, awayPrice: 1.01 }];
  assert.deepEqual(forecast(g), before);
  assert.ok(before.home! > 0.5);
  assert.equal(before.home! + before.away!, 1);
});
test("neutral venue and even teams produce a 50/50 baseline", () => {
  const g = game();
  g.away = { ...g.home, id: "other" };
  g.neutral = true;
  assert.equal(forecast(g).home, 0.5);
  g.neutral = false;
  assert.ok(forecast(g).home! > 0.5);
});
test("short season samples shrink confidence and predictions are bounded", () => {
  const g = game();
  g.home.wins = 1;
  g.home.losses = 0;
  g.away.wins = 0;
  g.away.losses = 1;
  assert.equal(forecast(g).quality, "Limited");
  g.home.wins = 100;
  g.away.losses = 100;
  assert.ok(forecast(g).home! <= 0.85);
  assert.ok(forecast(g).home! >= 0.15);
});
test("finished, in-game, postponed and missing-data events do not get pregame predictions", () => {
  const g = game();
  g.state = "post";
  assert.equal(forecast(g).home, null);
  g.state = "in";
  assert.equal(forecast(g).home, null);
  g.state = "pre";
  g.statusName = "STATUS_POSTPONED";
  assert.equal(forecast(g).home, null);
  g.statusName = "STATUS_SCHEDULED";
  g.home.wins = null;
  assert.equal(forecast(g).home, null);
});
test("missing scoring statistics leave scoring input neutral", () => {
  const g = game();
  g.home.averageFor = null;
  assert.equal(
    forecast(g).factors.find((f) => f.name === "Scoring differential")?.value,
    0,
  );
});
test("freshness uses provider timestamp and excludes absent, stale and future-dated quotes", () => {
  const q = game().quotes[0],
    now = Date.now();
  assert.equal(quoteFresh({ ...q, updatedAt: null }, now), false);
  assert.equal(
    quoteFresh(
      { ...q, updatedAt: new Date(now - 16 * 60000).toISOString() },
      now,
    ),
    false,
  );
  assert.equal(
    quoteFresh({ ...q, updatedAt: new Date(now + 120000).toISOString() }, now),
    false,
  );
  assert.equal(
    quoteFresh({ ...q, updatedAt: new Date(now - 60000).toISOString() }, now),
    true,
  );
});
test("opportunities calculate actual-price EV and suppress preseason, elapsed and in-game events", () => {
  const g = game(),
    now = Date.parse("2099-10-15T12:00Z");
  g.demo = false;
  g.quotes = [
    {
      ...g.quotes[0],
      homePrice: 2,
      awayPrice: 1.91,
      updatedAt: new Date(now).toISOString(),
    },
  ];
  const f = forecast(g),
    o = opportunity(g, f, now)!;
  assert.equal(o.side, "home");
  assert.equal(o.ev, f.home! * 2 - 1);
  g.seasonType = 1;
  assert.equal(opportunity(g, f, now), null);
  g.seasonType = 2;
  g.state = "in";
  assert.equal(opportunity(g, f, now), null);
  g.state = "pre";
  assert.equal(opportunity(g, f, Date.parse(g.start) + 1), null);
});
