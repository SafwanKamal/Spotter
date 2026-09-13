import { motionResponse } from "./motion";

export const motionConfigured = () =>
  Boolean(process.env.KIMODO_URL && process.env.KIMODO_API_TOKEN);

async function readWorkerBody(response: Response, limit = 2_500_000) {
  const reader = response.body?.getReader();
  if (!reader) return "";
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > limit) {
      await reader.cancel();
      throw new Error("Oversize response");
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString("utf8");
}

function workerErrorMessage(status: number, body: string) {
  try {
    const parsed = JSON.parse(body) as { error?: unknown };
    if (typeof parsed.error === "string" && parsed.error.trim()) {
      if (status === 400 && /invalid/i.test(parsed.error)) {
        return "The Kimodo worker rejected this move. Redeploy the updated worker so it accepts structured meta.json prompts.";
      }
      return parsed.error.slice(0, 300);
    }
  } catch {
    // Fall through to status-based copy.
  }
  if (status === 429)
    return "Worker busy. Try again after the current generation completes.";
  if (status === 401) return "The Kimodo worker rejected the API token.";
  if (status === 503)
    return "Install and verify kimodo_gen on the worker host first.";
  return "The motion worker could not accept this request. Check its availability.";
}

export async function workerHealth() {
  if (!motionConfigured()) return null;
  try {
    const response = await fetch(
      process.env.KIMODO_URL!.replace(/\/$/, "") + "/health",
      {
        headers: {
          Authorization: "Bearer " + process.env.KIMODO_API_TOKEN,
        },
        signal: AbortSignal.timeout(5000),
        cache: "no-store",
      },
    );
    if (!response.ok) return { supportsStructured: false };
    const raw = await readWorkerBody(response, 64_000);
    const parsed = JSON.parse(raw || "{}") as {
      input?: unknown;
      modelLoaded?: unknown;
    };
    return {
      supportsStructured:
        typeof parsed.input === "string" &&
        parsed.input.toLowerCase().includes("meta.json"),
      modelLoaded: Boolean(parsed.modelLoaded),
    };
  } catch {
    return { supportsStructured: false };
  }
}

export async function worker(path: string, body?: unknown) {
  if (!motionConfigured())
    return Response.json(
      { error: "The Kimodo worker is not connected yet." },
      { status: 503 },
    );
  try {
    const response = await fetch(
      process.env.KIMODO_URL!.replace(/\/$/, "") + path,
      {
        method: body ? "POST" : "GET",
        headers: {
          Authorization: "Bearer " + process.env.KIMODO_API_TOKEN,
          "Content-Type": "application/json",
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(10000),
        cache: "no-store",
      },
    );
    const raw = await readWorkerBody(response);
    if (!response.ok)
      return Response.json(
        { error: workerErrorMessage(response.status, raw) },
        { status: response.status === 429 ? 429 : 502 },
      );
    const data = motionResponse.parse(JSON.parse(raw || "{}"));
    return Response.json(data, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error(
      "Kimodo worker proxy failed:",
      error instanceof Error ? error.message : "Unknown error",
    );
    return Response.json(
      {
        error:
          "The motion worker is unavailable or returned an invalid result. Your workout review is unchanged.",
      },
      { status: 502 },
    );
  }
}
