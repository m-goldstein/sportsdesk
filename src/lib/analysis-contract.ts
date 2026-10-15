import { z } from "zod";
import type { Forecast, Game, Quote } from "./types";

export const PACKET_VERSION = "sportsdesk.matchup.v1";
export const PROMPT_VERSION = "sportsdesk.gpt.v1";
export const categories = [
  "matchup",
  "players",
  "availability",
  "statistics",
  "schedule",
  "news",
  "coaching",
  "markets",
  "environment",
] as const;
export type Category = (typeof categories)[number];
export type EvidenceSource = {
  id: string;
  name: string;
  url: string;
  fetchedAt: string;
  kind: "sports-feed" | "web-research" | "sample";
};
export type Evidence = {
  id: string;
  category: Category;
  side: "home" | "away" | "both";
  title: string;
  data: Record<string, unknown>;
  sourceId: string;
  observedAt: string;
  publishedAt: string | null;
  scope: string;
};
export type AnalysisPacket = {
  schemaVersion: typeof PACKET_VERSION;
  assembledAt: string;
  evidenceCutoff: string;
  game: Game;
  baseline: Forecast;
  evidence: Evidence[];
  sources: EvidenceSource[];
  coverage: {
    category: Category;
    count: number;
    status: "available" | "missing";
  }[];
  quotes: Quote[];
  gaps: string[];
  sportChecklist: string[];
  webResearch: {
    status: "pending" | "complete" | "unavailable" | "sample";
    searchedAt: string | null;
    warnings: string[];
  };
};
const evidenceIds = z.array(z.string()).max(12);
const read = z.object({
  summary: z.string().max(1800),
  evidenceIds,
  uncertainties: z.array(z.string().max(400)).max(6),
});
export const judgmentSchema = z.object({
  decision: z.enum(["lean_home", "lean_away", "no_lean"]),
  homeWinProbability: z.number().min(0.01).max(0.99).nullable(),
  confidence: z.enum(["low", "moderate", "high"]),
  summary: z.string().max(1800),
  matchupOverview: read,
  playerOverview: read,
  newsOverview: read,
  coachOverview: read,
  factors: z
    .array(
      z.object({
        title: z.string().max(120),
        direction: z.enum(["home", "away", "mixed"]),
        explanation: z.string().max(1000),
        evidenceIds,
      }),
    )
    .max(8),
  counterCase: read,
  risks: z.array(z.string().max(600)).max(8),
  whatWouldChangeTheView: z.array(z.string().max(600)).max(6),
  marketVerdict: z.enum(["watch", "pass"]),
  marketExplanation: z.string().max(1200),
});
export type Judgment = z.infer<typeof judgmentSchema>;
export const webDossierSchema = z.object({
  findings: z
    .array(
      z.object({
        category: z.enum([
          "players",
          "availability",
          "news",
          "coaching",
          "environment",
          "statistics",
        ]),
        side: z.enum(["home", "away", "both"]),
        title: z.string().max(160),
        finding: z.string().max(900),
        sourceUrl: z.string().max(2000),
        publishedAt: z.string().nullable(),
      }),
    )
    .max(18),
  gaps: z.array(z.string().max(400)).max(12),
});
export type WebDossier = z.infer<typeof webDossierSchema>;
export type AnalysisResult = {
  packet: AnalysisPacket;
  judgment: Judgment;
  generatedAt: string;
  model: string;
  promptVersion: typeof PROMPT_VERSION;
  packetHash: string;
  mode: "gpt" | "sample";
  usage: { inputTokens: number; outputTokens: number; webSearchCalls: number };
};
