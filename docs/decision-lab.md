# Decision lab

Sportsdesk's hackathon story is **research → challenge the assumptions → explore the paths → record a prediction → measure it**. Decision lab adds an interactive layer to the existing cited GPT research without requiring another API, account, database or environment variable. All new calculations run locally. Final-score sync uses the existing public sports-data API.

## A three-minute demo

1. Open `/?mode=demo&date=2026-10-15&view=Decision+lab` and choose **Demo walkthrough**. This sample is self-contained and clearly labeled throughout.
2. In **Scenario studio**, start with Knicks at Celtics. Drag Boston's assumed margin impact down by six points. The central probability, fair odds, hypothetical EV range and sensitivity map update together. Expand the math disclosure to explain the transformation.
3. Increase uncertainty to ±12 percentage points. Show how a favorable central estimate can cross the hypothetical price's break-even point. Click a heatmap cell to explore a different assumption pair. These are user assumptions, not measured injury effects.
4. Write a thesis and download the **Thesis card**. It is a standalone 1200×630 SVG in Sportsdesk's blue/aqua theme. **Share scenario** copies a link containing the matchup, start time, source mode, date and numeric assumptions. A recipient sees the same assumptions evaluated against the currently available team snapshot, not an immutable forecast.
5. **Lock prediction** freezes that probability, the original baseline, source snapshot and written reason. In the sample journal, choose a simulated winner. The Brier score and calibration point appear immediately. Reload to show persistence. Export the journal for a portable record.
6. Open **Tournament lab**. The sample NBA field contains eight teams. Swap two bracket slots and watch exact championship odds change; then **Play another universe** to reveal a possible elimination path. Export the field, advancement probabilities and seeded outcome.
7. Explain how live mode works: research real teams through the existing GPT packet, form a scenario, lock before kickoff, and later **Sync final scores**. Samples remain in a separate view and do not contribute to real-game scoring.

## Scenario math

The original baseline remains untouched. For a baseline home probability `p`, sport scale `s`, user margin changes `h` and `a`, and a venue adjustment `v`:

```text
scenario = logistic(logit(p) + (h − a) / s + v / s)
v = scenario home advantage − original home advantage
```

Each impact slider is bounded to ±one sport scale. Positive home impact increases the home team's hypothetical margin; positive away impact increases the away team's. They cancel when equal. The existing baseline bounds remain 15–85%; the experimental result is bounded to 1–99%. Venue uses the existing sport-specific home constant. No learned injury coefficients, player-value attribution, predicted final score or historical accuracy is implied.

The uncertainty slider selects a symmetric range of ±0–25 percentage points, clipped to 1–99%. It is a sensitivity interval chosen by the user, not a confidence interval estimated from data. The 5×5 heatmap varies each side by quarter-scale steps around the current slider setting; boundary values clamp to the slider limits. Clicking a cell makes that assumption pair the new center.

For a hypothetical decimal price `d > 1`, break-even probability is `1/d` and expected return per unit is `p*d − 1`. The studio also evaluates the endpoints of the user range. No bookmaker quote is silently substituted, no stake is recommended and no wager is executed. Fees, slippage, settlement differences and model error are not estimated.

Sharing uses a URL fragment for numeric scenario parameters; private thesis text is excluded. The fragment also identifies the exact matchup start so a mismatched event cannot silently load its assumptions. Shared links use current available data and say so explicitly. Exported SVG cards escape user text and contain no scripts or external assets.

## Tournament calculations

Fields contain the largest supported power of two up to eight teams available for the selected sport. Teams need non-null season records; the loaded slate takes precedence over compatible standings. Choosing a team already in the field swaps slots, ensuring unique entrants. First-round pairs are slots 1–2, 3–4, etc.

A neutral-venue application of the existing baseline estimates each pairwise probability. Dynamic programming propagates winner distributions from each half of the bracket:

```text
P(team wins next round) = P(team reaches round)
                        × sum_opponents(P(opponent reaches round) × P(team beats opponent))
```

Probabilities are summed over every possible path, without Monte Carlo sampling error. At each round, total advancement probability equals the number of surviving teams. Title probabilities sum to one. The separate **one universe** bracket uses a seeded pseudorandom draw at each match and is reproducible from its exported seed. Its displayed result is just one sampled outcome; it does not replace the exact title probabilities.

Assumptions: single elimination, neutral venues, independent games, constant team strength, no reseeding, no series, no fatigue or lineup changes. NFL probabilities are conditional on no tie. This is a hypothetical sandbox, separate from the official competition slate, and not a calibrated championship model.

## Prediction journal

Each local record includes a version, UUID, creation time, full matchup snapshot, home win probability, original baseline, scenario assumptions and thesis. The UI permits one prediction per matchup/start/mode and provides no probability-edit control. It refuses live/final/on-hold events and elapsed real-game kickoff times. Sample records can be created regardless of the illustrative date.

The journal uses the versioned browser key `sportsdesk.predictions.v1`, validates stored records on load, caps storage to 300 entries, surfaces storage failures and supports JSON exports. Deleting a record requires an explicit second click. This is browser-local persistence: clearing storage or changing devices loses access unless exported. Records can be removed or modified outside the UI; this is not an independently verified, tamper-proof public performance history.

Real-game settlement only accepts an exact ID, league, start, home/away identity, non-sample final event with finite nonnegative scores. The record must have been created before kickoff, and kickoff must have elapsed. Existing resolutions cannot be overwritten by a later refresh. Ties void the binary prediction rather than count as losses. Postponed and unfinished events remain pending. Changed kickoff times intentionally require review rather than being auto-matched.

Final-score checks group pending entries by Eastern slate date, fetch up to six dates per click in parallel with timeouts, then cycle to the next batch on subsequent clicks. Failed or partial feeds leave unresolved records untouched and display a status message. Sample outcomes can only be resolved by explicitly labeled local sample controls.

The Brier score is the mean squared difference between home probability and binary outcome (home win = 1). Lower is better; a constant 50% prediction scores 0.250. The comparison baseline is scored on exactly the same resolved games. Voids and pending entries are excluded. Calibration bins use five 20-point probability ranges, plotting average prediction against empirical home win frequency; the accompanying table gives counts so tiny samples are visible. Sample/live entries are isolated before every calculation and export.

## Implementation and verification

- `src/lib/decision-lab.ts`: pure scenario, exact bracket, seeded sampling, settlement, scoring and storage validation.
- `src/components/decision-lab.tsx`: lazy-loaded workspace, accessible keyboard tabs, device persistence and guided presentation.
- `src/components/scenario-studio.tsx`: interactive controls, heatmap, sharing, thesis cards and prediction creation.
- `src/components/tournament-lab.tsx`: field builder, title odds and alternate-universe bracket.
- `src/components/prediction-journal.tsx`: local record UI, final-score API boundary, Brier and calibration.

Unit tests cover probability conservation and symmetry, reproducible bracket paths, scenario direction/venue/bounds, actual-price EV, pregame constraints, exact settlement matching, voids, one-time resolution, calibration/Brier math and malformed local storage. Browser tests cover the complete scenario → share/export → lock → resolve → reload story, live final-score sync, sample separation, tournament swaps/exports and narrow-screen layouts.
