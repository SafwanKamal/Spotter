import { worker } from "@/lib/motion-server";
import { z } from "zod";
export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  if (!z.string().uuid().safeParse(id).success)
    return Response.json({ error: "Invalid motion ID" }, { status: 400 });
  return worker("/jobs/" + id);
}
