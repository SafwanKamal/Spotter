import { angle, type PoseFrame } from "../analysis";
import { analyzeExercise } from "./engine";
import type { ExerciseId } from "./types";

export type ExerciseCandidate = {
  exercise: ExerciseId;
  confidence: number;
};

export type ExerciseClassification = {
  exercise: ExerciseId;
  confidence: number;
  needsConfirmation: boolean;
  alternatives: ExerciseCandidate[];
  reason: string;
};

const visible = (frame: PoseFrame, index: number) => {
  const point = frame.landmarks[index];
  return point && (point.visibility ?? 0) >= 0.7;
};

const percentile = (values: number[], fraction: number) => {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * fraction))];
};

const range = (values: number[]) =>
  values.length ? percentile(values, 0.9) - percentile(values, 0.1) : 0;

export function extractExerciseFeatures(
  frames: PoseFrame[],
  width: number,
  height: number,
) {
  const orientations: number[] = [];
  const elbowAngles: number[] = [];
  const hipAngles: number[] = [];
  const kneeAngles: number[] = [];
  const torsoLeans: number[] = [];
  const bilateralKneeDifferences: number[] = [];
  const stanceRatios: number[] = [];

  for (const frame of frames) {
    const side = visible(frame, 11) && visible(frame, 23) ? "left" : "right";
    const ids =
      side === "left"
        ? { shoulder: 11, elbow: 13, wrist: 15, hip: 23, knee: 25, ankle: 27 }
        : { shoulder: 12, elbow: 14, wrist: 16, hip: 24, knee: 26, ankle: 28 };
    if (![ids.shoulder, ids.hip, ids.ankle].every((i) => visible(frame, i)))
      continue;
    const point = (index: number) => ({
      x: frame.landmarks[index].x * width,
      y: frame.landmarks[index].y * height,
    });
    const shoulder = point(ids.shoulder);
    const hip = point(ids.hip);
    const ankle = point(ids.ankle);
    orientations.push(
      Math.abs(shoulder.x - ankle.x) /
        Math.max(1, Math.abs(shoulder.y - ankle.y)),
    );
    torsoLeans.push(
      (Math.atan2(Math.abs(shoulder.x - hip.x), Math.abs(shoulder.y - hip.y)) *
        180) /
        Math.PI,
    );
    if (visible(frame, ids.knee)) {
      const knee = point(ids.knee);
      const kneeAngle = angle(hip, knee, ankle);
      const hipAngle = angle(shoulder, hip, knee);
      if (kneeAngle !== null) kneeAngles.push(kneeAngle);
      if (hipAngle !== null) hipAngles.push(hipAngle);
    }
    if (visible(frame, ids.elbow) && visible(frame, ids.wrist)) {
      const elbowAngle = angle(shoulder, point(ids.elbow), point(ids.wrist));
      if (elbowAngle !== null) elbowAngles.push(elbowAngle);
    }

    if ([11, 12, 23, 24, 25, 26, 27, 28].every((i) => visible(frame, i))) {
      const scaled = (index: number) => ({
        x: frame.landmarks[index].x * width,
        y: frame.landmarks[index].y * height,
      });
      const leftKnee = angle(scaled(23), scaled(25), scaled(27));
      const rightKnee = angle(scaled(24), scaled(26), scaled(28));
      if (leftKnee !== null && rightKnee !== null)
        bilateralKneeDifferences.push(Math.abs(leftKnee - rightKnee));
      const centerShoulder = {
        x: (scaled(11).x + scaled(12).x) / 2,
        y: (scaled(11).y + scaled(12).y) / 2,
      };
      const centerHip = {
        x: (scaled(23).x + scaled(24).x) / 2,
        y: (scaled(23).y + scaled(24).y) / 2,
      };
      const torsoLength = Math.hypot(
        centerShoulder.x - centerHip.x,
        centerShoulder.y - centerHip.y,
      );
      stanceRatios.push(
        Math.abs(scaled(27).x - scaled(28).x) / Math.max(1, torsoLength),
      );
    }
  }

  return {
    horizontalRatio: percentile(orientations, 0.5),
    elbowRange: range(elbowAngles),
    hipRange: range(hipAngles),
    kneeRange: range(kneeAngles),
    torsoLean90: percentile(torsoLeans, 0.9),
    bilateralKneeDifference90: percentile(bilateralKneeDifferences, 0.9),
    stanceRatio90: percentile(stanceRatios, 0.9),
    bilateralFrames: bilateralKneeDifferences.length,
    trackedFrames: orientations.length,
  };
}

