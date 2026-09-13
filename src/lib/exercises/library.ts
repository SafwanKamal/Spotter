import { angle } from "../analysis";
import type {
  DetectionNote,
  ExerciseDefinition,
  GenericRep,
  RolePoints,
} from "./types";

const degrees = (r: number) => (r * 180) / Math.PI;

// Same lean/torso computation the squat analyzer uses: the angle of the
// shoulder-hip line away from vertical, in pixel space so aspect ratio
// doesn't distort it.
function torsoLean(shoulder: { x: number; y: number }, hip: { x: number; y: number }) {
  return degrees(Math.atan2(Math.abs(shoulder.x - hip.x), hip.y - shoulder.y));
}

// Shared 0-100 scoring shape for every rep-based exercise: reward reaching a
// meaningful depth (bounded, not linear to infinity) plus a deliberate,
// unrushed descent and ascent. This mirrors the squat score's intent
// exactly; only the depth reference angle changes per exercise, since a
// "good" elbow bend and a "good" hip-hinge angle are not the same number.
function cyclicDepthTempoScore(
  reps: GenericRep[],
  coverage: number,
  {
    depthHighDeg,
    depthRangeDeg,
    descentThresholdSeconds,
    ascentThresholdSeconds,
  }: {
    depthHighDeg: number;
    depthRangeDeg: number;
    descentThresholdSeconds: number;
    ascentThresholdSeconds: number;
  },
): number | null {
  if (coverage < 0.75 || !reps.length) return null;
  return Math.round(
    reps.reduce(
      (sum, r) =>
        sum +
        Math.min(
          70,
          Math.max(0, ((depthHighDeg - r.minPrimary) / depthRangeDeg) * 70),
        ) +
        (r.descent >= descentThresholdSeconds ? 15 : 5) +
        (r.ascent >= ascentThresholdSeconds ? 15 : 5),
      0,
    ) / reps.length,
  );
}

function commonCyclicCues(
  reps: GenericRep[],
  notes: DetectionNote[],
  coverage: number,
  requiredJointsLabel: string,
  movementNoun: string,
): string[] {
  const cues: string[] = [];
  if (coverage < 0.75)
    cues.push(
      `Keep your ${requiredJointsLabel} in the frame the whole time so I can see the set.`,
    );
  if (!reps.length)
    cues.push(
      `I didn't catch a complete ${movementNoun}. Start in the resting position, go all the way through one rep, and return, from a clear side view.`,
    );
  if (reps.length)
    cues.push(
      "I counted every complete cycle. Depth and tempo can vary from rep to rep; that's still your set.",
    );
  return cues;
}

export const SQUAT_DEFINITION: ExerciseDefinition = {
  id: "squat",
  label: "Squat",
  mode: "cyclic",
  landmarks: {
    left: { shoulder: 11, hip: 23, knee: 25, ankle: 27 },
    right: { shoulder: 12, hip: 24, knee: 26, ankle: 28 },
  },
  measure({ shoulder, hip, knee, ankle }: RolePoints) {
    if (!shoulder || !hip || !knee || !ankle)
      return { primary: null, secondary: null };
    const primary = angle(hip, knee, ankle);
    const secondary = torsoLean(shoulder, hip);
    if (primary === null || secondary > 85) return { primary: null, secondary: null };
    return { primary, secondary };
  },
  score(outcome, coverage) {
    if (!("reps" in outcome)) return null;
    return cyclicDepthTempoScore(outcome.reps, coverage, {
      depthHighDeg: 160,
      depthRangeDeg: 70,
      descentThresholdSeconds: 0.8,
      ascentThresholdSeconds: 0.5,
    });
  },
  cues(outcome, coverage) {
    if (!("reps" in outcome)) return [];
    const { reps, notes } = outcome;
    const cues = commonCyclicCues(
      reps,
      notes,
      coverage,
      "shoulder, hip, knee, and ankle",
      "squat",
    );
    if (reps.some((r) => r.minPrimary > 100))
      cues.push(
        "A couple of reps didn't sit as low as the others. Match your deepest squat next set.",
      );
    if (reps.some((r) => r.descent < 0.8))
      cues.push(
        "Some reps dropped too fast. Slow the way down, then stand with the same pace.",
      );
    return cues;
  },
};

