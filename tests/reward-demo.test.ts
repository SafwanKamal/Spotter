import assert from "node:assert/strict";
import { test } from "node:test";
import { createClient, lamports } from "@solana/kit";
import { memoProgram } from "@solana-program/memo";
import {
  isFailedTransaction,
  litesvm,
  type LiteSvmSendContext,
} from "@solana/kit-plugin-litesvm";
import { airdropSigner, generatedSigner } from "@solana/kit-plugin-signer";
import { calculateReward, RewardLedger } from "../src/lib/reward-policy";
import {
  describeRewardDemoExamples,
  rewardDemoExamples,
  runRewardDemo,
} from "../src/lib/reward-demo";

test("demo examples award policy points and ignore movement score", async () => {
  const catalog = await describeRewardDemoExamples();
  assert.deepEqual(
    catalog.map((example) => [
      example.athlete,
      example.repetitions,
      example.points.total,
    ]),
    [
      ["Alex", 3, 16],
      ["Jordan", 8, 26],
      ["Sam", 5, 29],
    ],
  );
  const jordan = rewardDemoExamples.find(
    (example) => example.id === "jordan-eight-reps",
  )!;
  const lowScore = { ...jordan.claim, rangeTempoScore: 1 };
  assert.deepEqual(calculateReward(jordan.claim), calculateReward(lowScore));
  assert.equal(jordan.claim.rangeTempoScore, 99);
  const sam = catalog.find((example) => example.athlete === "Sam")!;
  assert.equal(sam.points.verifiedGymTime, 9);
  assert.match(sam.memo, /^formchain:v1\|sha256=[a-f0-9]{64}\|exercise=squat/);
  assert.equal(sam.memo.includes("rangeTempoScore"), false);
});

test("running the demo redeems three wallets and rejects replay", async () => {
  const result = await runRewardDemo({
    ledger: new RewardLedger(),
    nowMs: Date.UTC(2026, 8, 13, 18, 0, 0),
  });
  assert.equal(result.kind, "execution");
  assert.equal(result.replay.rejected, true);
  assert.equal(result.replay.code, "attestation_replayed");
  assert.deepEqual(
    result.leaderboard.map((entry) => [entry.athlete, entry.balance]),
    [
      ["Sam", 29],
      ["Jordan", 26],
      ["Alex", 16],
    ],
  );
  for (const example of result.examples) {
    assert.match(example.walletAddress, /^[1-9A-HJ-NP-Za-km-z]+$/);
    assert.equal(example.awardedPoints, example.points.total);
    assert.equal(example.balance, example.points.total);
  }
});

test("each demo memo executes in a local Solana validator", async () => {
  const catalog = await describeRewardDemoExamples();
  for (const example of catalog) {
    const client = await createClient()
      .use(generatedSigner())
      .use(litesvm())
      .use(airdropSigner(lamports(10_000_000n)))
      .use(memoProgram());
    const result = await client.memo.instructions
      .addMemo({ memo: example.memo })
      .sendTransaction();
    assert.match(String(result.context.signature), /^[1-9A-HJ-NP-Za-km-z]+$/);
    const metadata = (result.context as LiteSvmSendContext).transactionMetadata;
    if (isFailedTransaction(metadata)) assert.fail("Memo transaction failed.");
    assert.ok(metadata.logs().some((line: string) => line.includes(example.memo)));
  }
});
