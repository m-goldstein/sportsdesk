import { buyFill, evaluateBasket, normalCdf, Basket } from "./market-contracts";
import {
  cityDate,
  addDays,
  HourTemperature,
  TemperatureBucket,
  WeatherCity,
  WeatherForecast,
  WeatherRow,
  WeatherSettings,
} from "./weather-types";
// External provider payloads are normalized at this boundary.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Wire = Record<string, any>;
export function localMidnight(date: string, timezone: string) {
  const target = Date.parse(date + "T00:00:00Z");
  let guess = target;
  for (let i = 0; i < 4; i++) {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    }).formatToParts(guess);
    const p = Object.fromEntries(parts.map((x) => [x.type, x.value]));
    const represented = Date.UTC(
      +p.year,
      +p.month - 1,
      +p.day,
      +p.hour,
      +p.minute,
      +p.second,
    );
    guess += target - represented;
  }
  return guess;
}
export function parseBucket(
  label: string,
  contractId = "",
): TemperatureBucket | null {
  const clean = label.trim().replace(/[–−]/g, "-");
  let match: RegExpMatchArray | null;
  if ((match = clean.match(/^(-?\d+)\s*°F\s+or\s+(below|lower)$/i)))
    return { label, low: null, high: Number(match[1]), contractId };
  if ((match = clean.match(/^(-?\d+)\s*°F\s+or\s+(higher|above)$/i)))
    return { label, low: Number(match[1]), high: null, contractId };
  if (
    (match = clean.match(/^(-?\d+)\s*-\s*(-?\d+)\s*°F$/i)) &&
    Number(match[1]) <= Number(match[2])
  )
    return { label, low: Number(match[1]), high: Number(match[2]), contractId };
  if ((match = clean.match(/^(-?\d+)\s*°F$/i)))
    return { label, low: Number(match[1]), high: Number(match[1]), contractId };
  return null;
}
export function completePartition(buckets: TemperatureBucket[]) {
  if (buckets.length < 2) return false;
  const ordered = [...buckets].sort(
    (a, b) => (a.low ?? -Infinity) - (b.low ?? -Infinity),
  );
  return (
    ordered[0].low === null &&
    ordered.at(-1)!.high === null &&
    ordered.every(
      (b, i) =>
        i === 0 ||
        (b.low !== null &&
          ordered[i - 1].high !== null &&
          b.low === ordered[i - 1].high! + 1),
    )
  );
}
export function forecastFromPeriods(
  city: WeatherCity,
  date: string,
  hourly: Wire,
  daily: Wire,
  urls: { hourlyUrl: string; forecastUrl: string; stationUrl: string },
  now = Date.now(),
): WeatherForecast {
  const toF = (p: Wire) =>
    typeof p.temperature !== "number" || !Number.isFinite(p.temperature)
      ? null
      : p.temperatureUnit === "F"
        ? p.temperature
        : p.temperatureUnit === "C"
          ? (p.temperature * 9) / 5 + 32
          : null;
  const hours: HourTemperature[] = (hourly.properties?.periods ?? [])
    .flatMap((p: Wire) => {
      const f = toF(p);
      return f !== null &&
        Number.isFinite(Date.parse(p.startTime)) &&
        Date.parse(p.endTime) > Date.parse(p.startTime) &&
        cityDate(p.startTime, city.timezone) === date
        ? [
            {
              start: p.startTime,
              end: p.endTime,
              fahrenheit: f,
              summary: String(p.shortForecast ?? ""),
            },
          ]
        : [];
    })
    .sort(
      (a: HourTemperature, b: HourTemperature) =>
        Date.parse(a.start) - Date.parse(b.start),
    );
  const day = (daily.properties?.periods ?? []).find(
    (p: Wire) =>
      p.isDaytime &&
      Number.isFinite(Date.parse(p.startTime)) &&
      cityDate(p.startTime, city.timezone) === date,
  );
  const daytimeHigh = day ? toF(day) : null,
    hourlyHigh = hours.length
      ? Math.max(...hours.map((h) => h.fahrenheit))
      : null;
  const values = [daytimeHigh, hourlyHigh].filter(
      (v): v is number => v !== null,
    ),
    high = values.length ? Math.max(...values) : null;
  const start = localMidnight(date, city.timezone),
    end = localMidnight(addDays(date, 1), city.timezone);
  let covered = start;
  for (const h of hours) {
    if (Date.parse(h.start) > covered) break;
    covered = Math.max(covered, Date.parse(h.end));
  }
  const completeDay = covered >= end && hours.length > 0;
  const update =
    hourly.properties?.updateTime ?? hourly.properties?.generatedAt ?? null;
  const warnings: string[] = [];
  if (!completeDay)
    warnings.push(
      "Hourly forecast does not cover the entire local calendar day. Forecast-edge signals are withheld; partial hours are not a daily observed high.",
    );
  if (
    !update ||
    now - Date.parse(update) > 12 * 3600000 ||
    Date.parse(update) > now + 60000
  )
    warnings.push(
      "NOAA issue time is missing, stale or future-dated. Forecast-edge signals are withheld.",
    );
  return {
    high,
    daytimeHigh,
    hourlyHigh,
    completeDay,
    hours,
    updatedAt: update,
    fetchedAt: new Date(now).toISOString(),
    ...urls,
    summary: day?.detailedForecast ?? day?.shortForecast ?? "",
    warnings,
  };
}
export function bucketProbability(
  bucket: TemperatureBucket,
  mean: number,
  sigma: number,
) {
  if (!Number.isFinite(mean) || !Number.isFinite(sigma) || sigma <= 0)
    return null;
  return Math.max(
    0,
    Math.min(
      1,
      normalCdf(
        ((bucket.high === null ? Infinity : bucket.high + 0.5) - mean) / sigma,
      ) -
        normalCdf(
          ((bucket.low === null ? -Infinity : bucket.low - 0.5) - mean) / sigma,
        ),
    ),
  );
}
export function weatherSignals(
  row: WeatherRow,
  settings: WeatherSettings,
  now = Date.now(),
) {
  const f = row.forecast,
    age = f?.updatedAt ? now - Date.parse(f.updatedAt) : Infinity;
  const eligible =
    !!f &&
    f.high !== null &&
    f.completeDay &&
    age >= -60000 &&
    age <= 12 * 3600000 &&
    row.rulesVerified &&
    row.partitionComplete &&
    row.event?.active;
  return row.buckets.map((bucket) => {
    const contract = row.event?.contracts.find(
      (c) => c.id === bucket.contractId,
    );
    const probability = eligible
      ? bucketProbability(bucket, f!.high! + settings.bias, settings.sigma)
      : null;
    const yes =
      contract?.tradable && row.event?.active
        ? buyFill(contract.yesBook, settings.shares, contract.feeRate, now)
        : null;
    const no =
      contract?.tradable && row.event?.active
        ? buyFill(contract.noBook, settings.shares, contract.feeRate, now)
        : null;
    const side = (fill: typeof yes, p: number | null) =>
      fill && p !== null
        ? {
            fill,
            probability: p,
            edge:
              p -
              (fill.cost +
                fill.fee +
                settings.shares * settings.buffer +
                settings.extraCost) /
                settings.shares,
            ev:
              p * settings.shares -
              fill.cost -
              fill.fee -
              settings.shares * settings.buffer -
              settings.extraCost,
          }
        : null;
    return {
      bucket,
      contract,
      probability,
      yes: side(yes, probability),
      no: side(no, probability === null ? null : 1 - probability),
      yesFill: yes,
      noFill: no,
    };
  });
}
export function weatherArbitrage(
  row: WeatherRow,
  settings: WeatherSettings,
  now = Date.now(),
) {
  const event = row.event;
  if (!event?.active) return [];
  const baskets: Basket[] = [];
  for (const c of event.contracts) {
    if (!c.tradable) continue;
    const y = buyFill(c.yesBook, settings.shares, c.feeRate, now),
      n = buyFill(c.noBook, settings.shares, c.feeRate, now);
    if (y && n) {
      const b = evaluateBasket(
        `pair-${c.id}`,
        `${c.label}: YES + NO`,
        [
          { contract: c.label, side: "YES", fill: y },
          { contract: c.label, side: "NO", fill: n },
        ],
        settings.shares,
        settings.shares,
        settings.buffer,
        settings.extraCost,
      );
      if (b) baskets.push(b);
    }
  }
  if (
    row.rulesVerified &&
    row.partitionComplete &&
    event.negRisk &&
    !event.augmented &&
    event.contracts.length === row.buckets.length
  )
    for (const side of ["YES", "NO"] as const) {
      const legs = event.contracts.flatMap((c) => {
        const fill = c.tradable
          ? buyFill(
              side === "YES" ? c.yesBook : c.noBook,
              settings.shares,
              c.feeRate,
              now,
            )
          : null;
        return fill ? [{ contract: c.label, side, fill }] : [];
      });
      if (legs.length === event.contracts.length) {
        const b = evaluateBasket(
          `ladder-${side}`,
          `Complete ladder: all ${side}`,
          legs,
          settings.shares * (side === "YES" ? 1 : legs.length - 1),
          settings.shares,
          settings.buffer,
          settings.extraCost,
        );
        if (b) baskets.push(b);
      }
    }
  return baskets.sort((a, b) => b.profit - a.profit);
}
