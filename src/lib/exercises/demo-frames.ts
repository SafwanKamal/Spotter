import type { Point, PoseFrame } from "../analysis";

// Synthetic landmark rigs used only to exercise the detection math end to
// end (rep counting, hold segmentation) without a real recording. They
// follow the exact same technique as the existing squat demoFrames() in
// src/lib/analysis.ts: place a "vertex" and a "distal" point on a fixed
// straight line, then swing the "proximal" point through an angle so
// angle(proximal, vertex, distal) reads back exactly the intended value.
// None of this touches the real squat generator or the live pose model.

const FPS = 15;
const BLANK: Point = { x: 0.5, y: 0.5, visibility: 0 };

function bendProfile(time: number, cycleLength: number) {
  const cycle = time % cycleLength;
  return cycle < 0.5 || cycle > cycleLength - 0.5
    ? 0
    : Math.sin(((cycle - 0.5) / (cycleLength - 1)) * Math.PI);
}

// A point at `angleDeg` between the fixed vertex->distal direction (assumed
// straight down, i.e. distal = vertex + (0, length)) and vertex->result.
function swing(vertex: Point, length: number, angleDeg: number): Point {
  const rad = (angleDeg * Math.PI) / 180;
  return {
    x: vertex.x - length * Math.sin(rad),
    y: vertex.y + length * Math.cos(rad),
    visibility: 1,
  };
}

function blankFrame(): Point[] {
  return Array.from({ length: 33 }, () => ({ ...BLANK }));
}

export function demoFramesForPushup(
  repCount = 3,
  { topAngle = 172, bottomAngle = 85 }: { topAngle?: number; bottomAngle?: number } = {},
): PoseFrame[] {
  const totalSeconds = repCount * 4 + 1;
  return Array.from({ length: Math.round(totalSeconds * FPS) + 1 }, (_, i) => {
    const time = i / FPS;
    const bend = bendProfile(time, 4);
    const elbowAngle = topAngle - (topAngle - bottomAngle) * bend;
    // Leave room for the straight torso and legs at full extension.
    const elbow: Point = { x: 0.4, y: 0.66, visibility: 1 };
    const wrist: Point = { x: elbow.x, y: elbow.y + 0.24, visibility: 1 };
    const shoulder = swing(elbow, 0.24, elbowAngle);
    const hip: Point = { x: shoulder.x + 0.3, y: shoulder.y, visibility: 1 };
    const ankle: Point = { x: hip.x + 0.3, y: hip.y, visibility: 1 };
    const landmarks = blankFrame();
    for (const side of ["left", "right"] as const) {
      const ids =
        side === "left"
          ? { shoulder: 11, elbow: 13, wrist: 15, hip: 23, ankle: 27 }
          : { shoulder: 12, elbow: 14, wrist: 16, hip: 24, ankle: 28 };
      landmarks[ids.shoulder] = shoulder;
      landmarks[ids.elbow] = elbow;
      landmarks[ids.wrist] = wrist;
      landmarks[ids.hip] = hip;
      landmarks[ids.ankle] = ankle;
    }
    return { time, landmarks };
  });
}

