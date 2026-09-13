import { GoogleGenAI } from "@google/genai";
import { z } from "zod";
import {
  buildMotionNormalizePrompt,
  ensureMotionSpec,
  fallbackMotionSpec,
  motionNormalizeModels,
  motionSpecSchema,
  type CustomMotionInput,
  type MotionSpec,
} from "./motion-prompts";

export async function normalizeMotionSpec(
  input: CustomMotionInput,
): Promise<{ spec: MotionSpec; source: "gemini" | "fallback"; warning?: string }> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return {
      spec: fallbackMotionSpec(input),
      source: "fallback",
      warning:
        "Gemini is not configured, so a local prompt template was used. Set GEMINI_API_KEY for better normalization.",
    };
  }

  try {
    const ai = new GoogleGenAI({ apiKey });
    let parsed: MotionSpec | null = null;
    let lastError = "Invalid output";
    for (const model of motionNormalizeModels()) {
      try {
        const response = await ai.models.generateContent({
          model,
          contents: [
            {
              role: "user",
              parts: [{ text: buildMotionNormalizePrompt(input) }],
            },
          ],
          config: {
            httpOptions: { timeout: 25000 },
            temperature: 0.35,
            responseMimeType: "application/json",
            responseJsonSchema: z.toJSONSchema(motionSpecSchema),
          },
        });
        parsed = ensureMotionSpec(JSON.parse(response.text ?? "{}"));
        break;
      } catch (error) {
        lastError =
          error instanceof Error ? error.message : "Unknown provider error";
      }
    }
    if (!parsed) throw new Error(lastError);
    return { spec: parsed, source: "gemini" };
  } catch (error) {
    console.error(
      "Motion normalize failed:",
      error instanceof Error ? error.message : "Unknown provider error",
    );
    return {
      spec: fallbackMotionSpec(input),
      source: "fallback",
      warning:
        "Gemini could not normalize this move, so a local prompt template was used.",
    };
  }
}
