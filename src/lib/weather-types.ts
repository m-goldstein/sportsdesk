import { ContractEvent } from "./market-contracts";
export const WEATHER_CITIES = [
  {
    id: "nyc",
    name: "New York City",
    station: "KLGA",
    airport: "LaGuardia",
    timezone: "America/New_York",
  },
  {
    id: "chicago",
    name: "Chicago",
    station: "KORD",
    airport: "O’Hare",
    timezone: "America/Chicago",
  },
  {
    id: "miami",
    name: "Miami",
    station: "KMIA",
    airport: "Miami International",
    timezone: "America/New_York",
  },
  {
    id: "seattle",
    name: "Seattle",
    station: "KSEA",
    airport: "Seattle–Tacoma",
    timezone: "America/Los_Angeles",
  },
  {
    id: "atlanta",
    name: "Atlanta",
    station: "KATL",
    airport: "Hartsfield–Jackson",
    timezone: "America/New_York",
  },
  {
    id: "dallas",
    name: "Dallas",
    station: "KDAL",
    airport: "Dallas Love Field",
    timezone: "America/Chicago",
  },
  {
    id: "los-angeles",
    name: "Los Angeles",
    station: "KLAX",
    airport: "Los Angeles International",
    timezone: "America/Los_Angeles",
  },
  {
    id: "austin",
    name: "Austin",
    station: "KAUS",
    airport: "Austin–Bergstrom",
    timezone: "America/Chicago",
  },
  {
    id: "denver",
    name: "Denver",
    station: "KBKF",
    airport: "Buckley Space Force Base",
    timezone: "America/Denver",
  },
] as const;
export type WeatherCity = (typeof WEATHER_CITIES)[number];
export type HourTemperature = {
  start: string;
  end: string;
  fahrenheit: number;
  summary: string;
};
export type WeatherForecast = {
  high: number | null;
  daytimeHigh: number | null;
  hourlyHigh: number | null;
  completeDay: boolean;
  hours: HourTemperature[];
  updatedAt: string | null;
  fetchedAt: string;
  hourlyUrl: string;
  forecastUrl: string;
  stationUrl: string;
  summary: string;
  warnings: string[];
};
export type TemperatureBucket = {
  label: string;
  low: number | null;
  high: number | null;
  contractId: string;
};
export type WeatherRow = {
  city: WeatherCity;
  date: string;
  forecast: WeatherForecast | null;
  event: ContractEvent | null;
  buckets: TemperatureBucket[];
  rulesVerified: boolean;
  partitionComplete: boolean;
  warnings: string[];
};
export type WeatherBoard = {
  mode: "live" | "demo";
  date: string;
  fetchedAt: string;
  rows: WeatherRow[];
  warnings: string[];
};
export type WeatherSettings = {
  sigma: number;
  bias: number;
  shares: number;
  buffer: number;
  extraCost: number;
};
export const DEFAULT_WEATHER_SETTINGS: WeatherSettings = {
  sigma: 3,
  bias: 0,
  shares: 10,
  buffer: 0.002,
  extraCost: 0.05,
};
export function cityDate(time: string | number, timezone: string) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(time));
}
export function addDays(date: string, days: number) {
  return new Date(Date.parse(date + "T12:00:00Z") + days * 86400000)
    .toISOString()
    .slice(0, 10);
}
export function weatherSlug(city: WeatherCity, date: string) {
  const [year, month, day] = date.split("-").map(Number);
  const months = [
    "january",
    "february",
    "march",
    "april",
    "may",
    "june",
    "july",
    "august",
    "september",
    "october",
    "november",
    "december",
  ];
  return `highest-temperature-in-${city.id}-on-${months[month - 1]}-${day}-${year}`;
}
