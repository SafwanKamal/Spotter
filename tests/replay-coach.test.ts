import assert from "node:assert/strict";
import { test } from "node:test";
import { SPEAK_TEXT_MAX } from "../src/lib/coach-voice";
import { jointCoachSchema, jointCoachSpeechText } from "../src/lib/joint-coach";
import {
  bonesForJoint,
  demonstrationCoachNotes,
  highlightSets,
} from "../src/lib/replay-coach";

test("joint labels map onto Kimodo BVH bones", () => {
  assert.ok(bonesForJoint("left hip").includes("LeftUpLeg"));
  assert.ok(bonesForJoint("hips").includes("Hips"));
  assert.ok(bonesForJoint("knees").includes("LeftLeg"));
  assert.ok(bonesForJoint("knees").includes("Knee"));
  assert.ok(bonesForJoint("elbows").includes("LeftForeArm"));
  assert.ok(bonesForJoint("torso").includes("Spine"));
});

test("front-squat demonstration notes highlight hips and elbows", () => {
  const notes = demonstrationCoachNotes("front-squat");
  assert.equal(jointCoachSchema.safeParse(notes).success, true);
  const { movers, attention } = highlightSets(notes);
  assert.ok(movers.has("Hips"));
  assert.ok(attention.has("LeftForeArm"));
  assert.match(notes.summary, /hip/i);
  const spoken = jointCoachSpeechText(notes);
  assert.ok(spoken.length >= 24);
  assert.ok(spoken.length <= SPEAK_TEXT_MAX);
});

test("bodyweight demonstration notes watch the torso", () => {
  const notes = demonstrationCoachNotes("bodyweight");
  assert.equal(jointCoachSchema.safeParse(notes).success, true);
  assert.ok(highlightSets(notes).attention.has("Spine"));
});
