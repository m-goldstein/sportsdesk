export type PriceLevel = { price: number; size: number };
export type OrderBook = {
  assetId: string;
  conditionId: string;
  timestamp: string;
  fetchedAt: string;
  asks: PriceLevel[];
  bestBid: number | null;
  minOrderSize: number;
  hash: string;
};
export type Contract = {
  id: string;
  conditionId: string;
  label: string;
  question: string;
  slug: string;
  yesToken: string;
  noToken: string;
  indicative: number | null;
  feeRate: number | null;
  tradable: boolean;
  rules: string;
  resolutionSource: string;
  yesBook: OrderBook | null;
  noBook: OrderBook | null;
};
export type ContractEvent = {
  id: string;
  slug: string;
  title: string;
  date: string;
  rules: string;
  resolutionSource: string;
  active: boolean;
  negRisk: boolean;
  augmented: boolean;
  contracts: Contract[];
  fetchedAt: string;
  url: string;
};
export type Fill = {
  shares: number;
  cost: number;
  fee: number;
  average: number;
  maxAvailable: number;
  minOrderSize: number;
  timestamp: string;
};
export type Basket = {
  id: string;
  name: string;
  legs: { contract: string; side: "YES" | "NO"; fill: Fill }[];
  cost: number;
  fees: number;
  buffer: number;
  payout: number;
  profit: number;
  roi: number;
  shares: number;
};
export function freshBook(book: OrderBook | null, now = Date.now()) {
  if (!book) return false;
  const age = now - Date.parse(book.timestamp),
    retrievalAge = now - Date.parse(book.fetchedAt);
  return (
    Number.isFinite(age) &&
    age >= -30000 &&
    age <= 90000 &&
    retrievalAge >= -30000 &&
    retrievalAge <= 90000
  );
}
export function buyFill(
  book: OrderBook | null,
  shares: number,
  feeRate: number | null,
  now = Date.now(),
): Fill | null {
  if (
    !freshBook(book, now) ||
    !Number.isFinite(shares) ||
    shares <= 0 ||
    shares < book!.minOrderSize ||
    feeRate === null ||
    !Number.isFinite(feeRate) ||
    feeRate < 0 ||
    feeRate > 1
  )
    return null;
  let remaining = shares,
    cost = 0,
    fee = 0;
  for (const level of book!.asks) {
    const take = Math.min(remaining, level.size);
    cost += take * level.price;
    // Round up per level to avoid overstating a tiny arbitrage after fee precision.
    fee +=
      Math.ceil(
        take * feeRate * level.price * (1 - level.price) * 1e5 - 1e-10,
      ) / 1e5;
    remaining -= take;
    if (remaining < 1e-8) break;
  }
  if (remaining > 1e-8) return null;
  return {
    shares,
    cost,
    fee,
    average: cost / shares,
    maxAvailable: book!.asks.reduce((s, l) => s + l.size, 0),
    minOrderSize: book!.minOrderSize,
    timestamp: book!.timestamp,
  };
}
export function evaluateBasket(
  id: string,
  name: string,
  legs: Basket["legs"],
  payout: number,
  shares: number,
  bufferPerShare: number,
  extraCost: number,
): Basket | null {
  if (
    !legs.length ||
    !Number.isFinite(bufferPerShare) ||
    bufferPerShare < 0 ||
    !Number.isFinite(extraCost) ||
    extraCost < 0
  )
    return null;
  const timestamps = legs.map((l) => Date.parse(l.fill.timestamp));
  if (Math.max(...timestamps) - Math.min(...timestamps) > 15000) return null;
  const fees = legs.reduce((s, l) => s + l.fill.fee, 0),
    buffer = legs.length * shares * bufferPerShare + extraCost;
  const cost = legs.reduce((s, l) => s + l.fill.cost, 0) + fees + buffer;
  const profit = payout - cost;
  return {
    id,
    name,
    legs,
    shares,
    payout,
    cost,
    fees,
    buffer,
    profit,
    roi: cost > 0 ? profit / cost : 0,
  };
}
export function normalCdf(x: number) {
  if (x === Infinity) return 1;
  if (x === -Infinity) return 0;
  const sign = x < 0 ? -1 : 1,
    a = Math.abs(x) / Math.sqrt(2),
    t = 1 / (1 + 0.3275911 * a);
  const erf =
    1 -
    ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) *
      t +
      0.254829592) *
      t *
      Math.exp(-a * a);
  return (1 + sign * erf) / 2;
}
export function canonicalUrl(input: string) {
  try {
    const u = new URL(input);
    if (u.protocol !== "https:" || u.username || u.password || u.port)
      return null;
    u.hash = "";
    for (const key of [...u.searchParams.keys()])
      if (key.startsWith("utm_") || key === "ref") u.searchParams.delete(key);
    return u.toString().replace(/\/$/, "");
  } catch {
    return null;
  }
}
