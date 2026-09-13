import assert from "node:assert/strict";
import { test } from "node:test";
import { demoFrames } from "../src/lib/analysis";
import { demoFramesForPushup } from "../src/lib/exercises/demo-frames";
import { analyzeExercise } from "../src/lib/exercises/engine";
import {
  briefToJointCoachInput,
  buildJointCoachPrompt,
  fallbackJointCoach,
  jointCoachSpeechText,
} from "../src/lib/joint-coach";
import { summarizeKinematics } from "../src/lib/kinematics";
import { formPlaybook } from "../src/lib/form-playbooks";
import { SPEAK_TEXT_MAX } from "../src/lib/coach-voice";

test("squat demo frames put hips and knees among the biggest movers", () => {
  const frames = demoFrames();
  const analysis = analyzeExercise("squat", frames, 1000, 1000, 12, "synthetic");
  const brief = summarizeKinematics({
    exercise: "squat",
    frames,
    width: 1000,
    height: 1000,
    side: analysis.side,
    duration: analysis.duration,
    reps: analysis.reps,
  });
  assert.ok(brief.joints.length >= 3);
  const labels = brief.movers.join(" ");
  assert.match(labels, /hip|knee/);
  assert.ok(brief.joints.every((joint) => joint.travel >= 0));
  assert.ok(brief.joints.some((joint) => joint.peakSpeed > 0));
});

test("push-up kinematics keep wrists quieter than elbows", () => {
  const frames = demoFramesForPushup();
  const analysis = analyzeExercise(
    "pushup",
    frames,
    1000,
    1000,
    frames[frames.length - 1].time + 1 / 15,
    "synthetic",
  );
  const brief = summarizeKinematics({
    exercise: "pushup",
    frames,
    width: 1000,
    height: 1000,
    side: analysis.side,
    duration: analysis.duration,
    reps: analysis.reps,
  });
  assert.match(brief.movers.join(" "), /shoulder/);
  const shoulder = brief.joints.find((joint) => joint.joint.includes("Shoulder"));
  const wrist = brief.joints.find((joint) => joint.joint.includes("Wrist"));
  assert.ok(shoulder);
  assert.ok(shoulder.travel > 0);
  if (wrist) assert.ok(shoulder.travel >= wrist.travel);
});

test("form playbooks and the small-model prompt name joints that lose shape", () => {
  const squat = formPlaybook("squat");
  assert.match(squat, /valgus|inward/i);
  assert.match(squat, /heels/i);
  assert.match(formPlaybook("deadlift"), /hips shoot|hinge/i);
  const frames = demoFrames();
  const analysis = analyzeExercise("squat", frames, 1000, 1000, 12, "synthetic");
  const brief = summarizeKinematics({
    exercise: "squat",
    frames,
    width: 1000,
    height: 1000,
    side: analysis.side,
    duration: analysis.duration,
    reps: analysis.reps,
  });
  const prompt = buildJointCoachPrompt(briefToJointCoachInput(brief));
  assert.match(prompt, /Joints that traveled the most/);
  assert.match(prompt, /squat/);
  assert.ok(!/data:image/.test(prompt));
  const spoken = jointCoachSpeechText(fallbackJointCoach(brief));
  assert.ok(spoken.length >= 60);
  assert.ok(spoken.length <= SPEAK_TEXT_MAX);
});
