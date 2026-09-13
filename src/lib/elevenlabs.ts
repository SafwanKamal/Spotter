import { z } from "zod";

import { SPEAK_TEXT_MAX } from "@/lib/coach-voice";

// A widely-used ElevenLabs premade voice ("Brian" — calm, grounded, reads
// well as an in-person coach). Only used when the account owner has not
// picked their own voice via ELEVENLABS_VOICE_ID.
export const DEFAULT_VOICE_ID = "nPczCjzI2devNBz1zQrb";
// eleven_flash_v2_5 is ElevenLabs' lowest-latency model, which matters here:
// a coaching cue is only useful if it lands within a second or two of the
// rep or hold-form event that triggered it, not after the moment has passed.
export const DEFAULT_MODEL_ID = "eleven_flash_v2_5";

export const speakInput = z.object({
  // Live cues stay short; post-set joint reviews may use the full budget.
  // Never arbitrary free-form user chat, but still capped for the TTS route.
  text: z.string().trim().min(1).max(SPEAK_TEXT_MAX),
});

export type SpeakEnv = {
  ELEVENLABS_API_KEY?: string | undefined;
  ELEVENLABS_VOICE_ID?: string | undefined;
};

function processSpeakEnv(): SpeakEnv {
  return {
    ELEVENLABS_API_KEY: process.env.ELEVENLABS_API_KEY,
    ELEVENLABS_VOICE_ID: process.env.ELEVENLABS_VOICE_ID,
  };
}

export function isElevenLabsConfigured(env: SpeakEnv = processSpeakEnv()) {
  return Boolean(env.ELEVENLABS_API_KEY?.trim());
}

export function elevenLabsVoiceId(env: SpeakEnv = processSpeakEnv()) {
  return env.ELEVENLABS_VOICE_ID?.trim() || DEFAULT_VOICE_ID;
}

export type ElevenLabsSpeechRequest = {
  url: string;
  headers: { "Content-Type": string; Accept: string; "xi-api-key": string };
  body: string;
};

export function buildElevenLabsSpeechRequest(
  text: string,
  env: SpeakEnv = processSpeakEnv(),
): ElevenLabsSpeechRequest | null {
  const apiKey = env.ELEVENLABS_API_KEY?.trim();
  if (!apiKey) return null;
  const voiceId = elevenLabsVoiceId(env);
  return {
    url: `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}/stream?output_format=mp3_44100_64`,
    headers: {
      "Content-Type": "application/json",
      Accept: "audio/mpeg",
      "xi-api-key": apiKey,
    },
    body: JSON.stringify({
      text,
      model_id: DEFAULT_MODEL_ID,
      voice_settings: { stability: 0.5, similarity_boost: 0.75 },
    }),
  };
}

export class ElevenLabsError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "ElevenLabsError";
  }
}

type SpeakFetch = typeof fetch;

export async function synthesizeSpeech(
  text: string,
  options: {
    env?: SpeakEnv;
    fetch?: SpeakFetch;
    signal?: AbortSignal;
  } = {},
): Promise<{ stream: ReadableStream<Uint8Array>; contentType: string }> {
  const request = buildElevenLabsSpeechRequest(text, options.env ?? processSpeakEnv());
  if (!request) {
    throw new ElevenLabsError(
      "Live coaching voice is not configured. Text cues remain available. Set ELEVENLABS_API_KEY in .env.local.",
      503,
    );
  }
  const response = await (options.fetch ?? fetch)(request.url, {
    method: "POST",
    headers: request.headers,
    body: request.body,
    signal: options.signal ?? AbortSignal.timeout(20000),
  });
  if (!response.ok || !response.body) {
    console.error(
      "ElevenLabs speech failed:",
      response.status,
      await response.text().catch(() => ""),
    );
    throw new ElevenLabsError("Could not generate speech for this cue.", 502);
  }
  return {
    stream: response.body,
    contentType: response.headers.get("Content-Type") || "audio/mpeg",
  };
}
