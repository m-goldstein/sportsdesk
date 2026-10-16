import { unstable_cache } from "next/cache";
import {
  attachBooks,
  getContractEvent,
  mapLimit,
  publicJson,
  Wire,
} from "./contract-data";
import {
  addDays,
  WEATHER_CITIES,
  weatherSlug,
  WeatherBoard,
  WeatherCity,
  WeatherForecast,
  WeatherRow,
} from "./weather-types";
import {
  completePartition,
  forecastFromPeriods,
  localMidnight,
  parseBucket,
} from "./weather-model";
function nwsUrl(url: unknown) {
  if (
    typeof url !== "string" ||
    !/^https:\/\/api\.weather\.gov\/(gridpoints|points)\/[A-Za-z0-9,./-]+$/.test(
      url,
    )
  )
    throw new Error("Invalid NOAA endpoint");
  return url;
}
async function getForecast(
  city: WeatherCity,
  date: string,
): Promise<WeatherForecast> {
  const station = await unstable_cache(
    async () => {
      const data = await publicJson(
        `https://api.weather.gov/stations/${city.station}`,
      );
      const [lon, lat] = data.geometry?.coordinates ?? [];
      if (!Number.isFinite(lat) || !Number.isFinite(lon))
        throw new Error("Missing station coordinates");
      const points = await publicJson(
        `https://api.weather.gov/points/${lat.toFixed(4)},${lon.toFixed(4)}`,
      );
      return {
        hourlyUrl: nwsUrl(points.properties?.forecastHourly),
        forecastUrl: nwsUrl(points.properties?.forecast),
        stationUrl: `https://api.weather.gov/stations/${city.station}`,
      };
    },
    ["oracular-weather-station-v1", city.station],
    { revalidate: 86400 },
  )();
  return unstable_cache(
    async () => {
      const data = await Promise.allSettled([
        publicJson(station.hourlyUrl),
        publicJson(station.forecastUrl),
      ]);
      if (data[0].status !== "fulfilled")
        throw new Error("NOAA hourly unavailable");
      return forecastFromPeriods(
        city,
        date,
        data[0].value,
        data[1].status === "fulfilled" ? data[1].value : {},
        station,
      );
    },
    ["oracular-noaa-forecast-v1", city.station, date],
    { revalidate: 300 },
  )();
}
export function verifyWeatherRules(row: WeatherRow) {
  const e = row.event;
  if (!e) return false;
  const [year, month, day] = row.date.split("-").map(Number),
    months = [
      "Jan",
      "Feb",
      "Mar",
      "Apr",
      "May",
      "Jun",
      "Jul",
      "Aug",
      "Sep",
      "Oct",
      "Nov",
      "Dec",
    ];
  const source = (value: string) => {
    try {
      const u = new URL(value);
      return (
        u.protocol === "https:" &&
        ["www.weather.gov", "weather.gov"].includes(u.hostname) &&
        !u.port &&
        !u.username &&
        u.pathname === "/wrh/timeseries" &&
        u.searchParams.get("site")?.toUpperCase() === row.city.station
      );
    } catch {
      return false;
    }
  };
  const validRules = (rules: string) =>
    /highest temperature recorded by NOAA/i.test(rules) &&
    /whole degrees Fahrenheit/i.test(rules) &&
    rules.includes(`${day} ${months[month - 1]} '${String(year).slice(-2)}`);
  const normalized = (s: string) => s.replace(/\s+/g, " ").trim();
  return (
    e.slug === weatherSlug(row.city, row.date) &&
    e.date === row.date &&
    source(e.resolutionSource) &&
    validRules(e.rules) &&
    e.contracts.length > 0 &&
    new Set(e.contracts.map((c) => c.conditionId)).size ===
      e.contracts.length &&
    e.contracts.every(
      (c) =>
        source(c.resolutionSource) &&
        validRules(c.rules) &&
        normalized(c.rules) === normalized(e.rules) &&
        c.slug.startsWith(e.slug + "-"),
    )
  );
}
export async function getWeatherBoard(
  date: string,
  cityId = "all",
): Promise<WeatherBoard> {
  const cities = WEATHER_CITIES.filter(
    (c) => cityId === "all" || c.id === cityId,
  );
  const rows = await mapLimit(cities, 3, async (city): Promise<WeatherRow> => {
    const warnings: string[] = [];
    const [forecastResult, eventResult] = await Promise.allSettled([
      getForecast(city, date),
      getContractEvent(weatherSlug(city, date)),
    ]);
    const forecast =
      forecastResult.status === "fulfilled" ? forecastResult.value : null;
    if (!forecast)
      warnings.push(
        "NOAA forecast is unavailable. No forecast probability has been substituted.",
      );
    let event = eventResult.status === "fulfilled" ? eventResult.value : null;
    if (eventResult.status === "rejected")
      warnings.push(
        "Polymarket discovery failed. Retry the scan; no sample prices were substituted.",
      );
    else if (!event)
      warnings.push("No exact city/date daily-high contract found.");
    if (event) {
      const books = await attachBooks(event);
      event = books.event;
      warnings.push(...books.warnings);
    }
    const buckets = (event?.contracts ?? [])
      .flatMap((c) => {
        const b = parseBucket(c.label, c.id);
        return b ? [b] : [];
      })
      .sort((a, b) => (a.low ?? -Infinity) - (b.low ?? -Infinity));
    const row: WeatherRow = {
      city,
      date,
      forecast,
      event,
      buckets,
      rulesVerified: false,
      partitionComplete: false,
      warnings,
    };
    row.rulesVerified = verifyWeatherRules(row);
    row.partitionComplete =
      !!event &&
      buckets.length === event.contracts.length &&
      completePartition(buckets);
    if (event && !row.rulesVerified)
      warnings.push(
        "Station, source, date or precision rules could not be verified. Forecast edges and full-ladder arbitrage are withheld.",
      );
    if (event && !row.partitionComplete)
      warnings.push(
        "Temperature buckets do not form a verified complete non-overlapping ladder.",
      );
    return row;
  });
  return {
    mode: "live",
    date,
    fetchedAt: new Date().toISOString(),
    rows,
    warnings: [],
  };
}
export function sampleWeatherBoard(date: string): WeatherBoard {
  const now = Date.now(),
    stamp = new Date(now).toISOString();
  const rows: WeatherRow[] = WEATHER_CITIES.map((city, i) => {
    const high = 72 + i * 2,
      labels = [
        `${high - 3}°F or below`,
        `${high - 2}-${high - 1}°F`,
        `${high}-${high + 1}°F`,
        `${high + 2}°F or higher`,
      ];
    const slug = weatherSlug(city, date),
      probabilities = [0.08, 0.22, 0.42, 0.18];
    const contracts = labels.map((label, j) => {
      const id = `sample-weather-${i}-${j}`,
        conditionId = "0x" + (i * 10 + j + 1).toString(16).padStart(64, "0");
      const book = (side: string, price: number) => ({
        assetId: `sample-${side}-${id}`,
        conditionId,
        timestamp: stamp,
        fetchedAt: stamp,
        asks: [
          { price, size: 100 },
          { price: Math.min(0.999, price + 0.02), size: 100 },
        ],
        bestBid: Math.max(0.001, price - 0.02),
        minOrderSize: 5,
        hash: `sample-${id}`,
      });
      return {
        id,
        conditionId,
        label,
        question: `Sample high ${label}`,
        slug: `${slug}-${j}`,
        yesToken: `sample-yes-${id}`,
        noToken: `sample-no-${id}`,
        indicative: probabilities[j],
        feeRate: 0.05,
        tradable: true,
        rules:
          "Illustrative whole-degree Fahrenheit daily-high ladder; not a real contract.",
        resolutionSource: "",
        yesBook: book("yes", probabilities[j]),
        noBook: book("no", 1 - probabilities[j] + 0.02),
      };
    });
    const forecast: WeatherForecast = {
      high,
      daytimeHigh: high,
      hourlyHigh: high,
      completeDay: true,
      hours: Array.from(
        {
          length:
            (localMidnight(addDays(date, 1), city.timezone) -
              localMidnight(date, city.timezone)) /
            3600000,
        },
        (_, h) => ({
          start: new Date(
            localMidnight(date, city.timezone) + h * 3600000,
          ).toISOString(),
          end: new Date(
            localMidnight(date, city.timezone) + (h + 1) * 3600000,
          ).toISOString(),
          fahrenheit:
            high - 10 + 10 * Math.max(0, Math.cos(((h - 15) * Math.PI) / 12)),
          summary: "Illustrative forecast",
        }),
      ),
      updatedAt: stamp,
      fetchedAt: stamp,
      hourlyUrl: "",
      forecastUrl: "",
      stationUrl: "",
      summary: "Illustrative forecast; no NOAA or Polymarket requests.",
      warnings: [],
    };
    return {
      city,
      date,
      forecast,
      event: {
        id: `sample-event-${i}`,
        slug,
        title: `Sample highest temperature in ${city.name}`,
        date,
        rules: contracts[0].rules,
        resolutionSource: "",
        active: true,
        negRisk: true,
        augmented: false,
        contracts,
        fetchedAt: stamp,
        url: "",
      },
      buckets: labels.map((l, j) => parseBucket(l, contracts[j].id)!),
      rulesVerified: true,
      partitionComplete: true,
      warnings: [
        "All forecasts, prices, liquidity and arbitrage examples in this sample are fictional.",
      ],
    };
  });
  return {
    mode: "demo",
    date,
    fetchedAt: stamp,
    rows,
    warnings: [
      "Illustrative weather desk. No real wagering opportunity is represented.",
    ],
  };
}
