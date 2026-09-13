"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import MobileTabBar from "@/components/mobile-tab-bar";
import TabTransitionLoader from "@/components/tab-transition-loader";
import CompetitionPanel from "@/components/competition-panel";
import { CompetitionProvider } from "@/components/competition-provider";

import { navigation, isRouteActive } from "@/lib/navigation";
import { authDisplayName, type PublicAuthUser } from "@/lib/auth-user";

export default function SiteShell({
  children,
  user,
  authBypassed = false,
}: {
  children: ReactNode;
  user: PublicAuthUser | null;
  /** True while AUTH_DISABLED is standing in for a real session. */
  authBypassed?: boolean;
}) {
  const pathname = usePathname();
  const isCommunity = pathname === "/social" || pathname.startsWith("/social/");
  const needsCompetitions =
    isCommunity || pathname.startsWith("/profile/competitions/");
  const content = (
    <main id="main-content" className="app-main">
      {children}
    </main>
  );

  return (
    <>
      <a className="skip-link" href="#main-content">
        Skip to main content
      </a>
      {authBypassed ? (
        <p className="auth-bypass-banner" role="status">
          Auth is disabled for local development (AUTH_DISABLED=true). Remove it
          from .env.local to restore the sign-in gate.
        </p>
      ) : null}
      <header className={isCommunity ? "site-header site-header-wide" : "site-header"}>
        <Link className="wordmark" href="/" aria-label="Spotter home">
          <span>SPOT</span>TER
        </Link>
        <nav aria-label="Primary navigation">
          {navigation.map(({ href, label }) => {
            const active = isRouteActive(pathname, href);
            return (
              <Link
                key={href}
                href={href}
                className={active ? "active" : undefined}
                aria-current={active ? "page" : undefined}
              >
                {label}
              </Link>
            );
          })}
        </nav>
        <div className="header-meta">
          {user ? (
            <>
              <Link className="account-link" href="/profile">
                {authDisplayName(user)}
              </Link>
              {/*
                A plain anchor, not next/link: /auth/logout is served by the
                Auth0 proxy, not the App Router, so a client-side navigation
                would never reach it.
              */}
              <a className="account-link" href="/auth/logout">
                Sign out
              </a>
            </>
          ) : (
            <Link className="account-link" href="/sign-in">
              Sign in
            </Link>
          )}
        </div>
      </header>
      {needsCompetitions ? (
        <CompetitionProvider>
          <div className={isCommunity ? "competition-app-layout" : undefined}>
            {isCommunity ? <CompetitionPanel /> : null}
            {content}
          </div>
        </CompetitionProvider>
      ) : (
        content
      )}
      <TabTransitionLoader />
      <MobileTabBar />
    </>
  );
}
