import { test, expect } from "./support/signed-in";
import AxeBuilder from "@axe-core/playwright";
import { competitionFeedFixture } from "./support/competition-feed";
test.beforeEach(async ({ page }) => {
  await page.route("**/api/competitions", (route) =>
    route.fulfill({ json: competitionFeedFixture }),
  );
});
for (const width of [1440, 390])
  test(`competition rail and payout details at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto("/social");
    await expect(
      page.getByRole("heading", { name: "Community", level: 1 }),
    ).toBeVisible();
    if (width === 390)
      await page.locator(".competition-sidebar-mobile summary").click();
    const sidebar = page.getByRole("complementary", {
      name: "Gym competitions",
    });
    await expect(
      sidebar
        .getByRole("link", { name: /Weekend Push-up Cup/ })
        .filter({ visible: true }),
    ).toBeVisible();
    await sidebar
      .getByRole("link", { name: /Weekend Push-up Cup/ })
      .filter({ visible: true })
      .click();
    await expect(
      page.getByRole("heading", {
        name: "Weekend Push-up Cup",
        exact: true,
        level: 1,
      }),
    ).toBeVisible();
    await expect(sidebar).toHaveCount(0);
    await expect(
      page.getByText("Total funded prize pool", { exact: true }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await expect(page).toHaveTitle(/Gym competition/);
    await expect(page.locator(".tab-transition-overlay")).toHaveCount(0);
    const scan = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
      .analyze();
    expect(scan.violations).toEqual([]);
    await page.screenshot({
      path: `test-results/competition-${width}.png`,
      fullPage: true,
    });
  });

test("refresh preserves a last snapshot with a visible stale warning", async ({
  page,
}) => {
  await page.goto("/profile/competitions/west-texas-squat-open");
  await expect(
    page.getByRole("heading", { name: "West Texas Squat Open", level: 1 }),
  ).toBeVisible();
  await page.route("**/api/competitions", (route) =>
    route.fulfill({ status: 503, json: { error: "Unavailable" } }),
  );
  await page.getByRole("button", { name: "Refresh now", exact: true }).click();
  await expect(page.locator("main").getByRole("alert")).toContainText(
    "last snapshot may be out of date",
  );
  await expect(
    page.getByRole("heading", { name: "Top athletes" }),
  ).toBeVisible();
});

test("competition sidebar and polling stay out of other primary tabs", async ({
  page,
}) => {
  const requests: string[] = [];
  page.on("request", (r) => {
    if (r.url().includes("/api/competitions")) requests.push(r.url());
  });
  for (const route of [
    "/",
    "/analyze",
    "/replay",
    "/profile",
    "/profile/rewards",
  ]) {
    await page.goto(route);
    await expect(page.locator("main")).toBeVisible();
    await expect(
      page.getByRole("complementary", { name: "Gym competitions" }),
    ).toHaveCount(0);
    await expect(page.locator(".competition-app-layout")).toHaveCount(0);
  }
  expect(requests).toHaveLength(0);
});
