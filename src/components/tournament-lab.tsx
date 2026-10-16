"use client";
import { useMemo, useState } from "react";
import { ArrowDownToLine, Shuffle, Trophy } from "lucide-react";
import { bracketOdds, playBracket } from "@/lib/decision-lab";
import { Board, League, LEAGUES, Team } from "@/lib/types";
import { download } from "@/lib/download";
import { Empty, pct, TeamMark } from "./ui";
export function TournamentLab({ board }: { board: Board }) {
  const [league, setLeague] = useState<League>("NBA");
  const teams = useMemo(() => {
    const unique = new Map<string, Team>();
    // Slate records take precedence over separately fetched standings.
    for (const g of board.games.filter((g) => g.league === league))
      for (const t of [g.home, g.away])
        if (t.wins !== null && t.losses !== null) unique.set(t.id, t);
    for (const t of board.teams)
      if (
        t.league === league &&
        !unique.has(t.id) &&
        t.wins !== null &&
        t.losses !== null
      )
        unique.set(t.id, t);
    return [...unique.values()];
  }, [board, league]);
  return (
    <>
      <label className="lab-picker">
        Tournament sport
        <select
          aria-label="Tournament sport"
          value={league}
          onChange={(e) => setLeague(e.target.value as League)}
        >
          {Object.keys(LEAGUES).map((l) => (
            <option key={l}>{l}</option>
          ))}
        </select>
      </label>
      {teams.length >= 2 ? (
        <Bracket
          key={`${board.mode}:${league}:${teams.map((t) => t.id).join(",")}`}
          teams={teams}
          league={league}
          sample={board.mode === "demo"}
        />
      ) : (
        <Empty
          title="A field needs at least two teams"
          text="Try another sport or the Sample desk. Teams without season records are excluded rather than assigned invented ratings."
        />
      )}
    </>
  );
}
function Bracket({
  teams,
  league,
  sample,
}: {
  teams: Team[];
  league: League;
  sample: boolean;
}) {
  const count = teams.length >= 8 ? 8 : teams.length >= 4 ? 4 : 2;
  const [ids, setIds] = useState(teams.slice(0, count).map((t) => t.id)),
    [seed, setSeed] = useState(42);
  const field = ids.map((id) => teams.find((t) => t.id === id)!);
  const odds = bracketOdds(field, league)!;
  const rounds = playBracket(field, league, seed),
    champion = rounds.at(-1)![0].winner;
  const sorted = [...odds].sort((a, b) => b.champion - a.champion);
  const swap = (slot: number, id: string) =>
    setIds((previous) => {
      const next = [...previous],
        other = next.indexOf(id);
      if (other >= 0) next[other] = next[slot];
      next[slot] = id;
      return next;
    });
  return (
    <>
      <div className="lab-bracket-heading">
        <div>
          <span className="eyebrow accent-text">
            THE MULTIVERSE OF GAME DAY
          </span>
          <h3>One field. Every possible path.</h3>
          <p className="lab-description">
            A hypothetical {count}-team single-elimination tournament. Reorder
            the field to see how the path changes championship odds.
          </p>
        </div>
        <button
          className="secondary"
          onClick={() =>
            download(
              "oracular-bracket.json",
              JSON.stringify(
                {
                  version: 1,
                  kind: "hypothetical-bracket",
                  mode: sample ? "sample" : "live-records",
                  league,
                  generatedAt: new Date().toISOString(),
                  assumptions:
                    "Neutral venue, fixed bracket, independent games, uncalibrated baseline; not an official competition forecast.",
                  field,
                  odds: odds.map((o) => ({
                    team: o.team.name,
                    advancement: o.rounds,
                    champion: o.champion,
                  })),
                  universeSeed: seed,
                  universe: rounds,
                },
                null,
                2,
              ),
              "application/json",
            )
          }
        >
          <ArrowDownToLine size={14} />
          Export bracket
        </button>
      </div>
      <div className="lab-tournament-grid">
        <section className="panel lab-field">
          <span className="eyebrow">BUILD THE FIELD</span>
          {field.map((team, i) => (
            <label className="lab-seed" key={i}>
              <span>{String(i + 1).padStart(2, "0")}</span>
              <TeamMark team={team} small />
              <select
                aria-label={`Bracket slot ${i + 1}`}
                value={team.id}
                onChange={(e) => swap(i, e.target.value)}
              >
                {teams.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} · {t.record}
                  </option>
                ))}
              </select>
            </label>
          ))}
          <p className="lab-footnote">
            Selecting a team already in the field swaps the slots. Pairings:
            1–2, 3–4, and so on.
          </p>
        </section>
        <section className="panel lab-title-odds">
          <div className="lab-section-heading">
            <span className="eyebrow accent-text">
              EXACT TITLE PROBABILITIES
            </span>
            <span className="pill">All paths</span>
          </div>
          <h3>Who survives the whole bracket?</h3>
          <div className="lab-odds-list">
            {sorted.map((o, i) => (
              <div className="lab-odds-row" key={o.team.id}>
                <span className="muted">{i + 1}</span>
                <TeamMark team={o.team} small />
                <div>
                  <span>{o.team.name}</span>
                  <div className="lab-odds-bar">
                    <i style={{ width: `${o.champion * 100}%` }} />
                  </div>
                </div>
                <strong>{pct(o.champion, 1)}</strong>
              </div>
            ))}
          </div>
          <p className="lab-footnote">
            Calculated exactly across all possible winners at every round; no
            sampling error. Inputs still carry the baseline's uncertainty.
          </p>
        </section>
      </div>
      <section className="panel lab-universe">
        <div className="lab-section-heading">
          <div>
            <span className="eyebrow accent-text">PLAY ONE UNIVERSE</span>
            <h3>A possible path, never a guarantee.</h3>
          </div>
          <button
            className="primary"
            onClick={() => setSeed((previous) => previous + 1)}
          >
            <Shuffle size={14} />
            Play another universe
          </button>
        </div>
        <div className="lab-bracket-scroll">
          <div
            className="lab-bracket"
            style={{
              gridTemplateColumns: `repeat(${rounds.length}, minmax(185px, 1fr)) 150px`,
            }}
          >
            {rounds.map((round, i) => (
              <div className="lab-round" key={i}>
                <span className="eyebrow">
                  {rounds.length - i === 1
                    ? "FINAL"
                    : rounds.length - i === 2
                      ? "SEMIFINALS"
                      : "QUARTERFINALS"}
                </span>
                <div className="lab-round-matches">
                  {round.map((match, j) => (
                    <article
                      className="lab-bracket-match"
                      key={`${seed}:${j}`}
                      style={{ animationDelay: `${i * 180 + j * 60}ms` }}
                    >
                      {[match.home, match.away].map((team, n) => (
                        <div
                          className={
                            team.id === match.winner.id ? "winner" : ""
                          }
                          key={team.id}
                        >
                          <TeamMark team={team} small />
                          <span>{team.abbr}</span>
                          <small>
                            {pct(
                              n === 0
                                ? match.probability
                                : 1 - match.probability,
                              0,
                            )}
                          </small>
                          {team.id === match.winner.id && (
                            <span aria-label="Simulated winner">↗</span>
                          )}
                        </div>
                      ))}
                    </article>
                  ))}
                </div>
              </div>
            ))}
            <div className="lab-champion" key={seed}>
              <Trophy size={30} />
              <TeamMark team={champion} />
              <strong>{champion.shortName}</strong>
              <span>Universe #{seed}</span>
              <small>One sampled outcome</small>
            </div>
          </div>
        </div>
      </section>
      <p className="lab-footnote">
        {sample
          ? "Illustrative team records. "
          : "Current loaded team records, not time-travel snapshots. "}
        Neutral venues, independent games and unchanged team strength across
        rounds. No series, fatigue, injuries, reseeding or draws. NFL matchups
        are conditional on no tie. This sandbox is separate from the official
        tournament slate.
      </p>
    </>
  );
}
