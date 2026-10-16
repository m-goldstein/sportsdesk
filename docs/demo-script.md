# Oracular hackathon demo — about four minutes

Before presenting: use Sample desk and `2026-10-15` so the walkthrough is reproducible. All sample evidence is explicitly fictional. Keep the browser at desktop width. Open Overview; optionally prepare a real, upcoming matchup or election report beforehand if live feeds and OpenAI access are available.

**0:00 — The hook**

“Every day, people make predictions. A team wins. A city hits a record high. A governor keeps their seat.

The internet gives us thousands of opinions and a market price. The hard part is understanding what supports that price — and what would change our mind.

We built Oracular: a research desk that turns uncertainty into something you can inspect, challenge and measure.”

**0:30 — Sports research**

[Open a matchup → GPT analysis. Show the packet and sample report.]

“This demonstration uses clearly labeled sample data. In live mode, Oracular researches players, injuries, coaches, recent news and matchup statistics, then asks GPT for a cited judgment.

The interesting part is the evidence packet: you can see what the model was actually given, open its sources, and read the counterargument. A confident paragraph without evidence isn't the product.”

**1:00 — Make the audience change the forecast**

[Decision lab → Scenario studio → Knicks at Celtics. Move Boston's margin impact to −6; set uncertainty to ±12.]

“Now the fun part. Imagine Boston loses a key piece of its lineup. How much would that need to change the matchup?

With this hypothetical six-point adjustment, our sample estimate moves from about 64% to 52%. The whole sensitivity map changes with it.

At even odds, 52% looks attractive. But widen the uncertainty and the range crosses break-even. Now the decision is about the assumption, not just the number.”

[Write a thesis, download a card, lock the prediction, and resolve a sample outcome.]

“We can share the exact scenario, export a thesis card, and record the prediction before the result. The journal scores it with a Brier score. We're building a habit of checking our convictions.”

**1:55 — Forecasts meet weather markets**

[Weather markets. Show station codes, the temperature ladder and arbitrage cards.]

“We took the same idea beyond sports. People trade contracts on tomorrow's highest temperature.

Oracular fetches NOAA forecasts at the actual settlement station — LaGuardia, not just ‘New York’ — and matches the date, units and bucket rules to Polymarket.

A forecast edge depends on a weather model. Arbitrage is a separate question: can we buy a complete set of outcomes for less than its eventual payout? The scanner checks actual ask depth, fees, minimum sizes and execution buffers. These sample opportunities are fictional; live mode only shows what the books support.

We can practice with paper wagers, or open the actual contract. The app doesn't quietly place a trade.”

**2:45 — Elections with evidence**

[Election desk → Generate sample election research.]

“Next: governor and Senate races. Market prices tell us what traders think. Oracular brings in original polling and cited reporting to build a separate, transparent baseline.

News tone is visible, but it isn't treated as a poll. We can inspect field dates, sample sizes, candidate coverage and missing evidence. Without enough eligible polling, the platform says it doesn't have a supported prediction.”

**3:15 — One leaderboard, three worlds**

[Top outcomes. Switch market consensus → independent model likelihood; filter domains.]

“Finally, everything comes together: the top outcomes across sports, weather and elections.

We can rank market consensus or independent estimates, inspect the evidence behind each row, and see whether a quoted ask is still fresh. High probability doesn't automatically mean a good price — and the interface makes that distinction.”

**3:45 — Close**

[Return to Decision lab → Tournament lab → Play another universe.]

“We even made uncertainty playable. This bracket computes title odds across every possible path, then lets you watch one possible universe unfold.

Oracular makes a prediction worth more than a number. It gives it sources, assumptions, an alternative outcome and a way to keep score.

Read the signals. See what comes next.”
