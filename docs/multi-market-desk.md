# Oracular: weather, elections and a cross-market leaderboard

Oracular adds three views to the existing sports/GPT research workflow. They use only project-owned code and assets, require no sign-in, and preserve the navy/aqua theme. The repository remains `m-goldstein/sportsdesk`; the product name, metadata, mark, reports and export filenames use Oracular. Legacy browser storage keys remain readable.

## Weather market pipeline

1. Resolve the configured settlement station through NOAA's station metadata, then request `/points/{lat},{lon}` for its current forecast grid. Airport coordinates are used, not the city center. Grid mappings cache for 24 hours; forecasts cache for five minutes.
2. Read NOAA hourly and daytime guidance, keeping original issue and retrieval times. Convert Celsius guidance to Fahrenheit when necessary. The projected high is the larger of daytime guidance and the hourly forecast peak for the contract's local calendar date.
3. Discover the exact Polymarket event slug for city, month, day and year. Do not use a fuzzy city search, the event's noon `endDate`, or yesterday's prices as a substitute for the observation date.
4. Verify the NOAA resolution URL, station identifier, Fahrenheit whole-degree precision, date in the rules, matching per-contract rule text and unique condition IDs. Parse integer intervals and both open-ended tails. A full ladder must span all integers without overlaps or gaps.
5. Read both outcome order books through the public CLOB batch endpoint. Match returned asset and condition IDs, sort the actual asks, keep the nearest 30 price levels and preserve provider timestamps. The price displayed by Gamma remains indicative, not an executable ask.

Supported station contracts, verified against current live Gamma rules during implementation:

| City          | Station | Resolution location              | Time zone           |
| ------------- | ------- | -------------------------------- | ------------------- |
| New York City | KLGA    | LaGuardia Airport                | America/New_York    |
| Chicago       | KORD    | O'Hare International             | America/Chicago     |
| Miami         | KMIA    | Miami International              | America/New_York    |
| Seattle       | KSEA    | Seattle–Tacoma International     | America/Los_Angeles |
| Atlanta       | KATL    | Hartsfield–Jackson International | America/New_York    |
| Dallas        | KDAL    | Dallas Love Field                | America/Chicago     |
| Los Angeles   | KLAX    | Los Angeles International        | America/Los_Angeles |
| Austin        | KAUS    | Austin–Bergstrom International   | America/Chicago     |
| Denver        | KBKF    | Buckley Space Force Base         | America/Denver      |

A new or changed station is not silently equated to one on this list. Unsupported rule changes suppress forecast edges and cross-bucket arbitrage. The exact rule text and source links remain inspectable. Markets can have fallback sources, correction windows and unusual missing-data provisions; the contract rules govern settlement, not Oracular's forecast.

### Probabilities and same-day coverage

NOAA supplies forecasts, not this application's outcome probabilities. Oracular applies an **assumed, uncalibrated normal error distribution** centered on the projected high, with default standard deviation 3°F and optional bias. The user can change both. The probability of an integer bucket is the normal CDF difference between half-degree boundaries. An entire verified ladder sums to one.

A forecast edge needs complete hourly coverage from local midnight through the next midnight, with no missing-temperature intervals. Boundaries account for daylight-saving days of 23 or 25 hours. Same-day forecasts usually omit elapsed hours, so the model refuses to call the remaining-day maximum a complete daily high. That suppresses forecast-based signals; it does not disable independent book-arbitrage arithmetic. NOAA issue timestamps must be present, not future-dated and no older than 12 hours. Observed maxima, final NOAA settlement tables and historical forecasts are not reconstructed or fabricated.

### Pricing, arbitrage and paper wagering

The user specifies shares per leg, a per-share execution buffer and additional execution cost. Every simulated purchase must meet the book minimum and fill its entire size across returned ask depth. Unknown fee schedules are not treated as zero. The current Gamma fee fields `feesEnabled` and `feeSchedule` are used; only the documented exponent-1 schedule is supported. Fee per level is `shares × rate × p × (1−p)`, rounded upward to five decimals to avoid overstating a tiny spread.

Books expire after 90 seconds and may be at most 30 seconds future-skewed. Multi-leg candidates additionally require provider timestamps within 15 seconds. Gas and other costs must fit the chosen extra-cost budget. Displayed quotes are snapshots, not atomic reservations.

Supported buy-side structures:

- One contract's YES + NO: one share of each has a combined terminal payout of $1.
- Every YES in a verified exhaustive, mutually exclusive temperature ladder: one set pays $1.
- Every NO in the same ladder: an N-outcome set pays N−1 dollars.

Full-ladder checks also require a non-augmented negative-risk event and all parsed contract legs. Missing, closed, unfillable or stale legs withhold the basket. Positive residual profit after fees and buffers is labeled a **snapshot arbitrage candidate**. This is not a guarantee that all legs will fill or settle without delay. Sell/mint/short strategies and cross-venue spreads are outside this implementation.

The weather desk refreshes while visible every 30 seconds, and ages quotes locally every five seconds. Paper tickets re-check freshness at the click, freeze shares/cost/model probability, persist on the device and export as JSON. Samples and live tickets remain separate. The app submits no financial orders and stores no wallet/private-key credentials. The live-contract link opens Polymarket's own trade flow.

## Election research

The initial catalog covers 2026 governor races in Michigan, Wisconsin, Arizona, Georgia, Nevada, Pennsylvania, Ohio and Texas, plus Georgia and North Carolina Senate races. Contract discovery uses exact general-election slugs and title checks. Primary, nomination and margin contracts are not substituted. Unnamed “Option A…” and “Other” contracts do not become fictional candidates. Party and Independent contracts retain their actual labels; replacements and party mappings must be read from their settlement rules.

