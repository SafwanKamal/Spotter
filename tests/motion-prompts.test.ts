import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildKimodoMeta,
  composeMotionText,
  fallbackMotionSpec,
  listMotionPresets,
  MOTION_PRESET_IDS,
  presetSpec,
} from "../src/lib/motion-prompts";
import { motionCacheKey } from "../src/lib/motion-cache";

test("every preset builds a Kimodo meta.json payload", () => {
  for (const id of MOTION_PRESET_IDS) {
    const spec = presetSpec(id);
    const meta = buildKimodoMeta(spec, 4);
    assert.equal(meta.duration, 4);
    assert.equal(meta.num_samples, 1);
    assert.equal(meta.seed, 42);
    assert.equal(meta.diffusion_steps, 30);
    assert.match(meta.text, /^A person /);
    assert.match(meta.text, /\.$/);
    assert.ok(meta.text.length >= 24 && meta.text.length <= 500);
    assert.equal(meta.spotter.name, spec.name);
  }
  assert.ok(listMotionPresets().some((item) => item.id === "pushup"));
});

test("push-up and plank prompts ask for visible arm travel", () => {
  const pushup = composeMotionText(presetSpec("pushup"));
  const plank = composeMotionText(presetSpec("plank"));
  assert.match(pushup, /chest nearly touches|nearly touches the floor/i);
  assert.match(pushup, /elbows/i);
  assert.match(plank, /forearm/i);
  assert.match(plank, /straight(?:-arm)? arms|arms straighten|straight again/i);
  assert.doesNotMatch(plank, /holding the plank|without sagging|quiet hips/i);
});

test("custom fallback specs stay Kimodo-ready and hash stably", () => {
  const spec = fallbackMotionSpec({
    name: "kettlebell swing",
    description: "Hinge hard and snap the bell to chest height.",
  });
  assert.match(composeMotionText(spec), /^A person /);
  assert.equal(motionCacheKey(spec), motionCacheKey(spec));
  assert.match(motionCacheKey(spec), /^custom-[a-f0-9]{16}$/);
  assert.equal(motionCacheKey(presetSpec("bodyweight"), "bodyweight"), "bodyweight");
  assert.match(motionCacheKey(presetSpec("pushup"), "pushup"), /^pushup-[a-f0-9]{8}$/);
});
