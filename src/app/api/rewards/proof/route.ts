export async function GET() {
  return Response.json(
    { configured: false },
    { headers: { "Cache-Control": "no-store" } },
  );
}
export async function POST() {
  return Response.json(
    { error: "Server demo signing has been removed. Connect your own wallet." },
    { status: 410 },
  );
}
