import { z } from "zod";
import { ContractEvent } from "./market-contracts";
export const ELECTION_RACES = [
  {
    id: "michigan-governor",
    state: "Michigan",
    office: "Governor",
    slug: "michigan-governor-winner-2026",
    date: "2026-11-03",
  },
  {
    id: "wisconsin-governor",
    state: "Wisconsin",
    office: "Governor",
    slug: "wisconsin-governor-winner-2026",
    date: "2026-11-03",
  },
  {
    id: "arizona-governor",
    state: "Arizona",
    office: "Governor",
    slug: "arizona-governor-winner-2026",
    date: "2026-11-03",
  },
  {
    id: "georgia-governor",
    state: "Georgia",
    office: "Governor",
    slug: "georgia-governor-winner-2026",
    date: "2026-11-03",
  },
  {
    id: "nevada-governor",
    state: "Nevada",
    office: "Governor",
    slug: "nevada-governor-winner-2026",
    date: "2026-11-03",
  },
  {
    id: "pennsylvania-governor",
    state: "Pennsylvania",
    office: "Governor",
    slug: "pennsylvania-governor-winner-2026",
    date: "2026-11-03",
  },
  {
    id: "ohio-governor",
    state: "Ohio",
    office: "Governor",
    slug: "ohio-governor-winner-2026",
    date: "2026-11-03",
  },
  {
    id: "texas-governor",
    state: "Texas",
    office: "Governor",
    slug: "texas-governor-winner-2026",
    date: "2026-11-03",
  },
  {
    id: "georgia-senate",
    state: "Georgia",
    office: "Senate",
    slug: "georgia-senate-election-winner",
    date: "2026-11-03",
  },
  {
    id: "north-carolina-senate",
    state: "North Carolina",
    office: "Senate",
    slug: "north-carolina-senate-election-winner",
    date: "2026-11-03",
  },
] as const;
export type ElectionRace = (typeof ELECTION_RACES)[number];
export const pollSchema = z.object({
  pollster: z.string().min(2).max(120),
  sourceUrl: z.string().max(2000),
  publishedAt: z.string(),
  fieldStart: z.string(),
  fieldEnd: z.string(),
  population: z.enum(["likely-voters", "registered-voters", "adults"]),
  sampleSize: z.number().int().min(100).max(20000),
  sponsor: z.string().max(150),
  methodology: z.string().max(800),
  results: z
    .array(
      z.object({ contractId: z.string(), percent: z.number().min(0).max(100) }),
    )
    .min(2)
    .max(8),
});
export const electionDossierSchema = z.object({
  summary: z.string().max(2000),
  polls: z.array(pollSchema).max(12),
  news: z
    .array(
      z.object({
        title: z.string().max(200),
        sourceUrl: z.string().max(2000),
        publishedAt: z.string(),
        summary: z.string().max(1000),
        candidateSentiment: z
          .array(
            z.object({
              contractId: z.string(),
              tone: z.enum(["positive", "neutral", "negative", "mixed"]),
              score: z.number().min(-1).max(1),
              explanation: z.string().max(700),
            }),
          )
          .max(8),
      }),
    )
    .max(12),
  risks: z.array(z.string().max(500)).max(12),
  missingEvidence: z.array(z.string().max(500)).max(12),
});
export type Poll = z.infer<typeof pollSchema>;
export type ElectionDossier = z.infer<typeof electionDossierSchema>;
export type ElectionReport = ElectionDossier & {
  raceId: string;
  mode: "live" | "demo";
  generatedAt: string;
  model: string;
  sources: { url: string; title: string }[];
  validationWarnings: string[];
  hash: string;
  inputTokens: number;
  outputTokens: number;
};
export type ElectionRow = {
  race: ElectionRace;
  event: ContractEvent | null;
  warnings: string[];
};
export type ElectionBoard = {
  mode: "live" | "demo";
  fetchedAt: string;
  rows: ElectionRow[];
  configured: boolean;
};
