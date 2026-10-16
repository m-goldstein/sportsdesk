import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { demoBoard } from "../../src/lib/demo";
import { defaultScenario, Prediction } from "../../src/lib/decision-lab";

test("a scenario can be stress-tested, shared, exported, locked and scored across reloads", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/?mode=demo&date=2026-10-15&view=Decision+lab");
  await expect(
    page.getByRole("heading", { name: "What if you could test the thesis?" }),
  ).toBeVisible();
  await page
    .getByLabel("Scenario matchup", { exact: true })
    .selectOption("demo-1");
  const readout = page.locator(".lab-probability > strong");
  const baseline = await readout.textContent();
  const impact = page.getByLabel("BOS assumed margin impact", { exact: true });
  await impact.press("Home");
  for (let i = 0; i < 12; i++) await impact.press("ArrowRight");
  expect(await readout.textContent()).not.toBe(baseline);
  const probability = await readout.textContent();
  const uncertainty = page.getByLabel("Assumed uncertainty", { exact: true });
  await uncertainty.press("Home");
  for (let i = 0; i < 12; i++) await uncertainty.press("ArrowRight");
  await expect(
    page.getByRole("table", { name: "Scenario sensitivity map" }),
  ).toBeVisible();
  await page
    .getByLabel("Scenario thesis", { exact: true })
    .fill("A missing starter changes my view. <script> stays text.");
  await page
    .getByRole("button", { name: "Share scenario", exact: true })
    .click();
  const shared = await page.getByLabel("Shareable scenario URL").inputValue();
  expect(shared).toContain("h=-6");
  expect(shared).toContain("u=12");
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Thesis card", exact: true }).click();
  const file = await download;
  await file.saveAs("test-results/decision-lab-thesis-card.svg");
  expect(file.suggestedFilename()).toBe("oracular-NYK-BOS-thesis.svg");
  const svg = await readFile((await file.path())!, "utf8");
  expect(svg).toContain("&lt;script&gt;");
  expect(svg).not.toContain("<script>");
  await page.evaluate(() => scrollTo(0, 0));
  await page.screenshot({
    path: "test-results/decision-lab-scenario-desktop.png",
    fullPage: true,
    animations: "disabled",
  });
  await page
    .getByRole("button", { name: "Lock prediction", exact: true })
    .click();
  await expect(
    page.getByRole("tab", { name: /Prediction journal/ }),
  ).toHaveAttribute("aria-selected", "true");
  await expect(page.locator(".lab-entry-read strong")).toHaveText(probability!);
  await page.getByRole("button", { name: "BOS wins", exact: true }).click();
  await expect(page.locator(".lab-entry .pill")).toHaveText("Resolved");
  await expect(
    page.locator(".lab-journal-metrics > div").nth(2).locator("strong"),
  ).not.toHaveText("—");
  await page.reload();
  await page.getByRole("tab", { name: /Prediction journal/ }).click();
  await expect(page.locator(".lab-entry-thesis")).toContainText(
    "A missing starter",
  );
  await expect(page.locator(".lab-entry .pill")).toHaveText("Resolved");
  await page.goto(shared);
  await expect(
    page.getByLabel("BOS assumed margin impact", { exact: true }),
  ).toHaveValue("-6");
  await expect(
    page.getByLabel("Assumed uncertainty", { exact: true }),
  ).toHaveValue("12");
  await expect(readout).toHaveText(probability!);
  await expect(
    page.getByRole("button", { name: "Prediction already locked" }),
  ).toBeDisabled();
  await page.reload();
  await expect(
    page.getByLabel("BOS assumed margin impact", { exact: true }),
  ).toHaveValue("-6");
  await expect(readout).toHaveText(probability!);
  expect(errors).toEqual([]);
});

