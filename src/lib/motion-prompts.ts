import { z } from "zod";

/** Structured move description that becomes Kimodo meta.json `text`. */
export const motionSpecSchema = z.object({
  name: z.string().trim().min(2).max(80),
  style: z.enum(["controlled", "athletic", "slow", "explosive"]),
  startingPose: z.string().trim().min(8).max(160),
  action: z.string().trim().min(12).max(280),
  endingPose: z.string().trim().min(8).max(160),
  equipment: z.string().trim().min(2).max(80).optional(),
  text: z.string().trim().min(24).max(500),
});
export type MotionSpec = z.infer<typeof motionSpecSchema>;

export const customMotionInput = z.object({
  name: z.string().trim().min(2).max(80),
  description: z.string().trim().min(8).max(500),
});
export type CustomMotionInput = z.infer<typeof customMotionInput>;

export const MOTION_PRESET_IDS = [
  "bodyweight",
  "front-squat",
  "pushup",
  "lunge",
  "deadlift",
  "plank",
  "overhead-press",
  "jumping-jack",
] as const;
export type MotionPresetId = (typeof MOTION_PRESET_IDS)[number];

type PresetDefinition = MotionSpec & {
  id: MotionPresetId;
  label: string;
};

function sentence(parts: string[]) {
  const joined = parts
    .map((part) => part.trim().replace(/\.+$/, ""))
    .filter(Boolean)
    .join(". ");
  return joined.endsWith(".") ? joined : `${joined}.`;
}

function buildText(spec: Omit<MotionSpec, "text">): string {
  const gear = spec.equipment ? ` with ${spec.equipment}` : "";
  return sentence([
    `A person performs one ${spec.style} ${spec.name}${gear}`,
    `starting ${spec.startingPose}`,
    spec.action,
    `and finishing ${spec.endingPose}`,
  ]);
}

function preset(
  id: MotionPresetId,
  label: string,
  fields: Omit<MotionSpec, "text">,
): PresetDefinition {
  return { id, label, ...fields, text: buildText(fields) };
}

export const MOTION_PRESETS: Record<MotionPresetId, PresetDefinition> = {
  bodyweight: preset("bodyweight", "Bodyweight squat", {
    name: "bodyweight squat",
    style: "controlled",
    startingPose: "upright with feet shoulder-width and arms forward for balance",
    action:
      "lowering the hips into a squat until the thighs are near parallel, then standing back up",
    endingPose: "standing tall with the same foot stance",
  }),
  "front-squat": preset("front-squat", "Front squat", {
    name: "front squat",
    style: "controlled",
    startingPose:
      "upright in a front rack with hands at the front shoulders and elbows high",
    action:
      "lowering into a squat while keeping the torso stacked, then driving back to standing",
    endingPose: "standing upright still holding the front rack",
    equipment: "a barbell held at the front shoulders",
  }),
  pushup: preset("pushup", "Push-up", {
    name: "push-up",
    style: "controlled",
    startingPose:
      "on the floor in a straight-arm plank, hands under the shoulders, body long from head to heels",
    action:
      "bending both elbows deeply until the chest nearly touches the floor, then pressing hard through the hands until both arms straighten and the torso rises back up",
    endingPose: "in the same straight-arm plank with arms locked out",
  }),
  lunge: preset("lunge", "Reverse lunge", {
    name: "reverse lunge",
    style: "controlled",
    startingPose: "standing upright with feet together and arms at the sides",
    action:
      "stepping one foot backward into a lunge until both knees bend near ninety degrees, then returning to stand",
    endingPose: "standing tall with feet together again",
  }),
  deadlift: preset("deadlift", "Conventional deadlift", {
    name: "conventional deadlift",
    style: "controlled",
    startingPose:
      "hinged at the hips with a flat back, hands gripping a barbell on the floor",
    action:
      "driving through the feet to stand tall while keeping the bar close, then hinging back down with control",
    endingPose: "standing tall holding the barbell at the thighs",
    equipment: "a barbell",
  }),
  // Pure isometric holds produce near-zero Kimodo motion. Demo this as up-downs
  // so elbows/shoulders travel while keeping a front-plank body line.
  plank: preset("plank", "Plank up-down", {
    name: "plank up-down",
    style: "controlled",
    startingPose:
      "on the floor in a straight-arm plank with hands under the shoulders and a long body line",
    action:
      "lowering onto the right forearm then the left forearm into a forearm plank, then pressing each hand back to the floor until both arms are straight again",
    endingPose: "in the straight-arm plank with arms locked out",
  }),
  "overhead-press": preset("overhead-press", "Overhead press", {
    name: "overhead press",
    style: "controlled",
    startingPose:
      "standing tall with a barbell racked at the front shoulders and a braced torso",
    action:
      "pressing the bar overhead until the arms lock out, then lowering it back to the shoulders",
    endingPose: "standing with the bar returned to the front shoulders",
    equipment: "a barbell",
  }),
  "jumping-jack": preset("jumping-jack", "Jumping jack", {
    name: "jumping jack",
    style: "athletic",
    startingPose: "standing upright with feet together and arms at the sides",
    action:
      "jumping the feet out wide while raising both arms overhead, then jumping back to the start",
    endingPose: "standing with feet together and arms down",
  }),
};

