"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
const DecisionLab = dynamic(
  () => import("./decision-lab").then((m) => m.DecisionLab),
  { loading: () => <p className="notice">Opening the decision lab…</p> },
);
import {
  CloudSun,
  Landmark,
  ListOrdered,
  Activity,
  ArrowDown,
  ArrowDownToLine,
  ArrowRight,
  ArrowUpRight,
  AudioLines,
  BarChart3,
  Bookmark,
  Check,
  ChevronDown,
  ChevronRight,
  CircleDot,
  Clock3,
  FileText,
  FlaskConical,
  Globe2,
  LayoutDashboard,
  ListFilter,
  Menu,
  RefreshCw,
  Search,
  Settings2,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Target,
  Trophy,
  Users,
  X,
  Zap,
} from "lucide-react";
import {
  Board,
  Game,
  isLeague,
  LEAGUES,
  Quote,
  Research,
  Team,
} from "@/lib/types";
import { decimalToAmerican, forecast, noVig, opportunity } from "@/lib/model";
import { slateDate } from "@/lib/dates";
import {
  Empty,
  ExternalLink,
  ModelChart,
  PanelTitle,
  pct,
  ProbabilityBar,
  StateTag,
  TeamMark,
  when,
} from "./ui";
import { download, Markets, ResearchPanel } from "./research-panel";

