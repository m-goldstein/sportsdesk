"use client";
import { useEffect, useState } from "react";
import { ArrowRight, BookOpen, FlaskConical, Play, Trophy } from "lucide-react";
import { Board, Game } from "@/lib/types";
import { parseJournal, Prediction } from "@/lib/decision-lab";
import { ScenarioStudio } from "./scenario-studio";
import { TournamentLab } from "./tournament-lab";
import { PredictionJournal } from "./prediction-journal";
const tabs = [
  "Scenario studio",
  "Tournament lab",
  "Prediction journal",
] as const;
export function DecisionLab({
  board,
  games,
  onOpen,
}: {
  board: Board;
  games: Game[];
  onOpen: (g: Game) => void;
}) {
  const [tab, setTab] = useState<(typeof tabs)[number]>("Scenario studio");
  const [entries, setEntries] = useState<Prediction[]>([]),
    [ready, setReady] = useState(false),
    [error, setError] = useState("");
  const [tour, setTour] = useState<number | null>(null);
  useEffect(() => {
    const openShared = () => {
      if (new URLSearchParams(location.hash.slice(1)).get("lab") === "scenario")
        setTab("Scenario studio");
    };
    openShared();
    addEventListener("hashchange", openShared);
    return () => removeEventListener("hashchange", openShared);
  }, []);
  useEffect(() => {
    try {
      setEntries(
        parseJournal(
          JSON.parse(localStorage.getItem("sportsdesk.predictions.v1") ?? "[]"),
        ),
      );
    } catch {
      setError("This device's prediction journal could not be read.");
    }
    setReady(true);
  }, []);
  useEffect(() => {
    if (!ready) return;
    try {
      localStorage.setItem(
        "sportsdesk.predictions.v1",
        JSON.stringify(entries),
      );
    } catch {
      setError(
        "Storage is unavailable. Export your journal to keep this session's predictions.",
      );
    }
  }, [entries, ready]);
  const tourSteps = [
    [
      "01 / Change one assumption",
      "Choose a matchup. Move a lineup slider and watch the probability, sensitivity map and price threshold respond together.",
      "Scenario studio",
    ],
    [
      "02 / Make the uncertainty visible",
      "Widen the assumption range. A positive point estimate can still cross the break-even line. Share the exact scenario or export a thesis card.",
      "Scenario studio",
    ],
    [
      "03 / Explore another universe",
      "Choose a sport and reorder the field. Championship odds update across every possible path. Play one universe to animate a possible bracket.",
      "Tournament lab",
    ],
    [
      "04 / Put your thesis on the record",
      "Lock a pregame scenario with a written thesis. Sync real final scores later, or resolve a clearly labeled sample, then inspect the Brier score and calibration plot.",
      "Prediction journal",
    ],
  ];
  return (
    <div className="decision-lab">
      <section className="lab-hero">
        <div className="lab-hero-orbit" aria-hidden="true">
          <span />
          <span />
          <FlaskConical size={42} />
        </div>
        <div>
          <span className="eyebrow accent-text">FROM SIGNAL TO CONVICTION</span>
          <h2>What if you could test the thesis?</h2>
          <p>
            Change the assumptions. Explore the paths. Put your prediction on
            the record.
          </p>
          <div className="lab-hero-tags">
            <span>
              <FlaskConical size={12} /> Counterfactuals
            </span>
            <span>
              <Trophy size={12} /> Every bracket path
            </span>
            <span>
              <BookOpen size={12} /> Measurable predictions
            </span>
          </div>
        </div>
        <button
          className="secondary"
          onClick={() => {
            setTour(0);
            setTab("Scenario studio");
          }}
        >
          <Play size={14} /> Demo walkthrough
        </button>
      </section>
      {tour !== null && (
        <section className="lab-tour" aria-label="Demo walkthrough">
          <div>
            <span className="eyebrow accent-text">{tourSteps[tour][0]}</span>
            <p>{tourSteps[tour][1]}</p>
          </div>
          <span className="lab-tour-count">{tour + 1} / 4</span>
          <button
            className="secondary"
            onClick={() => {
              if (tour === 3) setTour(null);
              else {
                setTour(tour + 1);
                setTab(tourSteps[tour + 1][2] as typeof tab);
              }
            }}
          >
            {tour === 3 ? "Finish tour" : "Next step"}
            <ArrowRight size={13} />
          </button>
          <button className="text-button" onClick={() => setTour(null)}>
            Dismiss
          </button>
        </section>
      )}
      <div className="lab-tabs" role="tablist" aria-label="Decision lab tools">
        {tabs.map((name, i) => (
          <button
            key={name}
            id={`lab-tab-${i}`}
            role="tab"
            aria-selected={tab === name}
            aria-controls={`lab-panel-${i}`}
            tabIndex={tab === name ? 0 : -1}
            onKeyDown={(e) => {
              if (["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) {
                e.preventDefault();
                const index =
                  e.key === "Home"
                    ? 0
                    : e.key === "End"
                      ? 2
                      : (i + (e.key === "ArrowRight" ? 1 : 2)) % 3;
                setTab(tabs[index]);
                document.getElementById(`lab-tab-${index}`)?.focus();
              }
            }}
            onClick={() => setTab(name)}
          >
            <span>0{i + 1}</span>
            {name}
            {name === "Prediction journal" && (
              <small>
                {
                  entries.filter((e) => e.game.demo === (board.mode === "demo"))
                    .length
                }
              </small>
            )}
          </button>
        ))}
      </div>
      {error && (
        <p className="notice error" role="status">
          {error}
        </p>
      )}
      <div
        role="tabpanel"
        id="lab-panel-0"
        aria-labelledby="lab-tab-0"
        hidden={tab !== "Scenario studio"}
      >
        <ScenarioStudio
          games={games}
          ready={ready}
          entries={entries}
          onRecord={(entry) => {
            setEntries((previous) => [entry, ...previous].slice(0, 300));
            setTab("Prediction journal");
          }}
          onOpen={onOpen}
        />
      </div>
      <div
        role="tabpanel"
        id="lab-panel-1"
        aria-labelledby="lab-tab-1"
        hidden={tab !== "Tournament lab"}
      >
        <TournamentLab board={board} />
      </div>
      <div
        role="tabpanel"
        id="lab-panel-2"
        aria-labelledby="lab-tab-2"
        hidden={tab !== "Prediction journal"}
      >
        <PredictionJournal
          entries={entries}
          setEntries={setEntries}
          mode={board.mode}
          onCreate={() => setTab("Scenario studio")}
        />
      </div>
    </div>
  );
}
