import assert from "node:assert/strict";
import { test } from "node:test";

import {
  analysisSpeechText,
  coachingSpeechText,
  enqueueLiveCue,
  MAX_LIVE_VOICE_QUEUE,
  PREVIEW_COACH_CUE,
  SPEAK_TEXT_MAX,
} from "../src/lib/coach-voice";
import {
  buildElevenLabsSpeechRequest,
  DEFAULT_MODEL_ID,
  DEFAULT_VOICE_ID,
  ElevenLabsError,
  isElevenLabsConfigured,
  speakInput,
  synthesizeSpeech,
} from "../src/lib/elevenlabs";
import { analyzeExercise } from "../src/lib/exercises/engine";
import { LiveCoachTracker } from "../src/lib/exercises/live-cues";
import { demoFrames } from "../src/lib/analysis";

test("live voice queue keeps the newest cues and drops blanks", () => {
  assert.deepEqual(enqueueLiveCue([], "  "), []);
  assert.deepEqual(enqueueLiveCue([], PREVIEW_COACH_CUE), [PREVIEW_COACH_CUE]);
  const queued = enqueueLiveCue(["first", "second"], "third");
  assert.equal(queued.length, MAX_LIVE_VOICE_QUEUE);
  assert.deepEqual(queued, ["second", "third"]);
});

test("a clip review is flattened into one bounded spoken script", () => {
  const squat = analyzeExercise(
    "squat",
    demoFrames(),
    1000,
    1000,
    12,
    "synthetic",
  );
  const spoken = analysisSpeechText(squat, {
    needsConfirmation: false,
  });
  assert.match(spoken, /squat/);
  assert.match(spoken, /This looks like a squat/);
  assert.ok(!/confidence/.test(spoken));
  assert.match(spoken, /I counted 3 repetitions/);
  assert.match(spoken, /100 percent of frames/);
  assert.ok(spoken.length <= SPEAK_TEXT_MAX);
  assert.ok(!/Every detected cycle is included/.test(spoken));

  const uncertain = analysisSpeechText(squat, {
    needsConfirmation: true,
  });
  assert.match(uncertain, /Confirm the exercise if that is off/);
});

test("a Gemini review is flattened into one bounded spoken script", () => {
  const spoken = coachingSpeechText({
    summary: "Depth was consistent across the set.",
    cues: [
      {
        observation: "The last rep rose quickly.",
        suggestion: "Control the way up.",
      },
    ],
  });
  assert.match(spoken, /Depth was consistent/);
  assert.match(spoken, /Control the way up/);
  assert.ok(spoken.length <= SPEAK_TEXT_MAX);
});

test("speak input rejects empty and oversized cue text", () => {
  assert.equal(speakInput.safeParse({ text: "  " }).success, false);
  assert.equal(
    speakInput.safeParse({ text: "x".repeat(SPEAK_TEXT_MAX + 1) }).success,
    false,
  );
  assert.deepEqual(speakInput.parse({ text: "  Rep 1. Good depth that rep.  " }), {
    text: "Rep 1. Good depth that rep.",
  });
});

test("ElevenLabs requests stream Flash audio and stay unconfigured without a key", () => {
  assert.equal(isElevenLabsConfigured({}), false);
  assert.equal(buildElevenLabsSpeechRequest("Rep 1.", {}), null);
  const request = buildElevenLabsSpeechRequest("Rep 1. Good depth that rep.", {
    ELEVENLABS_API_KEY: "sk_test",
  });
  assert.ok(request);
  assert.match(request.url, new RegExp(`/text-to-speech/${DEFAULT_VOICE_ID}/stream`));
  assert.match(request.url, /output_format=mp3_44100_64/);
  assert.equal(request.headers.Accept, "audio/mpeg");
  assert.equal(request.headers["xi-api-key"], "sk_test");
  assert.match(request.body, new RegExp(`"model_id":"${DEFAULT_MODEL_ID}"`));
});

test("synthesizeSpeech returns the provider stream and maps failures", async () => {
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new Uint8Array([1, 2, 3]));
      controller.close();
    },
  });
  const speech = await synthesizeSpeech("Rep 1. Good depth that rep.", {
    env: { ELEVENLABS_API_KEY: "sk_test", ELEVENLABS_VOICE_ID: "customVoice" },
    fetch: async (url, init) => {
      assert.match(String(url), /customVoice\/stream/);
      assert.equal(init?.method, "POST");
      return new Response(stream, {
        status: 200,
        headers: { "Content-Type": "audio/mpeg" },
      });
    },
  });
  assert.equal(speech.contentType, "audio/mpeg");
  assert.ok(speech.stream);

  await assert.rejects(
    () => synthesizeSpeech("Rep 1.", { env: {} }),
    (error: unknown) =>
      error instanceof ElevenLabsError && error.status === 503,
  );
  await assert.rejects(
    () =>
      synthesizeSpeech("Rep 1.", {
        env: { ELEVENLABS_API_KEY: "sk_test" },
        fetch: async () => new Response("quota", { status: 429 }),
      }),
    (error: unknown) =>
      error instanceof ElevenLabsError && error.status === 502,
  );
});

test("live squat cues fire once per newly completed rep", () => {
  const analysis = analyzeExercise(
    "squat",
    demoFrames(),
    1000,
    1000,
    12,
    "synthetic",
  );
  const tracker = new LiveCoachTracker("squat");
  const first = tracker.update(analysis);
  assert.ok(first.length >= 1);
  assert.match(first[0].text, /^Rep 1\./);
  assert.deepEqual(tracker.update(analysis), []);
});
