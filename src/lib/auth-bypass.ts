import "server-only";
import type { User } from "@auth0/nextjs-auth0/types";

/**
 * Development-only escape hatch from the Auth0 gate.
 *
 * Set AUTH_DISABLED=true in .env.local and every route under
 * `src/app/(app)` renders, and the gated API handlers answer, as if a
 * user were signed in. This exists so agents and teammates can build and
 * exercise the product without a round trip through Universal Login.
 *
 * Two deliberate safety properties:
 *
 *  1. It is inert in a production build. `next build` / `next start` set
 *     NODE_ENV=production, so a stray AUTH_DISABLED in a deployed
 *     environment does nothing. Turning the bypass on in production would
 *     take a deliberate code change, not a config mistake.
 *  2. AUTH_DISABLED is not NEXT_PUBLIC_, so it is never inlined into the
 *     client bundle and cannot be flipped from the browser.
 *
 * Remove the flag from .env.local when the auth work resumes; the header
 * carries a banner the whole time it is on so it is hard to forget.
 */
export function isAuthBypassed(): boolean {
  if (process.env.NODE_ENV === "production") return false;
  return process.env.AUTH_DISABLED === "true";
}

/** Stand-in identity used while the bypass is active. */
export const BYPASS_USER: User = {
  sub: "dev|auth-disabled",
  name: "Dev Mode",
  email: "dev@localhost",
  email_verified: true,
};
