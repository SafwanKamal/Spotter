import { z } from "zod";
import { readBoundedJson } from "@/lib/reward-server";
import { participationStore, rewardUser } from "@/lib/participation-server";
export const runtime = "nodejs";
export async function POST(request: Request) {
  const user = await rewardUser();
  if (!user)
    return Response.json(
      { error: "Sign in to collect points." },
      { status: 401 },
    );
  if (
    request.headers.get("origin") &&
    request.headers.get("origin") !== new URL(request.url).origin
  )
    return Response.json({ error: "Invalid origin." }, { status: 403 });
  const store = participationStore();
  try {
    const result = store.claim(
      user.id,
      user.name,
      await readBoundedJson(request),
    );
    return Response.json(
      { ...result, history: store.history(user.id) },
      {
        status: result.alreadyClaimed ? 200 : 201,
        headers: { "Cache-Control": "no-store" },
      },
    );
  } catch (e) {
    return Response.json(
      {
        error:
          e instanceof z.ZodError
            ? "Use a live camera session with complete repetitions and at least 75% tracking coverage."
            : e instanceof RangeError
              ? "Request is too large."
              : e instanceof Error
                ? e.message
                : "Unable to collect points.",
      },
      {
        status:
          e instanceof RangeError ? 413 : e instanceof z.ZodError ? 400 : 429,
      },
    );
  } finally {
    store.db.close();
  }
}
