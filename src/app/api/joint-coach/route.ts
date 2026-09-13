import { GoogleGenAI } from "@google/genai";
import { z } from "zod";
import {
  buildJointCoachPrompt,
  jointCoachInput,
  jointCoachModel,
  jointCoachModels,
  jointCoachSchema,
} from "@/lib/joint-coach";
import { requireSession } from "@/lib/require-session";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function GET() {
  return Response.json(
    {
      configured: Boolean(process.env.GEMINI_API_KEY),
      model: jointCoachModel(),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function POST(request: Request) {
  const unauthorized = await requireSession();
  if (unauthorized) return unauthorized;

  const reader = request.body?.getReader();
  if (!reader)
    return Response.json({ error: "A JSON body is required." }, { status: 400 });
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 16_384) {
        await reader.cancel();
        return Response.json(
          { error: "Joint summary exceeds the 16 KB request limit." },
          { status: 413 },
        );
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  let input: z.infer<typeof jointCoachInput>;
  try {
    input = jointCoachInput.parse(
      JSON.parse(Buffer.concat(chunks).toString("utf8")),
    );
  } catch {
    return Response.json(
      { error: "Invalid joint coaching request. Analyze a clip again." },
      { status: 400 },
    );
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey)
    return Response.json(
      {
        error:
          "Gemini is not configured. Local joint measurements remain available. Set GEMINI_API_KEY in .env.local.",
      },
      { status: 503 },
    );

  try {
    const ai = new GoogleGenAI({ apiKey });
    let parsed: z.infer<typeof jointCoachSchema> | null = null;
    let lastError = "Invalid output";
    for (const model of jointCoachModels()) {
      try {
        const response = await ai.models.generateContent({
          model,
          contents: [
            { role: "user", parts: [{ text: buildJointCoachPrompt(input) }] },
          ],
          config: {
            httpOptions: { timeout: 25000 },
            temperature: 0.4,
            responseMimeType: "application/json",
            responseJsonSchema: z.toJSONSchema(jointCoachSchema),
          },
        });
        const candidate = jointCoachSchema.safeParse(
          JSON.parse(response.text ?? "{}"),
        );
        if (candidate.success) {
          parsed = candidate.data;
          break;
        }
        lastError = "Invalid output";
      } catch (error) {
        lastError =
          error instanceof Error ? error.message : "Unknown provider error";
      }
    }
    if (!parsed) throw new Error(lastError);
    return Response.json(parsed, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    console.error(
      "Joint coaching failed:",
      error instanceof Error ? error.message : "Unknown provider error",
    );
    return Response.json(
      {
        error:
          "The joint coach could not finish this review. Your local tracking is intact; check Gemini access and retry.",
      },
      { status: 502 },
    );
  }
}