export const PUSHUP_DEFINITION: ExerciseDefinition = {
  id: "pushup",
  label: "Push-up",
  mode: "cyclic",
  landmarks: {
    left: { shoulder: 11, elbow: 13, wrist: 15, hip: 23, ankle: 27 },
    right: { shoulder: 12, elbow: 14, wrist: 16, hip: 24, ankle: 28 },
  },
  measure({ shoulder, elbow, wrist, hip, ankle }: RolePoints) {
    if (!shoulder || !elbow || !wrist) return { primary: null, secondary: null };
    const primary = angle(shoulder, elbow, wrist);
    if (primary === null) return { primary: null, secondary: null };
    // Body-line straightness: 0 when shoulder-hip-ankle sits on a straight
    // line, larger as the hips sag or pike. A single camera cannot tell
    // sag from pike apart, only that the line is not straight — cues say so.
    const secondary =
      shoulder && hip && ankle
        ? (() => {
            const lineAngle = angle(shoulder, hip, ankle);
            return lineAngle === null ? null : Math.abs(180 - lineAngle);
          })()
        : null;
    return { primary, secondary };
  },
  cyclicTuning: { enterDelta: 20, exitDelta: 10, minDepthDelta: 25 },
  score(outcome, coverage) {
    if (!("reps" in outcome)) return null;
    return cyclicDepthTempoScore(outcome.reps, coverage, {
      depthHighDeg: 165,
      depthRangeDeg: 75,
      descentThresholdSeconds: 0.5,
      ascentThresholdSeconds: 0.4,
    });
  },
  cues(outcome, coverage) {
    if (!("reps" in outcome)) return [];
    const { reps, notes } = outcome;
    const cues = commonCyclicCues(
      reps,
      notes,
      coverage,
      "shoulder, elbow, and wrist",
      "push-up",
    );
    if (reps.some((r) => r.maxSecondary > 18))
      cues.push(
        "Your hip line moved noticeably away from straight during at least one rep. Brace so the hips stay in line with shoulders and ankles.",
      );
    if (reps.some((r) => r.minPrimary > 110))
      cues.push(
        "Give yourself more range at the bottom. Let the elbows bend until the chest is closer to the floor.",
      );
    return cues;
  },
};

export const LUNGE_DEFINITION: ExerciseDefinition = {
  id: "lunge",
  label: "Lunge",
  mode: "cyclic",
  landmarks: {
    left: { shoulder: 11, hip: 23, knee: 25, ankle: 27 },
    right: { shoulder: 12, hip: 24, knee: 26, ankle: 28 },
  },
  measure({ shoulder, hip, knee, ankle }: RolePoints) {
    if (!shoulder || !hip || !knee || !ankle)
      return { primary: null, secondary: null };
    const primary = angle(hip, knee, ankle);
    const secondary = torsoLean(shoulder, hip);
    if (primary === null || secondary > 85) return { primary: null, secondary: null };
    return { primary, secondary };
  },
  score(outcome, coverage) {
    if (!("reps" in outcome)) return null;
    return cyclicDepthTempoScore(outcome.reps, coverage, {
      depthHighDeg: 160,
      depthRangeDeg: 70,
      descentThresholdSeconds: 0.6,
      ascentThresholdSeconds: 0.4,
    });
  },
  cues(outcome, coverage) {
    if (!("reps" in outcome)) return [];
    const { reps, notes } = outcome;
    const cues = commonCyclicCues(
      reps,
      notes,
      coverage,
      "shoulder, hip, knee, and ankle",
      "lunge",
    );
    cues.push(
      "A single side-view camera tracks one leg's bend and overall torso lean. It cannot confirm front-knee alignment over the ankle or back-knee position.",
    );
    if (reps.some((r) => r.maxSecondary > 25))
      cues.push(
        "Your torso leaned forward on at least one rep. Keep the chest stacked over the hips as you drop.",
      );
    return cues;
  },
};

