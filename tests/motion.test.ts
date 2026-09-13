import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import * as THREE from "three";
import { BVHLoader } from "three/addons/loaders/BVHLoader.js";
import {
  canonicalMotionDuration,
  motionRequest,
  motionResponse,
  snapMotionDuration,
  validateBvh,
} from "../src/lib/motion";
import { readCachedMotion } from "../src/lib/motion-cache";

const sample = readFileSync(
  new URL("./fixtures/simple-squat.bvh", import.meta.url),
  "utf8",
);

test("the bounded BVH parser accepts a small complete motion", () => {
  const result = validateBvh(sample);
  assert.deepEqual(result, { duration: 0.0666666, frames: 3, joints: 3 });
});

test("BVH validation rejects missing frames, unreasonable values, and large files", () => {
  assert.throws(() => validateBvh(sample.replace(/0 0 0 0 0 0 0 0 0\s*$/, "")));
  assert.throws(() => validateBvh(sample.replace("0.0333333", "0.00001")));
  assert.throws(() => validateBvh("x".repeat(2_000_001)));
});

test("motion API contracts accept presets, custom moves, and structured specs", () => {
  assert.equal(
    motionRequest.safeParse({ duration: 4, variant: "front-squat" }).success,
    true,
  );
  assert.equal(
    motionRequest.safeParse({ duration: 4, variant: "pushup" }).success,
    true,
  );
  assert.equal(
    motionRequest.safeParse({
      duration: 4,
      custom: {
        name: "kettlebell swing",
        description: "Hinge at the hips and swing the bell to chest height.",
      },
    }).success,
    true,
  );
  assert.equal(
    motionRequest.safeParse({ duration: 30, variant: "deadlift" }).success,
    false,
  );
  assert.equal(
    motionRequest.safeParse({
      duration: 4,
      variant: "front-squat",
      custom: { name: "squat", description: "too many sources together" },
    }).success,
    false,
  );
  assert.equal(
    motionResponse.safeParse({
      status: "complete",
      id: "not-a-uuid",
      bvh: sample,
      model: "Kimodo",
    }).success,
    false,
  );
});

test("canonical replay follows median rep tempo within Kimodo bounds", () => {
  assert.equal(canonicalMotionDuration([]), 4);
  assert.equal(
    canonicalMotionDuration([
      { start: 0, end: 1.5 },
      { start: 2, end: 4 },
      { start: 5, end: 8 },
    ]),
    2.5,
  );
  assert.equal(canonicalMotionDuration([{ start: 0, end: 0.2 }]), 2);
  assert.equal(canonicalMotionDuration([{ start: 0, end: 20 }]), 8);
  assert.equal(snapMotionDuration(3.47), 3.5);
  assert.equal(snapMotionDuration(2.25), 2.5);
});

test("bundled squat demonstrations are valid cached BVH clips", () => {
  const front = readCachedMotion("front-squat", 4, { fallback: false });
  const bodyweight = readCachedMotion("bodyweight", 4, { fallback: false });
  const nearest = readCachedMotion("front-squat", 2.5, { fallback: false });
  assert.equal(nearest, null);
  assert.ok(front);
  assert.ok(bodyweight);
  assert.equal(front.cached, true);
  assert.equal(validateBvh(front.bvh).frames, 121);
  assert.ok(Math.abs(validateBvh(front.bvh).duration - 4) < 0.001);
  assert.ok(Math.abs(validateBvh(bodyweight.bvh).duration - 4) < 0.001);
  assert.equal(readCachedMotion("front-squat", 2.5)?.duration, 4);
});

function poseAt(bvh: string, time: number) {
  const animation = new BVHLoader().parse(bvh);
  const root = animation.skeleton.bones[0];
  const mixer = new THREE.AnimationMixer(root);
  mixer.clipAction(animation.clip).play();
  mixer.setTime(time);
  root.updateMatrixWorld(true);
  const at = (name: string) => {
    const bone = animation.skeleton.bones.find((item) => item.name === name);
    assert.ok(bone, name);
    return bone.getWorldPosition(new THREE.Vector3());
  };
  return {
    hips: at("Hips"),
    knee: at("LeftLeg"),
    ankle: at("LeftFoot"),
    shoulder: at("LeftArm"),
    elbow: at("LeftForeArm"),
    hand: at("LeftHand"),
    rightHand: at("RightHand"),
  };
}

test("bundled squat clips drop the hips and keep the arms out of a T-pose", () => {
  for (const variant of ["bodyweight", "front-squat"] as const) {
    const clip = readCachedMotion(variant, 4, { fallback: false });
    assert.ok(clip);
    const stand = poseAt(clip.bvh, 0);
    const bottom = poseAt(clip.bvh, 2);
    assert.ok(
      stand.hips.y - bottom.hips.y > 25,
      `${variant} should drop the hips into a squat`,
    );
    assert.ok(
      bottom.knee.z - bottom.hips.z > 12,
      `${variant} knees should travel in front of the hips`,
    );
    assert.ok(
      bottom.knee.y > bottom.ankle.y + 18,
      `${variant} knees should stay above the ankles`,
    );
    assert.ok(
      Math.abs(stand.hand.x - stand.rightHand.x) < 90,
      `${variant} arms should not be locked in a T-pose`,
    );
    if (variant === "bodyweight") {
      assert.ok(
        stand.hand.z > stand.hips.z + 30,
        "bodyweight hands should reach forward of the torso",
      );
    }
    if (variant === "front-squat") {
      assert.ok(
        Math.abs(stand.hand.y - stand.shoulder.y) < 20,
        "front-squat hands should sit near the shoulders",
      );
      assert.ok(
        stand.elbow.z > stand.hand.z + 12,
        "front-squat elbows should stay in front of the hands",
      );
    }
  }
});
