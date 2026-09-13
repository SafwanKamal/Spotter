import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { createClient, generateKeyPair, lamports, writeKeyPair } from "@solana/kit";
import { getAddMemoInstruction } from "@solana-program/memo";
import { memoProgram } from "@solana-program/memo";
import {
  isFailedTransaction,
  litesvm,
  type LiteSvmSendContext,
} from "@solana/kit-plugin-litesvm";
import {
  airdropSigner,
  generatedSigner,
  signerFromFile,
} from "@solana/kit-plugin-signer";
import { analyzeSquats, demoFrames } from "../src/lib/analysis";
import {
  createWorkoutClaim,
  createWorkoutMemo,
  demoProofAnalysisSchema,
  devnetExplorerUrl,
  hashWorkoutClaim,
  serializeWorkoutClaim,
} from "../src/lib/workout-proof";

const analysis = analyzeSquats(demoFrames(), 1000, 1000, 12, "video");

test("workout claims contain bounded summary data without frames or landmarks", () => {
  const claim = createWorkoutClaim(analysis);
  assert.deepEqual(claim, {
    version: "spotter.workout.v1",
    analysisVersion: 2,
    detectionAlgorithm: "relative-excursion-v2",
    exercise: "squat",
    source: "video",
    repetitions: 3,
    setDurationMs: 12_000,
    trackingPermille: 1_000,
    rangeTempoScore: analysis.movementScore,
  });
  assert.equal(serializeWorkoutClaim(claim).includes("landmark"), false);
  assert.equal(serializeWorkoutClaim(claim).includes("measurement"), false);
});

test("claim hashes and memo instructions are deterministic and bounded", async () => {
  const claim = createWorkoutClaim(analysis);
  const first = await hashWorkoutClaim(claim);
  const second = await hashWorkoutClaim(claim);
  assert.equal(first, second);
  assert.match(first, /^[a-f0-9]{64}$/);
  const memo = createWorkoutMemo(claim, first);
  assert.ok(new TextEncoder().encode(memo).byteLength <= 220);
  assert.equal(memo.includes("rangeTempoScore"), false);
  const instruction = getAddMemoInstruction({ memo });
  assert.equal(new TextDecoder().decode(instruction.data), memo);
});

test("synthetic, low-coverage, and incomplete sessions cannot become proofs", () => {
  assert.throws(() =>
    createWorkoutClaim(
      analyzeSquats(demoFrames(), 1000, 1000, 12, "synthetic"),
    ),
  );
  assert.throws(() =>
    createWorkoutClaim({ ...analysis, coverage: 0.74, movementScore: null }),
  );
  assert.throws(() =>
    createWorkoutClaim({ ...analysis, reps: [], movementScore: null }),
  );
});

test("explorer links accept only a base58-like transaction signature", () => {
  const signature = "1".repeat(64);
  assert.equal(
    devnetExplorerUrl(signature),
    "https://explorer.solana.com/tx/" + signature + "?cluster=devnet",
  );
  assert.throws(() => devnetExplorerUrl("../mainnet"));
});

test("the workout memo signs and executes in a local Solana validator", async () => {
  const client = await createClient()
    .use(generatedSigner())
    .use(litesvm())
    .use(airdropSigner(lamports(10_000_000n)))
    .use(memoProgram());
  const claim = createWorkoutClaim(analysis);
  const memo = createWorkoutMemo(claim, await hashWorkoutClaim(claim));
  const result = await client.memo.instructions
    .addMemo({ memo })
    .sendTransaction();
  assert.match(String(result.context.signature), /^[1-9A-HJ-NP-Za-km-z]+$/);
  const metadata = (result.context as LiteSvmSendContext).transactionMetadata;
  if (isFailedTransaction(metadata)) assert.fail("Memo transaction failed.");
  assert.ok(metadata.logs().some((line: string) => line.includes(memo)));
});

test("a Solana CLI keypair file can sign the same workout memo locally", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "spotter-keypair-"));
  const keypairPath = path.join(directory, "wallet.json");
  const keyPair = await generateKeyPair(true);
  await writeKeyPair(keyPair, keypairPath);
  const client = await createClient()
    .use(signerFromFile(keypairPath))
    .use(litesvm())
    .use(airdropSigner(lamports(10_000_000n)))
    .use(memoProgram());
  const claim = createWorkoutClaim(analysis);
  const memo = createWorkoutMemo(claim, await hashWorkoutClaim(claim));
  const result = await client.memo.instructions
    .addMemo({ memo })
    .sendTransaction();
  assert.match(String(result.context.signature), /^[1-9A-HJ-NP-Za-km-z]+$/);
  const metadata = (result.context as LiteSvmSendContext).transactionMetadata;
  if (isFailedTransaction(metadata)) assert.fail("Memo transaction failed.");
  assert.ok(metadata.logs().some((line: string) => line.includes(memo)));
  await rm(directory, { recursive: true, force: true });
});

test("demo proof analysis schema accepts only eligible squat summaries", () => {
  const valid = demoProofAnalysisSchema.parse({
    version: 2,
    exercise: "squat",
    source: "video",
    duration: analysis.duration,
    coverage: analysis.coverage,
    movementScore: analysis.movementScore,
    reps: analysis.reps,
    detection: { algorithm: "relative-excursion-v2" },
  });
  assert.equal(valid.exercise, "squat");
  assert.throws(() =>
    demoProofAnalysisSchema.parse({
      ...valid,
      source: "synthetic",
    }),
  );
});
