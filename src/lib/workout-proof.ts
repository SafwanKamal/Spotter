import { z } from "zod";
import type { Analysis } from "./analysis";

export const workoutClaimSchema = z.object({
  version: z.literal("formchain.workout.v1"),
  analysisVersion: z.literal(2),
  detectionAlgorithm: z.literal("relative-excursion-v2"),
  exercise: z.literal("squat"),
  source: z.literal("video"),
  repetitions: z.number().int().min(1).max(100),
  setDurationMs: z.number().int().min(3_000).max(30_000),
  trackingPermille: z.number().int().min(750).max(1_000),
  rangeTempoScore: z.number().int().min(0).max(100),
});

export type WorkoutClaim = z.infer<typeof workoutClaimSchema>;

export function createWorkoutClaim(analysis: Analysis): WorkoutClaim {
  return workoutClaimSchema.parse({
    version: "formchain.workout.v1",
    analysisVersion: analysis.version,
    detectionAlgorithm: analysis.detection.algorithm,
    exercise: analysis.exercise,
    source: analysis.source,
    repetitions: analysis.reps.length,
    setDurationMs: Math.round(analysis.duration * 1_000),
    trackingPermille: Math.round(analysis.coverage * 1_000),
    rangeTempoScore: analysis.movementScore,
  });
}

export function serializeWorkoutClaim(claim: WorkoutClaim): string {
  const checked = workoutClaimSchema.parse(claim);
  return JSON.stringify(checked);
}

export async function hashWorkoutClaim(claim: WorkoutClaim): Promise<string> {
  const bytes = new TextEncoder().encode(serializeWorkoutClaim(claim));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

export function createWorkoutMemo(claim: WorkoutClaim, digest: string): string {
  const checked = workoutClaimSchema.parse(claim);
  if (!/^[a-f0-9]{64}$/.test(digest)) throw new Error("Invalid claim digest.");
  const memo = [
    "formchain:v1",
    "sha256=" + digest,
    "exercise=" + checked.exercise,
    "reps=" + checked.repetitions,
    "set_ms=" + checked.setDurationMs,
  ].join("|");
  if (new TextEncoder().encode(memo).byteLength > 220)
    throw new Error("Workout proof is too large.");
  return memo;
}

/** Slim analysis summary accepted by the local demo-proof API. */
export const demoProofAnalysisSchema = z.object({
  version: z.literal(2),
  exercise: z.literal("squat"),
  source: z.literal("video"),
  duration: z.number().gt(0).lte(30),
  coverage: z.number().min(0.75).max(1),
  movementScore: z.number().int().min(0).max(100),
  reps: z.array(z.unknown()).min(1).max(100),
  detection: z.object({
    algorithm: z.literal("relative-excursion-v2"),
  }),
});

export type DemoProofAnalysis = z.infer<typeof demoProofAnalysisSchema>;

export function devnetExplorerUrl(signature: string): string {
  if (!/^[1-9A-HJ-NP-Za-km-z]{64,128}$/.test(signature))
    throw new Error("Invalid transaction signature.");
  return "https://explorer.solana.com/tx/" + signature + "?cluster=devnet";
}
