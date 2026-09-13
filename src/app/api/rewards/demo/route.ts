export async function GET() {
  return Response.json(
    { error: "Demo rewards have been removed." },
    { status: 410 },
  );
}
export const POST = GET;
