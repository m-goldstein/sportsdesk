import { test, expect } from "@playwright/test";
test("research, market comparison, saved notes, refresh and exports form a complete workflow", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/?mode=demo&date=2026-10-15");
  await expect(
    page.getByRole("heading", { name: "Your edge starts here." }),
  ).toBeVisible();
  await page
    .locator(".featured-card")
    .filter({ hasText: "Celtics" })
    .getByRole("button", { name: "Research matchup" })
    .click();
  const dialog = page.getByRole("dialog", { name: "Matchup research packet" });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("tab", { name: "Players", exact: true }).click();
  await expect(dialog.getByText("Jayson Tatum")).toBeVisible();
  await dialog.getByRole("tab", { name: "Availability" }).click();
  await expect(dialog.getByText("Questionable")).toBeVisible();
  await dialog.getByRole("tab", { name: "Markets", exact: true }).click();
  await expect(
    dialog.getByText("Sample sportsbook", { exact: true }),
  ).toBeVisible();
  await dialog.getByLabel("Decimal odds").fill("2.50");
  await expect(dialog.getByText("40.0%", { exact: true })).toBeVisible();
  await dialog.getByRole("button", { name: "Save matchup" }).click();
  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Watchlist" })
    .click();
  const notes = page.getByRole("textbox", { name: "Notes for NYK at BOS" });
  await notes.fill("Check starting lineups before changing the thesis.");
  await page.reload();
  await expect(notes).toHaveValue(
    "Check starting lineups before changing the thesis.",
  );
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export watchlist" }).click();
  expect((await download).suggestedFilename()).toBe(
    "sportsdesk-watchlist.json",
  );
  await page.getByRole("button", { name: "Build daily brief" }).click();
  await expect(
    page.getByRole("dialog", { name: "Daily research brief" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Close daily brief" }).click();
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Teams", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Team research", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Tournaments", exact: true })
    .click();
  await expect(
    page
      .locator(".tournament-game")
      .getByText("ACC Tournament · Semifinal", { exact: false }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});
test("sport and status filters, empty states and mobile layout remain usable", async ({
  page,
}) => {
  await page.goto("/?mode=demo&date=2026-10-15");
  await page.getByRole("button", { name: /NFL 1/ }).click();
  await expect(page.locator(".game-table tbody tr")).toHaveCount(1);
  await page.getByLabel("Game status", { exact: true }).selectOption("Final");
  await expect(
    page.getByRole("heading", { name: "No matchups found" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Clear filters" }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Open navigation" }).click();
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Live games" })
    .click();
  await expect(
    page.getByRole("heading", { name: "Live scoreboard" }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "test-results/sportsdesk-mobile.png",
    fullPage: true,
  });
});
test("live mode handles unavailable feeds without substituting sample data", async ({
  page,
}) => {
  await page.goto("/?mode=demo&date=2026-10-15");
  await page.route("**/api/board?mode=live**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        games: [],
        teams: [],
        leagues: [],
        mode: "live",
        fetchedAt: new Date().toISOString(),
        warnings: [
          "NBA: score feed unavailable. Retry or explore the sample desk.",
        ],
      }),
    }),
  );
  await page.getByLabel("Data source", { exact: true }).selectOption("live");
  await expect(page.getByText("LIVE FEEDS", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "No matchups found" }),
  ).toBeVisible();
  await expect(page.locator(".game-table")).toHaveCount(0);
});
