import { z } from "zod";
import { boundSpokenText } from "./coach-voice";
import { formPlaybook } from "./form-playbooks";
import type { KinematicBrief } from "./kinematics";

export const DEFAULT_JOINT_COACH_MODEL = "gemini-3.5-flash-lite";

export const jointCoachSchema = z.object({
  summary: z.string().min(60).max(900),
  movers: z
    .array(
      z.object({
        joint: z.string().min(3).max(40),
        takeaway: z.string().min(16).max(280),
      }),
    )
    .min(1)
    .max(3),
  attention: z
    .array(
      z.object({
        joint: z.string().min(3).max(40),
        why: z.string().min(16).max(280),
        cue: z.string().min(16).max(280),
      }),
    )
    .min(1)
    .max(3),
});
export type JointCoachReview = z.infer<typeof jointCoachSchema>;

export const jointCoachInput = z.object({
  exercise: z.enum(["squat", "pushup", "lunge", "deadlift", "plank"]),
  duration: z.number().min(0.5).max(30),
  side: z.enum(["left", "right"]),
  movers: z.array(z.string().trim().min(2).max(40)).max(4),
  jerky: z.array(z.string().trim().min(2).max(40)).max(4),
  joints: z
    .array(
      z.object({
        joint: z.string().min(2).max(40),
        label: z.string().min(2).max(40),
        travel: z.number().min(0).max(50),
        meanSpeed: z.number().min(0).max(80),
        peakSpeed: z.number().min(0).max(80),
        peakAccel: z.number().min(0).max(400),
        samples: z.number().int().min(0).max(2000),
      }),
    )
    .max(10),
  watch: z
    .array(
      z.object({
        joint: z.string().min(2).max(40),
        code: z.string().min(2).max(40),
        why: z.string().min(8).max(280),
      }),
    )
    .max(4),
  tempo: z.object({
    firstDescentSeconds: z.number().min(0).max(30).nullable(),
    lastDescentSeconds: z.number().min(0).max(30).nullable(),
    laterRepsFaster: z.boolean(),
    laterRepsShallower: z.boolean(),
  }),
});

export function briefToJointCoachInput(brief: KinematicBrief) {
  return jointCoachInput.parse({
    exercise: brief.exercise,
    duration: brief.duration,
    side: brief.side,
    movers: brief.movers,
    jerky: brief.jerky,
    joints: brief.joints,
    watch: brief.watch,
    tempo: brief.tempo,
  });
}

export function buildJointCoachPrompt(
  input: z.infer<typeof jointCoachInput>,
) {
  return [
    formPlaybook(input.exercise),
    `This set is a ${input.exercise} tracked from the ${input.side} side for ${input.duration.toFixed(1)} seconds.`,
    "Travel, speed, and acceleration are in body-height units from one camera. Use them as relative evidence, not as lab measurements.",
    `Joints that traveled the most: ${input.movers.join(", ") || "unclear"}.`,
    input.jerky.length
      ? `Highest acceleration (jerky control): ${input.jerky.join(", ")}.`
      : "No joint stood out as especially jerky.",
    `Joint table: ${JSON.stringify(input.joints)}.`,
    input.watch.length
      ? `Local shape watches, do not copy verbatim: ${JSON.stringify(input.watch)}.`
      : "No local shape watch fired.",
    `Tempo: ${JSON.stringify(input.tempo)}.`,
    "Write a coach debrief. Summary: 3 to 5 sentences. Start with which joints did the work. Then which joint needs attention because it is the one that usually loses shape first, grounded in this set. Close with one next-set focus.",
    "Movers: 1 to 3 joints that should keep doing the work, each with a short takeaway.",
    "Attention: 1 to 3 joints to babysit next set. why = what you noticed. cue = one concrete action.",
    "If later reps were faster or shallower, say the late-set joint that is leaking first.",
  ].join(" ");
}

export function fallbackJointCoach(brief: KinematicBrief): JointCoachReview {
  const movers = brief.movers.length
    ? brief.movers.slice(0, 3)
    : ["working joints"];
  const watch = brief.watch[0];
  const jerky = brief.jerky[0];
  const later =
    brief.tempo.laterRepsFaster || brief.tempo.laterRepsShallower
      ? " Later reps got quicker or shallower, so babysit that joint at the end of the set."
      : "";
  const summary = [
    `Your ${movers.slice(0, 2).join(" and ")} traveled the most in this ${brief.exercise}.`,
    watch
      ? watch.why
      : jerky
        ? `Your ${jerky} had the sharpest acceleration, so that is the joint to keep quiet.`
        : "Nothing in the camera plane jumped out as a collapse.",
    `Next set, keep the work in ${movers[0]} and do not let the late reps get sloppy.${later}`,
  ].join(" ");
  return jointCoachSchema.parse({
    summary: summary.slice(0, 900),
    movers: movers.map((joint) => ({
      joint,
      takeaway: `This joint carried a large share of the ${brief.exercise} motion.`,
    })),
    attention: [
      watch
        ? {
            joint: watch.joint,
            why: watch.why,
            cue: "Own that joint before you add speed or extra depth.",
          }
        : {
            joint: jerky ?? "torso",
            why: jerky
              ? `${jerky} showed the sharpest acceleration in this set.`
              : "Keep a quieter torso while the working joints move.",
            cue: "Slow the last third of the set and hold your shape.",
          },
    ],
  });
}

export function jointCoachSpeechText(review: JointCoachReview) {
  const first = review.attention[0];
  const follow = first ? `${first.why} ${first.cue}`.trim() : "";
  return boundSpokenText(
    [review.summary.trim(), follow].filter(Boolean).join(" "),
  );
}

export function jointCoachModels() {
  const preferred = process.env.GEMINI_JOINT_COACH_MODEL?.trim();
  const visual = process.env.GEMINI_MODEL?.trim();
  return [
    ...new Set(
      [preferred, DEFAULT_JOINT_COACH_MODEL, visual].filter(
        (name): name is string => Boolean(name),
      ),
    ),
  ];
}

export function jointCoachModel() {
  return jointCoachModels()[0] ?? DEFAULT_JOINT_COACH_MODEL;
}
