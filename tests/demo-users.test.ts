import test from "node:test";
import assert from "node:assert/strict";
import {
  ALL_BOARD_FILTERS,
  DEMO_ATHLETES,
  DEMO_E2E_ID,
  DEMO_VIEWER_ID,
  demoLeaderboard,
  demoLocalHistory,
  seedDemoParticipation,
} from "../src/lib/demo-users";
import { ParticipationStore } from "../src/lib/participation-store";

const now = Date.UTC(2026, 8, 13, 18, 0);

test("demo users populate ranking, search, exercise filters, and pagination", () => {
  const store = new ParticipationStore(":memory:");
  try {
    const seeded = seedDemoParticipation(store, now);
    assert.equal(seeded.athletes, 26);
    assert.equal(seeded.sessions, 32);
    assert.equal(seeded.skipped, 0);
    assert.equal(seeded.awarded > 0, true);

    const all = store.board(DEMO_VIEWER_ID, ALL_BOARD_FILTERS, now);
    assert.equal(all.total, DEMO_ATHLETES.length);
    assert.equal(all.entries.length, 20);
    assert.equal(all.pages, 2);
    assert.equal(all.me?.name, "Dev Mode");
    assert.equal(all.me?.isYou, true);
    assert.equal(all.entries.some((entry) => entry.isYou), true);

    const pageTwo = store.board(
      DEMO_VIEWER_ID,
      { ...ALL_BOARD_FILTERS, page: 2 },
      now,
    );
    assert.equal(pageTwo.entries.length, 6);
    assert.equal(pageTwo.page, 2);
    assert.equal(pageTwo.me?.name, "Dev Mode");

    const search = store.board(
      DEMO_VIEWER_ID,
      { ...ALL_BOARD_FILTERS, search: "Priya" },
      now,
    );
    assert.equal(search.matching, 1);
    assert.equal(search.entries[0]?.name, "Priya Raman");
    assert.equal(search.entries[0]?.rank, 1);

    const squats = store.board(
      DEMO_VIEWER_ID,
      { ...ALL_BOARD_FILTERS, exercise: "squat" },
      now,
    );
    assert.equal(squats.total > 0, true);
    assert.equal(
      squats.entries.every((entry) => entry.points > 0),
      true,
    );

    const week = store.board(
      DEMO_VIEWER_ID,
      { ...ALL_BOARD_FILTERS, period: "week" },
      now,
    );
    const month = store.board(
      DEMO_VIEWER_ID,
      { ...ALL_BOARD_FILTERS, period: "month" },
      now,
    );
    assert.equal(week.total < month.total, true);
    assert.equal(month.total < all.total, true);

    const tied = all.entries.filter((entry) => entry.name === "Jordan Blake" || entry.name === "Sam Okonkwo");
    assert.equal(tied.length, 2);
    assert.equal(tied[0]?.points, tied[1]?.points);
    assert.equal(tied[0]?.rank, tied[1]?.rank);

    assert.equal(store.history(DEMO_VIEWER_ID).length, 3);
    assert.equal(store.history(DEMO_E2E_ID).length, 2);
  } finally {
    store.db.close();
  }
});

test("reseeding the same demo users is idempotent", () => {
  const store = new ParticipationStore(":memory:");
  try {
    const first = seedDemoParticipation(store, now);
    const second = seedDemoParticipation(store, now);
    assert.equal(second.awarded, 0);
    assert.equal(second.skipped, first.sessions);
    assert.equal(store.board(DEMO_VIEWER_ID, ALL_BOARD_FILTERS, now).total, 26);
  } finally {
    store.db.close();
  }
});

test("demo local history covers this week and older sessions", () => {
  const history = demoLocalHistory(now);
  assert.equal(history.length, 4);
  assert.equal(
    history.filter((entry) => now - Date.parse(entry.loggedAt) <= 7 * 86_400_000)
      .length,
    3,
  );
  assert.deepEqual(
    history.map((entry) => entry.exercise),
    ["squat", "pushup", "lunge", "plank"],
  );
});

test("demoLeaderboard helper matches a freshly seeded store", () => {
  const board = demoLeaderboard(DEMO_VIEWER_ID, ALL_BOARD_FILTERS, now);
  assert.equal(board.total, 26);
  assert.equal(board.signedIn, true);
  assert.equal(board.history.length, 3);
  assert.equal(board.me?.name, "Dev Mode");
});
