import assert from "node:assert/strict";
import { test } from "node:test";
import { angle, analyzeSquats, demoFrames } from "../src/lib/analysis";
import {
  buildCoachingPrompt,
  coachingSchema,
  coachingInput,
  selectCoachingKeyframes,
} from "../src/lib/coaching";
import { detectReps } from "../src/lib/rep-detector";
import trace from "./fixtures/front-squat-trace.json";

test("the real front-squat trace counts all five reps independent of depth/tempo", () => {
  const result = detectReps(
    trace.samples.map(([time, knee, lean]) => ({ time, knee, lean })),
  );
  assert.equal(result.reps.length, 5);
  const expectedBottoms = [1.4, 4.2, 6.8667, 9.6667, 12.6667];
  result.reps.forEach((r, i) =>
    assert.ok(Math.abs(r.bottom - expectedBottoms[i]) < 0.1),
  );
  assert.ok(result.reps.some((r) => r.minKnee > 125));
  assert.ok(result.reps.some((r) => r.ascent < 0.25));
});
test("small tracking jitter and isolated low samples do not earn a rep", () => {
  const small = Array.from({ length: 100 }, (_, i) => ({
    time: i / 15,
    knee: 176 + Math.sin(i) * 4,
    lean: 0,
  }));
  assert.equal(detectReps(small).reps.length, 0);
  small[30].knee = 100;
  assert.equal(detectReps(small).reps.length, 0);
});

test("angles handle right angles and degenerate joints", () => {
  assert.equal(angle({ x: 1, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 1 }), 90);
  assert.equal(angle({ x: 0, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 1 }), null);
});
test("three complete cycles produce ordered phase timestamps and a bounded score", () => {
  const result = analyzeSquats(demoFrames(), 1000, 1000, 12, "synthetic");
  assert.equal(result.reps.length, 3);
  assert.equal(result.source, "synthetic");
  assert.equal(result.coverage, 1);
  assert.ok(result.movementScore! >= 0 && result.movementScore! <= 100);
  for (const r of result.reps)
    assert.ok(r.start < r.bottom && r.bottom < r.end);
});
test("no person and a stationary person do not earn scores or repetitions", () => {
  for (const frames of [
    demoFrames().map((f) => ({ ...f, landmarks: [] })),
    demoFrames().map((f) => ({ ...f, landmarks: demoFrames()[0].landmarks })),
  ]) {
    const result = analyzeSquats(frames, 1000, 1000, 12);
    assert.equal(result.reps.length, 0);
    assert.equal(result.movementScore, null);
  }
});
test("a clip starting at the bottom never counts its partial first rep", () => {
  const result = analyzeSquats(
    demoFrames().filter((f) => f.time >= 2),
    1000,
    1000,
    12,
  );
  assert.equal(result.reps.length, 2);
});
test("occlusion at the bottom breaks a repetition instead of bridging unseen motion", () => {
  const result = analyzeSquats(
    demoFrames().map((f) =>
      f.time % 4 > 1.7 && f.time % 4 < 2.3 ? { ...f, landmarks: [] } : f,
    ),
    1000,
    1000,
    12,
  );
  assert.equal(result.reps.length, 0);
});
test("timestamp gaps cannot be bridged into a rep", () => {
  const result = analyzeSquats(
    demoFrames().filter((f) => !(f.time % 4 > 1.7 && f.time % 4 < 2.3)),
    1000,
    1000,
    12,
  );
  assert.equal(result.reps.length, 0);
});
test("pixel scaling preserves angles across portrait and landscape frames", () => {
  const original = analyzeSquats(demoFrames(), 1000, 1000, 12);
  const stretched = demoFrames().map((f) => ({
    ...f,
    landmarks: f.landmarks.map((p) => ({ ...p, x: p.x / 2 })),
  }));
  const wide = analyzeSquats(stretched, 2000, 1000, 12);
  assert.deepEqual(wide.reps, original.reps);
});
test("coaching contracts reject missing evidence and malformed output", () => {
  assert.equal(
    coachingInput.safeParse({
      duration: 12,
      coverage: 1,
      reps: [],
      keyframes: [],
    }).success,
    false,
  );
  assert.equal(
    coachingSchema.safeParse({
      exercise: "squat",
      confidence: "certain",
      summary: "Perfect",
    }).success,
    false,
  );
});

test("Gemini keyframes include the bottom of every rep in a five-rep set", () => {
  const reps = Array.from({ length: 5 }, (_, index) => ({
    start: index * 3,
    bottom: index * 3 + 1,
    end: index * 3 + 2,
    minKnee: 90 + index,
    maxLean: 20 + index,
    descent: 1,
    ascent: 1,
  }));
  const keyframes = reps.flatMap((rep, index) => [
    { time: rep.start, label: `Rep ${index + 1} · start`, image: "start" },
    { time: rep.bottom, label: `Rep ${index + 1} · bottom`, image: "bottom" },
    { time: rep.end, label: `Rep ${index + 1} · return`, image: "return" },
  ]);
  const selected = selectCoachingKeyframes(keyframes, reps);
  assert.equal(selected.length, 6);
  for (let rep = 1; rep <= 5; rep += 1)
    assert.ok(selected.some((frame) => frame.label === `Rep ${rep} · bottom`));

  const prompt = buildCoachingPrompt(
    coachingInput.parse({
      duration: 15,
      coverage: 1,
      claimedExercise: "squat",
      reps,
      keyframes: selected.map((frame) => ({
        ...frame,
        image: "data:image/jpeg;base64,AA==",
      })),
    }),
  );
  assert.match(prompt, /this squat set/);
  assert.match(prompt, /bottom frame for every repetition/);
  assert.match(prompt, /"rep":5/);
  assert.match(prompt, /numerical form score/);
  assert.match(prompt, /Your job is insight/);
  assert.match(prompt, /Compare start, deepest position, and return/);
  assert.match(prompt, /knees tracking over the feet/);
  assert.match(prompt, /second person/);
  assert.match(prompt, /No empty praise such as 'great job'/);

  const pushupPrompt = buildCoachingPrompt(
    coachingInput.parse({
      duration: 15,
      coverage: 1,
      claimedExercise: "pushup",
      reps,
      keyframes: selected.map((frame) => ({
        ...frame,
        image: "data:image/jpeg;base64,AA==",
      })),
    }),
  );
  assert.match(pushupPrompt, /this push-up set/);
  assert.match(pushupPrompt, /elbow flare/);
});
