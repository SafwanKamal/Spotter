import { loadEnvConfig } from "@next/env";
import { defineConfig } from "@playwright/test";

// Match the Next.js dev server's env so signed-in fixtures can mint a
// decryptable Auth0 session cookie from AUTH0_SECRET in .env.local.
loadEnvConfig(process.cwd());

export default defineConfig({
  testDir: "tests/browser",
  timeout: 120000,
  workers: 1,
  use: {
    channel: process.env.PLAYWRIGHT_CHANNEL || undefined,
    baseURL: process.env.PLAYWRIGHT_BASE_URL || "http://127.0.0.1:3000",
    viewport: { width: 1440, height: 1000 },
    screenshot: "only-on-failure",
  },
  webServer: {
    command: "npm run dev -- --hostname 127.0.0.1",
    url: process.env.PLAYWRIGHT_BASE_URL || "http://127.0.0.1:3000",
    reuseExistingServer: !process.env.CI,
  },
});
