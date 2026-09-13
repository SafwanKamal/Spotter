import { test, expect } from "./support/signed-in";
import AxeBuilder from "@axe-core/playwright";

for (const width of [1440, 390]) {
  test(`shared UI theme and accessible routes at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.route("**/api/speak", async (route) => {
      if (route.request().method() === "GET") {
        return route.fulfill({ json: { configured: true } });
      }
      return route.fulfill({
        status: 200,
        headers: { "Content-Type": "audio/mpeg" },
        body: Buffer.from("id3"),
      });
    });
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    for (const route of [
      "/",
      "/analyze",
      "/replay",
      "/social",
      "/profile",
      "/profile/rewards",
    ]) {
      await page.goto(route);
      await expect(page.locator("main")).toBeVisible();
      if (width === 390 && route === "/") {
        const navigation = page.getByRole("navigation", { name: "Mobile navigation" });
        await expect(navigation.getByRole("link")).toHaveCount(5);
        await expect(navigation.getByRole("link", { name: "Replay" })).toBeVisible();
      }
      await expect(page.locator(".wordmark").first()).toHaveCSS(
        "color",
        "rgb(58, 46, 38)",
      );
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      const accessibility = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze();
      expect(accessibility.violations, route).toEqual([]);
      await page.screenshot({
        path: `test-results/ui-${width}-${route.replaceAll("/", "_") || "home"}.png`,
        fullPage: true,
      });
      // A single global override must reach every route, including CSS Modules.
      await page.addStyleTag({
        content:
          ":root { --ink: rgb(20, 40, 60); --radius-lg: 30px; --pose-landmark: rgb(10, 100, 200); }",
      });
      await expect(page.locator(".wordmark").first()).toHaveCSS(
        "color",
        "rgb(20, 40, 60)",
      );
      if (route === "/profile") {
        await expect(page.locator(".profile-card").first()).toHaveCSS(
          "border-top-left-radius",
          "30px",
        );
      }
      if (route === "/social") {
        await expect(page.getByRole("heading", { level: 1 })).toHaveCSS(
          "color",
          "rgb(20, 40, 60)",
        );
      }
      if (route === "/analyze") {
        await page.getByRole("button", { name: "Explore recognition sample" }).click();
        await expect(
          page.locator('svg [stroke="var(--pose-landmark)"]').first(),
        ).toHaveCSS("stroke", "rgb(10, 100, 200)");
      }
    }
    expect(errors).toEqual([]);
  });
}
