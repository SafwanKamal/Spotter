import type { JointCoachReview } from "./joint-coach";
import { jointCoachSchema } from "./joint-coach";

const STORAGE_KEY = "spotter.jointCoach.v1";

export function writeJointCoachReview(review: JointCoachReview) {
  if (typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(review));
  } catch {
    // Quota failures should not block analysis.
  }
}

export function readJointCoachReview(): JointCoachReview | null {
  if (typeof sessionStorage === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = jointCoachSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export function bonesForJoint(label: string): string[] {
  const key = label.toLowerCase();
  const left = !/\bright\b/.test(key);
  const right = !/\bleft\b/.test(key);
  const both = (leftName: string, rightName: string) => {
    const bones: string[] = [];
    if (left) bones.push(leftName);
    if (right) bones.push(rightName);
    return bones;
  };
  if (/\bhip/.test(key) || key.includes("pelvis"))
    return ["Hips", ...both("LeftUpLeg", "RightUpLeg")];
  if (/\bknee/.test(key))
    return ["Knee", ...both("LeftLeg", "RightLeg"), ...both("LeftKnee", "RightKnee")];
  if (/\bankle/.test(key) || /\bfoot/.test(key) || /\bheel/.test(key))
    return both("LeftFoot", "RightFoot");
  if (/\belbow/.test(key))
    return ["Elbow", ...both("LeftForeArm", "RightForeArm")];
  if (/\bwrist/.test(key) || /\bhand/.test(key))
    return both("LeftHand", "RightHand");
  if (/\bshoulder/.test(key) || /\barm/.test(key))
    return both("LeftArm", "RightArm");
  if (/\bhead/.test(key) || /\bneck/.test(key)) return ["Head", "Neck"];
  if (/\btorso/.test(key) || /\bspine/.test(key) || /\bchest/.test(key))
    return ["Spine", "Spine1"];
  return ["Hips"];
}

const DEMO_NOTES: Record<string, JointCoachReview> = {
  "front-squat": jointCoachSchema.parse({
    summary:
      "On this front-squat demonstration the hips and knees do the work while the elbows stay high in the rack. Watch the hips first: that is the joint that usually loses shape when the set gets heavy. Keep the torso stacked and sit between the heels.",
    movers: [
      {
        joint: "hips",
        takeaway: "Hips should fold back and down, then drive the stand.",
      },
      {
        joint: "knees",
        takeaway: "Knees travel forward over the mid-foot as the hips sit.",
      },
    ],
    attention: [
      {
        joint: "hips",
        why: "The hips are the first place a squat usually collapses or shoots back.",
        cue: "Sit between the heels and keep the chest over the mid-foot.",
      },
      {
        joint: "elbows",
        why: "In a front rack the elbows dropping is the upper-body leak to watch.",
        cue: "Keep the elbows up so the bar stays on the shoulders.",
      },
    ],
  }),
  bodyweight: jointCoachSchema.parse({
    summary:
      "On this bodyweight squat the hips and knees should travel the most. The torso is the joint line that usually folds first when depth gets rushed. Keep the whole foot down and sit between the heels.",
    movers: [
      {
        joint: "hips",
        takeaway: "Hips fold and rise; that is the prime motion of the squat.",
      },
      {
        joint: "knees",
        takeaway: "Knees track over the feet as the hips travel down.",
      },
    ],
    attention: [
      {
        joint: "torso",
        why: "The torso often dives forward before the hips finish sitting.",
        cue: "Keep the chest stacked over the mid-foot as you sit down.",
      },
      {
        joint: "knees",
        why: "Knees that cave in or shoot forward too fast are the first lower-body leak.",
        cue: "Drive the knees over the mid-toes and keep the heels down.",
      },
    ],
  }),
  pushup: jointCoachSchema.parse({
    summary:
      "On this push-up demonstration the elbows and shoulders do the pressing while the torso should stay quiet. Watch the hips: that is usually the first place the plank line breaks.",
    movers: [
      {
        joint: "elbows",
        takeaway: "Elbows bend and extend to lower and press the body.",
      },
      {
        joint: "shoulders",
        takeaway: "Shoulders stay stacked over the wrists through the press.",
      },
    ],
    attention: [
      {
        joint: "hips",
        why: "Hips sagging or piking is the first plank-line leak.",
        cue: "Brace so the hips stay in line with shoulders and ankles.",
      },
      {
        joint: "elbows",
        why: "Shallow elbows leave range on the table.",
        cue: "Lower until the elbows bend clearly, then press evenly.",
      },
    ],
  }),
  lunge: jointCoachSchema.parse({
    summary:
      "On this lunge demonstration the front knee and hips share the work. Watch the torso: leaning forward early usually means the hips are not owning the descent.",
    movers: [
      {
        joint: "knees",
        takeaway: "The working knee bends as you step and drop.",
      },
      {
        joint: "hips",
        takeaway: "Hips lower between the feet, then drive you back up.",
      },
    ],
    attention: [
      {
        joint: "torso",
        why: "The torso often tips forward before the lunge finds depth.",
        cue: "Keep the chest stacked over the hips as you drop.",
      },
      {
        joint: "knees",
        why: "A rushed front knee can shoot past the mid-foot.",
        cue: "Sink until both knees bend, then stand through the front foot.",
      },
    ],
  }),
  deadlift: jointCoachSchema.parse({
    summary:
      "On this deadlift demonstration the hips hinge and the torso stays long. Watch the knees: too much knee bend turns the hinge into a squat.",
    movers: [
      {
        joint: "hips",
        takeaway: "Hips push back to load the hinge, then drive to stand.",
      },
      {
        joint: "torso",
        takeaway: "The torso stays braced while the hips move under it.",
      },
    ],
    attention: [
      {
        joint: "hips",
        why: "Losing the hip hinge early is the first deadlift leak.",
        cue: "Push the hips back and keep the bar close as you stand.",
      },
      {
        joint: "knees",
        why: "Extra knee bend often means the move drifted toward a squat.",
        cue: "Keep a soft knee and let the hips do the travel.",
      },
    ],
  }),
  plank: jointCoachSchema.parse({
    summary:
      "On this plank up-down demonstration the elbows and shoulders travel while the hips should stay quiet. Watch the hips: that is usually the first place the plank line breaks during the transitions.",
    movers: [
      {
        joint: "elbows",
        takeaway: "Elbows fold to the forearms, then extend back to straight arms.",
      },
      {
        joint: "shoulders",
        takeaway: "Shoulders stay stacked as the arms drop and press.",
      },
    ],
    attention: [
      {
        joint: "hips",
        why: "Hips often sag or pike when switching between forearms and hands.",
        cue: "Brace and keep the hips level through each transition.",
      },
      {
        joint: "shoulders",
        why: "Collapsed shoulders make the up-down look soft before the hips move.",
        cue: "Push the floor away and keep the neck long.",
      },
    ],
  }),
  "overhead-press": jointCoachSchema.parse({
    summary:
      "On this overhead-press demonstration the shoulders and elbows do the pressing while the hips stay quiet. Watch the torso: leaning back is the usual cheat when the press gets heavy.",
    movers: [
      {
        joint: "shoulders",
        takeaway: "Shoulders drive the bar from the rack to lockout.",
      },
      {
        joint: "elbows",
        takeaway: "Elbows extend under the bar and finish stacked at the top.",
      },
    ],
    attention: [
      {
        joint: "torso",
        why: "The torso often leans back when the press stalls.",
        cue: "Brace and keep the ribs stacked over the hips as you press.",
      },
      {
        joint: "elbows",
        why: "Soft elbows at the top leave the lockout unfinished.",
        cue: "Finish with the arms straight and the bar over mid-foot.",
      },
    ],
  }),
  "jumping-jack": jointCoachSchema.parse({
    summary:
      "On this jumping-jack demonstration the hips and shoulders move together. Watch the landing: soft knees keep the bounce athletic instead of stiff.",
    movers: [
      {
        joint: "hips",
        takeaway: "Hips open and close as the feet jump out and in.",
      },
      {
        joint: "shoulders",
        takeaway: "Arms rise overhead in time with the foot jump.",
      },
    ],
    attention: [
      {
        joint: "knees",
        why: "Stiff knees make the landing noisy and late.",
        cue: "Land softly and keep a quiet bend in the knees.",
      },
      {
        joint: "shoulders",
        why: "Late arms break the rhythm of the jack.",
        cue: "Raise the arms as the feet open, not after.",
      },
    ],
  }),
};

export function demonstrationCoachNotes(
  moveId: string,
  moveName = moveId,
): JointCoachReview {
  if (DEMO_NOTES[moveId]) return DEMO_NOTES[moveId];
  const label = moveName.trim() || "movement";
  return jointCoachSchema.parse({
    summary: `On this ${label} demonstration, watch which joints travel the most and which joint line stays quiet. Generated examples illustrate a movement pattern; they do not reconstruct your recording.`,
    movers: [
      {
        joint: "hips",
        takeaway: "Notice whether the hips start, finish, or stabilize the move.",
      },
      {
        joint: "shoulders",
        takeaway: "Check how much the shoulders travel relative to the torso.",
      },
    ],
    attention: [
      {
        joint: "torso",
        why: "The torso is often the first place shape leaks when timing rushes.",
        cue: "Keep the torso braced while the working joints move.",
      },
      {
        joint: "hips",
        why: "Hips usually reveal whether the pattern stayed athletic or collapsed.",
        cue: "Own the hip position through the hardest part of the move.",
      },
    ],
  });
}

export function highlightSets(review: JointCoachReview) {
  return {
    movers: new Set(review.movers.flatMap((item) => bonesForJoint(item.joint))),
    attention: new Set(
      review.attention.flatMap((item) => bonesForJoint(item.joint)),
    ),
  };
}
