import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { AnalysisSessionProvider } from "@/components/analysis-session";
import SiteShell from "@/components/site-shell";
import { auth0 } from "@/lib/auth0";
import { BYPASS_USER, isAuthBypassed } from "@/lib/auth-bypass";
import { toPublicAuthUser } from "@/lib/auth-user";

/**
 * Layout for the core app experience (Overview, Analyze, Replay,
 * Community, Profile). Kept separate from the root layout so the
 * marketing landing page and the sign-in screens — which live outside
 * this route group — render without the app header/tab bar/session
 * context.
 *
 * This is also the authentication gate for the whole product surface.
 * Every route in this group requires a session; signed-out visitors are
 * sent to the marketing page at /welcome, which is the front door. The
 * check lives here rather than in `src/proxy.ts` so that it holds for
 * any route added to this group later without anyone having to remember
 * to extend a matcher.
 *
 * See `src/lib/auth-bypass.ts` for the development-only AUTH_DISABLED
 * escape hatch.
 */
export default async function AppLayout({ children }: { children: ReactNode }) {
  const session = await auth0.getSession();
  const bypassed = isAuthBypassed();
  const user = session?.user ?? (bypassed ? BYPASS_USER : null);

  if (!user) {
    redirect("/welcome");
  }

  return (
    <AnalysisSessionProvider>
      <SiteShell
        user={toPublicAuthUser(user)}
        authBypassed={bypassed && !session?.user}
      >
        {children}
      </SiteShell>
    </AnalysisSessionProvider>
  );
}
