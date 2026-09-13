import type { Page } from "@playwright/test";
import {
  DEMO_LOCAL_PROFILE,
  PROFILE_STORAGE_KEY,
  SESSION_HISTORY_STORAGE_KEY,
  demoLocalHistory,
} from "../../../src/lib/demo-users";

export async function seedLocalDemoUser(page: Page, now = Date.now()) {
  const history = demoLocalHistory(now);
  await page.addInitScript(
    ({ historyKey, profileKey, history, profile }) => {
      localStorage.setItem(historyKey, JSON.stringify(history));
      localStorage.setItem(profileKey, JSON.stringify(profile));
    },
    {
      historyKey: SESSION_HISTORY_STORAGE_KEY,
      profileKey: PROFILE_STORAGE_KEY,
      history,
      profile: DEMO_LOCAL_PROFILE,
    },
  );
  return history;
}
