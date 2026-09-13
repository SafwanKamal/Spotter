import type { Point, PoseFrame } from "./analysis";
import type {
  ExerciseId,
  GenericRep,
  HoldResult,
} from "./exercises/types";

const VISIBLE = 0.7;
const GAP_SECONDS = 0.28;

const INDEX = {
  nose: 0,
  leftShoulder: 11,
  rightShoulder: 12,
  leftElbow: 13,
  rightElbow: 14,
  leftWrist: 15,
  rightWrist: 16,
  leftHip: 23,
  rightHip: 24,
  leftKnee: 25,
  rightKnee: 26,
  leftAnkle: 27,
  rightAnkle: 28,
} as const;

export type TrackedJoint = keyof typeof INDEX;

export type JointKinematics = {
  joint: TrackedJoint;
  label: string;
  samples: number;
  travel: number;
  meanSpeed: number;
  peakSpeed: number;
  peakAccel: number;
};

export type ShapeWatch = {
  joint: string;
  code: string;
  why: string;
};

export type KinematicBrief = {
  exercise: ExerciseId;
  duration: number;
  side: "left" | "right";
  joints: JointKinematics[];
  movers: string[];
  jerky: string[];
  watch: ShapeWatch[];
  tempo: {
    firstDescentSeconds: number | null;
    lastDescentSeconds: number | null;
    laterRepsFaster: boolean;
    laterRepsShallower: boolean;
  };
};

const LABELS: Record<TrackedJoint, string> = {
  nose: "head",
  leftShoulder: "left shoulder",
  rightShoulder: "right shoulder",
  leftElbow: "left elbow",
  rightElbow: "right elbow",
  leftWrist: "left wrist",
  rightWrist: "right wrist",
  leftHip: "left hip",
  rightHip: "right hip",
  leftKnee: "left knee",
  rightKnee: "right knee",
  leftAnkle: "left ankle",
  rightAnkle: "right ankle",
};

function usable(point: Point | undefined) {
  return Boolean(
    point &&
      Number.isFinite(point.x) &&
      Number.isFinite(point.y) &&
      (point.visibility ?? 0) >= VISIBLE &&
      point.x >= 0 &&
      point.x <= 1 &&
      point.y >= 0 &&
      point.y <= 1,
  );
}

function pixel(point: Point, width: number, height: number) {
  return { x: point.x * width, y: point.y * height };
}

function median(values: number[]) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;
}

function bodyScale(frames: PoseFrame[], width: number, height: number) {
  const lengths: number[] = [];
  for (const frame of frames) {
    for (const side of ["left", "right"] as const) {
      const hip = frame.landmarks[INDEX[`${side}Hip`]];
      const ankle = frame.landmarks[INDEX[`${side}Ankle`]];
      if (!usable(hip) || !usable(ankle)) continue;
      const a = pixel(hip, width, height);
      const b = pixel(ankle, width, height);
      const length = Math.hypot(a.x - b.x, a.y - b.y);
      if (length > 8) lengths.push(length);
    }
  }
  return Math.max(median(lengths), 40);
}

function trackJoint(
  frames: PoseFrame[],
  index: number,
  width: number,
  height: number,
  scale: number,
) {
  let travel = 0;
  let speedSum = 0;
  let speedCount = 0;
  let peakSpeed = 0;
  let peakAccel = 0;
  let samples = 0;
  let prev: { t: number; x: number; y: number; speed: number } | null = null;
  for (const frame of frames) {
    const point = frame.landmarks[index];
    if (!usable(point)) {
      prev = null;
      continue;
    }
    samples += 1;
    const next = {
      t: frame.time,
      ...pixel(point, width, height),
      speed: 0,
    };
    if (prev) {
      const dt = next.t - prev.t;
      if (dt > 0 && dt <= GAP_SECONDS) {
        const dist = Math.hypot(next.x - prev.x, next.y - prev.y) / scale;
        const speed = dist / dt;
        travel += dist;
        speedSum += speed;
        speedCount += 1;
        peakSpeed = Math.max(peakSpeed, speed);
        peakAccel = Math.max(peakAccel, Math.abs(speed - prev.speed) / dt);
        next.speed = speed;
      }
    }
    prev = next;
  }
  return {
    samples,
    travel: Number(travel.toFixed(3)),
    meanSpeed: Number((speedCount ? speedSum / speedCount : 0).toFixed(3)),
    peakSpeed: Number(peakSpeed.toFixed(3)),
    peakAccel: Number(peakAccel.toFixed(3)),
  };
}

