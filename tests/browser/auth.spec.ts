import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test("sign-in and sign-up start Auth0 Universal Login", async ({ page }) => {
  await page.goto("/sign-in");
  await expect(
    page.getByRole("heading", { name: "Sign in to FormChain" }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Continue with Auth0" }),
  ).toHaveAttribute("href", "/auth/login?returnTo=%2F");
  await expect(page.getByRole("link", { name: "Create one" })).toHaveAttribute(
    "href",
    "/sign-up",
  );

  await page.goto("/sign-up");
  await expect(
    page.getByRole("heading", { name: "Create your FormChain account" }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Sign up with Auth0" }),
  ).toHaveAttribute(
    "href",
    "/auth/login?screen_hint=signup&returnTo=%2F",
  );
  await expect(page.getByRole("link", { name: "Sign in" })).toHaveAttribute(
    "href",
    "/sign-in",
  );

  // Credentials belong to Auth0's hosted page. A local field could only be
  // forwarded as a login_hint, and an empty one breaks /authorize.
  await expect(page.locator("input[type='email']")).toHaveCount(0);
  await expect(page.locator("input[type='password']")).toHaveCount(0);

  const accessibility = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(accessibility.violations).toEqual([]);
});

test("welcome is the signed-out front door", async ({ page }) => {
  await page.goto("/welcome");
  await expect(page.getByRole("link", { name: "Sign in" }).first()).toHaveAttribute(
    "href",
    "/sign-in",
  );
  await expect(
    page.getByRole("link", { name: "Create account" }).first(),
  ).toHaveAttribute("href", "/sign-up");
  // The primary CTA must not point into the gated app, or a signed-out
  // visitor bounces straight back to this page.
  await expect(
    page.getByRole("link", { name: "Get started free" }),
  ).toHaveAttribute("href", "/sign-up");
});

const GATED_ROUTES = [
  "/",
  "/analyze",
  "/replay",
  "/social",
  "/rewards",
  "/profile",
  "/profile/rewards",
];

for (const route of GATED_ROUTES) {
  test(`${route} redirects a signed-out visitor to /welcome`, async ({
    page,
  }) => {
    // The AUTH_DISABLED escape hatch intentionally removes this gate, so
    // these assertions only mean anything with the gate switched on.
    test.skip(
      process.env.AUTH_DISABLED === "true",
      "AUTH_DISABLED=true — the auth gate is deliberately off.",
    );
    await page.goto(route);
    await expect(page).toHaveURL(/\/welcome$/);
    await expect(
      page.getByRole("heading", { name: "See your form the way a coach would." }),
    ).toBeVisible();
  });
}

test("Auth0 login and signup routes redirect to the tenant", async ({
  request,
}) => {
  const login = await request.get("/auth/login", { maxRedirects: 0 });
  expect(login.status()).toBeGreaterThanOrEqual(300);
  expect(login.status()).toBeLessThan(400);
  expect(login.headers().location ?? "").toMatch(/auth0\.com/);

  const signup = await request.get("/auth/login?screen_hint=signup", {
    maxRedirects: 0,
  });
  expect(signup.status()).toBeGreaterThanOrEqual(300);
  expect(signup.status()).toBeLessThan(400);
  const signupLocation = signup.headers().location ?? "";
  expect(signupLocation).toMatch(/auth0\.com/);
  expect(signupLocation).toMatch(/screen_hint=signup/);
});