export function demoFramesForLunge(
  repCount = 3,
  { topAngle = 175, bottomAngle = 95 }: { topAngle?: number; bottomAngle?: number } = {},
): PoseFrame[] {
  const totalSeconds = repCount * 4 + 1;
  return Array.from({ length: Math.round(totalSeconds * FPS) + 1 }, (_, i) => {
    const time = i / FPS;
    const bend = bendProfile(time, 4);
    const kneeAngle = topAngle - (topAngle - bottomAngle) * bend;
    const knee: Point = { x: 0.6, y: 0.66, visibility: 1 };
    const ankle: Point = { x: knee.x, y: knee.y + 0.24, visibility: 1 };
    const hip = swing(knee, 0.24, kneeAngle);
    const shoulder: Point = { x: hip.x + 0.03 * bend, y: hip.y - 0.25, visibility: 1 };
    const landmarks = blankFrame();
    landmarks[11] = shoulder;
    landmarks[23] = hip;
    landmarks[25] = knee;
    landmarks[27] = ankle;
    // The other leg stays behind the working leg. Keeping this synthetic
    // fixture visibly split prevents the classifier test from teaching the
    // impossible rule that an upright torso alone means "lunge."
    const backKnee: Point = {
      x: hip.x - 0.12,
      y: hip.y + 0.19,
      visibility: 1,
    };
    const backAnkle: Point = {
      x: backKnee.x - 0.2,
      y: backKnee.y + 0.16,
      visibility: 1,
    };
    landmarks[12] = { ...shoulder, x: shoulder.x - 0.025 };
    landmarks[24] = { ...hip, x: hip.x - 0.025 };
    landmarks[26] = backKnee;
    landmarks[28] = backAnkle;
    return { time, landmarks };
  });
}

export function demoFramesForDeadlift(
  repCount = 3,
  {
    topAngle = 175,
    bottomAngle = 100,
    kneeBendAt,
  }: { topAngle?: number; bottomAngle?: number; kneeBendAt?: number } = {},
): PoseFrame[] {
  const totalSeconds = repCount * 4 + 1;
  return Array.from({ length: Math.round(totalSeconds * FPS) + 1 }, (_, i) => {
    const time = i / FPS;
    const bend = bendProfile(time, 4);
    const hingeAngle = topAngle - (topAngle - bottomAngle) * bend;
    const hip: Point = { x: 0.6, y: 0.5, visibility: 1 };
    const knee: Point = { x: 0.6, y: 0.74, visibility: 1 };
    // Rotate the lower leg by 60 degrees during the selected time window.
    // Preserve its length and keep every landmark inside the frame.
    const kneeBend =
      kneeBendAt !== undefined && Math.abs(time - kneeBendAt) < 0.5 ? Math.PI / 3 : 0;
    const ankle: Point = {
      x: knee.x - 0.24 * Math.sin(kneeBend),
      y: knee.y + 0.24 * Math.cos(kneeBend),
      visibility: 1,
    };
    const shoulder = swing(hip, 0.24, hingeAngle);
    const landmarks = blankFrame();
    for (const side of ["left", "right"] as const) {
      const ids =
        side === "left"
          ? { shoulder: 11, hip: 23, knee: 25, ankle: 27 }
          : { shoulder: 12, hip: 24, knee: 26, ankle: 28 };
      landmarks[ids.shoulder] = shoulder;
      landmarks[ids.hip] = hip;
      landmarks[ids.knee] = knee;
      landmarks[ids.ankle] = ankle;
    }
    return { time, landmarks };
  });
}

export function demoFramesForPlank(
  durationSeconds = 12,
  sagWindow?: [number, number],
): PoseFrame[] {
  return Array.from({ length: Math.round(durationSeconds * FPS) + 1 }, (_, i) => {
    const time = i / FPS;
    const shoulder: Point = { x: 0.3, y: 0.5, visibility: 1 };
    const ankle: Point = { x: 0.9, y: 0.5, visibility: 1 };
    const sagging = sagWindow && time >= sagWindow[0] && time <= sagWindow[1];
    const hip: Point = {
      x: 0.6,
      y: 0.5 + (sagging ? 0.16 : 0),
      visibility: 1,
    };
    const landmarks = blankFrame();
    for (const side of ["left", "right"] as const) {
      const ids =
        side === "left"
          ? { shoulder: 11, hip: 23, ankle: 27 }
          : { shoulder: 12, hip: 24, ankle: 28 };
      landmarks[ids.shoulder] = shoulder;
      landmarks[ids.hip] = hip;
      landmarks[ids.ankle] = ankle;
    }
    return { time, landmarks };
  });
}