function midlineDrift(
  frames: PoseFrame[],
  kneeIndex: number,
  ankleIndex: number,
) {
  const drifts: number[] = [];
  for (const frame of frames) {
    const knee = frame.landmarks[kneeIndex];
    const ankle = frame.landmarks[ankleIndex];
    if (!usable(knee) || !usable(ankle)) continue;
    drifts.push(Math.abs(knee.x - 0.5) - Math.abs(ankle.x - 0.5));
  }
  return median(drifts);
}

function lineDeviation(
  frames: PoseFrame[],
  shoulder: number,
  hip: number,
  ankle: number,
) {
  const deviations: number[] = [];
  for (const frame of frames) {
    const s = frame.landmarks[shoulder];
    const h = frame.landmarks[hip];
    const a = frame.landmarks[ankle];
    if (!usable(s) || !usable(h) || !usable(a)) continue;
    const denom = a.y - s.y;
    if (Math.abs(denom) < 1e-4) continue;
    const expected = s.x + ((h.y - s.y) / denom) * (a.x - s.x);
    deviations.push(Math.abs(h.x - expected) + Math.abs(h.y - (s.y + a.y) / 2));
  }
  return median(deviations);
}

function squatWatches(
  frames: PoseFrame[],
  side: "left" | "right",
  joints: JointKinematics[],
): ShapeWatch[] {
  const watch: ShapeWatch[] = [];
  const knee = INDEX[`${side}Knee`];
  const ankle = INDEX[`${side}Ankle`];
  const hip = byName(joints, `${side}Hip`);
  const ankleStats = byName(joints, `${side}Ankle`);
  const shoulder = byName(joints, `${side}Shoulder`);
  const drift = midlineDrift(frames, knee, ankle);
  if (drift < -0.03) {
    watch.push({
      joint: `${side} knee`,
      code: "knee_inward",
      why: "The knee sat closer to the midline than the ankle, which often means the knee is collapsing in.",
    });
  }
  if (ankleStats && hip && hip.travel > 0.2 && ankleStats.travel > hip.travel * 0.55) {
    watch.push({
      joint: `${side} ankle`,
      code: "heel_jitter",
      why: "The ankle traveled a lot relative to the hip. That can be a heel lifting or a wobbly foot.",
    });
  }
  if (shoulder && hip && shoulder.travel > hip.travel * 1.15) {
    watch.push({
      joint: `${side} shoulder`,
      code: "torso_fold",
      why: "The shoulder traveled more than the hip, which often means the torso is folding or diving forward.",
    });
  }
  return watch;
}

function pushupWatches(
  frames: PoseFrame[],
  side: "left" | "right",
  joints: JointKinematics[],
): ShapeWatch[] {
  const watch: ShapeWatch[] = [];
  const hipTravel = byName(joints, `${side}Hip`)?.travel ?? 0;
  const shoulderTravel = byName(joints, `${side}Shoulder`)?.travel ?? 0;
  const sag = lineDeviation(
    frames,
    INDEX[`${side}Shoulder`],
    INDEX[`${side}Hip`],
    INDEX[`${side}Ankle`],
  );
  if (sag > 0.04) {
    watch.push({
      joint: `${side} hip`,
      code: "body_line",
      why: "The hip left the shoulder-to-ankle line. That is usually sag or pike.",
    });
  }
  if (hipTravel > shoulderTravel * 1.35 && hipTravel > 0.15) {
    watch.push({
      joint: `${side} hip`,
      code: "hip_wiggle",
      why: "The hip moved more than the shoulder, so the trunk is not traveling as one piece.",
    });
  }
  return watch;
}

function deadliftWatches(joints: JointKinematics[], side: "left" | "right") {
  const watch: ShapeWatch[] = [];
  const hip = byName(joints, `${side}Hip`);
  const knee = byName(joints, `${side}Knee`);
  const shoulder = byName(joints, `${side}Shoulder`);
  if (knee && hip && knee.travel > hip.travel * 1.1) {
    watch.push({
      joint: `${side} knee`,
      code: "squatty_hinge",
      why: "The knee traveled as much as or more than the hip, so this is looking more like a squat than a hinge.",
    });
  }
  if (shoulder && hip && shoulder.peakAccel > hip.peakAccel * 1.4) {
    watch.push({
      joint: `${side} shoulder`,
      code: "torso_lag",
      why: "The shoulder was jerkier than the hip, which often means the torso is lagging or rounding as the hips rise.",
    });
  }
  return watch;
}

