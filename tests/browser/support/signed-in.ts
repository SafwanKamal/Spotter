import { test as base, expect } from "@playwright/test";
import { generateSessionCookie } from "@auth0/nextjs-auth0/testing";

/**
 * Every route under `src/app/(app)` now requires an Auth0 session — a
 * signed-out visitor is redirected to /welcome. Driving real Universal
 * Login from Playwright would mean automating a third-party page on every
 * run, so instead we mint the same encrypted `__session` cookie the SDK
 * would have written after a successful callback.
 *
 * Specs that exercise the app itself import `test` from here instead of
 * from "@playwright/test"; specs that assert signed-out behaviour (the
 * gate, the marketing page, the sign-in screens) keep the plain import.
 */

/** Matches SESSION_COOKIE_NAME in the SDK's abstract session store. */
const SESSION_COOKIE_NAME = "__session";

export const TEST_USER = {
  sub: "auth0|formchain-e2e",
  name: "Test Athlete",
  email: "test-athlete@example.com",
  email_verified: true,
};

export const test = base.extend<{ signedIn: void }>({
  signedIn: [
    async ({ context, baseURL }, use) => {
      const secret = process.env.AUTH0_SECRET;
      if (!secret) {
        throw new Error(
          "AUTH0_SECRET must be set for browser tests — it has to match the " +
            "value the dev server runs with, or the session cookie cannot " +
            "be decrypted.",
        );
      }

      const nowInSeconds = Math.floor(Date.now() / 1000);
      const value = await generateSessionCookie(
        {
          user: TEST_USER,
          tokenSet: {
            accessToken: "test-access-token",
            idToken: "test-id-token",
            // Kept comfortably unexpired so the SDK does not try to refresh
            // against the real tenant part-way through a test.
            expiresAt: nowInSeconds + 60 * 60,
          },
          internal: { sid: "formchain-e2e", createdAt: nowInSeconds },
        },
        { secret },
      );

      await context.addCookies([
        {
          name: SESSION_COOKIE_NAME,
          value,
          url: baseURL ?? "http://127.0.0.1:3000",
          httpOnly: true,
          sameSite: "Lax",
        },
      ]);

      await use();
    },
    { auto: true },
  ],
});

export { expect };
