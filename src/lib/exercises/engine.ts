import type { Point, PoseFrame } from "../analysis";
import { detectCyclicReps, detectHold } from "./detectors";
import { EXERCISE_LIBRARY } from "./library";
import type {
  ExerciseAnalysis,
  ExerciseDefinition,
  ExerciseId,
  GenericMeasurement,
  RolePoints,
} from "./types";

// Identical visibility gate to the one the squat analyzer uses internally,
// duplicated here (rather than imported) so this new, unwired engine can
// never change behavior for the existing squat pipeline.
function usable(p: Point | undefined) {
  return (
    p &&
    Number.isFinite(p.x) &&
    Number.isFinite(p.y) &&
    (p.visibility ?? 0) >= 0.7 &&
    p.x >= 0 &&
    p.x <= 1 &&
    p.y >= 0 &&
    p.y <= 1
  );
}

function neededIndices(
  landmarks: ExerciseDefinition["landmarks"]["left"],
): number[] {
  return Object.values(landmarks).filter((v): v is number => v !== undefined);
}

export function getExerciseDefinition(id: ExerciseId): ExerciseDefinition {
  const definition = EXERCISE_LIBRARY[id];
  if (!definition) throw new Error(`Unknown exercise: ${id}`);
  return definition;
}

export function analyzeExercise(
  exerciseId: ExerciseId,
  frames: PoseFrame[],
  width: number,
  height: number,
  duration: number,
  source: "video" | "synthetic" | "live" = "video",
): ExerciseAnalysis {
  if (!(width > 0 && height > 0 && duration > 0))
    throw new Error("Invalid video dimensions or duration.");
  const definition = getExerciseDefinition(exerciseId);
  const ordered = [...frames]
    .sort((a, b) => a.time - b.time)
    .filter(
      (f, i, all) =>
        Number.isFinite(f.time) &&
        f.time >= 0 &&
        f.time <= duration &&
        (i === 0 || f.time > all[i - 1].time),
    );

  const sides = definition.landmarks;
  const indicesFor = (side: "left" | "right") => neededIndices(sides[side]);
  const count = (side: "left" | "right") =>
    ordered.filter((f) =>
      indicesFor(side).every((i) => usable(f.landmarks[i])),
    ).length;
  const side = count("left") >= count("right") ? "left" : "right";
  const roleMap = sides[side];
  const roleIndices = Object.entries(roleMap) as [
    keyof typeof roleMap,
    number | undefined,
  ][];

  let priorPrimary: number | null = null,
    lastTime = -Infinity;
  const measurements: GenericMeasurement[] = ordered.map((f) => {
    const allUsable = roleIndices.every(
      ([, index]) => index === undefined || usable(f.landmarks[index]),
    );
    if (!allUsable) {
      priorPrimary = null;
      return { time: f.time, primary: null, secondary: null };
    }
    const points: RolePoints = {};
    for (const [role, index] of roleIndices) {
      if (index === undefined) continue;
      const p = f.landmarks[index];
      points[role] = { x: p.x * width, y: p.y * height };
    }
    const { primary, secondary } = definition.measure(points);
    if (primary === null) {
      priorPrimary = null;
      return { time: f.time, primary: null, secondary };
    }
    const smoothed =
      priorPrimary === null || f.time - lastTime > 0.25
        ? primary
        : priorPrimary * 0.45 + primary * 0.55;
    priorPrimary = smoothed;
    lastTime = f.time;
    return { time: f.time, primary: smoothed, secondary };
  });

  const coverage = measurements.length
    ? measurements.filter((m) => m.primary !== null).length /
      measurements.length
    : 0;

  if (definition.mode === "hold") {
    const hold = detectHold(
      measurements,
      180,
      definition.holdFormToleranceDeg ?? 15,
    );
    const movementScore = definition.score({ hold }, coverage);
    const cues = definition.cues({ hold }, coverage);
    return {
      version: 1,
      exercise: exerciseId,
      mode: "hold",
      source,
      duration,
      side,
      coverage,
      measurements,
      hold,
      notes: [],
      baseline: null,
      movementScore,
      cues,
    };
  }

  const { reps, baseline, notes } = detectCyclicReps(
    measurements,
    definition.cyclicTuning,
  );
  const movementScore = definition.score({ reps }, coverage);
  const cues = definition.cues({ reps, notes }, coverage);
  return {
    version: 1,
    exercise: exerciseId,
    mode: "cyclic",
    source,
    duration,
    side,
    coverage,
    measurements,
    reps,
    notes,
    baseline,
    movementScore,
    cues,
  };
}

export { EXERCISE_LIBRARY } from "./library";
export * from "./types";
