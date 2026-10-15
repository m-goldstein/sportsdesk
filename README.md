# Sportsdesk

A standalone sports research workspace for betting and prediction markets. evidence-first workflow: **ingest → normalize → calculate → explain → compare prices → preserve the thesis**.

Sportsdesk owns its source code, fonts, sample dataset, configuration, tests and production runtime. 

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
- **Players / Teams:** research matchup leaders and availability; inspect current-season standings and scoring profiles.
- **Tournaments:** competition slate, provider tournament/postseason labels, venue and neutral-site context. This is a competition research view, not a simulated bracket or championship forecasting model.
- **Markets:** compare independent model probabilities with moneyline prices from ESPN reference lines, The Odds API and exact-match Polymarket contracts. Includes no-vig probability, probability gap, freshness and a hypothetical decimal-odds EV calculator.
- **Watchlist:** save a frozen matchup snapshot and editable thesis. Versioned browser-local storage persists across reloads; export a backup as JSON. These are personal device records, not a shared account database.
- **Daily brief:** generate a deterministic evidence-based slate summary and download it as text.
- **Methodology:** inspect all baseline parameters and limitations.

Keyboard: **Cmd/Ctrl+K** focuses search. Research dialogs trap focus through native HTML dialog behavior; **Escape** closes them. The workspace adapts to narrow screens.

## Data providers

| Provider | Data | Configuration / behavior |
| --- | --- | --- |
| ESPN public feeds | NBA, NFL, MLB, NHL, NCAA men's basketball; scores, schedules, records, standings, matchup research | No API key. Public, undocumented feed contracts can change; upstream availability is not guaranteed. |
| ESPN reference odds | Moneyline prices when included in the scoreboard | No reliable quote timestamp; never treated as fresh signals. |
| [The Odds API](https://the-odds-api.com/liveapi/guides/v4/) | Two-outcome bookmaker moneylines | Optional `ODDS_API_KEY` in `.env.local`. Server-side only; US region. Responses cached for five minutes to limit quota consumption. |
| [Polymarket Gamma](https://docs.polymarket.com/market-data/discover-markets) | Public sports moneyline markets | No key. Searches the latest 100 active sports events; coverage is partial. Requires exact full team outcomes, game start within four hours, and moneyline contract type. Props, spreads, futures and generic yes/no contracts are excluded. The public endpoint may be blocked in some regions. |

Copy `.env.example` to `.env.local` only if configuring the optional odds provider. No external AI API is required: narrative synthesis is deterministic and derives from the packet.

Feeds may be delayed. Sportsdesk distinguishes retrieval time from provider quote update time. Missing or failed live data remains missing; it never silently falls back to sample data. ESPN calls cache for 60 seconds, standings for five minutes, and Polymarket for two minutes. Standings enrich only compatible current/future dates and matching season/type; historical dates use the scoreboard's records to avoid current-season leakage.

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
tests/                    Model/provider regression tests and browser workflows
scripts/check-standalone.mjs  Isolated production-runtime verification
```

Read-only APIs:

```text
GET /api/board?date=2026-10-15&league=NBA&mode=live
GET /api/research?league=NBA&id=<ESPN-event-id>
GET /api/markets?league=NBA&id=<ESPN-event-id>&date=2026-10-15
```

Dates must be valid `YYYY-MM-DD` values; leagues and event identifiers are validated. Sample event IDs such as `demo-1` return sample packets. API keys are read on the server and never returned. The platform and its research APIs are accessible without sign-in or authorization, as requested. Each visitor's watchlist stays in their own browser.

## Verification

```bash
npm run typecheck
npm test
npm run build
npm run check:standalone
npx playwright install chromium  # once, if no Playwright browser is installed
npm run test:browser
```

The standalone check copies the production runtime and static assets into a temporary directory, starts it there, and verifies the workspace and research APIs. No inspiration folder is present. Browser tests cover research tabs, market price calculations, watchlist notes across reloads, exports, competition context, filters, mobile navigation and unavailable live feeds.

## Deployment

### Vercel

Import this repository with the **Next.js** framework preset, repository root as the root directory, Node.js **22.x**, install command `npm ci`, and build command `npm run build`. Leave the output directory at the framework default.

**Required environment variables: none.** The only optional application variable is:

| Variable | Purpose | Environments |
| --- | --- | --- |
| `ODDS_API_KEY` | Timestamped bookmaker moneylines from The Odds API | Production, and Preview/Development if desired |

Add it in Vercel's project **Settings → Environment Variables**, keep it server-only (no `NEXT_PUBLIC_` prefix), then redeploy for the change to apply. No `AUTH_*`, database, OpenAI, ESPN or Polymarket credentials are required.

The application has no authentication gate. To make a deployment itself accessible without a Vercel login, also disable Vercel Authentication / Password Protection for the intended public deployment under **Deployment Protection**. This hosting setting is separate from application code and environment variables. References: [environment variables](https://vercel.com/docs/environment-variables), [deployment protection](https://vercel.com/docs/deployment-protection).

### Self-hosting

The Next.js build produces a standalone Node server. Deploy to a Node 22+ host, a Next.js-compatible hosting platform, or use the included Dockerfile:

```bash
docker build -t sportsdesk .
docker run --rm -p 3000:3000 --env-file .env.local sportsdesk
```

Omit `--env-file` when using only public feeds. No deployment or provider purchase is needed for local use.

DM Sans and Manrope are bundled locally under the SIL Open Font License; their notices are in `src/app/fonts/`. Team identity marks are rendered from text and colors; no reference-repository artwork is used.
