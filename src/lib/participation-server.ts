import "server-only";
import { createHash } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { ParticipationStore } from "./participation-store";
import { auth0 } from "./auth0";
import { BYPASS_USER, isAuthBypassed } from "./auth-bypass";
export async function rewardUser() {
  const user = isAuthBypassed()
    ? BYPASS_USER
    : (await auth0.getSession())?.user;
  return user?.sub
    ? {
        id: user.sub,
        name:
          "Athlete " +
          createHash("sha256").update(user.sub).digest("hex").slice(0, 6),
      }
    : null;
}
export function participationStore() {
  const path = resolve(
    /* turbopackIgnore: true */ process.env.REWARDS_DB_PATH ||
      ".data/rewards.sqlite",
  );
  mkdirSync(dirname(path), { recursive: true });
  return new ParticipationStore(path);
}
