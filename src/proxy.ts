import { auth0 } from "@/lib/auth0";

/**
 * Next.js 16 network-interception boundary (the successor to
 * `middleware.ts`). This is what actually mounts the Auth0 routes —
 * `/auth/login`, `/auth/callback`, `/auth/logout`, `/auth/profile` and
 * `/auth/access-token`. Without this file those paths 404 and every
 * sign-in button is a dead link, so it is required, not optional.
 *
 * It also refreshes the rolling session cookie on ordinary page
 * requests, which is why the matcher is broad rather than scoped to
 * `/auth/*`. Route protection itself lives in `src/app/(app)/layout.tsx`,
 * which redirects signed-out visitors to the marketing page.
 */
export async function proxy(request: Request) {
  return await auth0.middleware(request);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt).*)",
  ],
};
