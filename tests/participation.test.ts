import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ParticipationStore } from "../src/lib/participation-store";
import { parseSolAmount } from "../src/lib/solana-transfer";
const input = {
  source: "live",
  exercise: "squat",
  duration: 10,
  coverage: 0.9,
  reps: [{ start: 1, end: 4 }],
};
const filters = {
  period: "all" as const,
  exercise: "all",
  search: "",
  page: 1,
};
test("participation persists, replay is idempotent and accounts stay separate", () => {
  const dir = mkdtempSync(join(tmpdir(), "rewards-"));
  const path = join(dir, "db.sqlite");
  let store = new ParticipationStore(path);
  try {
    assert.equal(store.claim("a", "Alice", input).awardedPoints, 12);
    store.db.close();
    store = new ParticipationStore(path);
    assert.equal(store.claim("a", "Alice", input).alreadyClaimed, true);
    assert.equal(store.claim("b", "Bob", input).awardedPoints, 12);
    const board = store.board("a", filters);
    assert.deepEqual(
      board.entries.map((e) => e.rank),
      [1, 1],
    );
    assert.equal(board.me?.points, 12);
    assert.equal(board.total, 2);
    assert.equal(
      store.board("a", { ...filters, search: "Bob" }).entries.length,
      1,
    );
    assert.equal(store.board("a", { ...filters, exercise: "plank" }).total, 0);
  } finally {
    store.db.close();
    rmSync(dir, { recursive: true });
  }
});
test("server enforces eligibility, UTC daily cap and reporting periods", () => {
  const store = new ParticipationStore(":memory:");
  const now = Date.UTC(2026, 8, 13);
  try {
    assert.throws(() =>
      store.claim("a", "Alice", { ...input, source: "synthetic" }, now),
    );
    assert.throws(() =>
      store.claim("a", "Alice", { ...input, source: "video" }, now),
    );
    assert.throws(() =>
      store.claim(
        "a",
        "Alice",
        { ...input, reps: [{ start: 4, end: 2 }] },
        now,
      ),
    );
    for (let i = 0; i < 16; i++)
      store.claim("a", "Alice", { ...input, duration: 10 + i }, now);
    assert.throws(
      () => store.claim("a", "Alice", { ...input, duration: 27 }, now),
      /Daily limit/,
    );
    assert.equal(store.board("a", filters, now).me?.points, 192);
    assert.equal(
      store.board("a", { ...filters, period: "week" }, now + 8 * 86400000)
        .total,
      0,
    );
    assert.equal(
      store.claim("a", "Alice", { ...input, duration: 27 }, now + 86400000)
        .awardedPoints,
      12,
    );
  } finally {
    store.db.close();
  }
});
test("SOL conversion is exact and bounded", () => {
  assert.equal(parseSolAmount("0.000000001"), 1n);
  assert.equal(parseSolAmount("0.001"), 1000000n);
  for (const s of ["0", "-1", "NaN", "1e-3", "0.0000000001", "1.1"])
    assert.throws(() => parseSolAmount(s));
});

test('pagination preserves rank and current athlete across search and period boundaries', () => {
 const store = new ParticipationStore(':memory:');
 const sunday = Date.UTC(2026,8,13,23,59);
 try {
  for(let i=0;i<25;i++)store.claim(`athlete-${i}`,`Athlete ${i}`,input,sunday);
  const page=store.board('athlete-0',{...filters,page:2},sunday);
  assert.equal(page.entries.length,5);assert.equal(page.pages,2);assert.equal(page.me?.rank,1);
  const search=store.board('athlete-0',{...filters,search:'Athlete 24'},sunday);
  assert.equal(search.entries.length,1);assert.equal(search.me?.points,12);
  assert.equal(store.board('athlete-0',{...filters,period:'week'},sunday+60000).total,0);
  assert.equal(store.board('athlete-0',{...filters,period:'month'},sunday+60000).total,25);
 } finally {store.db.close();}
});
