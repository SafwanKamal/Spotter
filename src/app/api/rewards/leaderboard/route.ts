import { participationStore, rewardUser } from "@/lib/participation-server";
import { z } from "zod";
export const runtime = "nodejs";
const querySchema = z.object({
  period: z.enum(["week", "month", "all"]).default("week"),
  exercise: z
    .enum(["all", "squat", "pushup", "lunge", "deadlift", "plank"])
    .default("all"),
  search: z.string().max(60).default(""),
  page: z.coerce.number().int().min(1).max(10000).default(1),
});
export async function GET(request: Request) {
  const parsed = querySchema.safeParse(
    Object.fromEntries(new URL(request.url).searchParams),
  );
  if (!parsed.success)
    return Response.json(
      { error: "Invalid leaderboard filters." },
      { status: 400 },
    );
  const user = await rewardUser();
  const store = participationStore();
  try {
    return Response.json(
      {
        ...store.board(user?.id ?? null, parsed.data),
        history: user ? store.history(user.id) : [],
        signedIn: Boolean(user),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } finally {
    store.db.close();
  }
}
