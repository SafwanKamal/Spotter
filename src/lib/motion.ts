import { z } from "zod";
import type { Rep } from "./analysis";
import {
  customMotionInput,
  MOTION_PRESET_IDS,
  motionSpecSchema,
} from "./motion-prompts";

export const motionRequest = z
  .object({
    duration: z.number().min(2).max(8),
    variant: z.enum(MOTION_PRESET_IDS).optional(),
    custom: customMotionInput.optional(),
    spec: motionSpecSchema.optional(),
  })
  .superRefine((value, ctx) => {
    const sources = [value.variant, value.custom, value.spec].filter(Boolean);
    if (sources.length !== 1) {
      ctx.addIssue({
        code: "custom",
        message: "Provide exactly one of variant, custom, or spec.",
      });
    }
  });
export const motionResponse = z.discriminatedUnion("status", [
  z.object({ status: z.literal("queued"), id: z.string().uuid() }),
  z.object({ status: z.literal("running"), id: z.string().uuid() }),
  z.object({
    status: z.literal("failed"),
    id: z.string().uuid(),
    error: z.string().max(500),
  }),
  z.object({
    status: z.literal("complete"),
    id: z.string().uuid(),
    bvh: z.string().max(2_000_000),
    model: z.string().max(100),
    cached: z.boolean().optional(),
  }),
]);

export function snapMotionDuration(duration: number) {
  if (!Number.isFinite(duration)) return 4;
  return Math.min(8, Math.max(2, Math.round(duration * 2) / 2));
}

export function canonicalMotionDuration(
  reps: Array<Pick<Rep, "start" | "end">>,
): number {
  if (!reps.length) return 4;
  const durations = reps
    .map((rep) => rep.end - rep.start)
    .filter((duration) => Number.isFinite(duration) && duration > 0)
    .sort((left, right) => left - right);
  if (!durations.length) return 4;
  const middle = Math.floor(durations.length / 2);
  const median =
    durations.length % 2
      ? durations[middle]
      : (durations[middle - 1] + durations[middle]) / 2;
  // A small buffer gives a single-prompt generation room to begin upright and
  // settle after standing. Snap to 0.5s so cached clips reuse cleanly.
  return snapMotionDuration(median + 0.5);
}

// Validate the BVH grammar and numeric bounds before passing it to Three's permissive parser.
export function validateBvh(text: string) {
  if (text.length > 2_000_000)
    throw new Error("Choose a BVH file smaller than 2 MB.");
  const tokens = text.trim().split(/\s+/);
  let i = 0,
    channels = 0,
    joints = 0;
  const take = (expected: string) => {
    if (tokens[i++] !== expected) throw new Error("Invalid BVH structure.");
  };
  const number = () => {
    const n = Number(tokens[i++]);
    if (!Number.isFinite(n) || Math.abs(n) > 1e7)
      throw new Error("Invalid BVH values.");
    return n;
  };
  function bone(end = false) {
    if (++joints > 128) throw new Error("This skeleton has too many joints.");
    if (!end && !/^[\w.:-]+$/.test(tokens[i++] ?? ""))
      throw new Error("Invalid joint name.");
    take("{");
    take("OFFSET");
    number();
    number();
    number();
    if (!end) {
      take("CHANNELS");
      const count = number();
      if (!Number.isInteger(count) || count < 1 || count > 6)
        throw new Error("Invalid channels.");
      channels += count;
      for (let n = 0; n < count; n++)
        if (!/^[XYZ](position|rotation)$/.test(tokens[i++] ?? ""))
          throw new Error("Invalid channel.");
      while (tokens[i] !== "}") {
        if (tokens[i] === "JOINT") {
          i++;
          bone();
        } else if (tokens[i] === "End") {
          i++;
          take("Site");
          bone(true);
        } else throw new Error("Invalid skeleton hierarchy.");
      }
    }
    take("}");
  }
  take("HIERARCHY");
  take("ROOT");
  bone();
  take("MOTION");
  take("Frames:");
  const frames = number();
  take("Frame");
  take("Time:");
  const interval = number();
  if (
    !Number.isInteger(frames) ||
    frames < 2 ||
    frames > 1800 ||
    interval < 1 / 240 ||
    interval > 1 ||
    frames * interval > 60 ||
    frames * channels > 350000
  )
    throw new Error("Unsupported animation length.");
  if (tokens.length - i !== frames * channels)
    throw new Error("Incomplete animation frames.");
  while (i < tokens.length) number();
  return { duration: (frames - 1) * interval, frames, joints };
}
