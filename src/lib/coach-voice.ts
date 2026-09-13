// Client-safe helpers for the coaching voice. The ElevenLabs key never
// leaves the server; this module only shapes cue text and the short
// playback queue the live camera uses.

export const PREVIEW_COACH_CUE = "Rep 1. Good depth that rep.";
export const MAX_LIVE_VOICE_QUEUE = 2;
export const SPEAK_TEXT_MAX = 300;

export function enqueueLiveCue(queue: string[], text: string): string[] {
  const next = text.trim();
  if (!next) return queue;
  const combined = queue.concat(next);
  return combined.length <= MAX_LIVE_VOICE_QUEUE
    ? combined
    : combined.slice(combined.length - MAX_LIVE_VOICE_QUEUE);
}

export function coachingSpeechText(review: {
  summary: string;
  cues: Array<{ observation: string; suggestion: string }>;
}): string {
  const first = review.cues[0];
  const followUp = first
    ? `${first.observation} ${first.suggestion}`.trim()
    : "";
  return [review.summary.trim(), followUp]
    .filter(Boolean)
    .join(" ")
    .slice(0, SPEAK_TEXT_MAX);
}

const SPOKEN_EXERCISE: Record<string, string> = {
  squat: "squat",
  pushup: "push-up",
  lunge: "lunge",
  deadlift: "deadlift",
  plank: "plank",
};

export const GENERIC_ANALYSIS_CUE =
  /Every detected cycle is included|I counted every complete cycle|measurements are estimates from one camera/i;

function appendCue(base: string, cue: string) {
  const room = SPEAK_TEXT_MAX - base.length - 1;
  if (room < 24) return base;
  if (cue.length <= room) return `${base} ${cue}`;
  const cut = cue.slice(0, room);
  const sentence = cut.match(/^[\s\S]*?[.?!]/);
  if (sentence && sentence[0].trim().length >= 24)
    return `${base} ${sentence[0].trim()}`;
  const words = cut.replace(/\s+\S*$/, "").trim();
  return words.length >= 24 ? `${base} ${words}.` : base;
}

export function analysisSpeechText(
  analysis: {
    exercise: string;
    mode: "cyclic" | "hold";
    duration: number;
    coverage: number;
    reps?: Array<unknown>;
    hold?: {
      totalGoodFormSeconds: number;
      totalTrackedSeconds: number;
      formBreaks: number;
    };
    cues: string[];
  },
  classification?: {
    needsConfirmation: boolean;
  } | null,
): string {
  const label = SPOKEN_EXERCISE[analysis.exercise] ?? analysis.exercise;
  const parts: string[] = [];
  if (classification?.needsConfirmation) {
    parts.push(`This looks like a ${label}. Confirm the exercise if that is off.`);
  } else if (classification) {
    parts.push(`This looks like a ${label}.`);
  } else {
    parts.push(`${label.charAt(0).toUpperCase()}${label.slice(1)} review.`);
  }

  if (analysis.mode === "hold" && analysis.hold) {
    parts.push(
      `Straight body line for ${analysis.hold.totalGoodFormSeconds.toFixed(0)} of ${analysis.hold.totalTrackedSeconds.toFixed(0)} tracked seconds.`,
    );
    if (analysis.hold.formBreaks > 0) {
      parts.push(
        analysis.hold.formBreaks === 1
          ? "Form broke once."
          : `Form broke ${analysis.hold.formBreaks} times.`,
      );
    }
  } else {
    const reps = analysis.reps?.length ?? 0;
    const seconds = Math.round(analysis.duration);
    parts.push(
      reps === 1
        ? `I counted 1 repetition over ${seconds} seconds.`
        : `I counted ${reps} repetitions over ${seconds} seconds.`,
    );
  }

  parts.push(
    `Body tracked in ${Math.round(analysis.coverage * 100)} percent of frames.`,
  );

  const base = parts.join(" ");
  const cue = analysis.cues.find((item) => !GENERIC_ANALYSIS_CUE.test(item));
  return cue ? appendCue(base, cue) : base.slice(0, SPEAK_TEXT_MAX);
}
