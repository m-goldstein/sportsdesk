import { unstable_cache } from "next/cache";
import { Contract, ContractEvent, OrderBook } from "./market-contracts";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Wire = Record<string, any>;
const USER_AGENT = "Oracular/1.0 (+https://github.com/m-goldstein/sportsdesk)";
export async function publicJson(url: string, init: RequestInit = {}) {
  const response = await fetch(url, {
    ...init,
    headers: {
      "User-Agent": USER_AGENT,
      Accept: "application/json",
      ...init.headers,
    },
    cache: "no-store",
    signal: AbortSignal.timeout(12000),
    redirect: "error",
  });
  if (!response.ok)
    throw new Error(`Public provider returned ${response.status}`);
  return response.json();
}
function array(v: unknown): unknown[] {
  try {
    const a = typeof v === "string" ? JSON.parse(v) : v;
    return Array.isArray(a) ? a : [];
  } catch {
    return [];
  }
}
export function normalizeContract(raw: Wire, event: Wire): Contract | null {
  const outcomes = array(raw.outcomes),
    yes = outcomes.findIndex((o) => o === "Yes"),
    no = outcomes.findIndex((o) => o === "No");
  const tokens = array(
      raw.version === "v2" ? raw.positionIds : raw.clobTokenIds,
    ),
    prices = array(raw.outcomePrices).map(Number);
  if (
    outcomes.length !== 2 ||
    yes < 0 ||
    no < 0 ||
    tokens.length !== 2 ||
    tokens.some((t) => typeof t !== "string" || !/^\d{1,100}$/.test(t)) ||
    tokens[0] === tokens[1] ||
    !/^0x[a-fA-F0-9]{64}$/.test(raw.conditionId ?? "")
  )
    return null;
  const schedule = raw.feeSchedule;
  const feeRate =
    raw.feesEnabled === false
      ? 0
      : raw.feesEnabled === true &&
          schedule?.exponent === 1 &&
          typeof schedule.rate === "number" &&
          schedule.rate >= 0 &&
          schedule.rate <= 1
        ? schedule.rate
        : null;
  return {
    id: String(raw.id),
    conditionId: raw.conditionId,
    label: String(raw.groupItemTitle ?? raw.question ?? ""),
    question: String(raw.question ?? ""),
    slug: String(raw.slug ?? ""),
    yesToken: String(tokens[yes]),
    noToken: String(tokens[no]),
    indicative: prices[yes] > 0 && prices[yes] < 1 ? prices[yes] : null,
    feeRate,
    tradable:
      raw.active === true &&
      raw.closed === false &&
      raw.archived !== true &&
      raw.acceptingOrders === true &&
      raw.enableOrderBook === true,
    rules: String(raw.description ?? event.description ?? ""),
    resolutionSource: String(
      raw.resolutionSource ?? event.resolutionSource ?? "",
    ),
    yesBook: null,
    noBook: null,
  };
}
export function normalizeEvent(raw: Wire): ContractEvent {
  const contracts = (raw.markets ?? []).flatMap((m: Wire) => {
    const c = normalizeContract(m, raw);
    return c ? [c] : [];
  });
  return {
    id: String(raw.id),
    slug: String(raw.slug ?? ""),
    title: String(raw.title ?? ""),
    date: String(raw.eventDate ?? ""),
    rules: String(raw.description ?? ""),
    resolutionSource: String(raw.resolutionSource ?? ""),
    active:
      raw.active === true && raw.closed === false && raw.archived !== true,
    negRisk: raw.negRisk === true,
    augmented: raw.negRiskAugmented === true,
    contracts,
    fetchedAt: new Date().toISOString(),
    url: `https://polymarket.com/event/${encodeURIComponent(raw.slug ?? "")}`,
  };
}
export async function getContractEvent(slug: string) {
  return unstable_cache(
    async () => {
      const data = await publicJson(
        `https://gamma-api.polymarket.com/events?slug=${encodeURIComponent(slug)}`,
      );
      const raw = Array.isArray(data)
        ? data.find((e) => e.slug === slug)
        : null;
      return raw ? normalizeEvent(raw) : null;
    },
    ["oracular-contract-event-v1", slug],
    { revalidate: 60 },
  )();
}
export function normalizeBook(
  raw: Wire,
  assetId: string,
  conditionId: string,
  now = Date.now(),
): OrderBook | null {
  if (
    raw.asset_id !== assetId ||
    String(raw.market).toLowerCase() !== conditionId.toLowerCase()
  )
    return null;
  const stamp =
    typeof raw.timestamp === "number" || /^\d+$/.test(String(raw.timestamp))
      ? Number(raw.timestamp)
      : Date.parse(raw.timestamp);
  const size = Number(raw.min_order_size);
  if (!Number.isFinite(stamp) || !Number.isFinite(size) || size <= 0)
    return null;
  const valid = (levels: Wire[]) =>
    Array.isArray(levels)
      ? levels.flatMap((l) => {
          const price = Number(l.price),
            size = Number(l.size);
          return price > 0 && price < 1 && size > 0 && Number.isFinite(size)
            ? [{ price, size }]
            : [];
        })
      : [];
  const asks = valid(raw.asks)
      .sort((a, b) => a.price - b.price)
      .slice(0, 30),
    bids = valid(raw.bids).sort((a, b) => b.price - a.price);
  if (asks.length && bids.length && bids[0].price > asks[0].price) return null;
  return {
    assetId,
    conditionId,
    timestamp: new Date(stamp).toISOString(),
    fetchedAt: new Date(now).toISOString(),
    asks,
    bestBid: bids[0]?.price ?? null,
    minOrderSize: size,
    hash: String(raw.hash ?? ""),
  };
}
export async function attachBooks(
  event: ContractEvent,
): Promise<{ event: ContractEvent; warnings: string[] }> {
  const copy = structuredClone(event),
    tokens = copy.contracts
      .filter((c) => c.tradable)
      .flatMap((c) => [{ token_id: c.yesToken }, { token_id: c.noToken }]);
  if (!tokens.length)
    return { event: copy, warnings: ["No contracts currently accept orders."] };
  try {
    const response = await publicJson("https://clob.polymarket.com/books", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(tokens.slice(0, 100)),
    });
    if (!Array.isArray(response)) throw new Error("Invalid books");
    const byId = new Map(response.map((b) => [b.asset_id, b]));
    for (const c of copy.contracts) {
      const y = byId.get(c.yesToken),
        n = byId.get(c.noToken);
      c.yesBook = y ? normalizeBook(y, c.yesToken, c.conditionId) : null;
      c.noBook = n ? normalizeBook(n, c.noToken, c.conditionId) : null;
    }
    return {
      event: copy,
      warnings: copy.contracts.some(
        (c) => c.tradable && (!c.yesBook || !c.noBook),
      )
        ? [
            "Some outcome books are unavailable. Missing liquidity is excluded from signals.",
          ]
        : [],
    };
  } catch {
    return {
      event: copy,
      warnings: [
        "Live CLOB order books are unavailable from this region. Indicative prices are reference-only; no executable edge is inferred.",
      ],
    };
  }
}
export async function mapLimit<T, R>(
  values: T[],
  limit: number,
  fn: (value: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(values.length);
  let index = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, values.length) }, async () => {
      while (index < values.length) {
        const i = index++;
        results[i] = await fn(values[i]);
      }
    }),
  );
  return results;
}
