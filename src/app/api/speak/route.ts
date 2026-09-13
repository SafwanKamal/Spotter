import { ElevenLabsError, isElevenLabsConfigured, speakInput, synthesizeSpeech } from "@/lib/elevenlabs";
import { requireSession } from "@/lib/require-session";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function GET() {
  return Response.json(
    { configured: isElevenLabsConfigured() },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function POST(request: Request) {
  // This handler calls ElevenLabs on the tenant's API key, so it is gated.
  const unauthorized = await requireSession();
  if (unauthorized) return unauthorized;

  let input: { text: string };
  try {
    input = speakInput.parse(await request.json());
  } catch {
    return Response.json(
      { error: "A short 'text' string is required." },
      { status: 400 },
    );
  }
  try {
    const speech = await synthesizeSpeech(input.text, {
      signal: AbortSignal.any([
        request.signal,
        AbortSignal.timeout(20000),
      ]),
    });
    return new Response(speech.stream, {
      headers: {
        "Content-Type": speech.contentType,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    if (error instanceof ElevenLabsError) {
      return Response.json(
        { error: error.message },
        { status: error.status },
      );
    }
    console.error(
      "ElevenLabs speech failed:",
      error instanceof Error ? error.message : "Unknown provider error",
    );
    return Response.json(
      { error: "Could not generate speech for this cue." },
      { status: 502 },
    );
  }
}
