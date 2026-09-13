import { detectReps, type DetectionNote } from "./rep-detector";
export type Point = { x: number; y: number; z?: number; visibility?: number };
export type PoseFrame = { time: number; landmarks: Point[] };
export type Measurement = {
  time: number;
  knee: number | null;
  lean: number | null;
};
export type Rep = {
  start: number;
  bottom: number;
  end: number;
  minKnee: number;
  maxLean: number;
  descent: number;
  ascent: number;
};
export type Analysis = {
  version: 2;
  exercise: "squat";
  source: "video" | "synthetic";
  duration: number;
  side: "left" | "right";
  coverage: number;
  reps: Rep[];
  measurements: Measurement[];
  movementScore: number | null;
  cues: string[];
  detection: {
    baseline: number;
    notes: DetectionNote[];
    algorithm: "relative-excursion-v2";
  };
};
const SIDES = { left: [11, 23, 25, 27], right: [12, 24, 26, 28] } as const;
const degrees = (r: number) => (r * 180) / Math.PI;
export function angle(a: Point, b: Point, c: Point): number | null {
  const ux = a.x - b.x,
    uy = a.y - b.y,
    vx = c.x - b.x,
    vy = c.y - b.y;
  const length = Math.hypot(ux, uy) * Math.hypot(vx, vy);
  return length < 1e-8
    ? null
    : degrees(
        Math.acos(Math.max(-1, Math.min(1, (ux * vx + uy * vy) / length))),
      );
}
function usable(p: Point | undefined) {
  return (
    p &&
    Number.isFinite(p.x) &&
    Number.isFinite(p.y) &&
    (p.visibility ?? 0) >= 0.7 &&
    p.x >= 0 &&
    p.x <= 1 &&
    p.y >= 0 &&
    p.y <= 1
  );
}

// These are transparent prototype thresholds for a side-view squat, not clinical standards.
export function analyzeSquats(
  frames: PoseFrame[],
  width: number,
  height: number,
  duration: number,
  source: Analysis["source"] = "video",
): Analysis {
  if (!(width > 0 && height > 0 && duration > 0))
    throw new Error("Invalid video dimensions or duration.");
  const ordered = [...frames]
    .sort((a, b) => a.time - b.time)
    .filter(
      (f, i, all) =>
        Number.isFinite(f.time) &&
        f.time >= 0 &&
        f.time <= duration &&
        (i === 0 || f.time > all[i - 1].time),
    );
  const count = (side: keyof typeof SIDES) =>
    ordered.filter((f) => SIDES[side].every((i) => usable(f.landmarks[i])))
      .length;
  const side = count("left") >= count("right") ? "left" : "right";
  const [s, h, k, a] = SIDES[side];
  let prior: number | null = null,
    lastTime = -Infinity;
  const measurements: Measurement[] = ordered.map((f) => {
    if (!SIDES[side].every((i) => usable(f.landmarks[i]))) {
      prior = null;
      return { time: f.time, knee: null, lean: null };
    }
    const pixel = (i: number) => ({
      x: f.landmarks[i].x * width,
      y: f.landmarks[i].y * height,
    });
    const shoulder = pixel(s),
      hip = pixel(h),
      knee = angle(hip, pixel(k), pixel(a));
    const lean = degrees(
      Math.atan2(Math.abs(shoulder.x - hip.x), hip.y - shoulder.y),
    );
    if (knee === null || lean > 85) {
      prior = null;
      return { time: f.time, knee: null, lean: null };
    }
    const smooth: number =
      prior === null || f.time - lastTime > 0.25
        ? knee
        : prior * 0.45 + knee * 0.55;
    prior = smooth;
    lastTime = f.time;
    return { time: f.time, knee: smooth, lean };
  });
  const { reps, ...detection } = detectReps(measurements);
  const coverage = measurements.length
    ? measurements.filter((m) => m.knee !== null).length / measurements.length
    : 0;
  // Score ROM consistency and deliberate tempo only. Lean is reported, not universally penalized.
  const movementScore =
    coverage >= 0.75 && reps.length
      ? Math.round(
          reps.reduce(
            (sum, r) =>
              sum +
              Math.min(70, Math.max(0, ((160 - r.minKnee) / 70) * 70)) +
              (r.descent >= 0.8 ? 15 : 5) +
              (r.ascent >= 0.5 ? 15 : 5),
            0,
          ) / reps.length,
        )
      : null;
  const cues: string[] = [];
  if (coverage < 0.75)
    cues.push(
      "Keep your shoulder, hip, knee, and ankle visible throughout the clip. Missing landmarks limit the result.",
    );
  if (!reps.length)
    cues.push(
      "No complete squat cycles detected. Start standing, descend, and return to standing with a clear side view.",
    );
  if (reps.some((r) => r.minKnee > 100))
    cues.push(
      "Compare your lowest position across repetitions. Camera angle affects the measured knee bend.",
    );
  if (reps.some((r) => r.descent < 0.8))
    cues.push(
      "Some repetitions move faster than others. Select a rep to review its lowering and rising time.",
    );
  if (reps.length)
    cues.push(
      "Every detected cycle is included, even when depth or tempo varies. The measurements are estimates from one camera.",
    );
  return {
    version: 2,
    detection,
    exercise: "squat",
    source,
    duration,
    side,
    coverage,
    reps,
    measurements,
    movementScore,
    cues,
  };
}

// Synthetic landmarks exercise the real measurement pipeline; they are never presented as an athlete recording.
export function demoFrames(): PoseFrame[] {
  return Array.from({ length: 181 }, (_, i) => {
    const time = i / 15,
      cycle = time % 4;
    const bend =
      cycle < 0.5 || cycle > 3.5 ? 0 : Math.sin(((cycle - 0.5) / 3) * Math.PI);
    const kneeAngle = ((175 - 90 * bend) * Math.PI) / 180;
    const knee = { x: 0.6, y: 0.66, visibility: 1 };
    const hip = {
      x: knee.x - 0.24 * Math.sin(kneeAngle),
      y: knee.y + 0.24 * Math.cos(kneeAngle),
      visibility: 1,
    };
    const shoulder = { x: hip.x + 0.09 * bend, y: hip.y - 0.25, visibility: 1 };
    const landmarks: Point[] = Array.from({ length: 33 }, () => ({
      x: 0.5,
      y: 0.5,
      visibility: 0,
    }));
    ["left", "right"].forEach((side) => {
      const ids = SIDES[side as keyof typeof SIDES];
      landmarks[ids[0]] = shoulder;
      landmarks[ids[1]] = hip;
      landmarks[ids[2]] = knee;
      landmarks[ids[3]] = { x: 0.6, y: 0.9, visibility: 1 };
    });
    return { time, landmarks };
  });
}
