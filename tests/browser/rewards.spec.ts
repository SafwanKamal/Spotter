import { test, expect } from "./support/signed-in";
import AxeBuilder from "@axe-core/playwright";
const board = {
  entries: [
    {
      id: "one",
      name: "Athlete 123abc",
      rank: 1,
      points: 24,
      sessions: 2,
      repetitions: 2,
      activeDays: 1,
      isYou: true,
    },
  ],
  me: {
    id: "one",
    name: "Athlete 123abc",
    rank: 1,
    points: 24,
    sessions: 2,
    repetitions: 2,
    activeDays: 1,
    isYou: true,
  },
  total: 1,
  totalPoints: 24,
  matching: 1,
  pages: 1,
  page: 1,
  updatedAt: Date.now(),
  history: [],
};
test("rewards and community share ranking, filters, search and accessible mobile layout", async ({
  page,
}) => {
  let fail = false;
  await page.route("**/api/rewards/leaderboard?*", (route) =>
    route.fulfill({
      status: fail ? 503 : 200,
      json: fail ? { error: "Ranking temporarily unavailable" } : board,
    }),
  );
  await page.goto("/social");
  await expect(
    page.getByRole("heading", { name: "Community leaderboard", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("cell", { name: "24", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "This month", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "This month", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("combobox", { name: "Exercise", exact: true }).click();
  await page.getByRole("option", { name: "Plank", exact: true }).click();
  await expect(
    page.getByRole("combobox", { name: "Exercise", exact: true }),
  ).toContainText("Plank");
  await page.getByRole("searchbox").fill("Athlete");
  await page.goto("/profile/rewards");
  await expect(
    page.getByRole("heading", { name: "Your progress" }),
  ).toBeVisible();
  await expect(page.getByText("Working integration examples")).toHaveCount(0);
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    expect(
      (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze())
        .violations,
    ).toEqual([]);
    await page.screenshot({
      path: `test-results/rewards-${width}.png`,
      fullPage: true,
    });
  }
  fail = true;
  await page.getByRole("button", { name: "Refresh", exact: true }).click();
  await expect(page.getByRole("alert").filter({hasText:"Ranking temporarily unavailable"})).toContainText(
    "Ranking temporarily unavailable",
  );
  fail = false;
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(
    page.getByRole("cell", { name: "24", exact: true }),
  ).toBeVisible();
});
test("recorded session claims use the account and update ranking", async ({
  page,
}) => {
  await page.addInitScript(() =>
    sessionStorage.setItem(
      "spotter.rewardSession.v1",
      JSON.stringify({
        source: "live",
        exercise: "pushup",
        duration: 10,
        coverage: 0.9,
        reps: [{ start: 1, end: 4 }],
      }),
    ),
  );
  let claims = 0;
  await page.route("**/api/rewards/claim", async (route) => {
    claims++;
    expect(route.request().postDataJSON()).not.toHaveProperty("walletAddress");
    await route.fulfill({
      status: 201,
      json: { awardedPoints: 12, alreadyClaimed: false },
    });
  });
  await page.route("**/api/rewards/leaderboard?*", (route) =>
    route.fulfill({ json: board }),
  );
  await page.goto("/profile/rewards");
  await page.getByRole("button", { name: "Collect 12 points" }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "12 points added" }),
  ).toBeVisible();
  expect(claims).toBe(1);
  await expect(
    page.getByRole("button", { name: "Points collected" }),
  ).toBeDisabled();
});

test('community ranking fits desktop and mobile and handles an empty leaderboard', async ({page}) => {
 await page.route('**/api/rewards/leaderboard?*',route=>route.fulfill({json:{...board,entries:[],me:null,total:0,totalPoints:0,matching:0}}));
 await page.goto('/social');
 await expect(page.getByRole('heading',{name:'Be the first to show up'})).toBeVisible();
 for(const width of [1440,390]) {
  await page.setViewportSize({width,height:900});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  expect((await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa']).analyze()).violations).toEqual([]);
  await page.screenshot({path:`test-results/community-rewards-${width}.png`,fullPage:true});
 }
});
