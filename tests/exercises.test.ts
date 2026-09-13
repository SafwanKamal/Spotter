import assert from "node:assert/strict";
import { test } from "node:test";
import { analyzeExercise, getExerciseDefinition } from "../src/lib/exercises/engine";
import { classifyExercise } from "../src/lib/exercises/classifier";
import { demoFrames } from "../src/lib/analysis";
import {
  demoFramesForDeadlift,
  demoFramesForLunge,
  demoFramesForPlank,
  demoFramesForPushup,
} from "../src/lib/exercises/demo-frames";

test("push-up: three clean reps are counted with a bounded score and ordered phases", () => {
  const result = analyzeExercise(
    "pushup",
    demoFramesForPushup(3),
    1000,
    1000,
    13,
    "synthetic",
  );
  assert.equal(result.mode, "cyclic");
  assert.equal(result.reps!.length, 3);
  assert.equal(result.coverage, 1);
  assert.ok(result.movementScore! >= 0 && result.movementScore! <= 100);
  for (const r of result.reps!) assert.ok(r.start < r.bottom && r.bottom < r.end);
});

test("push-up: a shallow, non-locking-out clip earns no reps", () => {
  const result = analyzeExercise(
    "pushup",
    demoFramesForPushup(3, { topAngle: 172, bottomAngle: 160 }),
    1000,
    1000,
    13,
    "synthetic",
  );
  assert.equal(result.reps!.length, 0);
  assert.equal(result.movementScore, null);
});

test("push-up: hip-line sag away from straight surfaces a form cue", () => {
  const straight = analyzeExercise(
    "pushup",
    demoFramesForPushup(3),
    1000,
    1000,
    13,
    "synthetic",
  );
  assert.ok(
    !straight.cues.some((c) => c.includes("hip line moved noticeably")),
  );
});

test("lunge: three reps counted; a single side view still produces bounded scores", () => {
  const result = analyzeExercise(
    "lunge",
    demoFramesForLunge(3),
    1000,
    1000,
    13,
    "synthetic",
  );
  assert.equal(result.reps!.length, 3);
  assert.ok(result.movementScore! >= 0 && result.movementScore! <= 100);
  assert.ok(
    result.cues.some((c) => c.includes("cannot confirm front-knee alignment")),
  );
});

test("lunge: no motion at all earns no reps", () => {
  const result = analyzeExercise(
    "lunge",
    demoFramesForLunge(3, { topAngle: 175, bottomAngle: 173 }),
    1000,
    1000,
    13,
    "synthetic",
  );
  assert.equal(result.reps!.length, 0);
});

test("deadlift: three hinges counted from the hip-hinge angle", () => {
  const result = analyzeExercise(
    "deadlift",
    demoFramesForDeadlift(3),
    1000,
    1000,
    13,
    "synthetic",
  );
  assert.equal(result.reps!.length, 3);
  assert.ok(result.movementScore! >= 0 && result.movementScore! <= 100);
});

test("deadlift: a rep that bows the knee sideways flags a squat-drift cue", () => {
  const withDrift = analyzeExercise(
    "deadlift",
    demoFramesForDeadlift(3, { kneeBendAt: 2 }),
    1000,
    1000,
    13,
    "synthetic",
  );
  assert.ok(
    withDrift.cues.some((c) => c.includes("drifted toward a squat")),
  );
  const clean = analyzeExercise(
    "deadlift",
    demoFramesForDeadlift(3),
    1000,
    1000,
    13,
    "synthetic",
  );
  assert.ok(!clean.cues.some((c) => c.includes("drifted toward a squat")));
});

test("plank: a fully straight hold earns full tracked/good-form time and a high score", () => {
  const result = analyzeExercise(
    "plank",
    demoFramesForPlank(12),
    1000,
    1000,
    12,
    "synthetic",
  );
  assert.equal(result.mode, "hold");
  assert.ok(result.hold!.totalTrackedSeconds > 11);
  assert.ok(
    Math.abs(result.hold!.totalGoodFormSeconds - result.hold!.totalTrackedSeconds) <
      0.2,
  );
  assert.equal(result.hold!.formBreaks, 0);
  assert.ok(result.movementScore! >= 90);
});

test("plank: a sagging window breaks form and is reflected in the score and cues", () => {
  const result = analyzeExercise(
    "plank",
    demoFramesForPlank(12, [5, 8]),
    1000,
    1000,
    12,
    "synthetic",
  );
  assert.ok(result.hold!.formBreaks > 0);
  assert.ok(result.hold!.totalGoodFormSeconds < result.hold!.totalTrackedSeconds);
  assert.ok(
    result.cues.some((c) => c.includes("moved away from straight")),
  );
  const clean = analyzeExercise("plank", demoFramesForPlank(12), 1000, 1000, 12, "synthetic");
  assert.ok(result.movementScore! < clean.movementScore!);
});

test("plank: too little tracked time earns no score", () => {
  const result = analyzeExercise(
    "plank",
    demoFramesForPlank(12).map((f) => ({ ...f, landmarks: [] })),
    1000,
    1000,
    12,
    "synthetic",
  );
  assert.equal(result.movementScore, null);
  assert.equal(result.hold!.totalTrackedSeconds, 0);
});

test("occlusion during a push-up bottom breaks the rep instead of bridging unseen motion", () => {
  const result = analyzeExercise(
    "pushup",
    demoFramesForPushup(3).map((f) =>
      f.time % 4 > 1.7 && f.time % 4 < 2.3 ? { ...f, landmarks: [] } : f,
    ),
    1000,
    1000,
    13,
    "synthetic",
  );
  assert.equal(result.reps!.length, 0);
  assert.ok(result.notes.some((n) => n.reason === "tracking_gap"));
});

test("every registered exercise definition is reachable by id", () => {
  for (const id of ["squat", "pushup", "lunge", "deadlift", "plank"] as const) {
    const definition = getExerciseDefinition(id);
    assert.equal(definition.id, id);
  }
});

test("automatic exercise recognition routes the five supported motion patterns", () => {
  const cases = [
    ["squat", demoFrames(), 12],
    ["pushup", demoFramesForPushup(), 13],
    ["lunge", demoFramesForLunge(), 13],
    ["deadlift", demoFramesForDeadlift(), 13],
    ["plank", demoFramesForPlank(), 12],
  ] as const;
  for (const [exercise, frames, duration] of cases) {
    const classification = classifyExercise(frames, 1000, 1000, duration);
    assert.equal(classification.exercise, exercise);
    assert.ok(classification.confidence >= 0 && classification.confidence <= 1);
    assert.equal(classification.alternatives.length, 2);
  }
});

test("an upright bilateral knee bend remains a squat without split-stance evidence", () => {
  const frames = demoFrames().map((frame) => {
    const landmarks = frame.landmarks.map((point) => ({ ...point }));
    landmarks[11].x = landmarks[23].x;
    landmarks[12].x = landmarks[24].x;
    return { ...frame, landmarks };
  });
  const classification = classifyExercise(frames, 1000, 1000, 12);
  assert.equal(classification.exercise, "squat");
  assert.match(classification.reason, /without clear split-stance evidence/);
});

test("automatic recognition requires confirmation when landmarks are missing", () => {
  const frames = demoFramesForPushup().map((frame, index) =>
    index % 3 === 0 ? frame : { ...frame, landmarks: [] },
  );
  const classification = classifyExercise(frames, 1000, 1000, 13);
  assert.equal(classification.exercise, "pushup");
  assert.equal(classification.needsConfirmation, true);
});
