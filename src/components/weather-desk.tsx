"use client";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowDownToLine,
  ArrowUpRight,
  CloudSun,
  RefreshCw,
  ShieldCheck,
  Thermometer,
  Wallet,
} from "lucide-react";
import { buyFill, freshBook } from "@/lib/market-contracts";
import { weatherArbitrage, weatherSignals } from "@/lib/weather-model";
import {
  addDays,
  DEFAULT_WEATHER_SETTINGS,
  WEATHER_CITIES,
  WeatherBoard,
  WeatherRow,
  WeatherSettings,
} from "@/lib/weather-types";
import { download } from "@/lib/download";
import { Empty, ExternalLink, pct, when } from "./ui";
type PaperWager = {
  id: string;
  mode: "live" | "demo";
  city: string;
  date: string;
  label: string;
  side: "YES" | "NO";
  shares: number;
  cost: number;
  probability: number | null;
  createdAt: string;
  url: string;
};
export function WeatherDesk({
  mode,
  initialDate,
}: {
  mode: "live" | "demo";
  initialDate: string;
}) {
  const [date, setDate] = useState(() => addDays(initialDate, 1)),
    [city, setCity] = useState("all"),
    [data, setData] = useState<WeatherBoard | null>(null),
    [loading, setLoading] = useState(false),
    [error, setError] = useState(""),
    [retry, setRetry] = useState(0),
    [selected, setSelected] = useState(WEATHER_CITIES[0].id as string);
  const [settings, setSettings] = useState<WeatherSettings>(
      DEFAULT_WEATHER_SETTINGS,
    ),
    [now, setNow] = useState(Date.now()),
    [wagers, setWagers] = useState<PaperWager[]>([]),
    [storageReady, setStorageReady] = useState(false),
    [storageError, setStorageError] = useState(""),
    [notice, setNotice] = useState("");
  useEffect(() => {
    try {
      const saved = JSON.parse(
        localStorage.getItem("sportsdesk.weather-wagers.v1") ?? "[]",
      );
      if (Array.isArray(saved))
        setWagers(
          saved
            .filter(
              (w) =>
                typeof w.id === "string" &&
                ["live", "demo"].includes(w.mode) &&
                typeof w.city === "string" &&
                typeof w.label === "string" &&
                ["YES", "NO"].includes(w.side) &&
                Number.isFinite(w.shares) &&
                Number.isFinite(w.cost) &&
                typeof w.createdAt === "string",
            )
            .slice(0, 200),
        );
    } catch {
      setStorageError("Paper wagers could not be read from this device.");
    }
    setStorageReady(true);
  }, []);
  useEffect(() => {
    if (!storageReady) return;
    try {
      localStorage.setItem(
        "sportsdesk.weather-wagers.v1",
        JSON.stringify(wagers),
      );
    } catch {
      setStorageError(
        "Device storage is unavailable. Export your paper wagers to keep them.",
      );
    }
  }, [wagers, storageReady]);
  useEffect(() => {
    let current: AbortController | null = null,
      active = true,
      running = false;
    setData(null);
    setError("");
    const load = async () => {
      if (running) return;
      running = true;
      current = new AbortController();
      setLoading(true);
      try {
        const response = await fetch(
          `/api/weather?mode=${mode}&date=${date}&city=${city}`,
          { signal: current.signal },
        );
        const result = await response.json();
        if (!response.ok)
          throw new Error(result.error || "Weather scan failed.");
        if (active) {
          setData(result);
          setError("");
          setNow(Date.now());
        }
      } catch (e) {
        if (active && !(e instanceof Error && e.name === "AbortError"))
          setError(
            e instanceof Error
              ? e.message
              : "Weather providers are unavailable.",
          );
      } finally {
        running = false;
        if (active) setLoading(false);
      }
    };
    void load();
    const timer = setInterval(() => {
      setNow(Date.now());
      if (document.visibilityState === "visible") void load();
    }, 30000);
    const clock = setInterval(() => setNow(Date.now()), 5000);
    return () => {
      active = false;
      current?.abort();
      clearInterval(timer);
      clearInterval(clock);
    };
  }, [mode, date, city, retry]);
  const rows = data?.rows ?? [],
    row = rows.find((r) => r.city.id === selected) ?? rows[0];
  const allSignals = useMemo(
    () => rows.flatMap((r) => weatherSignals(r, settings, now)),
    [rows, settings, now],
  );
  const baskets = useMemo(
    () =>
      rows.flatMap((r) =>
        weatherArbitrage(r, settings, now).map((b) => ({
          ...b,
          city: r.city.name,
        })),
      ),
    [rows, settings, now],
  );
  const record = (r: WeatherRow, contractId: string, side: "YES" | "NO") => {
    const signal = weatherSignals(r, settings, Date.now()).find(
        (s) => s.contract?.id === contractId,
      ),
      c = signal?.contract;
    if (!signal || !c?.tradable) return;
    const fill = buyFill(
      side === "YES" ? c.yesBook : c.noBook,
      settings.shares,
      c.feeRate,
    );
    if (!fill) {
      setNotice(
        "The quote expired or cannot fill this size. Refresh before recording.",
      );
      return;
    }
    setWagers((prev) =>
      [
        {
          id: crypto.randomUUID(),
          mode,
          city: r.city.name,
          date: r.date,
          label: c.label,
          side,
          shares: settings.shares,
          cost:
            fill.cost +
            fill.fee +
            settings.shares * settings.buffer +
            settings.extraCost,
          probability:
            signal.probability === null
              ? null
              : side === "YES"
                ? signal.probability
                : 1 - signal.probability,
          createdAt: new Date().toISOString(),
          url: r.event?.url ?? "",
        },
        ...prev,
      ].slice(0, 200),
    );
    setNotice("Paper wager recorded on this device. No order was sent.");
  };
  const visibleWagers = wagers.filter((w) => w.mode === mode);
  return (
    <div className="market-desk weather-desk">
      <section className="market-hero">
        <span className="market-hero-symbol">
          <CloudSun size={34} />
        </span>
        <div>
          <span className="eyebrow accent-text">NOAA × POLYMARKET</span>
          <h2>The forecast has a market.</h2>
          <p>
            Daily highs at the settlement station. Live order books. Every
            assumption exposed.
          </p>
        </div>
        <span className="pill">
          {mode === "demo" ? "Illustrative sample" : "Public live feeds"}
        </span>
      </section>
      <div className="market-controls">
        <label>
          Observation date
          <input
            type="date"
            aria-label="Weather observation date"
            value={date}
            onChange={(e) => {
              if (e.target.value) setDate(e.target.value);
            }}
          />
        </label>
        <label>
          City
          <select
            aria-label="Weather city"
            value={city}
            onChange={(e) => setCity(e.target.value)}
          >
            <option value="all">All nine cities</option>
            {WEATHER_CITIES.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <button
          className="secondary"
          disabled={loading}
          onClick={() => setRetry((v) => v + 1)}
        >
          <RefreshCw size={14} className={loading ? "rotating" : ""} />
          {loading ? "Scanning stations & books…" : "Refresh weather scan"}
        </button>
        <button
          className="secondary"
          disabled={!data}
          onClick={() =>
            download(
              "oracular-weather-scan.json",
              JSON.stringify(
                {
                  data,
                  settings,
                  signals: allSignals.map((s) => ({
                    bucket: s.bucket,
                    probability: s.probability,
                    yes: s.yes,
                    no: s.no,
                  })),
                  baskets,
                },
                null,
                2,
              ),
              "application/json",
            )
          }
        >
          <ArrowDownToLine size={14} />
          Export scan
        </button>
      </div>
      {mode === "demo" && (
        <p className="notice">
          Sample weather desk: all forecasts, prices, depth and opportunities
          are fictional.
        </p>
      )}
      {error && (
        <p role="alert" className="notice error">
          {error} <button onClick={() => setRetry((v) => v + 1)}>Retry</button>
        </p>
      )}
      {storageError && <p className="notice error">{storageError}</p>}
      {notice && (
        <p className="notice" role="status">
          {notice}
        </p>
      )}
      <div className="market-metrics">
        <div>
          <small>STATIONS COVERED</small>
          <strong>
            {rows.filter((r) => r.forecast?.high !== null && r.forecast).length}{" "}
            / {rows.length || 9}
          </strong>
          <span>Airport coordinates from NOAA</span>
        </div>
        <div>
          <small>MATCHED DAILY-HIGH EVENTS</small>
          <strong>{rows.filter((r) => r.rulesVerified).length}</strong>
          <span>Exact date, station, source and units</span>
        </div>
        <div>
          <small>POSITIVE FORECAST EDGES</small>
          <strong>
            {
              allSignals.filter(
                (s) => (s.yes?.edge ?? -1) > 0.03 || (s.no?.edge ?? -1) > 0.03,
              ).length
            }
          </strong>
          <span>Assumed model · after costs · ≥3 pp</span>
        </div>
        <div>
          <small>ARBITRAGE CANDIDATES</small>
          <strong>{baskets.filter((b) => b.profit > 0.01).length}</strong>
          <span>Depth, fees & execution buffer included</span>
        </div>
      </div>
      <details className="panel market-assumptions" open>
        <summary>Forecast & execution assumptions</summary>
        <div className="market-settings">
          <label>
            Forecast error σ (°F)
            <input
              aria-label="Weather forecast error"
              type="number"
              min="1"
              max="10"
              step=".5"
              value={settings.sigma}
              onChange={(e) =>
                setSettings((p) => ({
                  ...p,
                  sigma: Math.max(1, Math.min(10, Number(e.target.value) || 1)),
                }))
              }
            />
          </label>
          <label>
            Forecast bias (°F)
            <input
              aria-label="Weather forecast bias"
              type="number"
              min="-8"
              max="8"
              step=".5"
              value={settings.bias}
              onChange={(e) =>
                setSettings((p) => ({
                  ...p,
                  bias: Math.max(-8, Math.min(8, Number(e.target.value))),
                }))
              }
            />
          </label>
          <label>
            Shares per outcome
            <input
              aria-label="Weather shares"
              type="number"
              min="1"
              max="10000"
              value={settings.shares}
              onChange={(e) =>
                setSettings((p) => ({
                  ...p,
                  shares: Math.max(
                    1,
                    Math.min(10000, Number(e.target.value) || 1),
                  ),
                }))
              }
            />
          </label>
          <label>
            Buffer per leg (¢/share)
            <input
              aria-label="Weather slippage buffer"
              type="number"
              min="0"
              max="10"
              step=".1"
              value={settings.buffer * 100}
              onChange={(e) =>
                setSettings((p) => ({
                  ...p,
                  buffer: Math.max(
                    0,
                    Math.min(0.1, Number(e.target.value) / 100),
                  ),
                }))
              }
            />
          </label>
          <label>
            Extra execution cost ($)
            <input
              aria-label="Weather extra execution cost"
              type="number"
              min="0"
              max="100"
              step=".01"
              value={settings.extraCost}
              onChange={(e) =>
                setSettings((p) => ({
                  ...p,
                  extraCost: Math.max(0, Math.min(100, Number(e.target.value))),
                }))
              }
            />
          </label>
        </div>
        <p>
          NOAA supplies a point forecast, not these probabilities. The
          experimental normal error model uses your σ and bias; it is not fitted
          or calibrated. Whole-degree buckets use half-degree boundaries.
          Same-day partial forecast coverage suppresses forecast edges. Book
          snapshots expire after 90 seconds.
        </p>
      </details>
      {loading && !data && (
        <section className="panel market-loading">
          <span className="spinner" />
          <h3>Matching forecasts to settlement stations…</h3>
          <p>
            Resolving NOAA grids, exact event dates and live outcome liquidity.
          </p>
        </section>
      )}
      {!!rows.length && (
        <>
          <div className="weather-city-grid">
            {rows.map((r) => (
              <button
                key={r.city.id}
                className={`panel weather-city ${row?.city.id === r.city.id ? "selected" : ""}`}
                onClick={() => setSelected(r.city.id)}
              >
                <span className="weather-city-name">
                  {r.city.name}
                  <small>{r.city.station}</small>
                </span>
                <strong>
                  {r.forecast?.high !== null && r.forecast ? (
                    `${r.forecast.high.toFixed(0)}°`
                  ) : (
                    <span>—</span>
                  )}
                  <small>forecast high °F</small>
                </strong>
                <span className="weather-city-meta">
                  <span className={r.rulesVerified ? "accent-text" : "muted"}>
                    <ShieldCheck size={11} />
                    {r.rulesVerified
                      ? "Rules matched"
                      : r.event
                        ? "Rules unverified"
                        : "No exact event"}
                  </span>
                  <small>
                    {r.forecast?.completeDay
                      ? "Full local-day forecast"
                      : "Partial / missing hours"}
                  </small>
                </span>
              </button>
            ))}
          </div>
          {row && (
            <section className="panel weather-detail">
              <div className="market-section-heading">
                <div>
                  <span className="eyebrow accent-text">
                    {row.city.station} / {row.city.timezone}
                  </span>
                  <h2>
                    {row.city.name} · {row.date}
                  </h2>
                  <p>
                    {row.city.airport} ·{" "}
                    {row.forecast?.summary ||
                      "No forecast narrative available."}
                  </p>
                </div>
                {row.event?.url && (
                  <a
                    className="secondary"
                    href={row.event.url}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Open live contracts <ArrowUpRight size={14} />
                  </a>
                )}
              </div>
              {row.forecast && (
                <>
                  <div className="weather-forecast-strip">
                    <div>
                      <Thermometer size={18} />
                      <strong>{row.forecast.high?.toFixed(1) ?? "—"}°F</strong>
                      <span>Projected calendar high</span>
                    </div>
                    <p>
                      Daytime guidance: {row.forecast.daytimeHigh ?? "—"}°F ·
                      Hourly forecast peak: {row.forecast.hourlyHigh ?? "—"}°F
                      <br />
                      Issued{" "}
                      {row.forecast.updatedAt
                        ? when(row.forecast.updatedAt, {
                            month: "short",
                            day: "numeric",
                            hour: "numeric",
                            minute: "2-digit",
                            timeZoneName: "short",
                          })
                        : "unknown"}{" "}
                      · {row.forecast.hours.length} hourly periods
                    </p>
                  </div>
                  <WeatherCurve row={row} />
                  <div className="market-source-links">
                    <ExternalLink href={row.forecast.hourlyUrl}>
                      NOAA hourly forecast
                    </ExternalLink>
                    <ExternalLink href={row.forecast.forecastUrl}>
                      NOAA daytime forecast
                    </ExternalLink>
                    <ExternalLink
                      href={
                        row.event?.resolutionSource || row.forecast.stationUrl
                      }
                    >
                      Settlement station
                    </ExternalLink>
                  </div>
                </>
              )}
              {[...row.warnings, ...(row.forecast?.warnings ?? [])].map(
                (w, i) => (
                  <p className="source-note" key={i}>
                    {w}
                  </p>
                ),
              )}
              {row.buckets.length ? (
                <div className="table-scroll">
                  <table className="weather-contract-table">
                    <thead>
                      <tr>
                        <th>High temperature</th>
                        <th>Model YES</th>
                        <th>Market ref.</th>
                        <th>YES ask / costs</th>
                        <th>NO ask / costs</th>
                        <th>Best model edge</th>
                        <th>Paper ticket</th>
                      </tr>
                    </thead>
                    <tbody>
                      {weatherSignals(row, settings, now).map((s) => {
                        const best = Math.max(
                          s.yes?.edge ?? -Infinity,
                          s.no?.edge ?? -Infinity,
                        );
                        return (
                          <tr key={s.bucket.contractId}>
                            <td>
                              <strong>{s.bucket.label}</strong>
                              <small>
                                {s.contract?.feeRate === null
                                  ? "Fee schedule unavailable"
                                  : `Taker rate ${((s.contract?.feeRate ?? 0) * 100).toFixed(1)}% × p(1−p)`}
                              </small>
                            </td>
                            <td className="accent-text">
                              {pct(s.probability, 1)}
                            </td>
                            <td>
                              {pct(s.contract?.indicative ?? null, 1)}
                              <small>Indicative, not ask</small>
                            </td>
                            <td>
                              {s.yesFill
                                ? `${(s.yesFill.average * 100).toFixed(1)}¢`
                                : "—"}
                              <small>
                                {s.yesFill
                                  ? `$${(s.yesFill.cost + s.yesFill.fee).toFixed(2)} incl. fees`
                                  : "Stale / no size / no fees"}
                              </small>
                            </td>
                            <td>
                              {s.noFill
                                ? `${(s.noFill.average * 100).toFixed(1)}¢`
                                : "—"}
                              <small>
                                {s.noFill
                                  ? `$${(s.noFill.cost + s.noFill.fee).toFixed(2)} incl. fees`
                                  : "Stale / no size / no fees"}
                              </small>
                            </td>
                            <td className={best > 0.03 ? "accent-text" : ""}>
                              {Number.isFinite(best)
                                ? `${(best * 100).toFixed(1)} pp`
                                : "—"}
                              <small>
                                {s.yes && s.no
                                  ? s.yes.edge >= s.no.edge
                                    ? "YES"
                                    : "NO"
                                  : s.yes
                                    ? "YES"
                                    : s.no
                                      ? "NO"
                                      : "No supported model edge"}
                              </small>
                            </td>
                            <td>
                              <div className="weather-ticket-buttons">
                                <button
                                  className="secondary"
                                  disabled={!storageReady || !s.yesFill}
                                  onClick={() =>
                                    record(row, s.bucket.contractId, "YES")
                                  }
                                >
                                  Paper YES
                                </button>
                                <button
                                  className="secondary"
                                  disabled={!storageReady || !s.noFill}
                                  onClick={() =>
                                    record(row, s.bucket.contractId, "NO")
                                  }
                                >
                                  Paper NO
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <Empty
                  title="No supported daily-high ladder"
                  text="Choose another city or date. Unsupported contracts are never replaced with illustrative prices in live mode."
                />
              )}
              {row.event && (
                <details className="market-rules">
                  <summary>Read exact contract settlement rules</summary>
                  <p>{row.event.rules}</p>
                </details>
              )}
            </section>
          )}
          <section className="panel weather-arbitrage">
            <div className="market-section-heading">
              <div>
                <span className="eyebrow accent-text">
                  STRUCTURAL PRICING / INDEPENDENT OF THE FORECAST
                </span>
                <h2>Arbitrage scanner</h2>
                <p>
                  Buy YES + NO for one contract, or every YES / every NO in a
                  verified complete ladder.
                </p>
              </div>
              <span className="pill">{settings.shares} shares per leg</span>
            </div>
            <p className="section-note">
              A positive locked-payout calculation is a candidate at this
              snapshot, not a guaranteed execution. Legs are not atomic; depth
              can disappear, fills can fail, and settlement can be delayed. Gas
              and other costs must fit your extra-cost budget.
            </p>
            {baskets.filter((b) => b.profit > 0.01).length ? (
              <div className="weather-arb-grid">
                {baskets
                  .filter((b) => b.profit > 0.01)
                  .slice(0, 12)
                  .map((b) => (
                    <article
                      className="weather-arb-card"
                      key={`${b.city}:${b.id}`}
                    >
                      <span className="eyebrow">
                        {b.city} ·{" "}
                        {mode === "demo"
                          ? "FICTIONAL SAMPLE"
                          : "SNAPSHOT CANDIDATE"}
                      </span>
                      <h3>{b.name}</h3>
                      <strong>
                        +${b.profit.toFixed(2)}
                        <small>
                          {(b.roi * 100).toFixed(1)}% return on modeled cost
                        </small>
                      </strong>
                      <p>
                        Cost ${b.cost.toFixed(2)} → payout $
                        {b.payout.toFixed(2)}
                        <br />
                        Fees ${b.fees.toFixed(3)} · buffers $
                        {b.buffer.toFixed(2)} · {b.legs.length} legs
                      </p>
                      <details>
                        <summary>Inspect basket legs</summary>
                        {b.legs.map((leg, i) => (
                          <p key={i}>
                            {leg.contract}: {leg.side} {leg.fill.shares} @{" "}
                            {(leg.fill.average * 100).toFixed(2)}¢
                          </p>
                        ))}
                      </details>
                    </article>
                  ))}
              </div>
            ) : (
              <Empty
                title="No positive supported arbitrage at this size"
                text="This is a valid scan result. Missing books, unknown fees, incomplete ladders, stale timestamps and insufficient depth are excluded."
              />
            )}
          </section>
        </>
      )}
      <section className="panel weather-paper">
        <div className="market-section-heading">
          <div>
            <span className="eyebrow accent-text">PRACTICE THE THESIS</span>
            <h2>Weather paper wagers</h2>
            <p>
              Device-local research tickets. No money moves and no live order is
              submitted.
            </p>
          </div>
          <button
            className="secondary"
            onClick={() =>
              download(
                "oracular-weather-paper-wagers.json",
                JSON.stringify(
                  { version: 1, mode, wagers: visibleWagers },
                  null,
                  2,
                ),
                "application/json",
              )
            }
          >
            <ArrowDownToLine size={14} />
            Export paper wagers
          </button>
        </div>
        {visibleWagers.length ? (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>City / date</th>
                  <th>Contract / side</th>
                  <th>Shares</th>
                  <th>Modeled cost</th>
                  <th>Model at entry</th>
                </tr>
              </thead>
              <tbody>
                {visibleWagers.map((w) => (
                  <tr key={w.id}>
                    <td>
                      {w.city}
                      <small>{w.date}</small>
                    </td>
                    <td>
                      <ExternalLink href={w.url}>
                        {w.label} · {w.side}
                      </ExternalLink>
                    </td>
                    <td>{w.shares}</td>
                    <td>
                      ${w.cost.toFixed(2)}
                      <small>Fees & buffers included</small>
                    </td>
                    <td>{pct(w.probability, 1)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="section-note">
            <Wallet size={14} /> Choose a contract with fresh fillable depth to
            record your first paper wager. Samples stay separate from live
            tickets.
          </p>
        )}
      </section>
    </div>
  );
}
function WeatherCurve({ row }: { row: WeatherRow }) {
  const hours = row.forecast?.hours ?? [];
  if (!hours.length) return null;
  const low = Math.min(...hours.map((h) => h.fahrenheit)) - 2,
    high = Math.max(...hours.map((h) => h.fahrenheit)) + 2;
  const points = hours
    .map(
      (h, i) =>
        `${40 + (i / Math.max(1, hours.length - 1)) * 820},${120 - ((h.fahrenheit - low) / (high - low)) * 95}`,
    )
    .join(" ");
  return (
    <svg
      className="weather-curve"
      viewBox="0 0 900 160"
      role="img"
      aria-label={`${row.city.name} hourly forecast temperatures, not observed temperatures`}
    >
      <path d="M40 130H860" stroke="#293b53" />
      <polyline
        points={points}
        fill="none"
        stroke="#55dce9"
        strokeWidth="3"
        strokeLinejoin="round"
      />
      {[0, Math.floor((hours.length - 1) / 2), hours.length - 1].map((i, n) => (
        <g key={n}>
          <text
            x={40 + (i / Math.max(1, hours.length - 1)) * 820}
            y="151"
            textAnchor={n === 0 ? "start" : n === 2 ? "end" : "middle"}
          >
            {new Date(hours[i].start).toLocaleTimeString("en-US", {
              timeZone: row.city.timezone,
              hour: "numeric",
            })}
          </text>
          <text
            x={40 + (i / Math.max(1, hours.length - 1)) * 820}
            y={110 - ((hours[i].fahrenheit - low) / (high - low)) * 95}
            textAnchor="middle"
          >
            {hours[i].fahrenheit.toFixed(0)}°
          </text>
        </g>
      ))}
    </svg>
  );
}
