"use client";
import { useEffect, useRef, useState } from "react";
import {
  AlertCircle,
  ArrowDownToLine,
  BrainCircuit,
  Check,
  FileSearch,
  Globe2,
  RefreshCw,
  Sparkles,
} from "lucide-react";
import type { AnalysisPacket, AnalysisResult } from "@/lib/analysis-contract";
import type { Game } from "@/lib/types";
import { slateDate } from "@/lib/dates";
import { ExternalLink, pct, when } from "./ui";
import { download } from "@/lib/download";

const labels: Record<string, string> = {
  matchup: "Matchup",
  players: "Players",
  availability: "Availability",
  statistics: "Statistics",
  schedule: "Form & rest",
  news: "News",
  coaching: "Coaching",
  markets: "Markets",
  environment: "Venue & weather",
};
type Preview = {
  packet: AnalysisPacket;
  configured: boolean;
  model: string;
  canAnalyze: boolean;
  disabledReason: string | null;
};
export function GptAnalysis({
  game,
  enabled,
}: {
  game: Game;
  enabled: boolean;
}) {
  const [preview, setPreview] = useState<Preview | null>(null),
    [result, setResult] = useState<AnalysisResult | null>(null);
  const [loading, setLoading] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [stage, setStage] = useState("packet"),
    [retry, setRetry] = useState(0);
  const job = useRef<AbortController | null>(null);
  const date = slateDate(game.start);
  useEffect(() => {
    if (!enabled || preview) return;
    const controller = new AbortController();
    setLoading(true);
    setError("");
    fetch(`/api/analysis?league=${game.league}&id=${game.id}&date=${date}`, {
      signal: controller.signal,
    })
      .then(async (response) => {
        const value = await response.json();
        if (!response.ok) throw new Error(value.error);
        return value as Preview;
      })
      .then(setPreview)
      .catch((error) => {
        if (!controller.signal.aborted)
          setError(
            error.message || "The GPT input packet could not be assembled.",
          );
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
    // A packet is an inspectable snapshot. Generating always reconstructs it on the server.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, game.id, date, retry]);
  useEffect(() => () => job.current?.abort(), []);
  async function run() {
    const controller = new AbortController();
    job.current = controller;
    setBusy(true);
    setError("");
    setStage("packet");
    try {
      const response = await fetch("/api/analysis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ league: game.league, id: game.id, date }),
        signal: controller.signal,
      });
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Analysis could not start.");
      }
      if (!response.body)
        throw new Error("The analysis connection was interrupted.");
      const reader = response.body.getReader(),
        decoder = new TextDecoder();
      let pending = "",
        completed = false;
      try {
        while (true) {
          const { value, done } = await reader.read();
          pending += decoder.decode(value, { stream: !done });
          const lines = pending.split("\n");
          pending = lines.pop() ?? "";
          for (const line of lines) {
            if (!line.trim()) continue;
            const event = JSON.parse(line);
            if (event.type === "stage") setStage(event.stage);
            if (event.type === "error") throw new Error(event.error);
            if (event.type === "result") {
              setResult(event.result);
              completed = true;
            }
          }
          if (done) break;
        }
      } finally {
        reader.releaseLock();
      }
      if (!completed)
        throw new Error(
          "The analysis connection ended before a report was ready. Try again; a completed report may be cached.",
        );
    } catch (error) {
      if (!controller.signal.aborted)
        setError(
          error instanceof Error
            ? error.message
            : "Analysis could not complete.",
        );
    } finally {
      if (!controller.signal.aborted) setBusy(false);
    }
  }
  const packet = result?.packet ?? preview?.packet;
  const judgment = result?.judgment;
  return (
    <section className="gpt-analysis" aria-label="GPT matchup analysis">
      <div className="gpt-hero">
        <span className="gpt-symbol">
          <BrainCircuit size={25} />
        </span>
        <div>
          <div className="eyebrow">EVIDENCE FIRST · GPT RESEARCH</div>
          <h2>A second read on the matchup.</h2>
          <p>
            Players, form, news and coaching—assembled before GPT weighs both
            sides.
          </p>
        </div>
        <button
          className="primary"
          disabled={
            busy || loading || !preview?.configured || !preview?.canAnalyze
          }
          onClick={run}
        >
          {busy ? (
            <span className="spinner" />
          ) : result ? (
            <RefreshCw size={15} />
          ) : (
            <Sparkles size={15} />
          )}
          {busy
            ? "Analyzing matchup…"
            : game.demo
              ? "View sample analysis"
              : result
                ? "Run GPT analysis again"
                : "Analyze matchup with GPT"}
        </button>
      </div>
      <p className="section-note">
        {game.demo
          ? "Sample preview uses illustrative data and makes no OpenAI request."
          : "Runs on demand. Current sports evidence and cited web research feed a separate GPT judgment. Recent reports may be reused for up to five minutes; live score snapshots use a one-minute cache window."}
      </p>
      {preview && !preview.configured && (
        <p className="notice">
          <AlertCircle size={15} />
          Add OPENAI_API_KEY to this deployment and redeploy to enable GPT
          analysis.
        </p>
      )}
      {preview?.disabledReason && (
        <p className="notice">
          <AlertCircle size={15} />
          {preview.disabledReason}
        </p>
      )}
      {loading && (
        <p className="notice" role="status">
          <span className="spinner" />
          Assembling the input packet from sports feeds…
        </p>
      )}
      {busy && (
        <div className="gpt-progress" role="status">
          {[
            {
              key: "packet",
              label: "Assemble sports evidence",
              icon: FileSearch,
            },
            {
              key: "web_research",
              label: "Research news & coaching",
              icon: Globe2,
            },
            {
              key: "judgment",
              label: "Analyze both sides",
              icon: BrainCircuit,
            },
          ].map(({ key, label, icon: Icon }) => (
            <span className={stage === key ? "current" : ""} key={key}>
              <Icon size={16} />
              {label}
              {stage === key && <span className="spinner" />}
            </span>
          ))}
        </div>
      )}
      {error && (
        <p className="notice error" role="alert">
          <AlertCircle size={15} />
          {error}
          {!preview && (
            <button
              onClick={() => {
                setPreview(null);
                setRetry((v) => v + 1);
              }}
            >
              Retry packet
            </button>
          )}
        </p>
      )}
      {packet && (
        <div className="gpt-coverage">
          {packet.coverage.map((c) => (
            <span
              className={`pill ${c.count ? "positive" : ""}`}
              key={c.category}
            >
              {c.count ? <Check size={10} /> : <AlertCircle size={10} />}
              {labels[c.category]}
              <b>{c.count || "Missing"}</b>
            </span>
          ))}
        </div>
      )}
      {judgment && result && (
        <>
          <div className="gpt-verdict research-block">
            <div>
              <div className="eyebrow">
                {result.mode === "sample"
                  ? "ILLUSTRATIVE REPORT · NOT GENERATED BY GPT"
                  : "GPT MATCHUP JUDGMENT"}
              </div>
              <h2>
                {judgment.decision === "no_lean"
                  ? "No supported lean"
                  : `${judgment.decision === "lean_home" ? game.home.name : game.away.name} lean`}
              </h2>
              <p>{judgment.summary}</p>
            </div>
            <div className="gpt-probability">
              <strong>
                {pct(
                  judgment.homeWinProbability === null
                    ? null
                    : judgment.decision === "lean_away"
                      ? 1 - judgment.homeWinProbability
                      : judgment.homeWinProbability,
                  1,
                )}
              </strong>
              <span>Subjective win estimate</span>
              <span className="pill">
                {judgment.confidence} conviction · uncalibrated
              </span>
            </div>
          </div>
          <div className="gpt-comparison">
            <span>
              Sportsdesk home baseline <b>{pct(packet!.baseline.home, 1)}</b>
            </span>
            <span>
              GPT home estimate <b>{pct(judgment.homeWinProbability, 1)}</b>
            </span>
            <span>
              Market view <b>{judgment.marketVerdict}</b>
            </span>
          </div>
          <div className="gpt-read-grid">
            {[
              { title: "Matchup overview", read: judgment.matchupOverview },
              { title: "Player overview", read: judgment.playerOverview },
              { title: "News overview", read: judgment.newsOverview },
              { title: "Coach background", read: judgment.coachOverview },
            ].map(({ title, read }) => (
              <article className="research-block" key={title}>
                <h3>{title}</h3>
                <p className="gpt-prose">{read.summary}</p>
                <EvidenceLinks packet={packet!} ids={read.evidenceIds} />
                {read.uncertainties.length > 0 && (
                  <ul className="gpt-list">
                    {read.uncertainties.map((u) => (
                      <li key={u}>{u}</li>
                    ))}
                  </ul>
                )}
              </article>
            ))}
          </div>
          <section className="research-block">
            <h3>What drives the view</h3>
            {judgment.factors.map((f, i) => (
              <div className="gpt-factor" key={i}>
                <div>
                  <h4>{f.title}</h4>
                  <p>{f.explanation}</p>
                  <EvidenceLinks packet={packet!} ids={f.evidenceIds} />
                </div>
                <span className="pill">
                  {f.direction === "mixed" ? "Mixed" : game[f.direction].abbr}
                </span>
              </div>
            ))}
          </section>
          <section className="research-block">
            <h3>The strongest counter-case</h3>
            <p className="gpt-prose">{judgment.counterCase.summary}</p>
            <EvidenceLinks
              packet={packet!}
              ids={judgment.counterCase.evidenceIds}
            />
            <h4 className="gpt-subheading">Risks & uncertainty</h4>
            <ul className="gpt-list">
              {judgment.risks.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
            <h4 className="gpt-subheading">What would change the view</h4>
            <ul className="gpt-list">
              {judgment.whatWouldChangeTheView.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
          </section>
          <section className="research-block">
            <h3>Market decision: {judgment.marketVerdict}</h3>
            <p className="gpt-prose">{judgment.marketExplanation}</p>
          </section>
          <div className="gpt-report-meta">
            <span>
              {result.model} ·{" "}
              {when(result.generatedAt, {
                month: "short",
                day: "numeric",
                hour: "numeric",
                minute: "2-digit",
                timeZoneName: "short",
              })}
              <small>
                Snapshot {result.packetHash.slice(0, 12)} ·{" "}
                {result.promptVersion} ·{" "}
                {result.usage.inputTokens + result.usage.outputTokens} tokens ·{" "}
                {result.usage.webSearchCalls} web tool calls
              </small>
            </span>
            <button
              className="secondary"
              onClick={() =>
                download(
                  `sportsdesk-gpt-${game.id}.json`,
                  JSON.stringify(result, null, 2),
                )
              }
            >
              <ArrowDownToLine size={14} />
              Export GPT analysis
            </button>
          </div>
        </>
      )}
      {packet && (
        <>
          <details className="gpt-evidence">
            <summary>
              <FileSearch size={15} />
              Inspect the exact {result ? "analysis" : "preview"} packet{" "}
              <span>
                {packet.evidence.length} evidence items ·{" "}
                {packet.sources.length} sources
              </span>
            </summary>
            <div className="gpt-packet-actions">
              <p className="section-note">
                Evidence cutoff:{" "}
                {when(packet.evidenceCutoff, {
                  year: "numeric",
                  month: "short",
                  day: "numeric",
                  hour: "numeric",
                  minute: "2-digit",
                  timeZoneName: "short",
                })}
                . A preview may differ from the fresh packet built when analysis
                starts.
              </p>
              <button
                className="secondary"
                onClick={() =>
                  download(
                    `sportsdesk-input-${game.id}.json`,
                    JSON.stringify(packet, null, 2),
                  )
                }
              >
                <ArrowDownToLine size={14} />
                Download input packet
              </button>
            </div>
            {packet.evidence.map((e) => (
              <article
                className="gpt-evidence-item"
                id={`evidence-${e.id}`}
                key={e.id}
              >
                <div>
                  <span className="pill">
                    {e.id} · {labels[e.category]}
                  </span>
                  <h4>{e.title}</h4>
                  <small>
                    {e.scope}
                    {e.publishedAt
                      ? ` · Published ${e.publishedAt}`
                      : " · Publication time not supplied"}
                  </small>
                </div>
                <EvidenceLinks packet={packet} ids={[e.id]} />
                <pre>{JSON.stringify(e.data, null, 2)}</pre>
              </article>
            ))}
          </details>
          <details className="gpt-evidence">
            <summary>
              <AlertCircle size={15} />
              Coverage gaps & source limitations{" "}
              <span>{packet.gaps.length}</span>
            </summary>
            <ul className="gpt-list">
              {[...packet.gaps, ...packet.webResearch.warnings].map((g, i) => (
                <li key={i}>{g}</li>
              ))}
            </ul>
            <p className="section-note">
              Web research: {packet.webResearch.status}. A source link
              establishes provenance; it does not independently prove every
              extracted claim. Absence of evidence is not confirmation.
            </p>
          </details>
        </>
      )}
    </section>
  );
}
function EvidenceLinks({
  packet,
  ids,
}: {
  packet: AnalysisPacket;
  ids: string[];
}) {
  return (
    <div className="gpt-citations">
      {[...new Set(ids)].map((id) => {
        const evidence = packet.evidence.find((e) => e.id === id);
        const source = packet.sources.find((s) => s.id === evidence?.sourceId);
        return source ? (
          <span key={id} title={evidence?.title}>
            <ExternalLink href={source.url}>
              {id} · {source.name}
            </ExternalLink>
          </span>
        ) : null;
      })}
    </div>
  );
}
