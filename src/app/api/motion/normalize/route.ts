import { z } from "zod";
import {
  customMotionInput,
  motionNormalizeModels,
} from "@/lib/motion-prompts";
import { normalizeMotionSpec } from "@/lib/motion-normalize";
import { requireSession } from "@/lib/require-session";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function GET() {
  return Response.json(
    {
      configured: Boolean(process.env.GEMINI_API_KEY),
      models: motionNormalizeModels(),
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
      if (size > 4_096) {
        await reader.cancel();
        return Response.json(
          { error: "Move description exceeds the 4 KB request limit." },
          { status: 413 },
        );
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  let input: z.infer<typeof customMotionInput>;
  try {
    input = customMotionInput.parse(
      JSON.parse(Buffer.concat(chunks).toString("utf8")),
    );
  } catch {
    return Response.json(
      {
        error:
          "Enter a move name (2–80 characters) and description (8–500 characters).",
      },
      { status: 400 },
    );
  }

  const result = await normalizeMotionSpec(input);
  return Response.json(result, { headers: { "Cache-Control": "no-store" } });
}
