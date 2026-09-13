import { GoogleGenAI } from "@google/genai";
import { z } from "zod";
import {
  buildCoachingPrompt,
  coachingInput,
  coachingSchema,
} from "@/lib/coaching";
import { requireSession } from "@/lib/require-session";

export const runtime = "nodejs";
export const maxDuration = 60;
export async function GET() {
  return Response.json(
    {
      configured: Boolean(
        process.env.GEMINI_API_KEY && process.env.GEMINI_MODEL,
      ),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
export async function POST(request: Request) {
  // This handler calls Gemini on the tenant's API key, so it is gated.
  const unauthorized = await requireSession();
  if (unauthorized) return unauthorized;

  // Read with a hard limit, including requests that omit Content-Length.
  const reader = request.body?.getReader();
  if (!reader)
    return Response.json(
      { error: "A JSON body is required." },
      { status: 400 },
    );
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 2_000_000) {
        await reader.cancel();
        return Response.json(
          { error: "Keyframes exceed the 2 MB request limit." },
          { status: 413 },
        );
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  let input: z.infer<typeof coachingInput>;
  try {
    input = coachingInput.parse(
      JSON.parse(Buffer.concat(chunks).toString("utf8")),
    );
  } catch {
    return Response.json(
      { error: "Invalid coaching request. Analyze a clip again." },
      { status: 400 },
    );
  }
  const apiKey = process.env.GEMINI_API_KEY,
    model = process.env.GEMINI_MODEL;
  if (!apiKey || !model)
    return Response.json(
      {
        error:
          "Gemini is not configured. Local measurements remain available. Set GEMINI_API_KEY and GEMINI_MODEL in .env.local.",
      },
      { status: 503 },
    );
  try {
    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateContent({
      model,
      contents: [
        {
          role: "user",
          parts: [
            {
              text: buildCoachingPrompt(input),
            },
            ...input.keyframes.flatMap((f) => [
              {
                text: `${f.label} at ${f.time.toFixed(2)} seconds. Study the body position in this frame. The label is only a clock, not a form verdict.`,
              },
              {
                inlineData: {
                  mimeType: "image/jpeg",
                  data: f.image.split(",")[1],
                },
              },
            ]),
          ],
        },
      ],
      config: {
        httpOptions: { timeout: 45000 },
        temperature: 0.55,
        responseMimeType: "application/json",
        responseJsonSchema: z.toJSONSchema(coachingSchema),
      },
    });
    const parsed = coachingSchema.safeParse(JSON.parse(response.text ?? "{}"));
    if (
      !parsed.success ||
      parsed.data.cues.some((c) => c.timestamp > input.duration)
    )
      throw new Error("Invalid output");
    return Response.json(parsed.data, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    console.error(
      "Gemini coaching failed:",
      error instanceof Error ? error.message : "Unknown provider error",
    );
    return Response.json(
      {
        error:
          "Gemini could not complete this review. Local results are intact; check your model access and quota, then retry.",
      },
      { status: 502 },
    );
  }
}
