"use client";
import { useState } from "react";
import {
  AlertCircle,
  ArrowDownToLine,
  Check,
  FileText,
  ShieldCheck,
} from "lucide-react";
import { forecast, noVig, decimalToAmerican, quoteFresh } from "@/lib/model";
import { Game, Quote, Research } from "@/lib/types";
import {
  Empty,
  ExternalLink,
  ModelChart,
  PanelTitle,
  pct,
  ProbabilityBar,
  TeamMark,
  when,
} from "./ui";
export function download(
  name: string,
  text: string,
  type = "application/json",
) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function Markets({
  game,
  quotes,
  warnings,
}: {
  game: Game;
  quotes: Quote[];
  warnings: string[];
}) {
  const prediction = forecast(game);
  return (
    <>
      <PanelTitle
        title="Market comparison"
        subtitle="Moneyline prices · two-outcome markets"
      />
      <p className="section-note">
        Fair probability removes the two-sided price margin. Expected value uses
        the actual quoted price, before fees and slippage. Estimates are
        research signals.
      </p>
      {quotes.length ? (
        <div className="table-scroll">
          <table className="market-table">
            <thead>
              <tr>
                <th>Source</th>
                <th>{game.home.abbr}</th>
                <th>{game.away.abbr}</th>
                <th>Fair home</th>
                <th>Model gap</th>
                <th>Freshness</th>
              </tr>
            </thead>
            <tbody>
              {quotes.map((q) => {
                const fair = noVig(q);
                return (
                  <tr key={q.id}>
                    <td>
                      <ExternalLink href={q.url}>{q.provider}</ExternalLink>
                      <small>
                        {q.kind === "prediction"
                          ? "Prediction market · indicative"
                          : "Sportsbook"}
                      </small>
                    </td>
                    <td>
                      {decimalToAmerican(q.homePrice)}
                      <small>{q.homePrice.toFixed(2)} decimal</small>
                    </td>
                    <td>
                      {decimalToAmerican(q.awayPrice)}
                      <small>{q.awayPrice.toFixed(2)} decimal</small>
                    </td>
                    <td>{pct(fair?.home ?? null, 1)}</td>
                    <td
                      className={
                        prediction.home !== null &&
                        fair &&
                        prediction.home > fair.home
                          ? "green"
                          : ""
                      }
                    >
                      {prediction.home !== null && fair
                        ? `${((prediction.home - fair.home) * 100).toFixed(1)} pp`
                        : "—"}
                    </td>
                    <td>
                      <span
                        className={`pill ${!game.demo && quoteFresh(q) ? "positive" : ""}`}
                      >
                        {game.demo
                          ? "Sample"
                          : quoteFresh(q)
                            ? "Recent"
                            : q.updatedAt
                              ? "Stale"
                              : "Unverified"}
                      </span>
                      <small>
                        {q.updatedAt
                          ? when(q.updatedAt, {
                              month: "short",
                              day: "numeric",
                              hour: "numeric",
                              minute: "2-digit",
                            })
                          : "No quote timestamp"}
                      </small>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <Empty
          title="No verified market prices"
          text="Current odds will appear when the provider supplies an exact team-and-start-time match."
        />
      )}
      {quotes
        .filter((q) => q.note)
        .map((q) => (
          <p className="source-note" key={q.id}>
            {q.provider}: {q.note}
          </p>
        ))}
      {warnings.map((w) => (
        <p className="notice" key={w}>
          <AlertCircle size={14} />
          {w}
        </p>
      ))}
      <div className="whatif">
        <h3>Price lab</h3>
        <p>Test a hypothetical home moneyline against this baseline.</p>
        <PriceLab probability={prediction.home} />
      </div>
    </>
  );
}
function PriceLab({ probability }: { probability: number | null }) {
  const [price, setPrice] = useState("2.00");
  const decimal = Number(price),
    valid = Number.isFinite(decimal) && decimal > 1 && decimal <= 1000;
  return (
    <div className="price-lab">
      <label>
        Decimal odds
        <input
          type="number"
          min="1.01"
          max="1000"
          step="0.01"
          value={price}
          onChange={(e) => setPrice(e.target.value)}
        />
      </label>
      <div>
        <small>Break-even</small>
        <strong>{valid ? pct(1 / decimal, 1) : "—"}</strong>
      </div>
      <div>
        <small>Hypothetical EV</small>
        <strong
          className={
            valid && probability !== null && probability * decimal > 1
              ? "green"
              : ""
          }
        >
          {valid && probability !== null
            ? `${((probability * decimal - 1) * 100).toFixed(1)}%`
            : "—"}
        </strong>
      </div>
      <span>What-if only · excludes fees</span>
    </div>
  );
}
export function ResearchPanel({
  game,
  research,
  error,
  loading,
  quotes,
  marketWarnings,
  onRetry,
}: {
  game: Game;
  research: Research | null;
  error: string;
  loading: boolean;
  quotes: Quote[];
  marketWarnings: string[];
  onRetry: () => void;
}) {
  const [tab, setTab] = useState("Overview");
  const prediction = forecast(game);
  return (
    <div className="research-content">
      <div className="dossier-heading">
        <div className="eyebrow">
          <FileText size={13} /> MATCHUP RESEARCH <span> / </span>
          {game.league}
        </div>
        <h2>
          {game.away.name} <span>at</span> {game.home.name}
        </h2>
        <p>
          {when(game.start, {
            weekday: "short",
            month: "short",
            day: "numeric",
            hour: "numeric",
            minute: "2-digit",
            timeZoneName: "short",
          })}{" "}
          · {game.venue}
        </p>
        {game.demo && <span className="pill amber">Illustrative sample</span>}
      </div>
      <div
        className="research-tabs"
        role="tablist"
        aria-label="Research sections"
      >
        {["Overview", "Players", "Availability", "Markets", "Sources"].map(
          (t) => (
            <button
              key={t}
              role="tab"
              aria-selected={tab === t}
              onClick={() => setTab(t)}
            >
              {t}
            </button>
          ),
        )}
        <button
          className="export-button"
          onClick={() =>
            download(
              `sportsdesk-${game.id}.json`,
              JSON.stringify(
                {
                  game,
                  forecast: prediction,
                  research,
                  quotes,
                  exportedAt: new Date().toISOString(),
                },
                null,
                2,
              ),
            )
          }
        >
          <ArrowDownToLine size={14} />
          Export packet
        </button>
      </div>
      {loading && (
        <div className="notice">
          <span className="spinner" /> Gathering matchup evidence…
        </div>
      )}
      {error && (
        <div className="notice error">
          <AlertCircle size={16} />
          {error}
          <button onClick={onRetry}>Retry research</button>
        </div>
      )}
      {tab === "Overview" && (
        <>
          <div className="research-grid">
            <section className="research-block">
              <div className="eyebrow">{prediction.label}</div>
              <div className="matchup-teams">
                <div>
                  <TeamMark team={game.home} />
                  <h3>{game.home.shortName}</h3>
                  <p>{game.home.record} · HOME</p>
                </div>
                <span>
                  {game.state === "pre"
                    ? "vs"
                    : `${game.home.score} : ${game.away.score}`}
                </span>
                <div>
                  <TeamMark team={game.away} />
                  <h3>{game.away.shortName}</h3>
                  <p>{game.away.record} · AWAY</p>
                </div>
              </div>
              <ProbabilityBar game={game} prediction={prediction} />
              {game.state === "in" && (
                <p className="section-note">
                  {game.demo ? "Sample" : "ESPN"} in-game home probability:{" "}
                  <b className="green">
                    {pct(research?.liveHomeProbability ?? null, 1)}
                  </b>
                  . Separate from the Sportsdesk pregame model.
                </p>
              )}
              <span className="quality">
                <ShieldCheck size={13} />
                {prediction.quality} sample coverage
              </span>
            </section>
            <section className="research-block">
              {prediction.factors.length ? (
                <ModelChart prediction={prediction} />
              ) : (
                <Empty title={prediction.label} text={prediction.reasons[0]} />
              )}
            </section>
          </div>
          <section className="research-block">
            <PanelTitle
              title="The research read"
              subtitle="Generated from the evidence packet · deterministic synthesis"
            />
            {prediction.reasons.map((r) => (
              <p className="brief-line" key={r}>
                <Check size={16} />
                {r}
              </p>
            ))}
            {prediction.factors.map((f) => (
              <div className="factor" key={f.name}>
                <div>
                  <h4>{f.name}</h4>
                  <p>{f.detail}</p>
                </div>
                <span className={f.value >= 0 ? "green" : "pink"}>
                  {f.value >= 0 ? "+" : ""}
                  {f.value.toFixed(2)}
                  <small>log-odds</small>
                </span>
              </div>
            ))}
          </section>
          <section className="research-block">
            <PanelTitle
              title="Recent results"
              subtitle="Provider's most recent games; check dates and competition"
            />
            {research?.recent.length ? (
              <div className="recent-grid">
                {[game.home, game.away].map((team) => (
                  <div key={team.id}>
                    <h3>{team.name}</h3>
                    {research.recent
                      .filter((g) => g.team === team.abbr)
                      .map((r, i) => (
                        <div className="recent-row" key={i}>
                          <span
                            className={`result ${r.result === "W" ? "won" : "lost"}`}
                          >
                            {r.result}
                          </span>
                          <span>
                            {r.opponent}
                            <small>
                              {r.date
                                ? when(r.date, {
                                    month: "short",
                                    day: "numeric",
                                    year: "numeric",
                                  })
                                : "Date unavailable"}
                            </small>
                          </span>
                          <strong>{r.score}</strong>
                        </div>
                      ))}
                  </div>
                ))}
              </div>
            ) : (
              <p className="section-note">
                Recent results are not available yet.
              </p>
            )}
          </section>
          {!!research?.stats.length && (
            <section className="research-block">
              <PanelTitle
                title="Team statistics"
                subtitle="Provider matchup comparison; pregame averages or in-game totals"
              />
              <table>
                <thead>
                  <tr>
                    <th>Statistic</th>
                    <th>{game.home.abbr}</th>
                    <th>{game.away.abbr}</th>
                  </tr>
                </thead>
                <tbody>
                  {research.stats.map((s) => (
                    <tr key={s.label}>
                      <td>{s.label}</td>
                      <td>{s.home}</td>
                      <td>{s.away}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          )}
          <section className="research-block">
            <h3>What could change the view</h3>
            {prediction.limitations.map((l) => (
              <p className="limitation" key={l}>
                <AlertCircle size={13} />
                {l}
              </p>
            ))}
          </section>
        </>
      )}
      {tab === "Players" && (
        <section className="research-block">
          <PanelTitle
            title="Players to research"
            subtitle="Season leaders and current game statistics when provided"
          />
          {research?.players.length ? (
            <div className="player-grid">
              {research.players.map((p, i) => (
                <article className="player-card" key={`${p.id}-${i}`}>
                  <span className="player-avatar">
                    {p.name
                      .split(" ")
                      .map((s) => s[0])
                      .slice(0, 2)
                      .join("")}
                  </span>
                  <div>
                    <h3>
                      <ExternalLink href={p.url}>{p.name}</ExternalLink>
                    </h3>
                    <p>
                      {p.team} · {p.position || "Player"}
                    </p>
                  </div>
                  <strong>
                    {p.value}
                    <small>{p.metric}</small>
                  </strong>
                </article>
              ))}
            </div>
          ) : (
            <Empty
              title="Player statistics pending"
              text="Season leaders and game box scores appear here when published by the sports feed."
            />
          )}
        </section>
      )}
      {tab === "Availability" && (
        <section className="research-block">
          <PanelTitle
            title="Player availability"
            subtitle="Reported injuries; starting lineups are not confirmed by this feed"
          />
          {research?.injuries.length ? (
            research.injuries.map((i, n) => (
              <article className="injury-row" key={n}>
                <span className="injury-icon">
                  <AlertCircle size={18} />
                </span>
                <div>
                  <h3>
                    {i.name} <span className="muted">· {i.team}</span>
                  </h3>
                  <p>{i.detail}</p>
                  <small>
                    {i.date
                      ? `Reported ${when(i.date, { month: "short", day: "numeric", year: "numeric" })}`
                      : "Report date unavailable"}
                  </small>
                </div>
                <span className="pill amber">{i.status}</span>
              </article>
            ))
          ) : (
            <Empty
              title="No injury entries returned"
              text="This does not confirm that every player is healthy. Check official team availability before drawing conclusions."
            />
          )}
        </section>
      )}
      {tab === "Markets" && (
        <section className="research-block">
          <Markets game={game} quotes={quotes} warnings={marketWarnings} />
        </section>
      )}
      {tab === "Sources" && (
        <section className="research-block">
          <PanelTitle
            title="Evidence & provenance"
            subtitle="Research sources and known limitations"
          />
          {[game.source, ...(research?.sources ?? [])].map((s, i) => (
            <article className="source-row" key={i}>
              <ShieldCheck size={18} />
              <div>
                <h3>
                  <ExternalLink href={s.url}>{s.name}</ExternalLink>
                </h3>
                <p>{s.note}</p>
                <small>
                  Retrieved{" "}
                  {when(s.fetchedAt, {
                    month: "short",
                    day: "numeric",
                    hour: "numeric",
                    minute: "2-digit",
                    timeZoneName: "short",
                  })}
                </small>
              </div>
            </article>
          ))}
          {research?.headlines.map((n) => (
            <p key={n.url} className="news-link">
              <ExternalLink href={n.url}>{n.title}</ExternalLink>
            </p>
          ))}
          {research?.warnings.map((w) => (
            <p className="notice" key={w}>
              {w}
            </p>
          ))}
          <p className="section-note">
            Sportsdesk baseline v1 uses season records, season scoring
            differential and venue. Probabilities have not been fitted or
            validated on historical outcomes. Market quotes are independent of
            the forecast. Live stats may be delayed.
          </p>
        </section>
      )}
    </div>
  );
}