/**
 * Classify the motion represented by MediaPipe landmarks. This is an
 * interpretable prototype classifier for the five supported exercises, not a
 * general activity-recognition model. Low-confidence results must remain
 * user-correctable.
 */
export function classifyExercise(
  frames: PoseFrame[],
  width: number,
  height: number,
  duration: number,
): ExerciseClassification {
  const features = extractExerciseFeatures(frames, width, height);
  const trackedShare = frames.length
    ? features.trackedFrames / frames.length
    : 0;
  const analyses = Object.fromEntries(
    (["squat", "pushup", "lunge", "deadlift", "plank"] as ExerciseId[]).map(
      (id) => [id, analyzeExercise(id, frames, width, height, duration)],
    ),
  ) as Record<ExerciseId, ReturnType<typeof analyzeExercise>>;

  let scores: Record<ExerciseId, number>;
  let reason: string;
  if (features.horizontalRatio > 1.15) {
    const pushupReps = analyses.pushup.reps?.length ?? 0;
    const pushupMotion = Math.min(1, features.elbowRange / 55);
    const plankHold = Math.min(
      1,
      (analyses.plank.hold?.totalTrackedSeconds ?? 0) / Math.min(duration, 5),
    );
    scores = {
      pushup: 0.38 + 0.4 * pushupMotion + Math.min(0.18, pushupReps * 0.06),
      plank: 0.38 + 0.48 * plankHold - 0.28 * pushupMotion,
      squat: 0.04,
      lunge: 0.04,
      deadlift: 0.06,
    };
    reason =
      pushupMotion > 0.45
        ? "Horizontal body position with repeated elbow movement."
        : "Horizontal body position with a sustained body line.";
  } else {
    const hingeDominance = Math.max(
      0,
      (features.hipRange - features.kneeRange * 1.4) / 55,
    );
    const kneeMotion = Math.min(1, features.kneeRange / 55);
    const squatLean = Math.min(1, features.torsoLean90 / 22);
    // A vertical torso does not distinguish a lunge from a squat: front
    // squats in particular are intentionally upright. Require a visibly
    // split stance before preferring lunge. The ankle separation is scaled
    // by torso length so it remains useful across camera distances.
    const splitStance = Math.max(
      0,
      Math.min(1, (features.stanceRatio90 - 1.35) / 0.9),
    );
    const kneeAsymmetry = Math.max(
      0,
      Math.min(1, (features.bilateralKneeDifference90 - 20) / 55),
    );
    const lungeEvidence = splitStance * (0.7 + kneeAsymmetry * 0.3);
    const deadliftReps = analyses.deadlift.reps?.length ?? 0;
    scores = {
      deadlift:
        0.2 + Math.min(0.58, hingeDominance * 0.58) + Math.min(0.12, deadliftReps * 0.04),
      squat:
        0.22 + kneeMotion * 0.45 + (1 - splitStance) * 0.22 + squatLean * 0.06,
      lunge: 0.16 + kneeMotion * 0.35 + lungeEvidence * 0.48,
      pushup: 0.04,
      plank: 0.04,
    };
    reason =
      hingeDominance > 0.45
        ? "Upright setup with hip motion dominating knee motion."
        : lungeEvidence > 0.45
          ? "Upright repeated knee bend with a visibly split, asymmetric stance."
          : "Upright repeated knee bend without clear split-stance evidence.";
  }

  const ranked = (Object.entries(scores) as [ExerciseId, number][])
    .map(([exercise, score]) => ({
      exercise,
      confidence: Math.max(0, Math.min(0.99, score * trackedShare)),
    }))
    .sort((a, b) => b.confidence - a.confidence);
  const winner = ranked[0];
  const margin = winner.confidence - ranked[1].confidence;
  const confidence = Math.min(0.99, winner.confidence * 0.75 + margin * 0.5);
  return {
    exercise: winner.exercise,
    confidence,
    needsConfirmation: confidence < 0.68 || margin < 0.12,
    alternatives: ranked.slice(1, 3),
    reason,
  };
}
