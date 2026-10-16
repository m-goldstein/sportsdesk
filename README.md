# Oracular

A standalone prediction-market research workspace for sports, daily high temperatures, and U.S. elections. Its evidence-first workflow: **ingest → normalize → calculate → explain → compare prices → preserve the thesis**.

Oracular owns its source code, fonts, sample dataset, configuration, tests and production runtime.

## Run locally

Requires Node.js 22 or newer.

```bash
npm ci
npm run dev
```

Open [localhost:3000](http://localhost:3000). Live sports data is the default. Use the **Sample desk** selector or [the sample workspace](http://localhost:3000/?mode=demo) for a reproducible walkthrough without external APIs.

```bash
npm run build
npm start
```

## Workspace

- **Overview / Matchups:** searchable slate, league/status filters, probability sorting, matchup cards and evidence summaries. Filters are bookmarkable. Times use America/New_York; scores refresh every 60 seconds while the tab is visible.
- **Live games:** scoreboard and game research, including provider live win probability when available. Live and completed games never receive a retrospective pregame forecast.
- **Research packets:** inspect model factors, season records, recent results, comparison statistics, player leaders, current-game box scores, injuries, headlines, source links and retrieval timestamps. Export a JSON evidence packet.
- **GPT analysis:** open a matchup's **GPT analysis** tab, inspect the input packet, then run on-demand GPT research. It assembles player, matchup, news, coaching, schedule, statistics and market evidence; enriches current context through cited web search; and generates a separate judgment with supporting evidence, counter-case, uncertainty and report exports. Sample mode demonstrates the workflow without an OpenAI call. See [the packet design deep dive](docs/gpt-analysis.md).
- **Weather markets:** NOAA/NWS forecasts at nine contract settlement stations; exact-date Polymarket daily-high ladders; fresh CLOB depth and market-specific fees; adjustable forecast-error scenarios; YES/NO and complete-ladder arbitrage candidates; device-local paper wagers and exports. Real trading opens the external contract. No wallet, private key or order execution is integrated.
- **Election desk:** eight 2026 governor races plus Georgia/North Carolina Senate races, live candidate contracts, on-demand cited original polling/news research, coverage-tone analysis and a transparent polling-model winner forecast. Incomplete evidence remains missing. Research uses the existing OpenAI key; free market tracking does not.
- **Top outcomes:** top 10/20/100 across sports, weather and elections; rank by market consensus or independent likelihood; one leader per event, category filters, source coverage, price freshness and JSON exports. Model probabilities are uncalibrated and are not comparable measures of proven accuracy.
- **Players / Teams:** research matchup leaders and availability; inspect current-season standings and scoring profiles.
- **Tournaments:** official competition slate, provider tournament/postseason labels, venue and neutral-site context. The separate **Decision lab → Tournament lab** provides a clearly labeled hypothetical bracket sandbox.
- **Markets:** compare independent model probabilities with moneyline prices from ESPN reference lines, The Odds API and exact-match Polymarket contracts. Includes no-vig probability, probability gap, freshness and a hypothetical decimal-odds EV calculator.
- **Watchlist:** save a frozen matchup snapshot and editable thesis. Versioned browser-local storage persists across reloads; export a backup as JSON. These are personal device records, not a shared account database.
- **Decision lab:** a counterfactual scenario studio with lineup-margin sliders, neutral-venue toggle, user-defined uncertainty range, interactive sensitivity heatmap and hypothetical price break-even comparison. Share the exact assumptions by URL or export a navy/aqua SVG thesis card.
- **Tournament lab:** build a 2-, 4- or 8-team field within one sport; swap bracket slots, compute exact advancement/title probabilities over every possible path, and play reproducible alternate universes. Export the complete bracket and assumptions as JSON.
- **Prediction journal:** lock a written pregame thesis, probability and source snapshot; sync matching final scores, compare Brier scores against the original baseline, and inspect a calibration plot. Sample outcomes have separate manual controls and never mix with real-game results. Device-local storage, JSON exports and explicit deletion; no account required.
- **Demo walkthrough:** a four-step guided presentation inside Decision lab. Start with the sample workspace for a reliable, API-free hackathon demo. See [the demo script and feature math](docs/decision-lab.md).
- **Daily brief:** generate a deterministic evidence-based slate summary and download it as text.
- **Methodology:** inspect all baseline parameters and limitations.

Keyboard: **Cmd/Ctrl+K** focuses search. Research dialogs trap focus through native HTML dialog behavior; **Escape** closes them. The workspace adapts to narrow screens.

## Data providers

| Provider                                                                     | Data                                                                                               | Configuration / behavior                                                                                                                                                                                                                                                                        |
| ---------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ESPN public feeds                                                            | NBA, NFL, MLB, NHL, NCAA men's basketball; scores, schedules, records, standings, matchup research | No API key. Public, undocumented feed contracts can change; upstream availability is not guaranteed.                                                                                                                                                                                            |
| ESPN reference odds                                                          | Moneyline prices when included in the scoreboard                                                   | No reliable quote timestamp; never treated as fresh signals.                                                                                                                                                                                                                                    |
| [The Odds API](https://the-odds-api.com/liveapi/guides/v4/)                  | Two-outcome bookmaker moneylines                                                                   | Optional `ODDS_API_KEY` in `.env.local`. Server-side only; US region. Responses cached for five minutes to limit quota consumption.                                                                                                                                                             |
| [Polymarket Gamma](https://docs.polymarket.com/market-data/discover-markets) | Public sports moneyline markets                                                                    | No key. Searches the latest 100 active sports events; coverage is partial. Requires exact full team outcomes, game start within four hours, and moneyline contract type. Props, spreads, futures and generic yes/no contracts are excluded. The public endpoint may be blocked in some regions. |

Copy `.env.example` to `.env.local` when configuring a provider. Basic research and the daily brief work without an AI API. Live GPT matchup and election analysis use `OPENAI_API_KEY`; `OPENAI_MODEL` optionally overrides the default `gpt-6.1-sol`. Keys stay on the server. Web enrichment uses OpenAI's hosted search, so no additional search-service key is required.

Feeds may be delayed. Oracular distinguishes retrieval time from provider quote update time. Missing or failed live data remains missing; it never silently falls back to sample data. ESPN calls cache for 60 seconds, standings for five minutes, and Polymarket for two minutes. Standings enrich only compatible current/future dates and matching season/type; historical dates use the scoreboard's records to avoid current-season leakage.

## Forecasting v1

This is an **uncalibrated statistical baseline**, not a trained or backtested prediction system. No accuracy or profitability claim is made.

1. Smooth each team's season record with a Beta(5,5) prior: `(wins + 0.5 × ties + 5) / (games + 10)`.
2. Calculate the home-minus-away logit difference, weighted 0.65.
3. Calculate the difference between season scoring margins, divide by the sport scale, cap at ±1.5, shrink by `minGames / (minGames + 10)`, and weight 0.35. Missing scoring data contributes zero.
4. Add fixed home advantage divided by sport scale; neutral venues contribute zero.
5. Apply the logistic function and bound the result to 15–85%.

Coverage describes available sample size, **not confidence in predictive accuracy**. It is Limited below eight games, Developing from eight games, and Established from 20 games when scoring data is also available. Player injuries, rotations, rest, strength of schedule and competition stakes are research context, not model inputs. NFL forecasts are conditional on no tie.

Market signals require an upcoming non-preseason game, a quote with a provider timestamp no older than 15 minutes, adequate sample coverage, at least a three-percentage-point gap against margin-adjusted probability, and positive estimated EV at the quoted price. The overview counts verified signals from currently loaded market research. A gap against a no-vig price alone is not a positive-EV test. Prediction-market prices are indicative; spreads, fees, slippage and settlement differences are excluded. No bets are placed.

Before using this as a predictive decision system, collect immutable forecasts before kickoff and evaluate out of sample with calibration curves, Brier score, log loss, closing-line value and realistic costs. Historical scoreboard browsing and saved snapshots are not a backtest.

## Architecture

```text
src/app/                  Next.js App Router, API routes, locally hosted fonts
src/components/           Responsive research workspace and research packet
src/lib/types.ts          Normalized sports/research/market contracts
src/lib/providers.ts      ESPN, The Odds API and Polymarket adapters
src/lib/model.ts          Pure probability, no-vig, freshness and EV calculations
src/lib/demo.ts           Independent, explicitly illustrative sample dataset
src/lib/analysis-*.ts     Versioned GPT packet, extended context, validation and orchestration
tests/                    Model/provider regression tests and browser workflows
scripts/check-standalone.mjs  Isolated production-runtime verification
```

Research APIs:

```text
GET /api/board?date=2026-10-15&league=NBA&mode=live
GET /api/research?league=NBA&id=<ESPN-event-id>
GET /api/markets?league=NBA&id=<ESPN-event-id>&date=2026-10-15
GET /api/weather?date=2026-10-16&city=all&mode=live
GET /api/elections?mode=live
POST /api/elections/analysis  # JSON { raceId, mode }; explicit on-demand research
GET /api/rankings?date=2026-10-15&mode=live
GET /api/analysis?league=NBA&id=<ESPN-event-id>&date=2026-10-15
POST /api/analysis  # JSON { league, id, date }; streamed progress and report
```

Dates must be valid `YYYY-MM-DD` values; leagues and event identifiers are validated. Sample event IDs such as `demo-1` return sample packets. API keys are read on the server and never returned. The platform and its research APIs are accessible without sign-in or authorization, as requested. Each visitor's watchlist and prediction journal stay in their own browser. Decision lab needs no additional environment variables or AI calls.

## Verification

```bash
npm run typecheck
npm test
npm run build
npm run check:standalone
npx playwright install chromium  # once, if no Playwright browser is installed
npm run test:browser
```

The standalone check copies the production runtime and static assets into a temporary directory, starts it there, and verifies the workspace and research APIs. No inspiration folder is present. Browser tests cover research and GPT workflows, scenario/share-link round trips, SVG exports, journal persistence and final-score settlement, exact bracket exports and field swaps, the guided demo, mobile layouts, and unavailable live feeds.

## Deployment

### Vercel

Import this repository with the **Next.js** framework preset, repository root as the root directory, Node.js **22.x**, install command `npm ci`, and build command `npm run build`. Leave the output directory at the framework default.

**Required for public sports, NOAA weather, live Polymarket feeds and rankings: none. Required for live GPT matchup/election research: `OPENAI_API_KEY`.**

| Variable         | Purpose                                                                    | Environments                                   |
| ---------------- | -------------------------------------------------------------------------- | ---------------------------------------------- |
| `OPENAI_API_KEY` | GPT matchup judgments, election polling/news research and cited web search | Production, and Preview/Development if desired |
| `OPENAI_MODEL`   | Optional model override; defaults to `gpt-6.1-sol`                         | Same environments as the key                   |
| `ODDS_API_KEY`   | Timestamped bookmaker moneylines from The Odds API                         | Production, and Preview/Development if desired |

Set these in Vercel's project **Settings → Environment Variables**, keep secrets server-only (no `NEXT_PUBLIC_` prefix), then redeploy for changes to apply. No `AUTH_*`, database, ESPN or Polymarket credentials are required. No sign-in is required to run GPT analysis. Sports-data and recent analysis caches reduce repeat requests; GPT/web-search usage is billed to the configured OpenAI API project.

The application has no authentication gate. To make a deployment itself accessible without a Vercel login, also disable Vercel Authentication / Password Protection for the intended public deployment under **Deployment Protection**. This hosting setting is separate from application code and environment variables. References: [environment variables](https://vercel.com/docs/environment-variables), [deployment protection](https://vercel.com/docs/deployment-protection).

### Self-hosting

The Next.js build produces a standalone Node server. Deploy to a Node 22+ host, a Next.js-compatible hosting platform, or use the included Dockerfile:

```bash
docker build -t oracular .
docker run --rm -p 3000:3000 --env-file .env.local oracular
```

Omit `--env-file` when using only public feeds. No deployment or provider purchase is needed for local use.

DM Sans and Manrope are bundled locally under the SIL Open Font License; their notices are in `src/app/fonts/`. Team identity marks are rendered from text and colors; no reference-repository artwork is used.

## Oracular multi-market desk

See [the multi-market design and source contracts](docs/multi-market-desk.md) for station matching, local-day coverage, fee/depth checks, polling eligibility and ranking semantics. A [hackathon presentation script](docs/demo-script.md) walks through the complete product. The product is branded Oracular; the existing GitHub repository and legacy browser storage keys remain compatible so existing saved research is retained.
