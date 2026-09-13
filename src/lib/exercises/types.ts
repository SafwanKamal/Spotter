import type { Point } from "../analysis";

// Every exercise this engine supports is measured from the same 33 MediaPipe
// BlazePose landmarks the app already loads for squats — this file adds no
// new pose model and no new landmark source. It only adds per-exercise
// geometry (which landmarks matter, and what angle between them is
// meaningful) and two reusable detectors: one for exercises that repeat in
// cycles (reps), and one for exercises held in a static position (holds).

export type ExerciseId =
  | "squat"
  | "pushup"
  | "lunge"
  | "deadlift"
  | "plank";

export type ExerciseMode = "cyclic" | "hold";

// A single generic joint measurement for one video frame. "primary" is the
// angle whose rise and fall defines a repetition (or, for a hold, defines
// whether form is currently acceptable). "secondary" is a supporting metric
// used for coaching cues and quality flags, never for counting.
export type GenericMeasurement = {
  time: number;
  primary: number | null;
  secondary: number | null;
};

export type DetectionReason =
  | "tracking_gap"
  | "small_movement"
  | "too_brief"
  | "incomplete";

export type DetectionNote = {
  start: number;
  end: number;
  reason: DetectionReason;
};

export type GenericRep = {
  start: number;
  bottom: number;
  end: number;
  minPrimary: number;
  maxSecondary: number;
  descent: number;
  ascent: number;
};

export type HoldSegment = {
  start: number;
  end: number;
  formOk: boolean;
};

export type HoldResult = {
  segments: HoldSegment[];
  totalTrackedSeconds: number;
  totalGoodFormSeconds: number;
  longestGoodFormSeconds: number;
  formBreaks: number;
};

// Pixel-space points for exactly the landmarks one exercise definition
// declared it needs, keyed by role rather than by raw MediaPipe index so
// each exercise's measure() reads like anatomy, not array offsets.
export type RolePoints = Partial<
  Record<"shoulder" | "elbow" | "wrist" | "hip" | "knee" | "ankle", Point>
>;

export type CyclicTuning = {
  // Degrees below the person's own resting/extended baseline before a
  // repetition is considered "entered" (bottom phase) and "exited" (back to
  // resting). Mirrors the relative-excursion approach proven on squats:
  // thresholds are relative to each person's own tracked range, not a fixed
  // universal angle, so camera angle and body proportions matter less.
  enterDelta: number;
  exitDelta: number;
  // Minimum drop from baseline (degrees) for a cycle to count as a real
  // repetition rather than tracking jitter.
  minDepthDelta: number;
  // Minimum total duration (seconds) for a cycle to count.
  minDurationSeconds: number;
};

export type ExerciseDefinition = {
  id: ExerciseId;
  label: string;
  mode: ExerciseMode;
  // MediaPipe landmark indices needed for this exercise, one full set per
  // body side. The engine already knows how to pick whichever side has
  // better visibility across the clip (same approach as the original squat
  // analyzer), so each exercise only has to say which roles it needs.
  landmarks: {
    left: Partial<Record<"shoulder" | "elbow" | "wrist" | "hip" | "knee" | "ankle", number>>;
    right: Partial<Record<"shoulder" | "elbow" | "wrist" | "hip" | "knee" | "ankle", number>>;
  };
  // Computes this frame's primary/secondary angles from pixel-space points
  // for exactly the roles this exercise declared above.
  measure(points: RolePoints): { primary: number | null; secondary: number | null };
  // Only used when mode === "cyclic".
  cyclicTuning?: Partial<CyclicTuning>;
  // Degrees of allowed deviation from a straight line before a hold's form
  // is flagged as broken. Only used when mode === "hold".
  holdFormToleranceDeg?: number;
  score(
    outcome: { reps: GenericRep[] } | { hold: HoldResult },
    coverage: number,
  ): number | null;
  cues(
    outcome: { reps: GenericRep[]; notes: DetectionNote[] } | { hold: HoldResult },
    coverage: number,
  ): string[];
};

export type ExerciseAnalysis = {
  version: 1;
  exercise: ExerciseId;
  mode: ExerciseMode;
  source: "video" | "synthetic" | "live";
  duration: number;
  side: "left" | "right";
  coverage: number;
  measurements: GenericMeasurement[];
  reps?: GenericRep[];
  hold?: HoldResult;
  notes: DetectionNote[];
  baseline: number | null;
  movementScore: number | null;
  cues: string[];
};
