import { test, expect } from "@playwright/test";

test("Oracular weather desk matches ladders, prices paper wagers, preserves tickets and exports", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/?mode=demo&date=2026-10-15&view=Weather+markets");
  await expect(page).toHaveTitle(/Oracular/);
  await expect(page.getByRole("link", { name: "Oracular home" })).toBeVisible();
  await expect(page.locator(".weather-city")).toHaveCount(9);
  await expect(page.getByLabel("Weather observation date")).toHaveValue(
    "2026-10-16",
  );
  await expect(page.locator(".weather-contract-table tbody tr")).toHaveCount(4);
  await expect(page.locator(".weather-arb-card")).toHaveCount(9);
  await page
    .locator(".weather-detail")
    .getByRole("button", { name: "Paper YES", exact: true })
    .first()
    .click();
  await expect(page.locator(".weather-paper tbody tr")).toHaveCount(1);
  await expect(
    page.getByText("Paper wager recorded on this device. No order was sent.", {
      exact: true,
    }),
  ).toBeVisible();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export paper wagers" }).click();
  expect((await download).suggestedFilename()).toBe(
    "oracular-weather-paper-wagers.json",
  );
  await page.getByLabel("Weather shares", { exact: true }).fill("1000");
  await expect(
    page.getByRole("heading", {
      name: "No positive supported arbitrage at this size",
    }),
  ).toBeVisible();
  await expect(
    page
      .locator(".weather-detail")
      .getByRole("button", { name: "Paper YES", exact: true })
      .first(),
  ).toBeDisabled();
  await page.reload();
  await expect(page.locator(".weather-paper tbody tr")).toHaveCount(1);
  await page.evaluate(() => scrollTo(0, 0));
  await page.screenshot({
    path: "test-results/oracular-weather-desktop.png",
    fullPage: true,
    animations: "disabled",
  });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.getByLabel("Weather city", { exact: true }).selectOption("miami");
  await expect(page.locator(".weather-city")).toHaveCount(1);
  await expect(page.locator(".weather-detail h2")).toContainText("Miami");
  await page.evaluate(() => scrollTo(0, 0));
  await page.screenshot({
    path: "test-results/oracular-weather-mobile.png",
    fullPage: true,
    animations: "disabled",
  });
  expect(errors).toEqual([]);
});

test("governor research combines source-linked polling, news tone, model forecasts and report persistence", async ({
  page,
}) => {
  await page.goto("/?mode=demo&date=2026-10-15&view=Election+desk");
  await expect(page.locator(".election-race-list button")).toHaveCount(10);
  await expect(page.locator(".election-candidate")).toHaveCount(2);
  await page
    .getByRole("button", { name: "Generate sample election research" })
    .click();
  await expect(page.locator(".election-poll-table tbody tr")).toHaveCount(3);
  await expect(page.locator(".election-model-read")).toContainText(
    "3 distinct pollsters",
  );
  await expect(page.locator(".election-news-grid article")).toHaveCount(1);
  await page.getByLabel("Exploratory sentiment overlay").check();
  await expect(page.getByLabel("Exploratory sentiment overlay")).toBeChecked();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export election research" }).click();
  expect((await download).suggestedFilename()).toBe(
    "oracular-michigan-governor-research.json",
  );
  await page.reload();
  await expect(page.locator(".election-poll-table tbody tr")).toHaveCount(3);
  await expect(
    page.getByLabel("Exploratory sentiment overlay"),
  ).not.toBeChecked();
  await page.evaluate(() => scrollTo(0, 0));
  await page.screenshot({
    path: "test-results/oracular-election-desktop.png",
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
    .getByLabel("Election office", { exact: true })
    .selectOption("Senate");
  await expect(page.locator(".election-race-list button")).toHaveCount(2);
  await expect(page.locator(".election-overview h2")).toContainText(
    "Georgia Senate",
  );
});

test("cross-domain top ten ranks market and independent estimates and links back to evidence", async ({
  page,
}) => {
  await page.goto("/?mode=demo&date=2026-10-15&view=Top+outcomes");
  await expect(page.locator(".ranking-table tbody tr")).toHaveCount(10);
  const percentages = await page
    .locator(".ranking-probability")
    .allTextContents();
  const values = percentages.map((p) => parseFloat(p));
  expect(values).toEqual([...values].sort((a, b) => b - a));
  await page
    .getByLabel("Ranking domain", { exact: true })
    .selectOption("Weather");
  await expect(page.locator(".ranking-table tbody tr")).toHaveCount(9);
  await page.getByLabel("Ranking basis", { exact: true }).selectOption("model");
  await expect(page.locator(".ranking-table tbody tr")).toHaveCount(9);
  await page
    .getByLabel("Ranking domain", { exact: true })
    .selectOption("Elections");
  await expect(
    page.getByRole("heading", {
      name: "No eligible outcomes for this ranking",
    }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Research election polling" }).click();
  await page
    .getByRole("button", { name: "Generate sample election research" })
    .click();
  await expect(page.locator(".election-model-read")).toBeVisible();
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Top outcomes", exact: true })
    .click();
  await page.getByLabel("Ranking basis", { exact: true }).selectOption("model");
  await page
    .getByLabel("Ranking domain", { exact: true })
    .selectOption("Elections");
  await expect(page.locator(".ranking-table tbody tr")).toHaveCount(1);
  await page
    .getByLabel("Ranking domain", { exact: true })
    .selectOption("All domains");
  await page.getByLabel("Ranking limit", { exact: true }).selectOption("20");
  await expect(page.locator(".ranking-table tbody tr")).toHaveCount(17);
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export rankings" }).click();
  expect((await download).suggestedFilename()).toBe(
    "oracular-top-outcomes.json",
  );
  await page.evaluate(() => scrollTo(0, 0));
  await page.screenshot({
    path: "test-results/oracular-rankings-desktop.png",
    fullPage: true,
    animations: "disabled",
  });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test("weather and election research failures stay visible and can be retried without fabricated data", async ({
  page,
}) => {
  await page.route("**/api/weather?**", (route) =>
    route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ error: "NOAA scan unavailable for this check." }),
    }),
  );
  await page.goto("/?mode=demo&date=2026-10-15&view=Weather+markets");
  await expect(page.locator(".market-desk").getByRole("alert")).toContainText(
    "NOAA scan unavailable",
  );
  await expect(page.locator(".weather-city")).toHaveCount(0);
  await page.unroute("**/api/weather?**");
  await page.getByRole("button", { name: "Retry", exact: true }).click();
  await expect(page.locator(".weather-city")).toHaveCount(9);
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Election desk", exact: true })
    .click();
  await page.route("**/api/elections/analysis", (route) =>
    route.fulfill({
      status: 502,
      contentType: "application/json",
      body: JSON.stringify({
        error: "Original polling sources could not be verified.",
      }),
    }),
  );
  await page
    .getByRole("button", { name: "Generate sample election research" })
    .click();
  await expect(page.locator(".market-desk").getByRole("alert")).toContainText(
    "Original polling sources",
  );
  await expect(page.locator(".election-model-read")).toHaveCount(0);
  await page.unroute("**/api/elections/analysis");
  await page
    .getByRole("button", { name: "Generate sample election research" })
    .click();
  await expect(page.locator(".election-model-read")).toBeVisible();
});
