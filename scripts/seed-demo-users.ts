import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { seedDemoParticipation } from "../src/lib/demo-users";
import { ParticipationStore } from "../src/lib/participation-store";

const path = resolve(process.env.REWARDS_DB_PATH || ".data/rewards.sqlite");
mkdirSync(dirname(path), { recursive: true });
const store = new ParticipationStore(path);
try {
  const result = seedDemoParticipation(store);
  console.log(
    `Seeded ${result.athletes} demo athletes and ${result.sessions} sessions into ${path} (${result.awarded} points awarded, ${result.skipped} already present).`,
  );
} finally {
  store.db.close();
}
