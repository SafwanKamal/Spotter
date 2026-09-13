import { test, expect } from "./support/signed-in";
import { seedLocalDemoUser } from "./support/demo-user";
import {
  ALL_BOARD_FILTERS,
  DEMO_E2E_ID,
  demoLeaderboard,
} from "../../src/lib/demo-users";

const now = Date.UTC(2026, 8, 13, 18, 0);

test("seeded local history fills dashboard activity, reflections, and profile", async ({
  page,
}) => {
  const history = await seedLocalDemoUser(page, now);
  await page.clock.setFixedTime(now);
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Steady practice." }),
  ).toBeVisible();
  await expect(page.getByText("3 sessions logged, 1 to go")).toBeVisible();
  await expect(page.getByText("Squat session")).toBeVisible();
  await expect(page.getByText("Push-up session")).toBeVisible();
  await expect(page.getByText("Lunge session")).toBeVisible();
  await expect(page.getByText("Brace before you chase depth.")).toBeVisible();
  await expect(page.getByText("5 reps · 46s")).toBeVisible();

  await page.getByRole("tab", { name: "Today" }).click();
  await expect(page.getByText("1", { exact: true }).first()).toBeVisible();
  await page.getByRole("tab", { name: "Month" }).click();
  await expect(page.getByText(`${history.length}`).first()).toBeVisible();

  await page.getByRole("link", { name: "Open profile" }).click();
  await expect(page.getByLabel("Display name")).toHaveValue("Dev Mode");
  await expect(
    page.getByRole("combobox", { name: "Training focus" }),
  ).toContainText("Improve technique");
});

test("seeded athletes drive leaderboard search, filters, pagination, and your rank", async ({
  page,
}) => {
  const payload = (searchParams: URLSearchParams) => {
    const period = (searchParams.get("period") ?? "week") as
      | "week"
      | "month"
      | "all";
    const exercise = searchParams.get("exercise") ?? "all";
    const search = searchParams.get("search") ?? "";
    const pageNumber = Number(searchParams.get("page") ?? "1");
    return demoLeaderboard(
      DEMO_E2E_ID,
      {
        ...ALL_BOARD_FILTERS,
        period,
        exercise,
        search,
        page: pageNumber,
      },
      now,
    );
  };

  await page.route("**/api/rewards/leaderboard?*", async (route) => {
    const url = new URL(route.request().url());
    await route.fulfill({ json: payload(url.searchParams) });
  });

  await page.goto("/social/leaderboard?ranking=athletes");
  await page.getByRole("button", { name: "All time", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "All time", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByText("Page 1 of 2")).toBeVisible();
  await expect(
    page.getByRole("rowheader", { name: "Priya Raman" }),
  ).toBeVisible();
  await expect(page.getByText(/You are\s*Test Athlete/)).toBeVisible();

  await page.getByRole("searchbox").fill("Jordan");
  await expect(
    page.getByRole("rowheader", { name: "Jordan Blake" }),
  ).toBeVisible();
  await expect(
    page.getByRole("rowheader", { name: "Priya Raman" }),
  ).toHaveCount(0);

  await page.getByRole("searchbox").fill("");

  const exerciseFilter = page.getByRole("combobox", {
    name: "Exercise",
    exact: true,
  });
  await exerciseFilter.click();
  await page.getByRole("option", { name: "Plank", exact: true }).click();
  await expect(exerciseFilter).toContainText("Plank");
  await expect(
    page.getByRole("rowheader", { name: "Avery Kim" }),
  ).toBeVisible();

  await exerciseFilter.click();
  await page.getByRole("option", { name: "All exercises", exact: true }).click();
  await expect(exerciseFilter).toContainText("All exercises");

  const board = page.getByRole("region", { name: "Community leaderboard" });
  await expect(board.getByText("Page 1 of 2")).toBeVisible();
  await expect(board.getByText("Updating ranking…")).toHaveCount(0);
  await board.getByRole("button", { name: "Next" }).click();
  await expect(board.getByText("Page 2 of 2")).toBeVisible();
  await expect(
    board.getByRole("rowheader", { name: "Kai Mendoza" }),
  ).toBeVisible();
});
