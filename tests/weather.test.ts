import test from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { normalizeBook, normalizeContract } from "../src/lib/contract-data";
import {
  buyFill,
  evaluateBasket,
  freshBook,
} from "../src/lib/market-contracts";
import {
  sampleWeatherBoard,
  verifyWeatherRules,
} from "../src/lib/weather-data";
import {
  bucketProbability,
  completePartition,
  forecastFromPeriods,
  localMidnight,
  parseBucket,
  weatherArbitrage,
  weatherSignals,
} from "../src/lib/weather-model";
import {
  addDays,
  DEFAULT_WEATHER_SETTINGS,
  WEATHER_CITIES,
  weatherSlug,
} from "../src/lib/weather-types";
import { GET } from "../src/app/api/weather/route";
const now = Date.parse("2026-10-15T12:00:00Z"),
  city = WEATHER_CITIES[0],
  date = "2026-10-16";
function row() {
  const r = sampleWeatherBoard(date).rows[0];
  r.forecast!.updatedAt = new Date(now).toISOString();
  for (const c of r.event!.contracts)
    for (const b of [c.yesBook!, c.noBook!]) {
      b.timestamp = new Date(now).toISOString();
      b.fetchedAt = b.timestamp;
    }
  return r;
}
test("whole-degree buckets are exact, including negative ranges, tails and partition gaps", () => {
  assert.deepEqual(parseBucket("-5–-4°F"), {
    label: "-5–-4°F",
    low: -5,
    high: -4,
    contractId: "",
  });
  assert.equal(parseBucket("70°C"), null);
  assert.equal(parseBucket("70-69°F"), null);
  assert.ok(
    completePartition([
      parseBucket("69°F or below")!,
      parseBucket("70-71°F")!,
      parseBucket("72°F or higher")!,
    ]),
  );
  assert.equal(
    completePartition([
      parseBucket("69°F or below")!,
      parseBucket("71°F or higher")!,
    ]),
    false,
  );
  assert.equal(
    completePartition([
      parseBucket("70°F or below")!,
      parseBucket("70°F or higher")!,
    ]),
    false,
  );
  const buckets = row().buckets;
  assert.ok(
    Math.abs(
      buckets.reduce((s, b) => s + bucketProbability(b, 72, 3)!, 0) - 1,
    ) < 1e-8,
  );
});
test("calendar forecasts cover local days across UTC midnight and DST, not just remaining daytime hours", () => {
  assert.equal(
    localMidnight("2026-03-09", city.timezone) -
      localMidnight("2026-03-08", city.timezone),
    23 * 3600000,
  );
  assert.equal(
    localMidnight("2026-11-02", city.timezone) -
      localMidnight("2026-11-01", city.timezone),
    25 * 3600000,
  );
  const start = localMidnight(date, city.timezone),
    periods = Array.from({ length: 24 }, (_, i) => ({
      startTime: new Date(start + i * 3600000).toISOString(),
      endTime: new Date(start + (i + 1) * 3600000).toISOString(),
      temperature: 20,
      temperatureUnit: "C",
      shortForecast: "Fair",
    }));
  const daily = {
    properties: {
      periods: [
        {
          startTime: new Date(start + 6 * 3600000).toISOString(),
          isDaytime: true,
          temperature: 72,
          temperatureUnit: "F",
        },
      ],
    },
  };
  const data = {
    properties: { updateTime: new Date(now).toISOString(), periods },
  };
  const forecast = forecastFromPeriods(
    city,
    date,
    data,
    daily,
    { hourlyUrl: "", forecastUrl: "", stationUrl: "" },
    now,
  );
  assert.equal(forecast.completeDay, true);
  assert.equal(forecast.high, 72);
  assert.equal(forecast.hourlyHigh, 68);
  assert.equal(
    forecastFromPeriods(
      city,
      date,
      { properties: { ...data.properties, periods: periods.slice(1) } },
      daily,
      { hourlyUrl: "", forecastUrl: "", stationUrl: "" },
      now,
    ).completeDay,
    false,
  );
  assert.equal(
    forecastFromPeriods(
      city,
      date,
      {
        properties: {
          ...data.properties,
          periods: periods.map((p, i) =>
            i === 10 ? { ...p, temperature: null } : p,
          ),
        },
      },
      daily,
      { hourlyUrl: "", forecastUrl: "", stationUrl: "" },
      now,
    ).completeDay,
    false,
  );
});
test("weather rules require the exact NOAA station, date, source and identical whole-degree resolution semantics", () => {
  const r = row(),
    e = r.event!;
  e.date = date;
  e.slug = weatherSlug(city, date);
  e.resolutionSource = "https://www.weather.gov/wrh/timeseries?site=klga";
  e.rules =
    "The highest temperature recorded by NOAA on 16 Oct '26 uses whole degrees Fahrenheit.";
  for (const [i, c] of e.contracts.entries()) {
    c.slug = e.slug + "-" + i;
    c.rules = e.rules;
    c.resolutionSource = e.resolutionSource;
  }
  assert.equal(verifyWeatherRules(r), true);
  e.contracts[0].resolutionSource =
    "https://www.weather.gov/wrh/timeseries?site=kjfk";
  assert.equal(verifyWeatherRules(r), false);
  e.contracts[0].resolutionSource =
    "https://www.weather.gov.attacker.test/wrh/timeseries?site=klga";
  assert.equal(verifyWeatherRules(r), false);
});
test("order books sort actual asks, bind token and condition, charge fees per fill, and require all requested size", () => {
  const c = row().event!.contracts[0];
  const raw = {
    market: c.conditionId,
    asset_id: c.yesToken,
    timestamp: String(now),
    min_order_size: "5",
    hash: "h",
    bids: [{ price: ".05", size: "200" }],
    asks: [
      { price: ".4", size: "20" },
      { price: ".1", size: "6" },
    ],
  };
  const b = normalizeBook(raw, c.yesToken, c.conditionId, now)!;
  assert.equal(b.asks[0].price, 0.1);
  const fill = buyFill(b, 10, 0.05, now)!;
  assert.ok(Math.abs(fill.cost - 2.2) < 1e-9);
  assert.equal(fill.fee, 0.075);
  assert.equal(buyFill(b, 4, 0.05, now), null);
  assert.equal(buyFill(b, 30, 0.05, now), null);
  assert.equal(buyFill(b, 10, null, now), null);
  assert.equal(
    normalizeBook(
      { ...raw, asset_id: "wrong" },
      c.yesToken,
      c.conditionId,
      now,
    ),
    null,
  );
  assert.equal(
    freshBook({ ...b, timestamp: new Date(now - 91000).toISOString() }, now),
    false,
  );
  assert.equal(
    freshBook({ ...b, timestamp: new Date(now + 31000).toISOString() }, now),
    false,
  );
});
test("arbitrage uses complete priced legs, fresh synchronized depth and all costs; model probability is independent", () => {
  const r = row(),
    settings = { ...DEFAULT_WEATHER_SETTINGS };
  const baskets = weatherArbitrage(r, settings, now);
  const yes = baskets.find((b) => b.id === "ladder-YES")!;
  assert.ok(yes.profit > 0);
  assert.equal(yes.payout, 10);
  assert.equal(yes.legs.length, 4);
  const unknown = structuredClone(r);
  unknown.event!.contracts[0].feeRate = null;
  assert.ok(
    !weatherArbitrage(unknown, settings, now).some(
      (b) => b.id === "ladder-YES",
    ),
  );
  assert.deepEqual(weatherArbitrage(r, { ...settings, shares: 1000 }, now), []);
  const incomplete = structuredClone(r);
  incomplete.partitionComplete = false;
  assert.ok(
    !weatherArbitrage(incomplete, settings, now).some((b) =>
      b.id.startsWith("ladder"),
    ),
  );
  r.forecast!.completeDay = false;
  assert.ok(
    weatherSignals(r, settings, now).every((s) => s.probability === null),
  );
  assert.ok(
    weatherArbitrage(r, settings, now).some((b) => b.id === "ladder-YES"),
  );
  const c = row().event!.contracts[0],
    fill = buyFill(c.yesBook, 10, 0.05, now)!;
  assert.equal(
    evaluateBasket(
      "x",
      "x",
      [
        { contract: "a", side: "YES", fill },
        {
          contract: "b",
          side: "NO",
          fill: { ...fill, timestamp: new Date(now - 16000).toISOString() },
        },
      ],
      10,
      10,
      0,
      0,
    ),
    null,
  );
});
test("unknown fee curves and malformed identifiers never default to fee-free", () => {
  const c = row().event!.contracts[0],
    base = {
      ...c,
      id: "1",
      conditionId: c.conditionId,
      outcomes: '["No","Yes"]',
      clobTokenIds: '["123","456"]',
      outcomePrices: '["0.7","0.3"]',
      feesEnabled: true,
      feeSchedule: { rate: 0.05, exponent: 1 },
    };
  assert.equal(normalizeContract(base, {})!.yesToken, "456");
  assert.equal(normalizeContract(base, {})!.feeRate, 0.05);
  assert.equal(
    normalizeContract(
      { ...base, feeSchedule: { rate: 0.05, exponent: 2 } },
      {},
    )!.feeRate,
    null,
  );
  assert.equal(
    normalizeContract({ ...base, clobTokenIds: '["123","123"]' }, {}),
    null,
  );
});
test("weather API rejects invalid dates/cities and sample mode remains self-contained", async () => {
  assert.equal(
    (
      await GET(
        new NextRequest("https://example.com/api/weather?date=2026-02-30"),
      )
    ).status,
    400,
  );
  assert.equal(
    (
      await GET(
        new NextRequest(
          "https://example.com/api/weather?date=2026-10-16&city=attacker",
        ),
      )
    ).status,
    400,
  );
  const response = await GET(
    new NextRequest(
      "https://example.com/api/weather?date=2026-10-16&city=nyc&mode=demo",
    ),
  );
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.rows.length, 1);
  assert.equal(body.mode, "demo");
});
