"use client";
import { useEffect, useState } from "react";
import {
  ArrowDownToLine,
  ArrowUpRight,
  Landmark,
  Newspaper,
  RefreshCw,
  Sparkles,
} from "lucide-react";
import { candidateContracts, electionForecast } from "@/lib/election-model";
import { ElectionBoard, ElectionReport } from "@/lib/election-types";
import {
  ELECTION_REPORTS_KEY,
  parseElectionReports,
} from "@/lib/election-storage";
import { canonicalUrl, freshBook } from "@/lib/market-contracts";
import { download } from "@/lib/download";
import { Empty, ExternalLink, pct, when } from "./ui";
export function ElectionDesk({ mode }: { mode: "live" | "demo" }) {
  const [data, setData] = useState<ElectionBoard | null>(null),
    [selected, setSelected] = useState("michigan-governor"),
    [office, setOffice] = useState("All offices"),
    [loading, setLoading] = useState(false),
    [error, setError] = useState(""),
    [retry, setRetry] = useState(0),
    [reports, setReports] = useState<ElectionReport[]>([]),
    [ready, setReady] = useState(false),
    [storageError, setStorageError] = useState(""),
    [researching, setResearching] = useState(false),
    [researchError, setResearchError] = useState(""),
    [sentiment, setSentiment] = useState(false),
    [clock, setClock] = useState(Date.now());
  useEffect(() => {
    try {
      setReports(
        parseElectionReports(
          JSON.parse(localStorage.getItem(ELECTION_REPORTS_KEY) ?? "[]"),
        ),
      );
    } catch {
      setStorageError("Election reports could not be read from this device.");
    }
    setReady(true);
  }, []);
  useEffect(() => {
    if (!ready) return;
    try {
      localStorage.setItem(ELECTION_REPORTS_KEY, JSON.stringify(reports));
    } catch {
      setStorageError(
        "Device storage is unavailable. Export this report to keep it.",
      );
    }
  }, [reports, ready]);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setData(null);
    setError("");
    fetch(`/api/elections?mode=${mode}`, { signal: controller.signal })
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.error || "Election feed failed.");
        return d;
      })
      .then(setData)
      .catch((e) => {
        if (e.name !== "AbortError") setError(e.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [mode, retry]);
  useEffect(() => {
    const timer = setInterval(() => setClock(Date.now()), 5000);
    return () => clearInterval(timer);
  }, []);
  const rows = (data?.rows ?? []).filter(
      (r) => office === "All offices" || r.race.office === office,
    ),
    row = rows.find((r) => r.race.id === selected) ?? rows[0],
    report =
      reports.find((r) => r.raceId === row?.race.id && r.mode === mode) ?? null,
    forecast = row ? electionForecast(row, report, sentiment, clock) : null;
  const run = async () => {
    if (!row) return;
    setResearching(true);
    setResearchError("");
    const raceId = row.race.id;
    try {
      const response = await fetch("/api/elections/analysis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ raceId, mode }),
        signal: AbortSignal.timeout(165000),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Research failed.");
      const parsed = parseElectionReports([result]);
      if (!parsed.length)
        throw new Error("The research report failed validation.");
      setReports((prev) =>
        [
          parsed[0],
          ...prev.filter((r) => r.raceId !== raceId || r.mode !== mode),
        ].slice(0, 30),
      );
    } catch (e) {
      setResearchError(
        e instanceof Error ? e.message : "Election research failed.",
      );
    } finally {
      setResearching(false);
    }
  };
  return (
    <div className="market-desk election-desk">
      <section className="market-hero">
        <span className="market-hero-symbol">
          <Landmark size={34} />
        </span>
        <div>
          <span className="eyebrow accent-text">THE RACE BEHIND THE PRICE</span>
          <h2>Polling. Reporting. A clearer race.</h2>
          <p>
            Track governors and Senate races with live contracts, original
            polling and cited news analysis.
          </p>
        </div>
        <span className="pill">2026 U.S. elections</span>
      </section>
      <div className="market-controls">
        <label>
          Office
          <select
            aria-label="Election office"
            value={office}
            onChange={(e) => setOffice(e.target.value)}
          >
            <option>All offices</option>
            <option>Governor</option>
            <option>Senate</option>
          </select>
        </label>
        <button
          className="secondary"
          disabled={loading}
          onClick={() => setRetry((v) => v + 1)}
        >
          <RefreshCw size={14} className={loading ? "rotating" : ""} />
          {loading ? "Loading live contracts…" : "Refresh election markets"}
        </button>
        <p className="market-control-note">
          Markets load without AI usage. Polling and news research runs only
          when requested.
        </p>
      </div>
      {mode === "demo" && (
        <p className="notice">
          Fictional election demonstration: sample candidates, polls, news and
          prices. No current race prediction is represented.
        </p>
      )}
      {error && (
        <p className="notice error" role="alert">
          {error}
        </p>
      )}
      {storageError && <p className="notice error">{storageError}</p>}
      {loading && !data && (
        <section className="panel market-loading">
          <span className="spinner" />
          <h3>Finding exact general-election contracts…</h3>
          <p>Primary, nomination and margin markets remain separate.</p>
        </section>
      )}
      <div className="election-layout">
        <aside className="panel election-race-list">
          <span className="eyebrow">RACES TO RESEARCH</span>
          {rows.map((r) => {
            const candidates = candidateContracts(r),
              leader = [...candidates].sort(
                (a, b) => (b.indicative ?? 0) - (a.indicative ?? 0),
              )[0];
            return (
              <button
                className={r.race.id === row?.race.id ? "selected" : ""}
                key={r.race.id}
                onClick={() => {
                  setSelected(r.race.id);
                  setResearchError("");
                }}
              >
                <span>
                  {r.race.state}
                  <small>{r.race.office} · Nov 3, 2026</small>
                </span>
                <strong>
                  {pct(leader?.indicative ?? null, 0)}
                  <small>market leader</small>
                </strong>
              </button>
            );
          })}
        </aside>
        {row ? (
          <div className="election-content">
            <section className="panel election-overview">
              <div className="market-section-heading">
                <div>
                  <span className="eyebrow accent-text">
                    {row.race.state.toUpperCase()} /{" "}
                    {row.race.office.toUpperCase()}
                  </span>
                  <h2>
                    {row.race.state} {row.race.office}
                  </h2>
                  <p>
                    General election · {row.race.date} ·{" "}
                    {candidateContracts(row).length} named contract outcomes
                  </p>
                </div>
                {row.event?.url && (
                  <a
                    className="secondary"
                    href={row.event.url}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Live Polymarket <ArrowUpRight size={14} />
                  </a>
                )}
              </div>
              {row.event ? (
                <>
                  <div className="election-candidate-grid">
                    {candidateContracts(row).map((c) => {
                      const model = forecast?.candidates.find(
                          (x) => x.contract.id === c.id,
                        ),
                        book = c.yesBook,
                        ask = freshBook(book, clock)
                          ? book!.asks[0]?.price
                          : null;
                      return (
                        <article className="election-candidate" key={c.id}>
                          <span className="eyebrow">
                            CANDIDATE / PARTY CONTRACT
                          </span>
                          <h3>{c.label}</h3>
                          <div>
                            <strong>
                              {pct(model?.probability ?? null, 1)}
                            </strong>
                            <span>polling-model win estimate</span>
                          </div>
                          <div className="election-prob-bar">
                            <span
                              style={{
                                width: `${(model?.probability ?? 0) * 100}%`,
                              }}
                            />
                          </div>
                          <p>
                            Market reference <b>{pct(c.indicative, 1)}</b>
                            <br />
                            Live YES ask{" "}
                            <b>
                              {ask
                                ? `${(ask * 100).toFixed(1)}¢`
                                : "Unavailable / stale"}
                            </b>
                          </p>
                          {model && (
                            <small>
                              Weighted poll share {model.share.toFixed(1)}% ·
                              media tone {model.sentiment.toFixed(2)}
                            </small>
                          )}
                        </article>
                      );
                    })}
                  </div>
                  <details className="market-rules">
                    <summary>Settlement rules & candidate replacements</summary>
                    <p>{row.event.rules}</p>
                  </details>
                </>
              ) : (
                <Empty
                  title="No matching general-election market"
                  text="The exact race contract is unavailable. No primary or nomination market is substituted."
                />
              )}
              {row.warnings.map((w, i) => (
                <p className="source-note" key={i}>
                  {w}
                </p>
              ))}
            </section>
            <section className="panel election-research">
              <div className="market-section-heading">
                <div>
                  <span className="eyebrow accent-text">
                    CITED RESEARCH / ON DEMAND
                  </span>
                  <h2>Read beyond the horse race.</h2>
                  <p>
                    Find original polls and recent reporting. News tone is
                    interpreted separately from vote intention.
                  </p>
                </div>
                <button
                  className="primary"
                  disabled={
                    researching || !ready || !row.event || !data?.configured
                  }
                  onClick={() => void run()}
                >
                  <Sparkles size={14} />
                  {researching
                    ? "Researching polls & news…"
                    : mode === "demo"
                      ? "Generate sample election research"
                      : "Research polls & news"}
                </button>
              </div>
              {!data?.configured && mode === "live" && (
                <p className="notice">
                  Add OPENAI_API_KEY to enable cited research. Live contract
                  tracking works without it.
                </p>
              )}
              {researching && (
                <p className="notice" role="status">
                  <span className="spinner" /> Searching original polling
                  releases and dated news. This can take up to two minutes; no
                  forecast is invented while evidence is missing.
                </p>
              )}
              {researchError && (
                <p className="notice error" role="alert">
                  {researchError}
                </p>
              )}
              {report ? (
                <>
                  <div className="election-report-heading">
                    <span className="pill">{report.model}</span>
                    <span>
                      {when(report.generatedAt, {
                        month: "short",
                        day: "numeric",
                        hour: "numeric",
                        minute: "2-digit",
                        timeZoneName: "short",
                      })}
                    </span>
                    <button
                      className="text-button"
                      onClick={() =>
                        download(
                          `oracular-${row.race.id}-research.json`,
                          JSON.stringify({ row, report, forecast }, null, 2),
                          "application/json",
                        )
                      }
                    >
                      <ArrowDownToLine size={13} />
                      Export election research
                    </button>
                  </div>
                  <p className="election-summary">
                    {
                      <CitedText
                        text={report.summary}
                        sources={report.sources}
                      />
                    }
                  </p>
                  <label className="election-sentiment-toggle">
                    <input
                      type="checkbox"
                      aria-label="Exploratory sentiment overlay"
                      checked={sentiment}
                      onChange={(e) => setSentiment(e.target.checked)}
                    />
                    Include exploratory media-tone overlay (at most ±1
                    vote-share point per candidate)
                  </label>
                  <p className="section-note">
                    The default model uses polling only. The optional tone
                    overlay is experimental, not a measured shift in voters.
                    Reports older than 48 hours are excluded from live
                    forecasts; refresh the research to update evidence.
                  </p>
                  {forecast ? (
                    <div className="election-model-read">
                      <strong>{forecast.candidates[0].contract.label}</strong>
                      <span>
                        leads this conditional-field polling baseline at{" "}
                        {pct(forecast.candidates[0].probability, 1)}.
                      </span>
                      <small>
                        {forecast.pollCount} distinct pollsters ·{" "}
                        {forecast.errorSd.toFixed(2)} pp candidate error SD ·
                        6,000 reproducible simulations
                      </small>
                    </div>
                  ) : (
                    <p className="notice">
                      No supported winner forecast: at least two distinct recent
                      pollsters must cover every named candidate contract.
                      Expired reports, missing candidates and voting-day races
                      are excluded.
                    </p>
                  )}
                  <h3 className="election-subheading">Polling evidence</h3>
                  {report.polls.length ? (
                    <div className="table-scroll">
                      <table className="election-poll-table">
                        <thead>
                          <tr>
                            <th>Pollster / original report</th>
                            <th>Fieldwork</th>
                            <th>Sample</th>
                            {candidateContracts(row).map((c) => (
                              <th key={c.id}>{c.label}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {report.polls.map((p, i) => (
                            <tr key={i}>
                              <td>
                                <ExternalLink href={p.sourceUrl}>
                                  {p.pollster}
                                </ExternalLink>
                                <small>{p.sponsor}</small>
                                <details>
                                  <summary>Method</summary>
                                  <p>{p.methodology}</p>
                                </details>
                              </td>
                              <td>
                                {p.fieldStart}
                                <small>through {p.fieldEnd}</small>
                              </td>
                              <td>
                                {p.sampleSize}
                                <small>{p.population}</small>
                              </td>
                              {candidateContracts(row).map((c) => (
                                <td key={c.id}>
                                  {p.results.find((r) => r.contractId === c.id)
                                    ?.percent ?? "—"}
                                  %
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <p className="section-note">
                      No source-linked polls passed the coverage, population,
                      date and provenance checks.
                    </p>
                  )}
                  <h3 className="election-subheading">
                    <Newspaper size={16} /> News & coverage tone
                  </h3>
                  {report.news.length ? (
                    <div className="election-news-grid">
                      {report.news.map((n, i) => (
                        <article key={i}>
                          <span className="eyebrow">
                            {n.publishedAt.slice(0, 10)}
                          </span>
                          <h3>
                            <ExternalLink href={n.sourceUrl}>
                              {n.title}
                            </ExternalLink>
                          </h3>
                          <p>{n.summary}</p>
                          {n.candidateSentiment.map((s, j) => (
                            <div className="election-tone" key={j}>
                              <span
                                className={`pill ${s.score > 0 ? "positive" : ""}`}
                              >
                                {
                                  candidateContracts(row).find(
                                    (c) => c.id === s.contractId,
                                  )?.label
                                }{" "}
                                · {s.tone}
                              </span>
                              <small>{s.explanation}</small>
                            </div>
                          ))}
                        </article>
                      ))}
                    </div>
                  ) : (
                    <p className="section-note">
                      No dated news items passed the evidence checks.
                    </p>
                  )}
                  <div className="election-evidence-gaps">
                    <h3>What could change this view</h3>
                    {[
                      ...report.risks,
                      ...report.missingEvidence,
                      ...report.validationWarnings,
                    ].map((s, i) => (
                      <p key={i}>
                        <CitedText text={s} sources={report.sources} />
                      </p>
                    ))}
                  </div>
                  <details className="market-rules">
                    <summary>Source register & evidence fingerprint</summary>
                    {report.sources.map((s, i) => (
                      <p key={i}>
                        <ExternalLink href={s.url}>
                          {s.title || s.url}
                        </ExternalLink>
                      </p>
                    ))}
                    <p>SHA-256: {report.hash}</p>
                    <p>
                      Source/date checks establish provenance, not independent
                      verification of every extracted claim. News tone is model
                      interpretation. Review the linked original reports.
                    </p>
                  </details>
                </>
              ) : (
                <Empty
                  title="Start with evidence, then a forecast"
                  text="Run research to assemble dated polls, reporting, source links, uncertainties and candidate coverage. No AI call occurs until you request it."
                />
              )}
            </section>
            <section className="panel election-method">
              <h3>How the winner baseline works</h3>
              <p>
                Latest survey per pollster; 14-day exponential recency
                weighting; sample-size influence capped at 3,000; likely voters
                weighted above registered voters. Survey samples do not
                eliminate a 3.5-point candidate-level error floor. Simulations
                add independent candidate errors and count who leads.
                Probabilities are conditional on the listed field and are
                uncalibrated. Undecided voters, turnout, correlated polling
                error and omitted candidates remain risks. Polling win
                likelihood and market price are independent estimates.
              </p>
            </section>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function CitedText({
  text,
  sources,
}: {
  text: string;
  sources: { url: string; title: string }[];
}) {
  const allowed = new Set(sources.map((s) => canonicalUrl(s.url)));
  const segments = text.split(/(\[[^\]]{1,200}\]\(https:\/\/[^\s)]+\))/g);
  return (
    <>
      {segments.map((segment, i) => {
        const match = segment.match(/^\[([^\]]+)\]\((https:\/\/[^\s)]+)\)$/);
        if (!match) return <span key={i}>{segment}</span>;
        const url = canonicalUrl(match[2]);
        return url && allowed.has(url) ? (
          <ExternalLink key={i} href={url}>
            {match[1]}
          </ExternalLink>
        ) : (
          <span key={i}>{match[1]}</span>
        );
      })}
    </>
  );
}
