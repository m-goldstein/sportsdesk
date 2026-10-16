"use client";
import { useEffect, useState } from "react";
import { ArrowDownToLine, BarChart3, RefreshCw, Trophy } from "lucide-react";
import { buildRankings, RankingFeed } from "@/lib/rankings";
import { ElectionReport } from "@/lib/election-types";
import {
  ELECTION_REPORTS_KEY,
  parseElectionReports,
} from "@/lib/election-storage";
import { download } from "@/lib/download";
import { Empty, ExternalLink, pct, when } from "./ui";
export function OutcomeRankings({
  mode,
  date,
  onNavigate,
}: {
  mode: "live" | "demo";
  date: string;
  onNavigate: (view: string) => void;
}) {
  const [feed, setFeed] = useState<RankingFeed | null>(null),
    [loading, setLoading] = useState(false),
    [error, setError] = useState(""),
    [retry, setRetry] = useState(0),
    [basis, setBasis] = useState<"market" | "model">("market"),
    [domain, setDomain] = useState("All domains"),
    [one, setOne] = useState(true),
    [limit, setLimit] = useState(10),
    [reports, setReports] = useState<ElectionReport[]>([]),
    [now, setNow] = useState(Date.now());
  useEffect(() => {
    try {
      setReports(
        parseElectionReports(
          JSON.parse(localStorage.getItem(ELECTION_REPORTS_KEY) ?? "[]"),
        ),
      );
    } catch {
      /* Missing device research remains unavailable. */
    }
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setFeed(null);
    setError("");
    fetch(`/api/rankings?mode=${mode}&date=${date}`, {
      signal: controller.signal,
    })
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.error || "Ranking scan failed.");
        return d;
      })
      .then((d) => {
        setFeed(d);
        setNow(Date.now());
      })
      .catch((e) => {
        if (e.name !== "AbortError") setError(e.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [mode, date, retry]);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 5000);
    return () => clearInterval(timer);
  }, []);
  const ranked = feed
      ? buildRankings(feed, reports, basis, domain, one, now)
      : [],
    visible = ranked.slice(0, limit);
  return (
    <div className="market-desk outcome-rankings">
      <section className="market-hero">
        <span className="market-hero-symbol">
          <Trophy size={34} />
        </span>
        <div>
          <span className="eyebrow accent-text">ONE DESK / THREE DOMAINS</span>
          <h2>The strongest outcomes, in one view.</h2>
          <p>
            Sports, daily temperatures and elections. Rank by market consensus
            or independent model estimates.
          </p>
        </div>
        <span className="pill">Top {limit}</span>
      </section>
      <div className="market-controls">
        <label>
          Ranking basis
          <select
            aria-label="Ranking basis"
            value={basis}
            onChange={(e) => setBasis(e.target.value as "market" | "model")}
          >
            <option value="market">Market consensus</option>
            <option value="model">Independent model likelihood</option>
          </select>
        </label>
        <label>
          Domain
          <select
            aria-label="Ranking domain"
            value={domain}
            onChange={(e) => setDomain(e.target.value)}
          >
            <option>All domains</option>
            <option>Sports</option>
            <option>Weather</option>
            <option>Elections</option>
          </select>
        </label>
        <label>
          Show
          <select
            aria-label="Ranking limit"
            value={limit}
            onChange={(e) => setLimit(Number(e.target.value))}
          >
            <option value="10">Top 10</option>
            <option value="20">Top 20</option>
            <option value="100">Top 100</option>
          </select>
        </label>
        <button
          className="secondary"
          disabled={loading}
          onClick={() => setRetry((v) => v + 1)}
        >
          <RefreshCw size={14} className={loading ? "rotating" : ""} />
          {loading ? "Scanning three domains…" : "Refresh rankings"}
        </button>
        <button
          className="secondary"
          disabled={!feed}
          onClick={() =>
            download(
              "oracular-top-outcomes.json",
              JSON.stringify(
                {
                  mode,
                  basis,
                  onePerEvent: one,
                  fetchedAt: feed?.fetchedAt,
                  rankings: visible,
                },
                null,
                2,
              ),
              "application/json",
            )
          }
        >
          <ArrowDownToLine size={14} />
          Export rankings
        </button>
      </div>
      <label className="ranking-dedupe">
        <input
          type="checkbox"
          checked={one}
          onChange={(e) => setOne(e.target.checked)}
        />
        One leading outcome per event
      </label>
      <p className="notice">
        High likelihood is not the same as a profitable trade. Market consensus
        is indicative pricing; independent sports, weather and polling models
        are uncalibrated and not directly comparable confidence scores. The
        table exposes both estimates and price freshness.
      </p>
      {mode === "demo" && (
        <p className="notice">
          Sample rankings: all contracts, prices and forecasts are illustrative.
        </p>
      )}
      {error && (
        <p className="notice error" role="alert">
          {error}
        </p>
      )}
      {feed?.warnings.map((w, i) => (
        <p className="source-note" key={i}>
          {w}
        </p>
      ))}
      <div className="ranking-domain-summary">
        {["Sports", "Weather", "Elections"].map((d) => (
          <button className="panel" key={d} onClick={() => setDomain(d)}>
            <span>{d}</span>
            <strong>
              {feed
                ? buildRankings(feed, reports, basis, d, true, now).length
                : "—"}
            </strong>
            <small>eligible event leaders</small>
          </button>
        ))}
      </div>
      <section className="panel ranking-table-panel">
        <div className="market-section-heading">
          <div>
            <span className="eyebrow accent-text">
              HIGHEST TO LOWEST /{" "}
              {basis === "market" ? "MARKET CONSENSUS" : "MODEL ESTIMATE"}
            </span>
            <h2>Top outcomes</h2>
            <p>
              {ranked.length} eligible outcomes · {visible.length} shown
              {feed
                ? ` · Scanned ${when(feed.fetchedAt, { hour: "numeric", minute: "2-digit", timeZoneName: "short" })}`
                : ""}
            </p>
          </div>
          <BarChart3 size={20} />
        </div>
        {loading ? (
          <div className="market-loading">
            <span className="spinner" />
            <p>
              Matching live contracts, station forecasts and polling coverage…
            </p>
          </div>
        ) : visible.length ? (
          <div className="table-scroll">
            <table className="ranking-table">
              <thead>
                <tr>
                  <th>Rank</th>
                  <th>Event / outcome</th>
                  <th>Ranked likelihood</th>
                  <th>Market ref.</th>
                  <th>Model estimate</th>
                  <th>YES / outcome ask</th>
                  <th>Evidence</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((r, i) => (
                  <tr key={r.id}>
                    <td>
                      <span
                        className={`ranking-place ${i < 3 ? "podium" : ""}`}
                      >
                        {String(i + 1).padStart(2, "0")}
                      </span>
                    </td>
                    <td>
                      <span
                        className={`pill ranking-domain ${r.domain.toLowerCase()}`}
                      >
                        {r.domain} · {r.category}
                      </span>
                      <strong>
                        <ExternalLink href={r.url}>{r.outcome}</ExternalLink>
                      </strong>
                      <small>
                        {r.title} · {r.date.slice(0, 10)}
                      </small>
                    </td>
                    <td>
                      <strong className="ranking-probability">
                        {pct(r[basis], 1)}
                      </strong>
                      <div className="ranking-mini-bar">
                        <i style={{ width: `${(r[basis] ?? 0) * 100}%` }} />
                      </div>
                    </td>
                    <td>
                      {pct(r.market, 1)}
                      <small>Indicative</small>
                    </td>
                    <td>
                      {pct(r.model, 1)}
                      <small>{r.modelLabel}</small>
                    </td>
                    <td>
                      {r.ask === null ? "—" : `${(r.ask * 100).toFixed(1)}¢`}
                      <small>
                        {r.ask === null
                          ? "Unavailable / expired"
                          : "Fresh snapshot · before fees"}
                      </small>
                    </td>
                    <td>
                      <span>{r.evidence}</span>
                      <small>
                        Observed{" "}
                        {when(r.snapshotAt, {
                          hour: "numeric",
                          minute: "2-digit",
                          timeZoneName: "short",
                        })}
                      </small>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty
            title="No eligible outcomes for this ranking"
            text="Missing contracts and evidence are excluded, not assigned confidence. Try market consensus, another domain, a current date or the clearly labeled Sample desk."
          />
        )}
      </section>
      <div className="ranking-links">
        <button
          className="secondary"
          onClick={() => onNavigate("Weather markets")}
        >
          Inspect weather assumptions
        </button>
        <button
          className="secondary"
          onClick={() => onNavigate("Election desk")}
        >
          Research election polling
        </button>
        <button className="secondary" onClick={() => onNavigate("Matchups")}>
          Research sports matchups
        </button>
      </div>
      <p className="section-note">
        Weather uses the next calendar day after the selected sports slate.
        Election contracts have their own election dates. Weather rankings use
        the default 3°F error assumption and no bias; customized weather
        scenarios do not silently change this leaderboard. Election model
        rankings use eligible research saved on this device, with the sentiment
        overlay off. Governor placeholders and “Other” buckets are excluded;
        weather rankings use YES temperature buckets rather than trivial NO tail
        outcomes.
      </p>
    </div>
  );
}
