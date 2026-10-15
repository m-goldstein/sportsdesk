"use client";
import { useEffect, useState } from "react";
import {
  ArrowDownToLine,
  ArrowRight,
  BookmarkPlus,
  RotateCcw,
  Share2,
  Sparkles,
} from "lucide-react";
import {
  canRecord,
  defaultScenario,
  Prediction,
  Scenario,
  scenarioForecast,
  xmlEscape,
} from "@/lib/decision-lab";
import { forecast } from "@/lib/model";
import { Game, LEAGUES } from "@/lib/types";
import { download } from "@/lib/download";
import { Empty, pct, TeamMark } from "./ui";
export function ScenarioStudio({
  games,
  ready,
  entries,
  onRecord,
  onOpen,
}: {
  games: Game[];
  ready: boolean;
  entries: Prediction[];
  onRecord: (entry: Prediction) => void;
  onOpen: (g: Game) => void;
}) {
  const eligible = games.filter(
    (g) => g.state === "pre" && forecast(g).home !== null,
  );
  const [gameId, setGameId] = useState("");
  const game = eligible.find((g) => g.id === gameId) ?? eligible[0];
  useEffect(() => {
    const load = () => {
      const hash = new URLSearchParams(location.hash.slice(1));
      if (hash.get("lab") === "scenario" && hash.get("game"))
        setGameId(hash.get("game")!);
    };
    load();
    addEventListener("hashchange", load);
    return () => removeEventListener("hashchange", load);
  }, []);
  return game ? (
    <>
      <label className="lab-picker">
        Experiment matchup
        <select
          aria-label="Scenario matchup"
          value={game.id}
          onChange={(e) => {
            setGameId(e.target.value);
            history.replaceState(null, "", location.pathname + location.search);
          }}
        >
          {eligible.map((g) => (
            <option key={g.id} value={g.id}>
              {g.league} · {g.away.name} at {g.home.name}
            </option>
          ))}
        </select>
      </label>
      <ScenarioExperiment
        key={`${game.id}:${game.start}`}
        game={game}
        ready={ready}
        recorded={entries.some(
          (e) =>
            e.game.id === game.id &&
            e.game.start === game.start &&
            e.game.demo === game.demo,
        )}
        onRecord={onRecord}
        onOpen={() => onOpen(game)}
      />
    </>
  ) : (
    <Empty
      title="A pregame slate powers the lab"
      text="Select another date or use the Sample desk to explore matchup scenarios. Live and completed games never receive a pregame scenario."
    />
  );
}
function ScenarioExperiment({
  game,
  ready,
  recorded,
  onRecord,
  onOpen,
}: {
  game: Game;
  ready: boolean;
  recorded: boolean;
  onRecord: (e: Prediction) => void;
  onOpen: () => void;
}) {
  const [input, setInput] = useState<Scenario>(() => defaultScenario(game)),
    [thesis, setThesis] = useState(""),
    [share, setShare] = useState(""),
    [message, setMessage] = useState("");
  useEffect(() => {
    const load = () => {
      const hash = new URLSearchParams(location.hash.slice(1));
      if (
        hash.get("lab") !== "scenario" ||
        hash.get("game") !== game.id ||
        hash.get("start") !== game.start
      )
        return;
      const number = (
        key: string,
        fallback: number,
        min: number,
        max: number,
      ) => {
        const raw = hash.get(key),
          v = raw === null ? NaN : Number(raw);
        return Number.isFinite(v) && v >= min && v <= max ? v : fallback;
      };
      const scale = LEAGUES[game.league].scale;
      setInput({
        homeImpact: number("h", 0, -scale, scale),
        awayImpact: number("a", 0, -scale, scale),
        neutral: hash.get("n") === "1",
        uncertainty: number("u", 5, 0, 25),
        price: number("p", 2, 1.01, 100),
      });
      setMessage(
        "Shared assumptions loaded. Probabilities use the currently available team snapshot.",
      );
    };
    load();
    addEventListener("hashchange", load);
    return () => removeEventListener("hashchange", load);
  }, [game.id, game.start, game.league]);
  const result = scenarioForecast(game, input)!;
  const rules = LEAGUES[game.league],
    step = rules.scale >= 10 ? 0.5 : 0.1;
  const change = <K extends keyof Scenario>(key: K, value: Scenario[K]) => {
    setInput((prev) => ({ ...prev, [key]: value }));
    setShare("");
    setMessage("");
  };
  const spread = rules.scale / 4,
    offsets = [-2, -1, 0, 1, 2];
  const signed = (v: number) =>
    `${v >= 0.05 ? "+" : ""}${(Math.abs(v) < 0.05 ? 0 : v).toFixed(1)}`;
  const shareScenario = async () => {
    const url = new URL(location.href);
    const hash = new URLSearchParams({
      lab: "scenario",
      game: game.id,
      start: game.start,
      h: String(input.homeImpact),
      a: String(input.awayImpact),
      n: input.neutral ? "1" : "0",
      u: String(input.uncertainty),
      p: String(input.price),
    });
    url.hash = hash.toString();
    setShare(url.toString());
    try {
      await navigator.clipboard.writeText(url.toString());
      setMessage("Scenario link copied.");
    } catch {
      setMessage("Copy the scenario link below.");
    }
  };
  const exportCard = () => {
    const lines =
      (thesis || "A thesis starts with assumptions. Test them before the game.")
        .match(/.{1,65}(?:\s|$)|.{1,65}/g)
        ?.slice(0, 3) ?? [];
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630"><rect width="1200" height="630" fill="#0b1220"/><circle cx="1040" cy="130" r="270" fill="#123349"/><circle cx="1040" cy="130" r="210" fill="none" stroke="#55dce9" stroke-opacity=".2"/><g font-family="Arial,sans-serif"><text x="64" y="76" fill="#55dce9" font-size="25">sportsdesk. / DECISION LAB</text><text x="64" y="128" fill="#93a6bd" font-size="19">${xmlEscape(game.league)} · ${game.demo ? "ILLUSTRATIVE SAMPLE" : "HYPOTHETICAL SCENARIO"}</text><text x="64" y="209" fill="#edf5ff" font-size="43">${xmlEscape(game.away.abbr)} at ${xmlEscape(game.home.abbr)}</text><text x="64" y="320" fill="#55dce9" font-size="94" font-weight="bold">${pct(result.probability, 1)}</text><text x="390" y="301" fill="#edf5ff" font-size="26">${xmlEscape(game.home.abbr)} scenario win probability</text><text x="64" y="374" fill="#93a6bd" font-size="21">Baseline ${pct(result.baseline, 1)} · Assumed range ${pct(result.low, 1)}–${pct(result.high, 1)}</text>${lines.map((line, i) => `<text x="64" y="${437 + i * 29}" fill="#edf5ff" font-size="21">${xmlEscape(line.trim())}</text>`).join("")}<text x="64" y="568" fill="#93a6bd" font-size="16">Home impact ${input.homeImpact} / Away impact ${input.awayImpact} ${rules.unit} · ${input.neutral ? "Neutral" : "Home"} venue</text><text x="64" y="598" fill="#93a6bd" font-size="14">User assumptions + uncalibrated baseline. No accuracy claim. ${xmlEscape(new Date().toISOString())}</text></g></svg>`;
    download(
      `sportsdesk-${game.away.abbr}-${game.home.abbr}-thesis.svg`,
      svg,
      "image/svg+xml",
    );
  };
  return (
    <>
      <div className="lab-scenario-grid">
        <section className="panel lab-controls">
          <div className="lab-section-heading">
            <span className="eyebrow accent-text">01 / THE ASSUMPTIONS</span>
            <button
              className="text-button"
              onClick={() => {
                setInput(defaultScenario(game));
                setThesis("");
                setShare("");
              }}
            >
              <RotateCcw size={12} /> Reset
            </button>
          </div>
          <h3>Rewrite the pregame story.</h3>
          <p className="lab-description">
            What would a lineup or performance change need to do to move your
            view?
          </p>
          {(["home", "away"] as const).map((side) => (
            <label className="lab-range" key={side}>
              <span>
                {game[side].abbr} assumed margin impact
                <strong>
                  {signed(input[`${side}Impact`])} {rules.unit}
                </strong>
              </span>
              <input
                aria-label={`${game[side].abbr} assumed margin impact`}
                type="range"
                min={-rules.scale}
                max={rules.scale}
                step={step}
                value={input[`${side}Impact`]}
                onChange={(e) =>
                  change(`${side}Impact`, Number(e.target.value))
                }
              />
              <small>
                Weaker lineup <span>Stronger lineup</span>
              </small>
            </label>
          ))}
          <label className="lab-checkbox">
            <input
              type="checkbox"
              checked={input.neutral}
              onChange={(e) => change("neutral", e.target.checked)}
            />{" "}
            Play at a neutral venue
          </label>
          <label className="lab-range">
            <span>
              Assumed uncertainty<strong>±{input.uncertainty} pp</strong>
            </span>
            <input
              type="range"
              min="0"
              max="25"
              step="1"
              aria-label="Assumed uncertainty"
              value={input.uncertainty}
              onChange={(e) => change("uncertainty", Number(e.target.value))}
            />
            <small>
              A sensitivity range you choose; not a statistical confidence
              interval.
            </small>
          </label>
          <details className="lab-method">
            <summary>Show the experiment math</summary>
            <p>
              Scenario = logistic(logit(baseline) + (home impact − away impact)
              / {rules.scale} + venue change / {rules.scale}). Impacts are
              hypothetical changes in team margin, not measured player values.
              Baseline is bounded to 15–85%; scenarios to 1–99%. No learned
              injury coefficients or score forecasts.
            </p>
          </details>
        </section>
        <section className="panel lab-outlook">
          <span className="eyebrow accent-text">02 / THE NEW OUTLOOK</span>
          <div className="lab-team-pair">
            <TeamMark team={game.home} />
            <span>
              {game.home.name}
              <small>Scenario home win probability</small>
            </span>
            <button className="text-button" onClick={onOpen}>
              Research <ArrowRight size={13} />
            </button>
          </div>
          <div className="lab-probability" aria-live="polite">
            <strong>{pct(result.probability, 1)}</strong>
            <span>
              {signed(result.delta * 100)} pp
              <small>from {pct(result.baseline, 1)} baseline</small>
            </span>
          </div>
          <div
            className="lab-prob-track"
            role="img"
            aria-label={`Assumed range ${pct(result.low, 1)} to ${pct(result.high, 1)}`}
          >
            <div
              style={{
                left: `${result.low * 100}%`,
                width: `${(result.high - result.low) * 100}%`,
              }}
            />
            <i style={{ left: `${result.baseline * 100}%` }} />
            <b style={{ left: `${result.probability * 100}%` }} />
          </div>
          <div className="lab-track-labels">
            <span>{game.away.abbr}</span>
            <span>50 / 50</span>
            <span>{game.home.abbr}</span>
          </div>
          <div className="lab-outlook-stats">
            <div>
              <small>ASSUMED RANGE</small>
              <strong>
                {pct(result.low, 0)} – {pct(result.high, 0)}
              </strong>
            </div>
            <div>
              <small>SCENARIO FAIR ODDS</small>
              <strong>
                {(1 / result.probability).toFixed(2)}
                <small>home decimal</small>
              </strong>
            </div>
          </div>
          <div className="lab-price">
            <label>
              Hypothetical home decimal price
              <input
                type="number"
                aria-label="Scenario decimal price"
                min="1.01"
                max="100"
                step="0.01"
                value={input.price || ""}
                onChange={(e) =>
                  change(
                    "price",
                    e.target.value === "" ? 0 : Number(e.target.value),
                  )
                }
              />
            </label>
            <div>
              <small>BREAK-EVEN PROBABILITY</small>
              <strong>{pct(result.breakEven, 1)}</strong>
            </div>
          </div>
          <div
            className={`lab-verdict ${result.lowEv !== null && result.lowEv > 0 ? "resilient" : ""}`}
          >
            <Sparkles size={17} />
            <div>
              <strong>
                {result.ev === null
                  ? "Enter a valid decimal price"
                  : result.lowEv! > 0
                    ? "Positive across your assumed range"
                    : result.highEv! < 0
                      ? "Below break-even across your range"
                      : "Your assumptions cross break-even"}
              </strong>
              <p>
                {result.ev === null
                  ? "Decimal prices must be greater than 1."
                  : `Hypothetical EV: ${signed(result.ev * 100)}% at the center; ${signed(result.lowEv! * 100)}% to ${signed(result.highEv! * 100)}% across your range. Before fees, with no stake recommendation.`}
              </p>
            </div>
          </div>
        </section>
      </div>
      <section className="panel lab-map">
        <div>
          <span className="eyebrow accent-text">
            03 / FIND THE TIPPING POINT
          </span>
          <h3>A map of alternate assumptions.</h3>
          <p className="lab-description">
            Each cell recomputes {game.home.abbr}'s probability. Columns vary
            home impact; rows vary away impact. Out-of-range impacts stop at the
            slider limits.
          </p>
          <div className="lab-map-key">
            <span /> Lower home probability <span /> Higher home probability
          </div>
          <small className="muted">
            Outline = current scenario · Values in {rules.unit.toLowerCase()}
          </small>
        </div>
        <div className="lab-heat-wrap">
          <span className="lab-heat-axis">
            {game.home.abbr} margin impact →
          </span>
          <table className="lab-heat" aria-label="Scenario sensitivity map">
            <thead>
              <tr>
                <th scope="col">{game.away.abbr} ↓</th>
                {offsets.map((o) => (
                  <th scope="col" key={o}>
                    {signed(
                      Math.max(
                        -rules.scale,
                        Math.min(rules.scale, input.homeImpact + o * spread),
                      ),
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {offsets.map((y) => (
                <tr key={y}>
                  <th scope="row">
                    {signed(
                      Math.max(
                        -rules.scale,
                        Math.min(rules.scale, input.awayImpact + y * spread),
                      ),
                    )}
                  </th>
                  {offsets.map((x) => {
                    const h = Math.max(
                        -rules.scale,
                        Math.min(rules.scale, input.homeImpact + x * spread),
                      ),
                      a = Math.max(
                        -rules.scale,
                        Math.min(rules.scale, input.awayImpact + y * spread),
                      ),
                      p = scenarioForecast(game, {
                        ...input,
                        homeImpact: h,
                        awayImpact: a,
                      })!.probability;
                    return (
                      <td key={x}>
                        <button
                          className={x === 0 && y === 0 ? "current" : ""}
                          style={{
                            background: `rgba(85,220,233,${0.07 + p * 0.52})`,
                          }}
                          aria-label={`Home impact ${h}, away impact ${a}, home probability ${pct(p, 1)}`}
                          onClick={() => {
                            setInput((prev) => ({
                              ...prev,
                              homeImpact: h,
                              awayImpact: a,
                            }));
                            setShare("");
                          }}
                        >
                          {pct(p, 0)}
                        </button>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <section className="panel lab-thesis">
        <div>
          <span className="eyebrow accent-text">04 / MAKE IT REVIEWABLE</span>
          <h3>Put a reason behind the number.</h3>
          <p className="lab-description">
            Lock one prediction per matchup and mode on this device. The
            probability and assumptions freeze at the time you record it.
          </p>
        </div>
        <div>
          <label className="lab-thesis-label">
            Your thesis
            <textarea
              aria-label="Scenario thesis"
              placeholder="I expect the home team to control the pace, unless…"
              maxLength={400}
              value={thesis}
              onChange={(e) => setThesis(e.target.value)}
            />
          </label>
          <div className="lab-thesis-actions">
            <button
              className="primary"
              disabled={
                !ready || recorded || !thesis.trim() || !canRecord(game)
              }
              onClick={() => {
                if (!canRecord(game) || recorded) return;
                onRecord({
                  version: 1,
                  id: crypto.randomUUID(),
                  game,
                  createdAt: new Date().toISOString(),
                  probability: result.probability,
                  baseline: result.baseline,
                  scenario: input,
                  thesis: thesis.trim(),
                });
              }}
            >
              <BookmarkPlus size={14} />
              {recorded
                ? "Prediction already locked"
                : !canRecord(game)
                  ? "Pregame window closed"
                  : "Lock prediction"}
            </button>
            <button className="secondary" onClick={() => void shareScenario()}>
              <Share2 size={14} />
              Share scenario
            </button>
            <button className="secondary" onClick={exportCard}>
              <ArrowDownToLine size={14} />
              Thesis card
            </button>
          </div>
          {game.demo && (
            <p className="lab-footnote">
              Sample prediction: illustrative data, isolated from your real-game
              journal.
            </p>
          )}
          {message && (
            <p className="lab-footnote" role="status">
              {message}
            </p>
          )}
          {share && (
            <input
              className="lab-share-url"
              aria-label="Shareable scenario URL"
              value={share}
              readOnly
              onFocus={(e) => e.target.select()}
            />
          )}
        </div>
      </section>
    </>
  );
}
