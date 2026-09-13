import {
  buildKimodoMeta,
  ensureMotionSpec,
  isMotionPresetId,
  listMotionPresets,
  presetSpec,
  type MotionPresetId,
  type MotionSpec,
} from "@/lib/motion-prompts";
import { motionRequest, snapMotionDuration } from "@/lib/motion";
import {
  listCachedMotions,
  motionAvailable,
  motionCacheKey,
  readCachedMotion,
} from "@/lib/motion-cache";
import { motionConfigured, worker, workerHealth } from "@/lib/motion-server";
import { requireSession } from "@/lib/require-session";

export async function GET() {
  const health = motionConfigured() ? await workerHealth() : null;
  return Response.json(
    {
      configured: motionAvailable(motionConfigured()),
      worker: motionConfigured(),
      workerSupportsStructured: Boolean(health?.supportsStructured),
      cached: listCachedMotions(),
      presets: listMotionPresets(),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function POST(request: Request) {
  // Bounded JSON only: generation receives no private video or image data.
  const reader = request.body?.getReader();
  if (!reader)
    return Response.json({ error: "Missing request" }, { status: 400 });
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > 8_192) {
      await reader.cancel();
      return Response.json({ error: "Request too large" }, { status: 413 });
    }
    chunks.push(value);
  }
  try {
    const parsed = motionRequest.parse(
      JSON.parse(Buffer.concat(chunks).toString("utf8")),
    );
    const duration = snapMotionDuration(parsed.duration);

    let spec: MotionSpec;
    let presetId: MotionPresetId | undefined;
    if (parsed.variant && isMotionPresetId(parsed.variant)) {
      presetId = parsed.variant;
      spec = presetSpec(parsed.variant);
    } else if (parsed.spec) {
      spec = ensureMotionSpec(parsed.spec);
    } else if (parsed.custom) {
      const unauthorized = await requireSession();
      if (unauthorized) return unauthorized;
      const { normalizeMotionSpec } = await import("@/lib/motion-normalize");
      const result = await normalizeMotionSpec(parsed.custom);
      spec = result.spec;
    } else {
      return Response.json(
        { error: "Choose a move or enter a custom description." },
        { status: 400 },
      );
    }

    const cacheId = motionCacheKey(spec, presetId);
    const exact = readCachedMotion(cacheId, duration, { fallback: false });
    if (exact)
      return Response.json(
        {
          status: "complete",
          id: exact.id,
          bvh: exact.bvh,
          model: exact.model,
          cached: true,
          name: spec.name,
        },
        { headers: { "Cache-Control": "no-store" } },
      );

    const payload = {
      duration,
      cacheKey: cacheId,
      variant: presetId,
      meta: buildKimodoMeta(spec, duration),
    };

    if (motionConfigured()) return await worker("/jobs", payload);

    const nearest = readCachedMotion(cacheId, duration);
    if (nearest)
      return Response.json(
        {
          status: "complete",
          id: nearest.id,
          bvh: nearest.bvh,
          model: nearest.model,
          cached: true,
          name: spec.name,
        },
        { headers: { "Cache-Control": "no-store" } },
      );
    return Response.json(
      { error: "The Kimodo worker is not connected yet." },
      { status: 503 },
    );
  } catch {
    return Response.json(
      {
        error:
          "Choose a move preset or a custom name and description, with a duration between 2 and 8 seconds.",
      },
      { status: 400 },
    );
  }
}
