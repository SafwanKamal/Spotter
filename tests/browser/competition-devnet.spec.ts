import { test, expect } from "./support/signed-in";
import AxeBuilder from "@axe-core/playwright";
test.skip(
  process.env.RUN_COMPETITION_DEVNET_UI !== "1",
  "Opt-in: requires the local directory and settled devnet demo.",
);
for (const width of [1440, 390])
  test(`confirmed devnet competition payouts at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto("/profile/competitions/community-lunge-finish");
    await expect(
      page.getByRole("heading", { name: "Final standings" }),
    ).toBeVisible({ timeout: 20000 });
    await expect(page.locator(".competition-pool-value")).toContainText(
      "0.001",
    );
    await expect(page.getByRole("table").getByText(/Claimed/)).toHaveCount(3);
    await expect(
      page.getByText(
        "Verified: published standings match the results digest recorded on Solana.",
      ),
    ).toBeVisible();
    await expect(page.locator(".competition-pool-stats")).toContainText(
      "0.001 SOL",
    );
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    const scan = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
      .analyze();
    expect(scan.violations).toEqual([]);
    await page.screenshot({
      path: `test-results/competition-live-${width}.png`,
      fullPage: true,
    });
  });
