// Barrel export for the generalized exercise-tracking engine. Nothing here
// is wired into the app yet — this module is purely additive and does not
// change the existing squat pipeline (src/lib/analysis.ts, src/lib/rep-detector.ts)
// or any Gemini/MediaPipe integration.
export * from "./types";
export { detectCyclicReps, detectHold } from "./detectors";
export {
  EXERCISE_LIBRARY,
  SQUAT_DEFINITION,
  PUSHUP_DEFINITION,
  LUNGE_DEFINITION,
  DEADLIFT_DEFINITION,
  PLANK_DEFINITION,
} from "./library";
export { analyzeExercise, getExerciseDefinition } from "./engine";
export {
  demoFramesForPushup,
  demoFramesForLunge,
  demoFramesForDeadlift,
  demoFramesForPlank,
} from "./demo-frames";