export function isMotionPresetId(value: string): value is MotionPresetId {
  return (MOTION_PRESET_IDS as readonly string[]).includes(value);
}

export function listMotionPresets() {
  return MOTION_PRESET_IDS.map((id) => ({
    id,
    label: MOTION_PRESETS[id].label,
    cached: id === "bodyweight" || id === "front-squat",
  }));
}

export function presetSpec(id: MotionPresetId): MotionSpec {
  const { name, style, startingPose, action, endingPose, equipment, text } =
    MOTION_PRESETS[id];
  return motionSpecSchema.parse({
    name,
    style,
    startingPose,
    action,
    endingPose,
    equipment,
    text,
  });
}

/** Compose Kimodo-ready text from structured fields when Gemini omits `text`. */
export function composeMotionText(spec: Omit<MotionSpec, "text"> | MotionSpec) {
  if ("text" in spec && spec.text?.trim()) {
    const text = spec.text.trim();
    return text.endsWith(".") ? text : `${text}.`;
  }
  return buildText(spec);
}

export function ensureMotionSpec(raw: unknown): MotionSpec {
  const parsed = motionSpecSchema.parse(raw);
  return { ...parsed, text: composeMotionText(parsed) };
}

/** Official Kimodo meta.json payload consumed via --input_folder. */
export function buildKimodoMeta(spec: MotionSpec, duration: number) {
  return {
    text: composeMotionText(spec),
    duration,
    num_samples: 1,
    seed: 42,
    // 30 steps keeps demo latency near the warm in-process path (~2–5s).
    // 100 remains available via KIMODO_DIFFUSION_STEPS / meta overrides.
    diffusion_steps: 30,
    cfg: {
      enabled: true,
      text_weight: 2.0,
      constraint_weight: 2.0,
    },
    // Spotter metadata — ignored by Kimodo, useful for cache/debug.
    spotter: {
      name: spec.name,
      style: spec.style,
      startingPose: spec.startingPose,
      action: spec.action,
      endingPose: spec.endingPose,
      equipment: spec.equipment ?? null,
    },
  };
}

export function buildMotionNormalizePrompt(input: CustomMotionInput) {
  return [
    "Normalize a gym or athletic move into structured JSON for NVIDIA Kimodo text-to-motion.",
    "Kimodo needs one clear third-person sentence about a single human performing the move.",
    "Do not invent medical advice. Do not describe multiple people, cameras, or editing cuts.",
    "Keep the motion physically plausible for one adult in place or with a short step.",
    "Prefer one repetition with visible joint travel that fits in a few seconds.",
    "Never describe a pure isometric hold (still plank, freeze, pause in place).",
    "If the user asks for a hold, convert it into a short dynamic demo: getting into position, an up-down, or one clear limb transition while keeping the same body line.",
    "Name floor presses and planks with concrete arm/torso travel (elbow bend, chest lowering, forearm drops) so the motion model moves.",
    `User name: ${JSON.stringify(input.name)}`,
    `User description: ${JSON.stringify(input.description)}`,
    "Fill name, style, startingPose, action, endingPose, optional equipment, and text.",
    "text must be a single Kimodo prompt beginning with 'A person' and ending with a period.",
    "style must be one of: controlled, athletic, slow, explosive.",
  ].join(" ");
}

/** Offline fallback when Gemini is unavailable. */
export function fallbackMotionSpec(input: CustomMotionInput): MotionSpec {
  const name = input.name.trim();
  const description = input.description.trim().replace(/\.+$/, "");
  const fields = {
    name,
    style: "controlled" as const,
    startingPose: "in a ready athletic stance",
    action: description,
    endingPose: "back in a balanced standing position",
  };
  return ensureMotionSpec({
    ...fields,
    text: sentence([
      `A person performs one controlled ${name}`,
      description,
      "starting upright and finishing in a balanced stance",
    ]),
  });
}

export const DEFAULT_MOTION_NORMALIZE_MODEL = "gemini-3.5-flash-lite";

export function motionNormalizeModels() {
  const preferred = process.env.GEMINI_MOTION_MODEL?.trim();
  const joint = process.env.GEMINI_JOINT_COACH_MODEL?.trim();
  const visual = process.env.GEMINI_MODEL?.trim();
  return [
    ...new Set(
      [preferred, joint, DEFAULT_MOTION_NORMALIZE_MODEL, visual].filter(
        (name): name is string => Boolean(name),
      ),
    ),
  ];
}
