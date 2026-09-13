import test from "node:test";
import assert from "node:assert/strict";
import { awards, decodePool } from "../src/lib/competition-chain";
import {
  competitionSchema,
  competitionTerms,
  ranked,
  phase,
} from "../src/lib/competitions";
const base = {
  id: "gym-open",
  title: "Gym Open",
  gym: "Demo Gym",
  description: "Demo",
  exercise: "squat",
  startsAt: 100,
  endsAt: 200,
  targetLamports: "1000003",
  organizer: "11111111111111111111111111111111",
  demo: true,
  updatedAt: 100,
  competitors: [],
};
test("prize split conserves every lamport, including small pools", () => {
  for (const n of [1n, 3n, 99n, 1000003n, 1000000000n])
    assert.equal(
      awards(n).reduce((a, b) => a + b, 0n),
      n,
    );
  assert.deepEqual(awards(1000003n), [500001n, 300000n, 200002n]);
  assert.throws(() => awards(-1n));
});
test("published competition rejects bad dates, invalid wallets and duplicates", () => {
  assert.throws(() => competitionSchema.parse({ ...base, endsAt: 99 }));
  assert.throws(() =>
    competitionSchema.parse({ ...base, targetLamports: "1000000001" }),
  );
  const p = { wallet: base.organizer, name: "Alex", score: 10, reviewed: true };
  assert.throws(() =>
    competitionSchema.parse({ ...base, competitors: [p, p] }),
  );
});
test("ranking excludes unreviewed entries and terms bind dates and amount", () => {
  const c = competitionSchema.parse({
    ...base,
    competitors: [
      { wallet: base.organizer, name: "Alex", score: 100, reviewed: false },
    ],
  });
  assert.equal(ranked(c).length, 0);
  assert.notEqual(competitionTerms(c), competitionTerms({ ...c, endsAt: 201 }));
  assert.notEqual(
    competitionTerms(c),
    competitionTerms({ ...c, targetLamports: "2000000" }),
  );
  assert.equal(phase(c, 99), "Upcoming");
  assert.equal(phase(c, 100), "Open");
  assert.equal(phase(c, 200), "Ended");
});
test("malformed pool state cannot be displayed as funded", () => {
  assert.throws(() => decodePool(new Uint8Array(20)));
  assert.throws(() => decodePool(new Uint8Array(211)));
});
