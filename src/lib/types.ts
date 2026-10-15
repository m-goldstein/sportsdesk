export const LEAGUES = {
  NBA: {
    sport: "basketball",
    slug: "nba",
    odds: "basketball_nba",
    name: "National Basketball Association",
    unit: "PTS",
    scale: 12,
    home: 2.5,
  },
  NFL: {
    sport: "football",
    slug: "nfl",
    odds: "americanfootball_nfl",
    name: "National Football League",
    unit: "PTS",
    scale: 10,
    home: 2,
  },
  MLB: {
    sport: "baseball",
    slug: "mlb",
    odds: "baseball_mlb",
    name: "Major League Baseball",
    unit: "RUNS",
    scale: 3,
    home: 0.2,
  },
  NHL: {
    sport: "hockey",
    slug: "nhl",
    odds: "icehockey_nhl",
    name: "National Hockey League",
    unit: "GOALS",
    scale: 1.8,
    home: 0.2,
  },
  NCAAM: {
    sport: "basketball",
    slug: "mens-college-basketball",
    odds: "basketball_ncaab",
    name: "NCAA Men's Basketball",
    unit: "PTS",
    scale: 11,
    home: 3,
  },
} as const;
export type League = keyof typeof LEAGUES;
export type Mode = "live" | "demo";
export type Source = {
  name: string;
  url: string;
  fetchedAt: string;
  note?: string;
};
export type Team = {
  league?: League;
  id: string;
  name: string;
  shortName: string;
  abbr: string;
  color: string;
  record: string;
  wins: number | null;
  losses: number | null;
  ties: number;
  score: number;
  averageFor: number | null;
  averageAgainst: number | null;
  rank?: number;
  streak?: string;
  group?: string;
};
export type Quote = {
  id: string;
  provider: string;
  kind: "sportsbook" | "prediction";
  homePrice: number;
  awayPrice: number;
  updatedAt: string | null;
  url: string;
  volume?: number;
  note?: string;
};
export type Game = {
  id: string;
  league: League;
  start: string;
  state: "pre" | "in" | "post";
  status: string;
  statusName: string;
  period: number;
  clock: string;
  home: Team;
  away: Team;
  venue: string;
  neutral: boolean;
  season: string;
  seasonType: number;
  context: string;
  quotes: Quote[];
  source: Source;
  demo: boolean;
};
export type Factor = { name: string; value: number; detail: string };
export type Forecast = {
  home: number | null;
  away: number | null;
  favorite: "home" | "away" | null;
  quality: "Limited" | "Developing" | "Established";
  factors: Factor[];
  reasons: string[];
  limitations: string[];
  label: string;
};
export type Board = {
  games: Game[];
  teams: Team[];
  leagues: { league: League; season: string; error?: string }[];
  fetchedAt: string;
  mode: Mode;
  warnings: string[];
};
export type Player = {
  id: string;
  name: string;
  team: string;
  position: string;
  value: string;
  metric: string;
  url: string;
  status?: string;
};
export type Injury = {
  name: string;
  team: string;
  status: string;
  detail: string;
  date: string;
};
export type RecentGame = {
  team: string;
  opponent: string;
  date: string;
  result: string;
  score: string;
};
export type Research = {
  gameId: string;
  fetchedAt: string;
  players: Player[];
  injuries: Injury[];
  recent: RecentGame[];
  stats: { label: string; home: string; away: string }[];
  headlines: { title: string; url: string }[];
  sources: Source[];
  warnings: string[];
  liveHomeProbability: number | null;
};
export function isLeague(value: string): value is League {
  return value in LEAGUES;
}