const WeatherDesk = dynamic(
  () => import("./weather-desk").then((m) => m.WeatherDesk),
  { loading: () => <p className="notice">Opening weather markets…</p> },
);
const ElectionDesk = dynamic(
  () => import("./election-desk").then((m) => m.ElectionDesk),
  { loading: () => <p className="notice">Opening election research…</p> },
);
const OutcomeRankings = dynamic(
  () => import("./outcome-rankings").then((m) => m.OutcomeRankings),
  { loading: () => <p className="notice">Opening outcome rankings…</p> },
);
type Saved = { game: Game; savedAt: string; note: string };
const sections = [
  "Overview",
  "Matchups",
  "Live games",
  "Players",
  "Teams",
  "Tournaments",
  "Markets",
  "Weather markets",
  "Election desk",
  "Top outcomes",
  "Watchlist",
  "Decision lab",
  "Methodology",
] as const;
const icons = {
  Overview: LayoutDashboard,
  Matchups: BarChart3,
  "Live games": AudioLines,
  Players: Users,
  Teams: ShieldCheck,
  Tournaments: Trophy,
  Markets: Globe2,
  "Weather markets": CloudSun,
  "Election desk": Landmark,
  "Top outcomes": ListOrdered,
  Watchlist: Bookmark,
  "Decision lab": FlaskConical,
  Methodology: FlaskConical,
};
const leagueIcons: Record<string, string> = {
  NBA: "◉",
  NFL: "⬭",
  MLB: "◇",
  NHL: "◈",
  NCAAM: "◉",
};
const titles: Record<string, [string, string]> = {
  Overview: [
    "Your edge starts here.",
    "Every matchup. Every signal. A clearer read on the game.",
  ],
  Matchups: [
    "Read the matchup.",
    "Screen the slate, compare probabilities and inspect the evidence.",
  ],
  "Live games": [
    "The game, as it happens.",
    "Follow scores and open the research packet for live game statistics.",
  ],
  Players: [
    "Know who moves the game.",
    "Research matchup leaders, game statistics and player availability.",
  ],
  Teams: [
    "Go beyond the standings.",
    "Season records, scoring profiles and the context behind every team.",
  ],
  Tournaments: [
    "See the bigger picture.",
    "Research competition context, postseason matchups and the path ahead.",
  ],
  Markets: [
    "A probability has a price.",
    "Compare your matchup thesis with sportsbooks and prediction markets.",
  ],
  "Weather markets": [
    "Read the sky. Price the outcome.",
    "NOAA station forecasts meet live daily-high temperature contracts.",
  ],
  "Election desk": [
    "Every race has a deeper story.",
    "Governors, Senate races, original polling and the news behind the market.",
  ],
  "Top outcomes": [
    "Find the clearest outcomes.",
    "Rank sports, weather and election contracts across one research desk.",
  ],
  Watchlist: [
    "Keep your thesis in play.",
    "Your saved matchup snapshots and research notes, stored on this device.",
  ],
  "Decision lab": [
    "Turn a hunch into a hypothesis.",
    "A playground for alternate outcomes, tournament paths and predictions you can measure.",
  ],
  Methodology: [
    "Evidence before conviction.",
    "Understand exactly what goes into a Oracular forecast.",
  ],
};
export function Oracular({
  initialBoard,
  initialDate,
  initialLeague,
  initialView,
  initialSearch,
}: {
  initialBoard: Board;
  initialDate: string;
  initialLeague: string;
  initialView: string;
  initialSearch: string;
}) {
  const [board, setBoard] = useState(initialBoard),
    [date, setDate] = useState(initialDate);
  const [league, setLeague] = useState(
    isLeague(initialLeague) ? initialLeague : "All sports",
  );
  const [view, setView] = useState<string>(
    sections.includes(initialView as (typeof sections)[number])
      ? initialView
      : "Overview",
  );
  const [search, setSearch] = useState(initialSearch),
    [status, setStatus] = useState("All games"),
    [sort, setSort] = useState("Start time");
  const [selected, setSelected] = useState<Game | null>(
    initialBoard.games[0] ?? null,
  );
  const [saved, setSaved] = useState<Saved[]>([]),
    [storageReady, setStorageReady] = useState(false),
    [storageError, setStorageError] = useState("");
  const [busy, setBusy] = useState(false),
    [boardError, setBoardError] = useState("");
  const [research, setResearch] = useState<Research | null>(null),
    [researchError, setResearchError] = useState(""),
    [researchBusy, setResearchBusy] = useState(false),
    [retry, setRetry] = useState(0);
  const [quotes, setQuotes] = useState<Quote[]>(selected?.quotes ?? []),
    [marketWarnings, setMarketWarnings] = useState<string[]>([]),
    [marketsBusy, setMarketsBusy] = useState(false);
  const [mobileMenu, setMobileMenu] = useState(false),
    [modal, setModal] = useState(false),
    [brief, setBrief] = useState(false),
    [toast, setToast] = useState("");
  const modalRef = useRef<HTMLDialogElement>(null),
    briefRef = useRef<HTMLDialogElement>(null),
    searchRef = useRef<HTMLInputElement>(null),
    requestRef = useRef<AbortController | null>(null);
  const pick = selected ? forecast(selected) : null;
  const visible = useMemo(() => {
    const text = search.toLowerCase();
    const result = board.games.filter(
      (g) =>
        (league === "All sports" || g.league === league) &&
        `${g.home.name} ${g.away.name} ${g.league} ${g.context}`
          .toLowerCase()
          .includes(text) &&
        (view !== "Live games" || g.state === "in") &&
        (status === "All games" ||
          (status === "Upcoming"
            ? g.state === "pre"
            : status === "Live"
              ? g.state === "in"
              : g.state === "post")),
    );
    return result.sort((a, b) =>
      sort === "Win probability"
        ? Math.max(forecast(b).home ?? 0, forecast(b).away ?? 0) -
          Math.max(forecast(a).home ?? 0, forecast(a).away ?? 0)
        : Date.parse(a.start) - Date.parse(b.start),
    );
  }, [board.games, league, search, status, view, sort]);
  const featured = visible
    .filter((g) => g.state === "pre" && forecast(g).home !== null)
    .slice(0, 3);
  const liveCount = board.games.filter((g) => g.state === "in").length;
  const signals = board.games.filter((g) => {
    const priced = selected?.id === g.id ? { ...g, quotes } : g;
    const o = opportunity(priced, forecast(g));
    return (
      !g.demo &&
      o &&
      o.ev > 0 &&
      o.edge >= 0.03 &&
      forecast(g).quality !== "Limited"
    );
  }).length;
  const selectedSaved =
    !!selected && saved.some((s) => s.game.id === selected.id);

  useEffect(() => {
    if (
      !modal &&
      view !== "Watchlist" &&
      selected &&
      !visible.some((g) => g.id === selected.id)
    )
      setSelected(visible[0] ?? null);
    else if (!selected && visible.length) setSelected(visible[0]);
  }, [visible, selected, modal, view]);

  useEffect(() => {
    try {
      const data: unknown = JSON.parse(
        localStorage.getItem("sportsdesk.watchlist.v1") ?? "[]",
      );
      if (Array.isArray(data))
        setSaved(
          data.filter(
            (s): s is Saved =>
              !!s?.game?.id &&
              isLeague(s.game.league) &&
              !!s.game.home?.name &&
              !!s.game.away?.name &&
              !!s.game.source &&
              typeof s.savedAt === "string" &&
              typeof s.note === "string",
          ),
        );
    } catch {
      setStorageError("Saved research could not be read from this device.");
    }
    setStorageReady(true);
  }, []);
  useEffect(() => {
    if (!storageReady) return;
    try {
      localStorage.setItem("sportsdesk.watchlist.v1", JSON.stringify(saved));
    } catch {
      setStorageError(
        "Device storage is unavailable. Changes will last for this session only.",
      );
    }
  }, [saved, storageReady]);
  useEffect(() => {
    const params = new URLSearchParams();
    params.set("mode", board.mode);
    params.set("date", date);
    if (league !== "All sports") params.set("league", league);
    if (view !== "Overview") params.set("view", view);
    if (search) params.set("q", search);
    history.replaceState(null, "", `?${params}${location.hash}`);
  }, [board.mode, date, league, view, search]);
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        e.preventDefault();
        searchRef.current?.focus();
      }
      if (e.key === "Escape") setMobileMenu(false);
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, []);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), 3500);
    return () => clearTimeout(timer);
  }, [toast]);
  useEffect(() => {
    const d = modalRef.current;
    if (modal && d && !d.open) d.showModal();
    else if (!modal && d?.open) d.close();
  }, [modal]);
  useEffect(() => {
    const d = briefRef.current;
    if (brief && d && !d.open) d.showModal();
    else if (!brief && d?.open) d.close();
  }, [brief]);
  useEffect(() => {
    setResearch(null);
    setResearchError("");
    setQuotes(selected?.quotes ?? []);
    setMarketWarnings([]);
    if (!selected) return;
    const controller = new AbortController();
    setResearchBusy(true);
    fetch(`/api/research?league=${selected.league}&id=${selected.id}`, {
      signal: controller.signal,
    })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error);
        return data as Research;
      })
      .then(setResearch)
      .catch((e) => {
        if (e.name !== "AbortError")
          setResearchError(e.message || "Research could not be loaded.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setResearchBusy(false);
      });
    return () => controller.abort();
  }, [selected, retry]);
  useEffect(() => {
    if (!selected || (!modal && view !== "Markets")) return;
    const controller = new AbortController();
    setMarketsBusy(true);
    fetch(
      `/api/markets?league=${selected.league}&id=${selected.id}&date=${slateDate(selected.start)}`,
      { signal: controller.signal },
    )
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error);
        return data;
      })
      .then((data) => {
        setQuotes(data.quotes);
        setMarketWarnings(data.warnings);
      })
      .catch((e) => {
        if (e.name !== "AbortError")
          setMarketWarnings([e.message || "Market feeds are unavailable."]);
      })
      .finally(() => {
        if (!controller.signal.aborted) setMarketsBusy(false);
      });
    return () => controller.abort();
  }, [selected, modal, view]);
  const refresh = useCallback(
    async (nextMode = board.mode, nextDate = date) => {
      requestRef.current?.abort();
      const controller = new AbortController();
      requestRef.current = controller;
      setBusy(true);
      setBoardError("");
      try {
        const response = await fetch(
          `/api/board?mode=${nextMode}&date=${nextDate}`,
          { signal: controller.signal },
        );
        if (!response.ok)
          throw new Error(
            "The slate could not be refreshed. Check the date and try again.",
          );
        const data: Board = await response.json();
        setBoard(data);
        setDate(nextDate);
        setSelected(
          (previous) =>
            data.games.find((g) => g.id === previous?.id) ??
            data.games[0] ??
            null,
        );
      } catch (error) {
        if (!controller.signal.aborted)
          setBoardError(
            error instanceof Error ? error.message : "Feed unavailable.",
          );
      } finally {
        if (!controller.signal.aborted) setBusy(false);
      }
    },
    [board.mode, date],
  );
  useEffect(() => {
    if (board.mode !== "live") return;
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") void refresh();
    }, 60000);
    return () => clearInterval(timer);
  }, [board.mode, refresh]);
  const navigate = (next: string) => {
    setView(next);
    setMobileMenu(false);
    setStatus("All games");
  };
  const openGame = (game: Game) => {
    setSelected(game);
    setModal(true);
  };
  const saveGame = (game: Game) => {
    const exists = saved.some((s) => s.game.id === game.id);
    setSaved((previous) =>
      exists
        ? previous.filter((s) => s.game.id !== game.id)
        : [...previous, { game, savedAt: new Date().toISOString(), note: "" }],
    );
    setToast(
      exists
        ? "Matchup removed from watchlist"
        : "Research snapshot saved to watchlist",
    );
  };
  const briefText = [
    `ORACULAR / DAILY RESEARCH BRIEF`,
    `${date} · ${board.mode === "demo" ? "ILLUSTRATIVE SAMPLE" : "Live feed"}`,
    "",
    ...visible.map((g) => {
      const f = forecast(g);
      return `${g.away.name} at ${g.home.name} · ${g.league}\n${f.label}: ${g.home.abbr} ${pct(f.home, 1)} / ${g.away.abbr} ${pct(f.away, 1)}\n${f.reasons.join(" ")}\nContext: ${g.context}\nSource: ${g.source.name} ${g.source.url}\n`;
    }),
    "Model: uncalibrated v1 statistical baseline. Season records, scoring differential and venue only. No historical accuracy claim. Player context requires separate review. Research only; no betting execution.",
  ].join("\n");

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">
        Skip to workspace
      </a>
      {mobileMenu && (
        <button
          className="sidebar-scrim"
          aria-label="Close navigation"
          onClick={() => setMobileMenu(false)}
        />
      )}
      <aside className={`sidebar ${mobileMenu ? "open" : ""}`}>
        <a className="brand" href="/" aria-label="Oracular home">
          <span className="brand-mark">
            <svg viewBox="0 0 32 32" aria-hidden="true">
              <path
                d="M3 16s5-8 13-8 13 8 13 8-5 8-13 8S3 16 3 16Z"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
              />
              <circle cx="16" cy="16" r="4" fill="currentColor" />
            </svg>
          </span>
          <span>
            Oracular<span className="accent-text">.</span>
          </span>
        </a>
        <div className="workspace-label">
          <span className="workspace-icon">
            <Target size={17} />
          </span>
          <div>
            Research workspace<small>Your independent advantage</small>
          </div>
          <span className="pill">v1</span>
        </div>
        <span className="nav-label">WORKSPACE</span>
        <nav aria-label="Workspace navigation">
          {sections.slice(0, 3).map((name) => {
            const Icon = icons[name];
            return (
              <button
                key={name}
                className={view === name ? "active" : ""}
                onClick={() => navigate(name)}
              >
                <Icon size={17} />
                {name}
                {name === "Live games" && (
                  <span className="nav-count">{liveCount}</span>
                )}
              </button>
            );
          })}
          <span className="nav-label">RESEARCH & INTELLIGENCE</span>
          {sections.slice(3, 10).map((name) => {
            const Icon = icons[name];
            return (
              <button
                key={name}
                className={view === name ? "active" : ""}
                onClick={() => navigate(name)}
              >
                <Icon size={17} />
                {name}
                {name === "Markets" && <span className="tiny-pill">BETA</span>}
              </button>
            );
          })}
          <span className="nav-label">YOUR DESK</span>
          {sections.slice(10).map((name) => {
            const Icon = icons[name];
            return (
              <button
                key={name}
                className={view === name ? "active" : ""}
                onClick={() => navigate(name)}
              >
                <Icon size={17} />
                {name}
                {name === "Watchlist" && (
                  <span className="nav-count">{saved.length}</span>
                )}
              </button>
            );
          })}
        </nav>
        <div className="sidebar-bottom">
          <div className="desk-note">
            <span className="little-stars">✳</span>
            <h3>Research. Refine. Repeat.</h3>
            <p>
              Find the story behind the numbers. Build a thesis you can explain.
            </p>
            <button onClick={() => navigate("Methodology")}>
              Explore our methodology <ArrowUpRight size={14} />
            </button>
          </div>
          <div className="connection">
            <span className="live-dot" />
            <span>
              {board.mode === "demo"
                ? "Sample workspace"
                : "Public sports feeds"}
              <small>
                {board.mode === "demo"
                  ? "Illustrative data"
                  : "Refreshes every 60 seconds"}
              </small>
            </span>
            <Settings2 size={15} />
          </div>
          <div className="profile">
            <span>SD</span>
            <div>
              Independent researcher<small>Personal workspace</small>
            </div>
            <ShieldCheck size={16} />
          </div>
        </div>
      </aside>
      <div className="workspace">
        <header className="topbar">
          <div className="breadcrumb">
            <button
              className="icon-button mobile-toggle"
              aria-label="Open navigation"
              onClick={() => setMobileMenu(true)}
            >
              <Menu size={20} />
            </button>
            <span>Workspace</span>
            <ChevronRight size={13} />
            <strong>{view}</strong>
          </div>
          <div className="topbar-actions">
            <label className="global-search">
              <Search size={15} />
              <input
                ref={searchRef}
                aria-label="Search teams, matchups or competitions"
                placeholder="Search your next edge…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              <kbd>⌘ K</kbd>
            </label>
            <span
              className={`data-status ${board.mode === "demo" ? "sample" : ""}`}
            >
              <span className="live-dot" />
              {board.mode === "demo" ? "SAMPLE DATA" : "LIVE FEEDS"}
            </span>
          </div>
        </header>
        <main id="main-content" className="main-content">
          <div className="page-heading">
            <div>
              <div className="eyebrow">
                <span className="accent-text">
                  THE ORACULAR RESEARCH WORKSPACE
                </span>
                <span className="heading-slash">/</span>
                {when(`${date}T12:00:00-04:00`, {
                  weekday: "long",
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                })}
              </div>
              <h1>{titles[view][0]}</h1>
              <p>{titles[view][1]}</p>
            </div>
            <button className="primary" onClick={() => setBrief(true)}>
              <Sparkles size={15} />
              Build daily brief
              <ArrowUpRight size={15} />
            </button>
          </div>
          <div className="desk-toolbar">
            {!["Weather markets", "Election desk", "Top outcomes"].includes(
              view,
            ) && (
              <div className="sport-tabs" aria-label="Filter by sport">
                {["All sports", ...Object.keys(LEAGUES)].map((l) => (
                  <button
                    key={l}
                    className={league === l ? "active" : ""}
                    onClick={() => setLeague(l)}
                  >
                    {l === "All sports" ? (
                      <LayoutDashboard size={14} />
                    ) : (
                      <span className="sport-symbol">{leagueIcons[l]}</span>
                    )}
                    {l}
                    <span className="tab-count">
                      {
                        board.games.filter(
                          (g) => l === "All sports" || g.league === l,
                        ).length
                      }
                    </span>
                  </button>
                ))}
              </div>
            )}
            <div className="toolbar-controls">
              <label className="mode-control">
                <span className="sr-only">Data source</span>
                <select
                  aria-label="Data source"
                  value={board.mode}
                  disabled={busy}
                  onChange={(e) =>
                    void refresh(e.target.value as "live" | "demo")
                  }
                >
                  <option value="live">Live data</option>
                  <option value="demo">Sample desk</option>
                </select>
                <ChevronDown size={12} />
              </label>
              {!["Weather markets", "Election desk"].includes(view) && (
                <input
                  className="date-input"
                  type="date"
                  aria-label="Slate date"
                  value={date}
                  disabled={busy}
                  onChange={(e) => {
                    if (e.target.value)
                      void refresh(board.mode, e.target.value);
                  }}
                />
              )}
              <button
                className="icon-button refresh-button"
                disabled={busy}
                aria-label="Refresh sports feeds"
                onClick={() => void refresh()}
              >
                <RefreshCw size={15} className={busy ? "rotating" : ""} />
              </button>
            </div>
          </div>
          {(board.warnings.length > 0 || boardError || storageError) && (
            <div
              className={`feed-banner ${boardError ? "error" : ""}`}
              role="status"
            >
              <CircleDot size={14} />
              <span>
                {boardError || storageError || board.warnings.join(" ")}
              </span>
              {board.mode === "demo" && (
                <button disabled={busy} onClick={() => void refresh("live")}>
                  Switch to live <ArrowRight size={13} />
                </button>
              )}
            </div>
          )}

          {view === "Overview" && (
            <>
              <div className="metrics-grid">
                <Metric
                  icon={<Trophy size={17} />}
                  label="ON THE SLATE"
                  value={String(visible.length).padStart(2, "0")}
                  note={`${board.leagues.filter((l) => !l.error).length} leagues in your research universe`}
                />
                <Metric
                  icon={<AudioLines size={17} />}
                  label="LIVE RIGHT NOW"
                  value={String(
                    visible.filter((g) => g.state === "in").length,
                  ).padStart(2, "0")}
                  note="Scores & game context as reported"
                  live
                />
                <Metric
                  icon={<Zap size={17} />}
                  label="VERIFIED PRICE SIGNALS"
                  value={String(signals).padStart(2, "0")}
                  note="Fresh quotes · positive estimated EV"
                />
                <Metric
                  icon={<Bookmark size={17} />}
                  label="YOUR WATCHLIST"
                  value={String(saved.length).padStart(2, "0")}
                  note="Saved research, ready when you are"
                />
              </div>
              <button
                className="lab-launch"
                onClick={() => navigate("Decision lab")}
              >
                <span className="lab-launch-icon">
                  <FlaskConical size={24} />
                </span>
                <span>
                  <small>NEW / DECISION LAB</small>
                  <strong>Don’t just read the odds. Test the story.</strong>
                  <span>
                    Explore what-if scenarios, simulate a tournament and keep
                    score of your predictions.
                  </span>
                </span>
                <ArrowRight size={20} />
              </button>
              <PanelTitle
                title="On the radar"
                subtitle="A closer look at the upcoming slate"
                action={
                  <button
                    className="text-button"
                    onClick={() => navigate("Matchups")}
                  >
                    Explore all matchups <ArrowRight size={14} />
                  </button>
                }
              />
              <div className="featured-grid">
                {featured.length ? (
                  featured.map((game, i) => (
                    <Featured
                      key={game.id}
                      game={game}
                      index={i}
                      saved={saved.some((s) => s.game.id === game.id)}
                      onOpen={() => openGame(game)}
                      onSave={() => saveGame(game)}
                    />
                  ))
                ) : (
                  <div className="panel radar-empty">
                    <Empty
                      title="The next slate is taking shape"
                      text="Explore another date or switch to the sample desk to walk through the research workflow."
                      action={
                        <button
                          className="secondary"
                          disabled={busy}
                          onClick={() => void refresh("demo")}
                        >
                          Explore sample desk
                        </button>
                      }
                    />
                  </div>
                )}
              </div>
            </>
          )}

          {["Overview", "Matchups", "Live games"].includes(view) && (
            <div className="content-columns">
              <section className="panel slate-panel">
                <PanelTitle
                  title={
                    view === "Live games" ? "Live scoreboard" : "The game board"
                  }
                  subtitle={`${visible.length} matchups · ${board.mode === "demo" ? "Illustrative sample" : "Times in Eastern Time"}`}
                  action={
                    <span className="subtle-icon">
                      <SlidersHorizontal size={16} />
                    </span>
                  }
                />
                <div className="table-toolbar">
                  <label>
                    <Search size={14} />
                    <input
                      aria-label="Filter game board"
                      placeholder="Filter teams or competitions…"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                    />
                  </label>
                  <select
                    aria-label="Game status"
                    value={status}
                    onChange={(e) => setStatus(e.target.value)}
                  >
                    <option>All games</option>
                    <option>Upcoming</option>
                    <option>Live</option>
                    <option>Final</option>
                  </select>
                  <select
                    aria-label="Sort matchups"
                    value={sort}
                    onChange={(e) => setSort(e.target.value)}
                  >
                    <option>Start time</option>
                    <option>Win probability</option>
                  </select>
                </div>
                {visible.length ? (
                  <div className="table-scroll">
                    <table className="game-table">
                      <thead>
                        <tr>
                          <th>Matchup</th>
                          <th>Status / ET</th>
                          <th>Model lean</th>
                          <th>
                            Win prob. <ArrowDown size={10} />
                          </th>
                          <th>Coverage</th>
                          <th>
                            <Bookmark size={12} />
                            <span className="sr-only">Save</span>
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {visible.map((game) => {
                          const f = forecast(game);
                          const favorite = f.favorite ? game[f.favorite] : null;
                          return (
                            <tr
                              key={game.id}
                              className={
                                selected?.id === game.id ? "selected-row" : ""
                              }
                            >
                              <td>
                                <button
                                  className="matchup-cell"
                                  onClick={() => openGame(game)}
                                >
                                  <span className="stacked-marks">
                                    <TeamMark team={game.away} small />
                                    <TeamMark team={game.home} small />
                                  </span>
                                  <span>
                                    <strong>
                                      {game.away.abbr}{" "}
                                      <span className="muted">at</span>{" "}
                                      {game.home.abbr}
                                    </strong>
                                    <small>
                                      {game.league} <span>·</span>{" "}
                                      {game.seasonType === 1
                                        ? "Preseason"
                                        : game.context.includes("sample")
                                          ? "Regular season"
                                          : game.context}
                                    </small>
                                  </span>
                                </button>
                              </td>
                              <td>
                                <StateTag game={game} />
                                {game.state !== "pre" && (
                                  <small className="score-cell">
                                    {game.away.score} – {game.home.score}
                                  </small>
                                )}
                              </td>
                              <td>
                                <span className={favorite ? "lean" : "muted"}>
                                  {favorite ? (
                                    <>
                                      <span className="accent-text">↗</span>{" "}
                                      {favorite.abbr}
                                    </>
                                  ) : (
                                    f.label
                                  )}
                                </span>
                              </td>
                              <td>
                                <span className="table-prob">
                                  {favorite
                                    ? pct(Math.max(f.home!, f.away!))
                                    : "—"}
                                </span>
                                {favorite && (
                                  <span className="mini-bar">
                                    <span
                                      style={{
                                        width: `${Math.max(f.home!, f.away!) * 100}%`,
                                      }}
                                    />
                                  </span>
                                )}
                              </td>
                              <td>
                                <span
                                  className={`coverage ${f.quality.toLowerCase()}`}
                                >
                                  <i />
                                  {f.quality}
                                </span>
                              </td>
                              <td>
                                <button
                                  className={`icon-button save-button ${saved.some((s) => s.game.id === game.id) ? "saved" : ""}`}
                                  aria-label={`${saved.some((s) => s.game.id === game.id) ? "Remove" : "Save"} ${game.away.abbr} at ${game.home.abbr}`}
                                  onClick={() => saveGame(game)}
                                >
                                  <Bookmark size={15} />
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <Empty
                    title={
                      view === "Live games"
                        ? "No live games in this view"
                        : "No matchups found"
                    }
                    text="Try another sport, date or search. Games appear when published by the sports feed."
                    action={
                      <button
                        className="secondary"
                        onClick={() => {
                          setSearch("");
                          setLeague("All sports");
                          setStatus("All games");
                        }}
                      >
                        Clear filters
                      </button>
                    }
                  />
                )}
                <div className="table-footer">
                  <span>
                    <ShieldCheck size={12} />
                    Probabilities grounded in season data
                  </span>
                  <span>Baseline v1</span>
                </div>
              </section>
              <aside className="intel-column">
                <section className="panel intel-panel">
                  <PanelTitle
                    title="Desk intelligence"
                    action={
                      <span className="intel-badge">
                        <Sparkles size={15} />
                      </span>
                    }
                  />
                  {selected && pick ? (
                    <>
                      <button
                        className="selected-matchup"
                        onClick={() => openGame(selected)}
                      >
                        <span className="eyebrow">CURRENT RESEARCH</span>
                        <h3>
                          {selected.away.abbr} <span>at</span>{" "}
                          {selected.home.abbr}
                          <ArrowUpRight size={15} />
                        </h3>
                        <p>
                          {selected.league} · {selected.venue}
                        </p>
                      </button>
                      {pick.home !== null ? (
                        <ModelChart prediction={pick} />
                      ) : (
                        <div className="live-intel">
                          <Activity size={25} />
                          <h3>
                            {selected.away.score} <span>–</span>{" "}
                            {selected.home.score}
                          </h3>
                          <p>{selected.status}</p>
                        </div>
                      )}
                      <div className="intelligence-read">
                        <span className="eyebrow">
                          <span className="accent-text">✳</span> THE RESEARCH
                          READ
                        </span>
                        <p>{pick.reasons[0]}</p>
                        <div>
                          <span className="quality">
                            <ShieldCheck size={12} />
                            {pick.quality} coverage
                          </span>
                          <span className="pill">
                            {selected.demo ? "Sample" : "ESPN"}
                          </span>
                        </div>
                      </div>
                      <div className="intel-checks">
                        <p>
                          <Check size={13} />
                          <span>
                            Season records
                            <span>
                              {selected.home.record} / {selected.away.record}
                            </span>
                          </span>
                        </p>
                        <p>
                          <Clock3 size={13} />
                          <span>
                            Player availability
                            <span>
                              {researchBusy
                                ? "Gathering evidence…"
                                : research
                                  ? `${research.injuries.length} reported injury entries`
                                  : "Awaiting research"}
                            </span>
                          </span>
                        </p>
                        <p>
                          <Target size={13} />
                          <span>
                            Market pricing
                            <span>
                              {selected.quotes.length
                                ? "Reference lines available"
                                : "Open packet to check coverage"}
                            </span>
                          </span>
                        </p>
                      </div>
                      <button
                        className="secondary full-width"
                        onClick={() => openGame(selected)}
                      >
                        Open research packet <ArrowRight size={14} />
                      </button>
                    </>
                  ) : (
                    <Empty
                      title="Your research starts here"
                      text="Select a matchup to inspect the evidence."
                    />
                  )}
                </section>
                <div className="research-principle">
                  <span>
                    <FlaskConical size={17} />
                  </span>
                  <div>
                    <h4>A lean is the start of a thesis.</h4>
                    <p>
                      Review the lineup, competition and price before drawing a
                      conclusion.
                    </p>
                  </div>
                </div>
              </aside>
            </div>
          )}

          {view === "Weather markets" && (
            <WeatherDesk mode={board.mode} initialDate={date} />
          )}
          {view === "Election desk" && <ElectionDesk mode={board.mode} />}
          {view === "Top outcomes" && (
            <OutcomeRankings
              mode={board.mode}
              date={date}
              onNavigate={navigate}
            />
          )}

          {view === "Decision lab" && (
            <DecisionLab board={board} games={visible} onOpen={openGame} />
          )}

          {view === "Teams" && (
            <section className="panel">
              <PanelTitle
                title="Team research"
                subtitle="Current-season standings · records and scoring profiles"
              />
              <TeamsTable
                teams={board.teams.filter(
                  (t) =>
                    (league === "All sports" || t.league === league) &&
                    `${t.name} ${t.group ?? ""}`
                      .toLowerCase()
                      .includes(search.toLowerCase()),
                )}
                games={board.games}
                onOpen={openGame}
              />
            </section>
          )}
          {view === "Tournaments" && (
            <div className="tournament-layout">
              {board.leagues
                .filter((l) => league === "All sports" || l.league === league)
                .map((l) => {
                  const games = visible.filter((g) => g.league === l.league);
                  return (
                    <section className="panel tournament-panel" key={l.league}>
                      <div className="tournament-heading">
                        <span className="tournament-icon">
                          <Trophy size={25} />
                        </span>
                        <div>
                          <span className="eyebrow">{l.season}</span>
                          <h2>{LEAGUES[l.league].name}</h2>
                        </div>
                        <span className="pill">{games.length} games</span>
                      </div>
                      <p className="section-note">
                        {l.league === "NCAAM"
                          ? "Conference and NCAA tournament games carry competition labels when published by the feed."
                          : "Research the current competition slate and postseason context."}
                      </p>
                      {games.length ? (
                        games.map((g) => (
                          <button
                            className="tournament-game"
                            onClick={() => openGame(g)}
                            key={g.id}
                          >
                            <div>
                              <strong>
                                {g.away.name} <span className="muted">at</span>{" "}
                                {g.home.name}
                              </strong>
                              <small>
                                {g.context} ·{" "}
                                {g.neutral ? "Neutral venue" : g.venue}
                              </small>
                            </div>
                            <StateTag game={g} />
                            <ChevronRight size={15} />
                          </button>
                        ))
                      ) : (
                        <p className="section-note">
                          No scheduled games on this date.
                        </p>
                      )}
                    </section>
                  );
                })}
            </div>
          )}
          {["Players", "Markets"].includes(view) && (
            <section className="panel focused-panel">
              <PanelTitle
                title={
                  view === "Players"
                    ? "Matchup player research"
                    : "Sportsbooks & prediction markets"
                }
                subtitle="Select a matchup to load its evidence and exact market matches"
              />
              <label className="matchup-picker">
                Matchup
                <select
                  aria-label="Select research matchup"
                  value={selected?.id ?? ""}
                  onChange={(e) =>
                    setSelected(
                      board.games.find((g) => g.id === e.target.value) ?? null,
                    )
                  }
                >
                  {!selected && <option value="">Select matchup</option>}
                  {visible.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.league} · {g.away.name} at {g.home.name}
                    </option>
                  ))}
                </select>
              </label>
              {selected ? (
                view === "Markets" ? (
                  <>
                    {marketsBusy && (
                      <p className="notice">
                        <span className="spinner" />
                        Checking market providers…
                      </p>
                    )}
                    <Markets
                      game={selected}
                      quotes={quotes}
                      warnings={marketWarnings}
                    />
                  </>
                ) : (
                  <>
                    <div className="player-summary-heading">
                      <h2>
                        {selected.away.name} at {selected.home.name}
                      </h2>
                      <button
                        className="secondary"
                        onClick={() => setModal(true)}
                      >
                        Full research <ArrowUpRight size={14} />
                      </button>
                    </div>
                    {researchBusy && (
                      <p className="notice">Gathering player research…</p>
                    )}
                    {researchError && (
                      <p className="notice error">
                        {researchError}
                        <button onClick={() => setRetry((v) => v + 1)}>
                          Retry
                        </button>
                      </p>
                    )}
                    {research?.players.length ? (
                      <div className="player-grid">
                        {research.players.map((p, i) => (
                          <article className="player-card" key={`${p.id}-${i}`}>
                            <span className="player-avatar">
                              {p.name
                                .split(" ")
                                .map((n) => n[0])
                                .slice(0, 2)
                                .join("")}
                            </span>
                            <div>
                              <h3>
                                <ExternalLink href={p.url}>
                                  {p.name}
                                </ExternalLink>
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
                      !researchBusy && (
                        <Empty
                          title="Player stats are not available yet"
                          text="Season leaders and current-game player stats appear when provided."
                        />
                      )
                    )}
                    <PanelTitle
                      title="Availability report"
                      subtitle="Unconfirmed lineups · injury reports may be incomplete"
                    />
                    {research?.injuries.length ? (
                      research.injuries.map((i, n) => (
                        <div className="injury-row" key={n}>
                          <div>
                            <h3>
                              {i.name} · {i.team}
                            </h3>
                            <p>{i.detail}</p>
                          </div>
                          <span className="pill amber">{i.status}</span>
                        </div>
                      ))
                    ) : (
                      <p className="section-note">
                        No injury entries returned. Check official availability
                        reports.
                      </p>
                    )}
                  </>
                )
              ) : (
                <Empty
                  title="Select a matchup"
                  text="Choose a date with scheduled games to start your research."
                />
              )}
            </section>
          )}
          {view === "Watchlist" && (
            <section className="panel">
              <PanelTitle
                title="Saved research"
                subtitle={`${saved.length} snapshots · local to this browser`}
                action={
                  saved.length ? (
                    <button
                      className="secondary"
                      onClick={() =>
                        download(
                          "oracular-watchlist.json",
                          JSON.stringify(saved, null, 2),
                        )
                      }
                    >
                      <ArrowDownToLine size={14} />
                      Export watchlist
                    </button>
                  ) : undefined
                }
              />
              {saved.length ? (
                <div className="watchlist-grid">
                  {saved
                    .filter(
                      (s) =>
                        (league === "All sports" || s.game.league === league) &&
                        `${s.game.home.name} ${s.game.away.name}`
                          .toLowerCase()
                          .includes(search.toLowerCase()),
                    )
                    .map((s) => (
                      <article className="saved-card" key={s.game.id}>
                        <div className="saved-card-top">
                          <span className="pill">
                            {s.game.league}
                            {s.game.demo ? " · Sample" : ""}
                          </span>
                          <button
                            className="icon-button"
                            aria-label={`Remove saved ${s.game.id}`}
                            onClick={() => saveGame(s.game)}
                          >
                            <X size={16} />
                          </button>
                        </div>
                        <button
                          className="saved-title"
                          onClick={() => openGame(s.game)}
                        >
                          {s.game.away.name}
                          <span>
                            at {s.game.home.name} <ArrowUpRight size={15} />
                          </span>
                        </button>
                        <ProbabilityBar
                          game={s.game}
                          prediction={forecast(s.game)}
                        />
                        <p className="source-note">
                          Saved{" "}
                          {when(s.savedAt, {
                            month: "short",
                            day: "numeric",
                            hour: "numeric",
                            minute: "2-digit",
                          })}{" "}
                          · Frozen research snapshot
                        </p>
                        <label className="notes-label">
                          Your thesis
                          <textarea
                            aria-label={`Notes for ${s.game.away.abbr} at ${s.game.home.abbr}`}
                            placeholder="What supports your view? What would change it?"
                            value={s.note}
                            onChange={(e) =>
                              setSaved((previous) =>
                                previous.map((item) =>
                                  item.game.id === s.game.id
                                    ? { ...item, note: e.target.value }
                                    : item,
                                ),
                              )
                            }
                          />
                        </label>
                      </article>
                    ))}
                </div>
              ) : (
                <Empty
                  title="Build your research shortlist"
                  text="Save a matchup using its bookmark button. Return to compare the evidence and record your thesis."
                  action={
                    <button
                      className="primary"
                      onClick={() => navigate("Matchups")}
                    >
                      Explore matchups <ArrowRight size={14} />
                    </button>
                  }
                />
              )}
            </section>
          )}
          {view === "Methodology" && <Methodology />}
          <footer className="workspace-footer">
            <span>
              <span className="brand-mini">o</span>Built for clearer decisions.
            </span>
            <span>
              {board.mode === "demo"
                ? "Illustrative data"
                : "Public data · may be delayed"}
              <span className="footer-dot">·</span>Research only
              <span className="footer-dot">·</span>v0.1.0
            </span>
          </footer>
        </main>
      </div>
      <dialog
        ref={modalRef}
        className="research-dialog"
        aria-label="Matchup research packet"
        onCancel={() => setModal(false)}
        onClose={() => setModal(false)}
      >
        <div className="dialog-topbar">
          <span>
            <span className="brand-mini">o</span> ORACULAR / SPORTS RESEARCH
          </span>
          <div>
            {selected && (
              <button
                className={`secondary ${selectedSaved ? "saved" : ""}`}
                onClick={() => saveGame(selected)}
              >
                <Bookmark size={14} />
                {selectedSaved ? "Saved" : "Save matchup"}
              </button>
            )}
            <button
              className="icon-button"
              aria-label="Close research packet"
              onClick={() => setModal(false)}
            >
              <X size={20} />
            </button>
          </div>
        </div>
        {selected && (
          <ResearchPanel
            key={selected.id}
            game={selected}
            research={research}
            loading={researchBusy}
            error={researchError}
            quotes={quotes}
            marketWarnings={
              marketsBusy
                ? ["Checking market providers…", ...marketWarnings]
                : marketWarnings
            }
            onRetry={() => setRetry((v) => v + 1)}
          />
        )}
      </dialog>
      <dialog
        ref={briefRef}
        className="brief-dialog"
        aria-label="Daily research brief"
        onCancel={() => setBrief(false)}
        onClose={() => setBrief(false)}
      >
        <div className="dialog-topbar">
          <span>
            <Sparkles size={16} /> Daily research brief
          </span>
          <button
            className="icon-button"
            aria-label="Close daily brief"
            onClick={() => setBrief(false)}
          >
            <X size={20} />
          </button>
        </div>
        <div className="brief-body">
          <div className="eyebrow">YOUR SLATE, SYNTHESIZED</div>
          <h2>
            The desk read<span className="accent-text">.</span>
          </h2>
          <p>
            {date} · {visible.length} matchups ·{" "}
            {board.mode === "demo" ? "Illustrative sample" : "Current evidence"}
          </p>
          <pre>{briefText}</pre>
          <button
            className="primary"
            onClick={() =>
              download(`oracular-brief-${date}.txt`, briefText, "text/plain")
            }
          >
            <ArrowDownToLine size={15} />
            Download brief
          </button>
        </div>
      </dialog>
      {toast && (
        <div className="toast" role="status">
          <Check size={16} />
          {toast}
        </div>
      )}
    </div>
  );
}
function Metric({
  icon,
  label,
  value,
  note,
  live,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  note: string;
  live?: boolean;
}) {
  return (
    <div className="metric-card">
      <div className="metric-label">
        {label}
        <span>{icon}</span>
      </div>
      <div className="metric-value">
        {value}
        {live && (
          <span className="metric-live">
            <span className="live-dot" />
            LIVE
          </span>
        )}
      </div>
      <p>{note}</p>
    </div>
  );
}
function Featured({
  game,
  index,
  saved,
  onOpen,
  onSave,
}: {
  game: Game;
  index: number;
  saved: boolean;
  onOpen: () => void;
  onSave: () => void;
}) {
  const f = forecast(game),
    favorite = f.favorite ? game[f.favorite] : null;
  const reference = game.quotes[0],
    fair = reference ? noVig(reference) : null;
  return (
    <article className={`featured-card ${index === 0 ? "spotlight" : ""}`}>
      <div className="featured-card-top">
        <span className="featured-league">
          <span>{leagueIcons[game.league]}</span>
          {game.league}
          <span>·</span>
          {game.seasonType === 1
            ? "Preseason"
            : game.seasonType === 3
              ? "Postseason"
              : "Regular season"}
        </span>
        <button
          className={`icon-button ${saved ? "saved" : ""}`}
          aria-label={`${saved ? "Unsave" : "Save"} radar ${game.id}`}
          onClick={onSave}
        >
          <Bookmark size={15} />
        </button>
      </div>
      <button className="featured-matchup" onClick={onOpen}>
        <div>
          <TeamMark team={game.home} />
          <span>{game.home.shortName}</span>
          <small>{game.home.record}</small>
        </div>
        <span className="versus">
          vs<small>{when(game.start)}</small>
        </span>
        <div>
          <TeamMark team={game.away} />
          <span>{game.away.shortName}</span>
          <small>{game.away.record}</small>
        </div>
      </button>
      <div className="featured-prediction">
        <div>
          <span className="eyebrow">MODEL LEAN</span>
          <strong>
            {favorite?.abbr ?? "—"} <ArrowUpRight size={14} />
          </strong>
        </div>
        <div>
          <span className="eyebrow">WIN PROBABILITY</span>
          <strong className="accent-text">
            {pct(f.home !== null ? Math.max(f.home, f.away!) : null, 1)}
          </strong>
        </div>
        <div>
          <span className="eyebrow">MARKET FAIR</span>
          <strong>{fair && f.favorite ? pct(fair[f.favorite], 1) : "—"}</strong>
        </div>
      </div>
      <div className="featured-footer">
        <span>
          <span className="accent-text">✳</span>
          {f.quality} sample coverage
        </span>
        <button onClick={onOpen}>
          Research matchup <ArrowRight size={13} />
        </button>
      </div>
    </article>
  );
}
function TeamsTable({
  teams,
  games,
  onOpen,
}: {
  teams: Team[];
  games: Game[];
  onOpen: (game: Game) => void;
}) {
  return teams.length ? (
    <div className="table-scroll">
      <table className="teams-table">
        <thead>
          <tr>
            <th>Team / competition</th>
            <th>Record</th>
            <th>Win %</th>
            <th>Scored / game</th>
            <th>Allowed / game</th>
            <th>Streak</th>
            <th>Research</th>
          </tr>
        </thead>
        <tbody>
          {teams.map((t) => {
            const game = games.find(
              (g) => g.home.id === t.id || g.away.id === t.id,
            );
            return (
              <tr key={`${t.league}-${t.id}`}>
                <td>
                  <div className="team-name">
                    <TeamMark team={t} small />
                    <span>
                      {t.name}
                      <small>
                        {t.league} · {t.group ?? "Current season"}
                      </small>
                    </span>
                  </div>
                </td>
                <td>{t.record}</td>
                <td>
                  {t.wins !== null &&
                  t.losses !== null &&
                  t.wins + t.losses + t.ties > 0
                    ? pct(t.wins / (t.wins + t.losses + t.ties), 1)
                    : "—"}
                </td>
                <td>{t.averageFor?.toFixed(1) ?? "—"}</td>
                <td>{t.averageAgainst?.toFixed(1) ?? "—"}</td>
                <td>{t.streak ?? "—"}</td>
                <td>
                  {game ? (
                    <button
                      className="text-button"
                      onClick={() => onOpen(game)}
                    >
                      Matchup <ArrowUpRight size={13} />
                    </button>
                  ) : (
                    <span className="muted">Off slate</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  ) : (
    <Empty
      title="Standings unavailable for this view"
      text="Try another sport or date. Oracular uses scoreboard records when detailed standings are missing."
    />
  );
}
function Methodology() {
  return (
    <div className="methodology">
      <section className="method-hero">
        <span className="method-symbol">✳</span>
        <span className="eyebrow">THE ORACULAR APPROACH</span>
        <h2>
          Understand the game.
          <br />
          <span className="accent-text">Then question the price.</span>
        </h2>
        <p>
          Oracular turns sports data into an inspectable research packet. A
          predicted winner and a worthwhile market price are separate questions.
        </p>
      </section>
      <div className="method-grid">
        {[
          [
            "01",
            "Gather the evidence",
            "ESPN provides schedules, scores, current-season records, standings, player leaders, recent results and injuries. Missing information stays missing. Live mode never substitutes sample statistics.",
          ],
          [
            "02",
            "Build a baseline",
            "Season wins and losses receive a symmetric Beta(5,5) prior. The home-away logit difference receives 65% weight; scoring margin receives 35%, with sample shrinkage. A sport-specific home adjustment is added before a sigmoid and a 15–85% cap.",
          ],
          [
            "03",
            "Inspect the context",
            "Player injuries, lineups, rest, opponent strength and tournament stakes require research. They do not adjust v1 probabilities. In-game and final games do not receive retrospective pregame forecasts. Provider live probability is labeled separately.",
          ],
          [
            "04",
            "Compare the market",
            "Market prices never enter the model. Two-sided implied probabilities are normalized to remove margin. EV = model probability × decimal price − 1. Signals require recent timestamped quotes, positive EV, a gap of at least 3 percentage points and adequate sample coverage.",
          ],
          [
            "05",
            "Preserve your thesis",
            "Save the game, source and calculated baseline as a local snapshot. Add notes, export the packet and revisit the evidence. Watchlist entries remain snapshots; they are not automatically graded as historical predictions.",
          ],
          [
            "06",
            "Measure before trusting",
            "This v1 is a transparent, uncalibrated heuristic. There is no claimed win rate or backtest. The next validation step is timestamped, out-of-sample evaluation with Brier score, log loss, calibration and closing-line comparisons.",
          ],
        ].map(([n, title, text]) => (
          <article className="panel method-card" key={n}>
            <span>{n}</span>
            <h3>{title}</h3>
            <p>{text}</p>
          </article>
        ))}
      </div>
      <div className="panel model-parameters">
        <PanelTitle
          title="Baseline parameters"
          subtitle="Fixed initial assumptions; not fitted to historical results"
        />
        <table>
          <thead>
            <tr>
              <th>Sport</th>
              <th>Margin scale</th>
              <th>Home adjustment</th>
              <th>Outcome convention</th>
            </tr>
          </thead>
          <tbody>
            {Object.entries(LEAGUES).map(([key, l]) => (
              <tr key={key}>
                <td>{key}</td>
                <td>
                  {l.scale} {l.unit.toLowerCase()}
                </td>
                <td>
                  +{l.home} {l.unit.toLowerCase()}
                </td>
                <td>
                  {key === "NFL"
                    ? "Conditional on no tie"
                    : "Game winner incl. overtime"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="section-note">
          Home advantage is zero at neutral venues. Preseason market signals are
          withheld. ESPN reference odds without update timestamps never qualify
          as verified signals. Polymarket prices are indicative and exclude fees
          and slippage.
        </p>
      </div>
    </div>
  );
}
