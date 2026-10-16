import { electionDossierSchema, ElectionReport } from "./election-types";
export const ELECTION_REPORTS_KEY = "sportsdesk.election-reports.v1";
export function parseElectionReports(value: unknown): ElectionReport[] {
  if (!Array.isArray(value)) return [];
  return value
    .slice(0, 30)
    .filter(
      (r): r is ElectionReport =>
        !!r &&
        typeof r.raceId === "string" &&
        ["demo", "live"].includes(r.mode) &&
        Number.isFinite(Date.parse(r.generatedAt)) &&
        typeof r.model === "string" &&
        typeof r.hash === "string" &&
        Array.isArray(r.validationWarnings) &&
        r.validationWarnings.every((s: unknown) => typeof s === "string") &&
        Array.isArray(r.sources) &&
        r.sources.every(
          (s: { url?: unknown; title?: unknown }) =>
            typeof s.url === "string" && typeof s.title === "string",
        ) &&
        electionDossierSchema.safeParse(r).success,
    );
}
