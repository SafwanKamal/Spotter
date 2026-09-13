import "server-only";
import { auth0 } from "@/lib/auth0";
import { isAuthBypassed } from "@/lib/auth-bypass";

/**
 * Guard for route handlers that spend money on a third-party API
 * (Gemini coaching, joint coach, ElevenLabs speech, custom Kimodo prompts). The page gate in
 * `src/app/(app)/layout.tsx` only protects the UI — these endpoints are
 * reachable directly by URL, so without this check anyone who finds a
 * deployed instance can bill the tenant's API keys.
 *
 * Returns a 401 Response to bail out with, or null when the caller has a
 * valid session.
 */
export async function requireSession(): Promise<Response | null> {
  // Development-only escape hatch; see src/lib/auth-bypass.ts.
  if (isAuthBypassed()) return null;

  const session = await auth0.getSession();
  if (!session?.user) {
    return Response.json(
      { error: "Sign in to use this endpoint." },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
  }
  return null;
}
