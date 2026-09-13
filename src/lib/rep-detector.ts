import type { Measurement, Rep } from "./analysis";

export type DetectionNote = {
  start: number;
  end: number;
  reason: "tracking_gap" | "small_movement" | "too_brief" | "incomplete";
};
export function detectReps(measurements: Measurement[]) {
  const values = measurements
    .flatMap((m) => (m.knee === null ? [] : [m.knee]))
    .sort((a, b) => a - b);
  const baseline = values.length
    ? values[Math.floor((values.length - 1) * 0.9)]
    : 180;
  const top = baseline - 8,
    enter = baseline - 14;
  const reps: Rep[] = [],
    notes: DetectionNote[] = [];
  let standing: Measurement | null = null,
    active: Rep | null = null,
    previousTime = -Infinity,
    excursionSamples = 0;
  for (const m of measurements) {
    if (m.knee === null || m.time - previousTime > 0.25) {
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
    if (m.knee === null) continue;
    if (!active) {
      if (m.knee >= top) standing = m;
      else if (standing && m.knee < enter) {
        active = {
          start: standing.time,
          bottom: m.time,
          end: m.time,
          minKnee: m.knee,
          maxLean: m.lean ?? 0,
          descent: 0,
          ascent: 0,
        };
        excursionSamples = 1;
      }
    } else {
      if (m.knee < enter) excursionSamples++;
      if (m.knee < active.minKnee) {
        active.minKnee = m.knee;
        active.bottom = m.time;
      }
      active.maxLean = Math.max(active.maxLean, m.lean ?? 0);
      if (m.knee >= top) {
        active.end = m.time;
        active.descent = active.bottom - active.start;
        active.ascent = active.end - active.bottom;
        const duration = active.end - active.start;
        // Recognize motion separately from quality: depth and tempo are review metrics, never pass/fail rep gates.
        if (baseline - active.minKnee < 20)
          notes.push({
            start: active.start,
            end: m.time,
            reason: "small_movement",
          });
        else if (duration < 0.3 || excursionSamples < 2)
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
  return { reps, baseline, notes, algorithm: "relative-excursion-v2" as const };
}