function plankWatches(joints: JointKinematics[], side: "left" | "right") {
  const watch: ShapeWatch[] = [];
  const hip = byName(joints, `${side}Hip`);
  const ranked = [...joints].sort((a, b) => b.travel - a.travel);
  const leakiest = ranked[0];
  if (leakiest && leakiest.travel > 0.08) {
    watch.push({
      joint: LABELS[leakiest.joint],
      code: "hold_leak",
      why: "A plank should barely travel. This joint moved the most, so it is the first place the hold is leaking.",
    });
  }
  if (hip && hip.peakAccel >= ranked[0]?.peakAccel) {
    watch.push({
      joint: `${side} hip`,
      code: "hip_jitter",
      why: "The hip showed the sharpest acceleration, which is usually sag or pike starting to show.",
    });
  }
  return watch;
}

function lungeWatches(
  frames: PoseFrame[],
  side: "left" | "right",
  joints: JointKinematics[],
) {
  const watch = squatWatches(frames, side, joints).map((item) =>
    item.code === "torso_fold"
      ? {
          ...item,
          why: "The torso traveled forward more than the hip dropped, which often means a short stride or pushing from the toes.",
        }
      : item,
  );
  const ankle = byName(joints, `${side}Ankle`);
  if (ankle && ankle.peakAccel > 2.4) {
    watch.push({
      joint: `${side} ankle`,
      code: "balance_wobble",
      why: "The ankle was jumpy. That is usually a balance leak on the front foot.",
    });
  }
  return watch;
}

function byName(joints: JointKinematics[], joint: string) {
  return joints.find((item) => item.joint === joint);
}

function tempo(reps: GenericRep[] | undefined) {
  if (!reps?.length) {
    return {
      firstDescentSeconds: null,
      lastDescentSeconds: null,
      laterRepsFaster: false,
      laterRepsShallower: false,
    };
  }
  const first = reps[0];
  const last = reps[reps.length - 1];
  return {
    firstDescentSeconds: Number(first.descent.toFixed(2)),
    lastDescentSeconds: Number(last.descent.toFixed(2)),
    laterRepsFaster: reps.length > 1 && last.descent < first.descent * 0.75,
    laterRepsShallower:
      reps.length > 1 && last.minPrimary > first.minPrimary + 8,
  };
}

export function summarizeKinematics(input: {
  exercise: ExerciseId;
  frames: PoseFrame[];
  width: number;
  height: number;
  side: "left" | "right";
  duration: number;
  reps?: GenericRep[];
  hold?: HoldResult;
}): KinematicBrief {
  const frames = [...input.frames]
    .sort((a, b) => a.time - b.time)
    .filter(
      (frame, index, all) =>
        Number.isFinite(frame.time) &&
        (index === 0 || frame.time > all[index - 1].time),
    );
  const scale = bodyScale(frames, input.width, input.height);
  const joints: JointKinematics[] = (
    Object.keys(INDEX) as TrackedJoint[]
  ).map((joint) => ({
    joint,
    label: LABELS[joint],
    ...trackJoint(frames, INDEX[joint], input.width, input.height, scale),
  }));
  const ranked = [...joints]
    .filter((item) => item.samples >= 4)
    .sort((a, b) => b.travel - a.travel);
  const movers = ranked.slice(0, 3).map((item) => item.label);
  const jerky = [...ranked]
    .sort((a, b) => b.peakAccel - a.peakAccel)
    .slice(0, 2)
    .filter((item) => item.peakAccel > 1.2)
    .map((item) => item.label);

  let watch: ShapeWatch[] = [];
  if (input.exercise === "squat") watch = squatWatches(frames, input.side, joints);
  else if (input.exercise === "pushup")
    watch = pushupWatches(frames, input.side, joints);
  else if (input.exercise === "deadlift")
    watch = deadliftWatches(joints, input.side);
  else if (input.exercise === "plank") watch = plankWatches(joints, input.side);
  else watch = lungeWatches(frames, input.side, joints);

  if (input.hold && input.hold.formBreaks > 0) {
    watch.push({
      joint: "hips",
      code: "form_break",
      why: `The hold left a straight body line ${input.hold.formBreaks} time${input.hold.formBreaks === 1 ? "" : "s"}.`,
    });
  }

  const unique = watch.filter(
    (item, index) =>
      watch.findIndex((other) => other.code === item.code && other.joint === item.joint) ===
      index,
  );

  return {
    exercise: input.exercise,
    duration: Number(input.duration.toFixed(2)),
    side: input.side,
    joints: ranked.slice(0, 8),
    movers,
    jerky,
    watch: unique.slice(0, 4),
    tempo: tempo(input.reps),
  };
}
