import { competitionFeed } from "@/lib/competition-server";
export const runtime = "nodejs";
export async function GET() {
  try {
    return Response.json(await competitionFeed(), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    return Response.json(
      { error: "The competition directory is unavailable. Please try again." },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
