import { createHash, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { snapMotionDuration, validateBvh } from "./motion";
import {
  composeMotionText,
  isMotionPresetId,
  type MotionSpec,
} from "./motion-prompts";

export const CACHED_MOTION_MODEL = "Cached squat demonstration";
export const MOTION_CACHE_VARIANTS = ["bodyweight", "front-squat"] as const;
export type MotionCacheVariant = (typeof MOTION_CACHE_VARIANTS)[number];

type DemoClip = {
  variant: MotionCacheVariant;
  duration: number;
  file: string;
};

const DEMOS: DemoClip[] = [
  { variant: "bodyweight", duration: 4, file: "bodyweight-4.0.bvh" },
  { variant: "front-squat", duration: 4, file: "front-squat-4.0.bvh" },
];

function readDemo(file: string) {
  const text = readFileSync(
    path.join(process.cwd(), "public/motion-demos", file),
    "utf8",
  );
  validateBvh(text);
  return text;
}

export function listCachedMotions() {
  return DEMOS.map(({ variant, duration, file }) => ({
    variant,
    duration,
    url: "/motion-demos/" + file,
  }));
}

export function readCachedMotion(
  variant: string,
  duration: number,
  options: { fallback?: boolean } = {},
) {
  const snapped = snapMotionDuration(duration);
  const exact = DEMOS.find(
    (clip) => clip.variant === variant && clip.duration === snapped,
  );
  const nearest = DEMOS.filter((clip) => clip.variant === variant).sort(
    (left, right) =>
      Math.abs(left.duration - snapped) - Math.abs(right.duration - snapped),
  )[0];
  const clip = exact ?? (options.fallback === false ? undefined : nearest);
  if (!clip) return null;
  return {
    status: "complete" as const,
    id: randomUUID(),
    bvh: readDemo(clip.file),
    model: CACHED_MOTION_MODEL,
    cached: true as const,
    variant: clip.variant,
    duration: clip.duration,
  };
}

export function motionAvailable(workerConfigured: boolean) {
  return workerConfigured || DEMOS.length > 0;
}

export function motionCacheKey(spec: MotionSpec, presetId?: string) {
  // Bundled squat demos are keyed by stable preset id. Other presets hash the
  // Kimodo text so prompt edits invalidate worker/browser caches.
  if (presetId === "bodyweight" || presetId === "front-squat") return presetId;
  const digest = createHash("sha256")
    .update(composeMotionText(spec))
    .digest("hex")
    .slice(0, 16);
  if (presetId && isMotionPresetId(presetId)) {
    return `${presetId}-${digest.slice(0, 8)}`;
  }
  return `custom-${digest}`;
}