Free market tracking is independent of GPT usage. Clicking **Research polls & news** uses the existing `OPENAI_API_KEY` and configured `OPENAI_MODEL` (default `gpt-6.1-sol`). It supplies state, office, year, election date, exact named contract IDs and rules; live web search returns a bounded structured dossier of original polls and dated reporting. Generation is cached for 30 minutes and concurrent work is bounded per server process. There is no distributed spend limit or persistent shared research database.

The prompt requires nonpartisan factual research. It excludes primary, generic-ballot, approval, national and hypothetical-matchup surveys. Polls must identify field dates, publication, population, sample size, sponsor, method and the share for **every named contract candidate**. An Independent contract requires a verified mapping to the actual polled candidate; if it is ambiguous, that poll is omitted. No candidate is assigned an invented result.

Validation accepts only HTTPS URLs actually returned by search on the configured pollster/news domains. Dates, candidate IDs, unique coverage, 60–100.5% reported ballot-share totals and supported sample populations are checked. Adult-population surveys are excluded; fieldwork must be within 45 days, not future-dated and before the election. News must be within 14 days. Publication cannot predate fieldwork completion. Duplicate surveys are rejected; multiple surveys from the same original pollster family do not create independent evidence.

Source presence and structural validation do **not** establish semantic truth or independent verification of GPT extraction. Users should inspect the original polling release. Missing evidence is shown alongside rejected-item reasons. If sources fail, no winner is manufactured.

### Polling winner model and sentiment

A forecast requires two distinct eligible pollster families covering the named field. Only the most recent survey per family is retained. Weights combine exponential recency with a 14-day decay scale, square-root sample size capped at 3,000, and a 0.8 multiplier for registered-voter samples versus likely voters.

The model uses weighted candidate vote shares and 6,000 reproducible simulations. Each candidate receives independent normal error with standard deviation `sqrt(3.5² + 100² × .25 / weightedN)`. A 3.5-point error floor persists rather than disappearing with a large survey. Counts of simulated leaders become conditional-field probabilities with small bounds to avoid numerical certainty. This is a transparent experimental baseline, not a calibrated election model. It does not fully model turnout, omitted candidates, correlated house effects or late undecided movement. Live research expires after 48 hours and forecasts stop when election day begins.

GPT classifies the tone of specific news coverage for each candidate, with a cited explanation and score from −1 to +1. This is **media tone, not voter sentiment**. Polling-only is the default. An explicitly enabled exploratory overlay adds at most ±1 vote-share point per candidate based on average tone. The leaderboard always uses polling-only estimates so that toggling a local experiment does not silently change rankings.

Reports persist in browser storage for the same mode/race, carry a SHA-256 evidence fingerprint and export the source packet and modeled result. This is a personal research cache, not a tamper-proof public audit trail. Sample mode uses fictional candidates, polls and news, and makes no OpenAI call.

## Top Outcomes ranking

The leaderboard returns top 10, 20 or 100 across Sports, Weather and Elections, with optional domain filtering and one leading outcome per event. Two explicitly different ranking bases are available:

- **Market consensus:** current indicative outcome probabilities from matched event contracts. This is market belief, not an independent model forecast or executable ask.
- **Independent model likelihood:** the existing uncalibrated sports baseline, default NOAA/error-model probabilities and eligible polling-only election reports saved on this device. Missing independent evidence remains missing; it is never filled using the market price.

Weather ranks YES temperature buckets rather than artificially certain NO-tail outcomes. Sports include exact team-and-start moneyline matches from the latest 100 public sports events plus bounded exact-team search (up to eight upcoming games, with a 30-minute start-time tolerance), with fresh outcome asks where available; coverage is partial. Weather uses the next calendar date after the selected sports slate, and election rows show their own election dates. Each row includes both probability views, model identity, source coverage and ask freshness. Different models and horizons are not comparable measures of proven confidence; a highly likely event can still be a poor trade at its market price.

The ranking fetch does not trigger paid election research. If polling is missing, visit Election Desk, run research, then return. API failures leave the affected domain empty rather than populate it with samples. Sample mode explicitly labels every result as illustrative.

## Environment and operation

No new environment variables are required. NOAA, Gamma and CLOB reads are public. `OPENAI_API_KEY` enables sports/election GPT research; `OPENAI_MODEL` remains optional; `ODDS_API_KEY` remains optional for sportsbook moneylines. Keys are server-only. NOAA requests identify Oracular and the repository contact URL through User-Agent. Public endpoints can be blocked or rate-limited; failures remain visible.

New API routes are `GET /api/weather`, `GET /api/elections`, `POST /api/elections/analysis`, and `GET /api/rankings`. The paid POST accepts only known race/mode identifiers, validates origin and request size, bounds search/output/time and sanitizes client errors. No arbitrary research prompt or client-provided evidence is accepted.

## Primary references

- [NOAA/NWS API](https://www.weather.gov/documentation/services-web-api): station, point and grid discovery, forecast lifecycle and limitations.
- [Polymarket market discovery](https://docs.polymarket.com/market-data/discover-markets): exact event and contract identity.
- [Polymarket prices/order books](https://docs.polymarket.com/market-data/prices-order-books): outcome identifiers, batch books, depth and minimum size.
- [Polymarket market details](https://docs.polymarket.com/market-data/market-details): per-market fees and metadata.
- [Polymarket fees](https://docs.polymarket.com/trading/fees): exponent-1 fee curve and precision.
- [NYC daily-high example](https://polymarket.com/event/highest-temperature-in-nyc-on-october-16-2026): NOAA KLGA source, precision, fallback and correction rules.
- [OpenAI web search](https://developers.openai.com/api/docs/guides/tools-web-search): source-linked live research and visible citations.
