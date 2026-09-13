// A local, transparent calorie estimate — deliberately NOT sent through
// Gemini. Gemini's coaching stays qualitative (form observations, never a
// numerical score or a health claim); a calorie count is a numeric claim,
// so it is computed the same deterministic way movementScore already is
// (see src/lib/analysis.ts), from measured duration and rep count only.
//
// The formula is the standard MET-based estimate used across fitness
// trackers: kcal/min = (MET x 3.5 x bodyWeightKg) / 200. MET values below
// are typical compendium-of-physical-activity figures for vigorous
// bodyweight/resistance training; they are population averages, not a
// measurement of this specific person's effort, and are only ever shown as
// an estimate.

export type CalorieExercise = "squat" | "pushup" | "lunge" | "deadlift" | "plank";

const MET_BY_EXERCISE: Record<CalorieExercise, number> = {
  squat: 5.0,
  pushup: 8.0,
  lunge: 4.5,
  deadlift: 6.0,
  plank: 3.8,
};

// A commonly used reference adult body weight, used only when the person
// has not entered their own. 70 kg (~154 lb).
export const DEFAULT_BODY_WEIGHT_KG = 70;

export type CalorieEstimateInput = {
  exercise: CalorieExercise;
  durationSeconds: number;
  // Rep count only nudges a short, mostly-resting clip toward a more
  // conservative estimate; it never multiplies the total, since duration
  // already captures active time for a single continuous clip.
  repCount: number;
  bodyWeightKg?: number;
};

export type CalorieEstimate = {
  kcal: number;
  met: number;
  bodyWeightKg: number;
  assumedBodyWeight: boolean;
};

export function estimateCaloriesBurned({
  exercise,
  durationSeconds,
  repCount,
  bodyWeightKg,
}: CalorieEstimateInput): CalorieEstimate | null {
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) return null;
  if (!Number.isFinite(repCount) || repCount < 0) return null;
  const weight =
    bodyWeightKg && Number.isFinite(bodyWeightKg) && bodyWeightKg > 20 && bodyWeightKg < 300
      ? bodyWeightKg
      : DEFAULT_BODY_WEIGHT_KG;
  const met = MET_BY_EXERCISE[exercise];
  // A hold (plank) with no completed reps but real tracked time still burns
  // energy; a cyclic exercise with zero completed reps is most likely a
  // clip with no real set in it, so it is credited at rest-level effort
  // instead of full exertion.
  const isHold = exercise === "plank";
  const effortMet = !isHold && repCount === 0 ? 1.3 : met;
  const minutes = durationSeconds / 60;
  const kcal = (effortMet * 3.5 * weight) / 200 * minutes;
  return {
    kcal: Math.round(kcal * 10) / 10,
    met: effortMet,
    bodyWeightKg: weight,
    assumedBodyWeight: weight === DEFAULT_BODY_WEIGHT_KG && !bodyWeightKg,
  };
}
