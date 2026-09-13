import type {
  CyclicTuning,
  DetectionNote,
  GenericMeasurement,
  GenericRep,
  HoldResult,
  HoldSegment,
} from "./types";

const DEFAULT_TUNING: CyclicTuning = {
  enterDelta: 14,
  exitDelta: 8,
  minDepthDelta: 20,
  minDurationSeconds: 0.3,
};

// A direct generalization of the squat rep detector (src/lib/rep-detector.ts):
// same relative-excursion approach, same tracking-gap/too-brief/small-movement
// safeguards, just parameterized over a generic "primary" angle instead of
// being hardcoded to knee angle. Kept as a separate function (rather than
// rewriting the original) so the live squat pipeline this hackathon is
// judged on is never touched by this generalization.
export function detectCyclicReps(
  measurements: GenericMeasurement[],
  tuning: Partial<CyclicTuning> = {},
): { reps: GenericRep[]; baseline: number; notes: DetectionNote[] } {
  const { enterDelta, exitDelta, minDepthDelta, minDurationSeconds } = {
    ...DEFAULT_TUNING,
    ...tuning,
  };
  const values = measurements
    .flatMap((m) => (m.primary === null ? [] : [m.primary]))
    .sort((a, b) => a - b);
  const baseline = values.length
    ? values[Math.floor((values.length - 1) * 0.9)]
    : 180;
  const top = baseline - exitDelta,
    enter = baseline - enterDelta;
  const reps: GenericRep[] = [],
    notes: DetectionNote[] = [];
  let standing: GenericMeasurement | null = null,
    active: GenericRep | null = null,
    previousTime = -Infinity,
    excursionSamples = 0;
  for (const m of measurements) {
    if (m.primary === null || m.time - previousTime > 0.25) {
      if (active)
        notes.push({
          start: active.start,
          end: previousTime,
          reason: "tracking_gap",
        });
      standing = null;
      active = null;
      excursionSamples = 0;
    }
    previousTime = m.time;
    if (m.primary === null) continue;
    if (!active) {
      if (m.primary >= top) standing = m;
      else if (standing && m.primary < enter) {
        active = {
          start: standing.time,
          bottom: m.time,
          end: m.time,
          minPrimary: m.primary,
          maxSecondary: m.secondary ?? 0,
          descent: 0,
          ascent: 0,
        };
        excursionSamples = 1;
      }
    } else {
      if (m.primary < enter) excursionSamples++;
      if (m.primary < active.minPrimary) {
        active.minPrimary = m.primary;
        active.bottom = m.time;
      }
      active.maxSecondary = Math.max(active.maxSecondary, m.secondary ?? 0);
      if (m.primary >= top) {
        active.end = m.time;
        active.descent = active.bottom - active.start;
        active.ascent = active.end - active.bottom;
        const duration = active.end - active.start;
        if (baseline - active.minPrimary < minDepthDelta)
          notes.push({
            start: active.start,
            end: m.time,
            reason: "small_movement",
          });
        else if (duration < minDurationSeconds || excursionSamples < 2)
          notes.push({ start: active.start, end: m.time, reason: "too_brief" });
        else reps.push(active);
        active = null;
        standing = m;
        excursionSamples = 0;
      }
    }
  }
  if (active)
    notes.push({
      start: active.start,
      end: previousTime,
      reason: "incomplete",
    });
  return { reps, baseline, notes };
}

// A hold (e.g. a plank) has no bend-and-return cycle to count. Instead it
// stays in a single sustained position, so what matters is how much of the
// attempt was tracked, and how much of the tracked time held acceptable
// form (primary angle close to the straight-line target the exercise
// defines, e.g. 180 degrees for a straight body line).
export function detectHold(
  measurements: GenericMeasurement[],
  targetAngle: number,
  formToleranceDeg: number,
): HoldResult {
  const segments: HoldSegment[] = [];
  let current: HoldSegment | null = null,
    previousTime = -Infinity;
  const flush = () => {
    if (current) segments.push(current);
    current = null;
  };
  for (const m of measurements) {
    if (m.primary === null || m.time - previousTime > 0.25) flush();
    previousTime = m.time;
    if (m.primary === null) continue;
    const formOk = Math.abs(targetAngle - m.primary) <= formToleranceDeg;
    if (!current || current.formOk !== formOk) {
      flush();
      current = { start: m.time, end: m.time, formOk };
    } else {
      current.end = m.time;
    }
  }
  flush();
  const totalTrackedSeconds = segments.reduce(
    (sum, s) => sum + (s.end - s.start),
    0,
  );
  const goodSegments = segments.filter((s) => s.formOk);
  const totalGoodFormSeconds = goodSegments.reduce(
    (sum, s) => sum + (s.end - s.start),
    0,
  );
  const longestGoodFormSeconds = goodSegments.reduce(
    (max, s) => Math.max(max, s.end - s.start),
    0,
  );
  return {
    segments,
    totalTrackedSeconds,
    totalGoodFormSeconds,
    longestGoodFormSeconds,
    formBreaks: segments.filter((s) => !s.formOk).length,
  };
}
