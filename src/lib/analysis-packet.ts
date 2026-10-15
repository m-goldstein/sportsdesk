import { createHash } from "node:crypto";
import { forecast, noVig, quoteFresh } from "./model";
import { AnalysisPacket, categories, Category, Evidence, EvidenceSource, Judgment, PACKET_VERSION, WebDossier } from "./analysis-contract";
import type { Game, Quote, Research } from "./types";

export const SPORT_CHECKLISTS: Record<Game["league"], string[]> = {
  NBA: ["Availability and projected minutes for primary creators", "Pace and possession-adjusted offense/defense; raw PPG is not efficiency", "Three-point variance, turnovers and offensive rebounding", "Rest, back-to-back schedule, travel and rotation changes"],
  NCAAM: ["Opponent-adjusted efficiency and strength of schedule", "Neutral court, tournament round and single-elimination variance", "Player availability, rotation depth and foul risk", "Coaching scheme and current roster continuity"],
  NFL: ["Starting quarterback and offensive-line availability", "EPA/play, success rate and pressure when sourced", "Rest, outdoor wind/weather and surface", "Coaching/play-caller changes and tie/settlement convention"],
  MLB: ["Confirmed starting pitcher, handedness and batting lineup", "Bullpen availability and recent workload", "Park/weather, defense and platoon splits", "K-BB%, xwOBA or xERA only when directly sourced; small samples"],
  NHL: ["Confirmed starting goalie and workload", "Five-on-five shot quality/xG when sourced", "Special teams, rest and travel", "Injury/line-combination changes; overtime settlement rules"],
};
export function canonicalUrl(value: string): string | null {
  try { const u = new URL(value); if (u.protocol !== "https:" || u.username || u.password) return null; u.hash = ""; for (const key of [...u.searchParams.keys()]) if (key.startsWith("utm_") || key === "ref") u.searchParams.delete(key); return u.toString().replace(/\/$/, ""); } catch { return null; }
}
export function completeCoverage(packet: AnalysisPacket) {
  packet.coverage = categories.map(category => { const count = packet.evidence.filter(e => e.category === category).length; return { category, count, status: count ? "available" : "missing" }; });
  packet.gaps = [...new Set(packet.gaps)];
  return packet;
}
export function addEvidence(packet: AnalysisPacket, item: Omit<Evidence, "id">) {
  const id = `E${String(packet.evidence.length + 1).padStart(3, "0")}`;
  packet.evidence.push({ id, ...item }); return id;
}
export function addSource(packet: AnalysisPacket, source: Omit<EvidenceSource, "id">) {
  const url = canonicalUrl(source.url) ?? source.url;
  const existing = packet.sources.find(s => s.url === url && s.name === source.name);
  if (existing) return existing.id;
  const id = `S${String(packet.sources.length + 1).padStart(3, "0")}`;
  packet.sources.push({ ...source, url, id }); return id;
}
export function basePacket(game: Game, research: Research | null, quotes: Quote[], warnings: string[], now = new Date().toISOString()): AnalysisPacket {
  const packet: AnalysisPacket = {
    schemaVersion: PACKET_VERSION, assembledAt: now, evidenceCutoff: now,
    game, baseline: forecast(game), evidence: [], sources: [], coverage: [], quotes,
    gaps: [...warnings, ...(research?.warnings ?? []), "Starting lineups and player minutes are not confirmed by the scoreboard.", "No historical calibration or accuracy claim applies to GPT probabilities."],
    sportChecklist: SPORT_CHECKLISTS[game.league], webResearch: { status: game.demo ? "sample" : "pending", searchedAt: null, warnings: [] },
  };
  const src = addSource(packet, { ...game.source, kind: game.demo ? "sample" : "sports-feed" });
  addEvidence(packet, { category: "matchup", side: "both", title: "Matchup identity, competition and scoreboard snapshot", sourceId: src, observedAt: game.source.fetchedAt, publishedAt: null, scope: game.season, data: { league: game.league, home: game.home, away: game.away, venue: game.venue, neutralSite: game.neutral, competition: game.context, seasonType: game.seasonType, state: game.state, period: game.period, clock: game.clock, startsAt: game.start } });
  if (research) {
    const summarySource = research.sources[0];
    const s = summarySource ? addSource(packet, { ...summarySource, kind: game.demo ? "sample" : "sports-feed" }) : src;
    const common = { sourceId: s, observedAt: research.fetchedAt, publishedAt: null, scope: "Provider matchup summary; season leaders and game stats retain their labels" };
    if (research.players.length) addEvidence(packet, { ...common, category: "players", side: "both", title: "Matchup player leaders and game statistics", data: { players: research.players.slice(0, 24) } });
    if (research.injuries.length) addEvidence(packet, { ...common, category: "availability", side: "both", title: "Reported player injuries", data: { entries: research.injuries.slice(0, 28), note: "Status reports may be incomplete; no entries does not establish a healthy lineup." } });
    if (research.stats.length) addEvidence(packet, { ...common, category: "statistics", side: "both", title: "Provider team-stat comparison", data: { stats: research.stats.slice(0, 24), note: "These are provider-labeled comparison values; do not assume identical sample scopes or treat PPG as pace-adjusted efficiency." } });
    if (game.state === "in" && research.liveHomeProbability !== null) addEvidence(packet, { ...common, category: "matchup", side: "both", title: "Provider in-game probability", data: { homeWinProbability: research.liveHomeProbability, origin: "ESPN; independent of Sportsdesk baseline and GPT" } });
  }
  if (quotes.length) addEvidence(packet, { category: "markets", side: "both", title: "Independent moneyline reference prices", sourceId: src, observedAt: now, publishedAt: null, scope: "Current fetched prices; provider quote timestamps remain separate", data: { quotes: quotes.map(q => ({ ...q, fair: noVig(q), fresh: !game.demo && quoteFresh(q, Date.parse(now)) })), note: "ESPN prices without provider timestamps and all sample prices are reference-only. Prediction prices are indicative, before fees/spread/slippage. A likely winner can be a poor bet." } });
  return completeCoverage(packet);
}
const SEARCH_DOMAINS = ["nba.com", "nfl.com", "mlb.com", "nhl.com", "ncaa.com", "espn.com", "apnews.com", "reuters.com", "weather.gov"];
export const allowedResearchDomains = SEARCH_DOMAINS;
export function acceptedResearchUrl(url: string) {
  const value = canonicalUrl(url); if (!value) return null;
  const host = new URL(value).hostname;
  return SEARCH_DOMAINS.some(d => host === d || host.endsWith(`.${d}`)) ? value : null;
}
export function enrichPacket(packet: AnalysisPacket, dossier: WebDossier, returnedSources: { url: string; title?: string }[], now = new Date().toISOString()) {
  const seen = new Set(packet.sources.map(s => canonicalUrl(s.url)).filter(Boolean));
  const retrieved = new Map(returnedSources.flatMap(s => { const url = acceptedResearchUrl(s.url); return url ? [[url, s] as const] : []; }));
  let rejected = 0;
  for (const finding of dossier.findings) {
    const url = acceptedResearchUrl(finding.sourceUrl), found = url ? retrieved.get(url) : null;
    const published = finding.publishedAt ? Date.parse(finding.publishedAt) : null;
    if (!url || !found || (published !== null && (!Number.isFinite(published) || published > Date.parse(packet.evidenceCutoff)))) { rejected++; continue; }
    // Undated current-status/news claims cannot establish fresh availability or breaking news.
    if ((finding.category === "news" || finding.category === "availability") && (published === null || Date.parse(packet.evidenceCutoff) - published > 7 * 86400000)) { rejected++; continue; }
    const key = `${url}:${finding.finding.toLowerCase().replace(/\W/g, "").slice(0, 120)}`;
    if (seen.has(key)) continue; seen.add(key);
    const sourceId = addSource(packet, { name: found.title ?? new URL(url).hostname, url, fetchedAt: now, kind: "web-research" });
    addEvidence(packet, { category: finding.category, side: finding.side, title: finding.title, sourceId, observedAt: now, publishedAt: finding.publishedAt, scope: "Web-retrieved claim summarized by GPT; citation presence is checked, factual entailment is not independently proven", data: { finding: finding.finding } });
  }
  packet.gaps.push(...dossier.gaps);
  packet.webResearch = { status: "complete", searchedAt: now, warnings: rejected ? [`${rejected} web findings were excluded because their source, date or freshness could not be validated.`] : [] };
  return completeCoverage(packet);
}
export function packetHash(packet: AnalysisPacket) { return createHash("sha256").update(JSON.stringify(packet)).digest("hex"); }
export function validateJudgment(judgment: Judgment, packet: AnalysisPacket): Judgment {
  const sections = [judgment.matchupOverview, judgment.playerOverview, judgment.newsOverview, judgment.coachOverview, judgment.counterCase, ...judgment.factors];
  const ids = new Set(packet.evidence.map(e => e.id));
  if (sections.some(s => s.evidenceIds.some(id => !ids.has(id)))) throw new Error("GPT returned a citation outside the evidence packet.");
  if (judgment.factors.some(f => !f.evidenceIds.length)) throw new Error("GPT returned an uncited decision factor.");
  if (judgment.decision === "lean_home" && (judgment.homeWinProbability === null || judgment.homeWinProbability <= .5)) throw new Error("GPT's probability does not match its home lean.");
  if (judgment.decision === "lean_away" && (judgment.homeWinProbability === null || judgment.homeWinProbability >= .5)) throw new Error("GPT's probability does not match its away lean.");
  if (judgment.decision === "no_lean") judgment.homeWinProbability = null;
  const thin = !packet.coverage.find(c => c.category === "players")?.count || packet.baseline.quality === "Limited" || packet.webResearch.status === "unavailable";
  if (thin && judgment.confidence === "high") judgment.confidence = "moderate";
  if (packet.game.seasonType === 1 || !packet.quotes.some(q => quoteFresh(q, Date.parse(packet.assembledAt)))) judgment.marketVerdict = "pass";
  return judgment;
}
