"use client";
import { Dispatch, SetStateAction, useState } from "react";
import {
  ArrowDownToLine,
  ArrowRight,
  Check,
  RefreshCw,
  Trash2,
} from "lucide-react";
import {
  journalStats,
  Prediction,
  resolvePrediction,
} from "@/lib/decision-lab";
import { slateDate } from "@/lib/dates";
import { Board, Mode } from "@/lib/types";
import { download } from "@/lib/download";
import { Empty, pct, when } from "./ui";
export function PredictionJournal({
  entries,
  setEntries,
  mode,
  onCreate,
}: {
  entries: Prediction[];
  setEntries: Dispatch<SetStateAction<Prediction[]>>;
  mode: Mode;
  onCreate: () => void;
}) {
  const [syncing, setSyncing] = useState(false),
    [message, setMessage] = useState(""),
    [removing, setRemoving] = useState<string | null>(null);
  const [syncOffset, setSyncOffset] = useState(0);
  const visible = entries.filter((e) => e.game.demo === (mode === "demo"));
  const stats = journalStats(visible);
  const sync = async () => {
    setSyncing(true);
    setMessage("");
    const pending = visible.filter((e) => !e.resolution && !e.game.demo);
    const allDates = [
      ...new Set(pending.map((e) => slateDate(e.game.start))),
    ].sort();
    const offset = syncOffset < allDates.length ? syncOffset : 0;
    const dates = allDates.slice(offset, offset + 6);
    setSyncOffset(offset + 6);
    const results = await Promise.allSettled(
      dates.map(async (date) => {
        const response = await fetch(`/api/board?mode=live&date=${date}`, {
          signal: AbortSignal.timeout(20000),
        });
        if (!response.ok) throw new Error("Feed unavailable");
        const data: Board = await response.json();
        if (data.mode !== "live" || !Array.isArray(data.games))
          throw new Error("Invalid feed");
        return data;
      }),
    );
    const boards = results.flatMap((r) =>
      r.status === "fulfilled" ? [r.value] : [],
    );
    const games = boards.flatMap((b) => b.games);
    setEntries((previous) =>
      previous.map((e) => {
        const game = games.find(
          (g) =>
            g.id === e.game.id &&
            g.league === e.game.league &&
            g.start === e.game.start,
        );
        return game ? resolvePrediction(e, game) : e;
      }),
    );
    const failures = results.filter((r) => r.status === "rejected").length;
    const warnings = boards.some((b) => b.warnings.length > 0);
    setMessage(
      dates.length
        ? `Checked ${boards.length} slate dates. Only matching final scores resolve a prediction; ties are void.${failures || warnings ? " Some sports feeds were unavailable; unresolved entries were preserved." : ""}${new Set(pending.map((e) => slateDate(e.game.start))).size > 6 ? " Sync again to check the next batch of dates." : ""}`
        : "No real-game predictions need a result check.",
    );
    setSyncing(false);
  };
  const sampleResolve = (id: string, outcome: 0 | 1 | null) =>
    setEntries((previous) =>
      previous.map((e) =>
        e.id === id && e.game.demo && !e.resolution
          ? {
              ...e,
              resolution: {
                outcome,
                homeScore: outcome === 1 ? 1 : 0,
                awayScore: outcome === 0 ? 1 : 0,
                resolvedAt: new Date().toISOString(),
                source: "sample",
              },
            }
          : e,
      ),
    );
  return (
    <>
      <div className="lab-bracket-heading">
        <div>
          <span className="eyebrow accent-text">
            A TRACK RECORD STARTS WITH A RECORD
          </span>
          <h3>Make your conviction measurable.</h3>
          <p className="lab-description">
            {mode === "demo"
              ? "Sample journal. Practice resolving predictions without mixing them with real games."
              : "Real-game journal. Pregame probabilities freeze; matching final scores settle the outcome."}
          </p>
        </div>
        <div className="lab-thesis-actions">
          <button
            className="secondary"
            onClick={() =>
              download(
                "oracular-prediction-journal.json",
                JSON.stringify(
                  {
                    version: 1,
                    exportedAt: new Date().toISOString(),
                    mode,
                    entries: visible,
                  },
                  null,
                  2,
                ),
                "application/json",
              )
            }
          >
            <ArrowDownToLine size={14} />
            Export journal
          </button>
          {mode === "live" && (
            <button
              className="primary"
              disabled={syncing || !visible.some((e) => !e.resolution)}
              onClick={() => void sync()}
            >
              <RefreshCw size={14} className={syncing ? "rotating" : ""} />
              {syncing ? "Checking results…" : "Sync final scores"}
            </button>
          )}
        </div>
      </div>
      {message && (
        <p className="notice" role="status">
          {message}
        </p>
      )}
      <div className="lab-journal-metrics">
        <div>
          <small>PREDICTIONS LOCKED</small>
          <strong>{visible.length.toString().padStart(2, "0")}</strong>
          <span>
            {visible.filter((e) => !e.resolution).length} awaiting resolution
          </span>
        </div>
        <div>
          <small>SCORED OUTCOMES</small>
          <strong>{stats.settled.toString().padStart(2, "0")}</strong>
          <span>
            {visible.filter((e) => e.resolution?.outcome === null).length} void
            / tied
          </span>
        </div>
        <div>
          <small>YOUR BRIER SCORE</small>
          <strong>{stats.brier?.toFixed(3) ?? "—"}</strong>
          <span>Lower is better · 0 is perfect</span>
        </div>
        <div>
          <small>BASELINE BRIER SCORE</small>
          <strong>{stats.baselineBrier?.toFixed(3) ?? "—"}</strong>
          <span>Same games, original baseline</span>
        </div>
      </div>
      <div className="lab-journal-layout">
        <section className="lab-entry-list">
          {visible.length ? (
            visible.map((e) => (
              <article className="panel lab-entry" key={e.id}>
                <div className="lab-section-heading">
                  <span className="eyebrow">
                    {e.game.league} ·{" "}
                    {e.game.demo ? "SAMPLE" : "PREGAME RECORD"}
                  </span>
                  <span className={`pill ${e.resolution ? "positive" : ""}`}>
                    {e.resolution
                      ? e.resolution.outcome === null
                        ? "Void"
                        : "Resolved"
                      : "Locked"}
                  </span>
                </div>
                <h3>
                  {e.game.away.name} <span className="muted">at</span>{" "}
                  {e.game.home.name}
                </h3>
                <p className="lab-entry-thesis">“{e.thesis}”</p>
                <div className="lab-entry-read">
                  <div>
                    <small>{e.game.home.abbr} PROBABILITY</small>
                    <strong>{pct(e.probability, 1)}</strong>
                  </div>
                  <div>
                    <small>LOCKED AT</small>
                    <span>
                      {when(e.createdAt, {
                        month: "short",
                        day: "numeric",
                        hour: "numeric",
                        minute: "2-digit",
                        timeZoneName: "short",
                      })}
                    </span>
                  </div>
                </div>
                <details className="lab-method">
                  <summary>Frozen assumptions & result</summary>
                  <p>
                    Baseline: {pct(e.baseline, 1)}. Home impact:{" "}
                    {e.scenario.homeImpact}, away impact:{" "}
                    {e.scenario.awayImpact}. Venue:{" "}
                    {e.scenario.neutral ? "neutral" : "home"}. Assumed
                    uncertainty: ±{e.scenario.uncertainty} pp. Source:{" "}
                    {e.game.source?.name ?? "Loaded snapshot"}. Game starts{" "}
                    {when(e.game.start, {
                      month: "short",
                      day: "numeric",
                      hour: "numeric",
                      minute: "2-digit",
                      timeZoneName: "short",
                    })}
                    .
                  </p>
                  {e.resolution && (
                    <p>
                      {e.resolution.source === "sample"
                        ? "Manually simulated sample outcome"
                        : `Final feed score: ${e.game.home.abbr} ${e.resolution.homeScore} – ${e.game.away.abbr} ${e.resolution.awayScore}`}
                      . Outcome:{" "}
                      {e.resolution.outcome === null
                        ? "tie / void"
                        : e.resolution.outcome === 1
                          ? "home win"
                          : "away win"}
                      .{" "}
                      {e.resolution.outcome !== null &&
                        `Brier loss: ${((e.probability - e.resolution.outcome) ** 2).toFixed(3)}.`}
                    </p>
                  )}
                </details>
                {e.game.demo && !e.resolution && (
                  <div className="lab-sample-resolve">
                    <span>Resolve this sample:</span>
                    <button
                      className="secondary"
                      onClick={() => sampleResolve(e.id, 1)}
                    >
                      {e.game.home.abbr} wins
                    </button>
                    <button
                      className="secondary"
                      onClick={() => sampleResolve(e.id, 0)}
                    >
                      {e.game.away.abbr} wins
                    </button>
                    <button
                      className="text-button"
                      onClick={() => sampleResolve(e.id, null)}
                    >
                      Void
                    </button>
                  </div>
                )}
                <div className="lab-entry-footer">
                  <small>
                    <Check size={12} /> Probability frozen at creation
                  </small>
                  {removing === e.id ? (
                    <span>
                      <button
                        className="text-button"
                        onClick={() => {
                          setEntries((prev) =>
                            prev.filter((p) => p.id !== e.id),
                          );
                          setRemoving(null);
                        }}
                      >
                        Confirm removal
                      </button>
                      <button
                        className="text-button"
                        onClick={() => setRemoving(null)}
                      >
                        Cancel
                      </button>
                    </span>
                  ) : (
                    <button
                      className="icon-button"
                      aria-label={`Remove prediction ${e.game.away.abbr} at ${e.game.home.abbr}`}
                      onClick={() => setRemoving(e.id)}
                    >
                      <Trash2 size={13} />
                    </button>
                  )}
                </div>
              </article>
            ))
          ) : (
            <section className="panel">
              <Empty
                title="Your first thesis belongs here"
                text="Set up a matchup scenario, write your reasoning and lock the prediction before the game begins."
                action={
                  <button className="primary" onClick={onCreate}>
                    Create a prediction <ArrowRight size={14} />
                  </button>
                }
              />
            </section>
          )}
        </section>
        <aside className="panel lab-calibration">
          <span className="eyebrow accent-text">CONFIDENCE MEETS REALITY</span>
          <h3>Are your probabilities honest?</h3>
          <p className="lab-description">
            If you call home teams 70% likely, do they win about 70% of the
            time?
          </p>
          <svg
            viewBox="0 0 300 280"
            role="img"
            aria-label={`Calibration plot with ${stats.settled} scored outcomes. Dashed diagonal is perfect calibration.`}
          >
            <path d="M40 20V240H270" fill="none" stroke="#52647d" />
            <path
              d="M40 240L260 20"
              fill="none"
              stroke="#52647d"
              strokeDasharray="5 5"
            />
            {[0.25, 0.5, 0.75, 1].map((v) => (
              <g key={v}>
                <path d={`M40 ${240 - v * 220}H260`} stroke="#293b53" />
                <text x="32" y={244 - v * 220} textAnchor="end">
                  {v * 100}
                </text>
                <text x={40 + v * 220} y="259" textAnchor="middle">
                  {v * 100}
                </text>
              </g>
            ))}
            {stats.bins
              .filter((b) => b.count > 0)
              .map((b) => (
                <circle
                  key={b.start}
                  cx={40 + b.predicted! * 220}
                  cy={240 - b.observed! * 220}
                  r={Math.min(12, 4 + Math.sqrt(b.count))}
                  fill="#55dce9"
                  stroke="#0b1220"
                  strokeWidth="2"
                >
                  <title>
                    {b.count} predictions: {pct(b.predicted, 1)} expected,{" "}
                    {pct(b.observed, 1)} observed
                  </title>
                </circle>
              ))}
            <text x="150" y="278" textAnchor="middle">
              Predicted home win %
            </text>
            <text transform="translate(11 130) rotate(-90)" textAnchor="middle">
              Observed home win %
            </text>
            {!stats.settled && (
              <text x="150" y="120" textAnchor="middle">
                Resolve predictions to plot
              </text>
            )}
          </svg>
          <div className="lab-calibration-bins">
            {stats.bins.map((b) => (
              <div key={b.start}>
                <span>
                  {b.start}–{b.start + 20}%
                </span>
                <span>{b.count} calls</span>
                <strong>{b.count ? `${pct(b.observed, 0)} won` : "—"}</strong>
              </div>
            ))}
          </div>
          <p className="lab-footnote">
            Brier score = mean((home probability − outcome)²). A constant 50%
            forecast scores 0.250. Tiny samples are noisy. These are
            device-local, removable records, not a verified public performance
            claim.{" "}
            {mode === "demo"
              ? "All plotted outcomes are simulated samples."
              : "Only real resolved entries appear in this view."}
          </p>
        </aside>
      </div>
    </>
  );
}