export const DEADLIFT_DEFINITION: ExerciseDefinition = {
  id: "deadlift",
  label: "Deadlift",
  mode: "cyclic",
  landmarks: {
    left: { shoulder: 11, hip: 23, knee: 25, ankle: 27 },
    right: { shoulder: 12, hip: 24, knee: 26, ankle: 28 },
  },
  measure({ shoulder, hip, knee, ankle }: RolePoints) {
    if (!shoulder || !hip || !knee) return { primary: null, secondary: null };
    // Primary: the hip-hinge angle (shoulder-hip-knee) — near 180 degrees
    // standing tall, decreasing as the torso hinges forward over the hips.
    const primary = angle(shoulder, hip, knee);
    // Secondary: how far the knee angle has dropped from straight (180deg).
    // A hinge keeps the knees only softly bent, so a small deviation is
    // expected; a deviation that grows a lot looks more like a squat than a
    // hinge. Expressed as a deviation (0 = straight, larger = more bent) so
    // it shares the same "higher is worse" convention as every other
    // exercise's secondary metric — the rep detector's maxSecondary tracking
    // takes the running maximum, which would otherwise reward the worst
    // moment (a collapsed knee) by reporting it as if it were the best.
    const secondary = ankle
      ? (() => {
          const kneeAngle = angle(hip, knee, ankle);
          return kneeAngle === null ? null : 180 - kneeAngle;
        })()
      : null;
    if (primary === null) return { primary: null, secondary: null };
    return { primary, secondary };
  },
  cyclicTuning: { enterDelta: 18, exitDelta: 8, minDepthDelta: 18 },
  score(outcome, coverage) {
    if (!("reps" in outcome)) return null;
    return cyclicDepthTempoScore(outcome.reps, coverage, {
      depthHighDeg: 175,
      depthRangeDeg: 85,
      descentThresholdSeconds: 0.7,
      ascentThresholdSeconds: 0.5,
    });
  },
  cues(outcome, coverage) {
    if (!("reps" in outcome)) return [];
    const { reps, notes } = outcome;
    const cues = commonCyclicCues(
      reps,
      notes,
      coverage,
      "shoulder, hip, and knee",
      "hip-hinge",
    );
    if (reps.some((r) => r.maxSecondary > 50))
      cues.push(
        "At least one repetition showed a large knee bend for a hinge pattern — this can indicate the movement drifted toward a squat. Push the hips back and keep a softer knee bend.",
      );
    cues.push(
      "I can't see back rounding or bar path from this camera. Watch the clip for a long, braced spine.",
    );
    return cues;
  },
};

export const PLANK_DEFINITION: ExerciseDefinition = {
  id: "plank",
  label: "Plank",
  mode: "hold",
  landmarks: {
    left: { shoulder: 11, hip: 23, ankle: 27 },
    right: { shoulder: 12, hip: 24, ankle: 28 },
  },
  measure({ shoulder, hip, ankle }: RolePoints) {
    if (!shoulder || !hip || !ankle) return { primary: null, secondary: null };
    const primary = angle(shoulder, hip, ankle);
    return { primary, secondary: null };
  },
  holdFormToleranceDeg: 16,
  score(outcome) {
    if (!("hold" in outcome)) return null;
    const { hold } = outcome;
    if (hold.totalTrackedSeconds < 2) return null;
    const formShare = hold.totalGoodFormSeconds / hold.totalTrackedSeconds;
    // Reward both a high proportion of good-form time and a longer
    // continuous hold, capped so an extremely long hold cannot dominate.
    const durationCredit = Math.min(30, hold.longestGoodFormSeconds * 2);
    return Math.round(Math.min(100, formShare * 70 + durationCredit));
  },
  cues(outcome) {
    if (!("hold" in outcome)) return [];
    const { hold } = outcome;
    const cues: string[] = [];
    if (hold.totalTrackedSeconds < 2)
      cues.push(
        "Keep your shoulder, hip, and ankle in the frame the whole hold so I can see the line.",
      );
    else {
      cues.push(
        `You held a straight body line for ${hold.totalGoodFormSeconds.toFixed(1)} of ${hold.totalTrackedSeconds.toFixed(1)} tracked seconds.`,
      );
      if (hold.formBreaks > 0)
        cues.push(
          "Your hip line moved away from straight at least once. Squeeze glutes and brace so the hips stay in line with shoulders and ankles.",
        );
      cues.push(
        `Longest stretch in a straight line: ${hold.longestGoodFormSeconds.toFixed(1)}s. Breathe and hold that next time.`,
      );
    }
    return cues;
  },
};

export const EXERCISE_LIBRARY: Record<string, ExerciseDefinition> = {
  squat: SQUAT_DEFINITION,
  pushup: PUSHUP_DEFINITION,
  lunge: LUNGE_DEFINITION,
  deadlift: DEADLIFT_DEFINITION,
  plank: PLANK_DEFINITION,
};
