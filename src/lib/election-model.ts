import { canonicalUrl, Contract } from "./market-contracts";
import {
  ElectionDossier,
  ElectionReport,
  ElectionRow,
  Poll,
} from "./election-types";
export const POLL_DOMAINS = [
  "maristpoll.marist.edu",
  "poll.qu.edu",
  "qu.edu",
  "emersoncollegepolling.com",
  "suffolk.edu",
  "nytimes.com",
  "umass.edu",
  "unh.edu",
  "yougov.com",
  "today.yougov.com",
  "morningconsult.com",
  "foxnews.com",
  "cnn.com",
  "fau.edu",
  "researchco.ca",
  "noblepredictiveinsights.com",
];
export const NEWS_DOMAINS = [
  ...POLL_DOMAINS,
  "apnews.com",
  "reuters.com",
  "nbcnews.com",
  "pbs.org",
  "npr.org",
  "ballotpedia.org",
];
export function allowedSource(url: string, domains: string[]) {
  const normalized = canonicalUrl(url);
  if (!normalized) return false;
  const host = new URL(normalized).hostname;
  return domains.some((d) => host === d || host.endsWith("." + d));
}
export function candidateContracts(row: ElectionRow): Contract[] {
  return (row.event?.contracts ?? []).filter(
    (c) => c.label.trim() && !/^(Option\s+[A-Z]|Other)$/i.test(c.label.trim()),
  );
}
function pollsterKey(poll: Poll, sample = false) {
  if (sample) return poll.pollster.toLowerCase().replace(/[^a-z0-9]/g, "");
  const url = canonicalUrl(poll.sourceUrl);
  if (!url) return "invalid-source";
  const host = new URL(url).hostname.replace(/^www\./, "");
  const family = POLL_DOMAINS.find((d) => host === d || host.endsWith("." + d));
  return family ?? poll.pollster.toLowerCase().replace(/[^a-z0-9]/g, "");
}
function dateTime(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? Date.parse(value + "T00:00:00Z")
    : Date.parse(value);
}
export function validateElectionDossier(
  dossier: ElectionDossier,
  row: ElectionRow,
  sources: { url: string; title: string }[],
  now = Date.now(),
) {
  const warnings: string[] = [],
    returned = new Set(
      sources.flatMap((s) => {
        const u = canonicalUrl(s.url);
        return u ? [u] : [];
      }),
    );
  const ids = candidateContracts(row).map((c) => c.id),
    source = (u: string, domains: string[]) =>
      !!canonicalUrl(u) &&
      returned.has(canonicalUrl(u)!) &&
      allowedSource(u, domains);
  const seen = new Set<string>();
  const polls = dossier.polls.filter((p) => {
    const end = dateTime(p.fieldEnd),
      start = Date.parse(p.fieldStart),
      published = dateTime(p.publishedAt),
      actualEnd = Date.parse(p.fieldEnd);
    const key = `${pollsterKey(p)}:${p.fieldEnd}:${p.population}`;
    const total = p.results.reduce((s, r) => s + r.percent, 0);
    const good =
      source(p.sourceUrl, POLL_DOMAINS) &&
      Number.isFinite(end) &&
      Number.isFinite(start) &&
      Number.isFinite(published) &&
      start <= end &&
      actualEnd <= now &&
      published >= actualEnd &&
      published <= now &&
      now - actualEnd <= 45 * 86400000 &&
      p.population !== "adults" &&
      p.results.length === ids.length &&
      new Set(p.results.map((r) => r.contractId)).size === ids.length &&
      ids.every((id) => p.results.some((r) => r.contractId === id)) &&
      total >= 60 &&
      total <= 100.5 &&
      !seen.has(key) &&
      end < Date.parse(row.race.date + "T23:59:59Z");
    if (good) seen.add(key);
    else
      warnings.push(
        `Excluded poll from ${p.pollster}: incomplete candidate coverage, dates, duplicate, population or source checks failed.`,
      );
    return good;
  });
  const seenNews = new Set<string>();
  const news = dossier.news.filter((n) => {
    const published = Date.parse(n.publishedAt),
      url = canonicalUrl(n.sourceUrl);
    const good =
      !!url &&
      source(n.sourceUrl, NEWS_DOMAINS) &&
      Number.isFinite(published) &&
      published <= now &&
      now - published <= 14 * 86400000 &&
      !seenNews.has(url) &&
      n.candidateSentiment.every((s) => ids.includes(s.contractId));
    if (good) seenNews.add(url!);
    else
      warnings.push(
        `Excluded news item: ${n.title}. Source, candidate or publication date could not be accepted.`,
      );
    return good;
  });
  return { ...dossier, polls, news, validationWarnings: warnings };
}
export function electionForecast(
  row: ElectionRow,
  report: ElectionReport | null,
  withSentiment = false,
  now = Date.now(),
) {
  const candidates = candidateContracts(row);
  if (
    !report ||
    report.raceId !== row.race.id ||
    (report.mode === "live" && !row.event?.active) ||
    (report.mode === "live" &&
      (now - Date.parse(report.generatedAt) > 48 * 3600000 ||
        Date.parse(report.generatedAt) > now + 60000)) ||
    (now >= Date.parse(row.race.date + "T05:00Z") && report.mode === "live")
  )
    return null;
  const polls = report.polls.filter(
    (p) =>
      now - Date.parse(p.fieldEnd) <= 45 * 86400000 &&
      Date.parse(p.fieldEnd) <= now &&
      p.population !== "adults" &&
      candidates.every((c) => p.results.some((r) => r.contractId === c.id)),
  );
  // Retain the most recent survey per pollster; repeated polls do not create false independence.
  const byPollster = new Map<string, Poll>();
  for (const p of [...polls].sort(
    (a, b) => Date.parse(b.fieldEnd) - Date.parse(a.fieldEnd),
  )) {
    const key = pollsterKey(p, report.mode === "demo");
    if (!byPollster.has(key)) byPollster.set(key, p);
  }
  const independent = [...byPollster.values()];
  if (independent.length < 2 || candidates.length < 2 || candidates.length > 8)
    return null;
  const weights = independent.map(
    (p) =>
      Math.exp(-(now - Date.parse(p.fieldEnd)) / (14 * 86400000)) *
      Math.sqrt(Math.min(3000, p.sampleSize)) *
      (p.population === "likely-voters" ? 1 : 0.8),
  );
  const total = weights.reduce((s, w) => s + w, 0);
  const averages = candidates.map(
    (c) =>
      independent.reduce(
        (s, p, i) =>
          s +
          p.results.find((r) => r.contractId === c.id)!.percent * weights[i],
        0,
      ) / total,
  );
  const sentiment = candidates.map((c) => {
    const items = report.news.flatMap((n) =>
      n.candidateSentiment.filter((s) => s.contractId === c.id),
    );
    return items.length
      ? items.reduce((s, n) => s + n.score, 0) / items.length
      : 0;
  });
  const effectiveN = independent.reduce(
    (s, p, i) => s + (Math.min(3000, p.sampleSize) * weights[i]) / total,
    0,
  );
  // Conservative error floor persists even with many respondents. Illustrative, not fitted.
  const errorSd = Math.sqrt(3.5 ** 2 + (100 ** 2 * 0.25) / effectiveN);
  const wins = candidates.map(() => 0);
  let seed = 20261103;
  const random = () => {
    seed = (Math.imul(1664525, seed) + 1013904223) >>> 0;
    return (seed + 0.5) / 4294967296;
  };
  for (let trial = 0; trial < 6000; trial++) {
    let best = -Infinity,
      winner = 0;
    for (let i = 0; i < candidates.length; i++) {
      const noise =
        Math.sqrt(-2 * Math.log(random())) *
        Math.cos(2 * Math.PI * random()) *
        errorSd;
      const share = averages[i] + (withSentiment ? sentiment[i] : 0) + noise;
      if (share > best) {
        best = share;
        winner = i;
      }
    }
    wins[winner]++;
  }
  const raw = wins.map((w) => Math.max(0.01, Math.min(0.98, w / 6000))),
    sum = raw.reduce((s, p) => s + p, 0);
  return {
    candidates: candidates
      .map((c, i) => ({
        contract: c,
        share: averages[i],
        sentiment: sentiment[i],
        probability: raw[i] / sum,
      }))
      .sort((a, b) => b.probability - a.probability),
    pollCount: independent.length,
    errorSd,
    withSentiment,
  };
}