test("tournament paths, field swaps, exports and walkthrough work on desktop and mobile", async ({
  page,
}) => {
  await page.goto("/?mode=demo&date=2026-10-15");
  await page.getByRole("button", { name: /Don’t just read the odds/ }).click();
  await page.getByRole("button", { name: "Demo walkthrough" }).click();
  await page.getByRole("button", { name: "Next step" }).click();
  await page.getByRole("button", { name: "Next step" }).click();
  await expect(
    page.getByRole("tab", { name: "02 Tournament lab" }),
  ).toHaveAttribute("aria-selected", "true");
  await expect(page.locator(".lab-bracket-match")).toHaveCount(7);
  const first = await page
    .getByLabel("Bracket slot 1", { exact: true })
    .inputValue();
  const second = await page
    .getByLabel("Bracket slot 2", { exact: true })
    .inputValue();
  await page.getByLabel("Bracket slot 1", { exact: true }).selectOption(second);
  await expect(page.getByLabel("Bracket slot 2", { exact: true })).toHaveValue(
    first,
  );
  await page.getByRole("button", { name: "Play another universe" }).click();
  await expect(page.locator(".lab-champion")).toContainText("Universe #43");
  const download = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Export bracket", exact: true })
    .click();
  const report = JSON.parse(
    await readFile((await (await download).path())!, "utf8"),
  );
  expect(report.field).toHaveLength(8);
  expect(
    report.odds.reduce(
      (sum: number, o: { champion: number }) => sum + o.champion,
      0,
    ),
  ).toBeCloseTo(1, 10);
  await page.evaluate(() => scrollTo(0, 0));
  await page.screenshot({
    path: "test-results/decision-lab-tournament-desktop.png",
    fullPage: true,
    animations: "disabled",
  });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page
    .getByLabel("Tournament sport", { exact: true })
    .selectOption("NFL");
  await expect(page.locator(".lab-bracket-match")).toHaveCount(1);
  await page.getByRole("button", { name: "Dismiss", exact: true }).click();
  await page.getByRole("tab", { name: "Scenario studio" }).click();
  await expect(
    page.getByRole("table", { name: "Scenario sensitivity map" }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.evaluate(() => scrollTo(0, 0));
  await page.screenshot({
    path: "test-results/decision-lab-scenario-mobile.png",
    fullPage: true,
    animations: "disabled",
  });
});

test("real final-score sync resolves only the live journal and preserves sample separation", async ({
  page,
}) => {
  const board = demoBoard("2020-10-15");
  board.mode = "live";
  board.warnings = [];
  const g = { ...board.games[0], demo: false };
  const entry: Prediction = {
    version: 1,
    id: "live-test",
    game: g,
    createdAt: "2020-10-15T10:00:00Z",
    probability: 0.7,
    baseline: 0.6,
    scenario: defaultScenario(g),
    thesis: "Recorded before the game",
  };
  await page.addInitScript(
    ({ entry }) =>
      localStorage.setItem(
        "sportsdesk.predictions.v1",
        JSON.stringify([entry]),
      ),
    { entry },
  );
  await page.route("**/api/board?mode=live**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ...board,
        games: [
          {
            ...g,
            state: "post",
            statusName: "STATUS_FINAL",
            home: { ...g.home, score: 110 },
            away: { ...g.away, score: 100 },
          },
        ],
      }),
    }),
  );
  await page.goto("/?mode=demo&date=2020-10-15&view=Decision+lab");
  await page.getByRole("tab", { name: /Prediction journal/ }).click();
  await expect(page.locator(".lab-entry")).toHaveCount(0);
  await page.getByLabel("Data source", { exact: true }).selectOption("live");
  await expect(page.locator(".lab-entry")).toHaveCount(1);
  await page.getByRole("button", { name: "Sync final scores" }).click();
  await expect(page.locator(".lab-entry .pill")).toHaveText("Resolved");
  await expect(
    page.locator(".lab-journal-metrics > div").nth(2).locator("strong"),
  ).toHaveText("0.090");
  await expect(
    page.locator(".lab-journal-metrics > div").nth(3).locator("strong"),
  ).toHaveText("0.160");
  await page.getByRole("button", { name: "Export journal" }).click();
});
