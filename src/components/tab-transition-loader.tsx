"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

/** Fade in, hold long enough for one beat of the destination loop, fade out. */
const ENTER_MS = 140;
const HOLD_MS = 500;
const EXIT_MS = 180;

type TabKey = "overview" | "analyze" | "replay" | "community" | "profile";
type Phase = "idle" | "in" | "out";

const TAB_ROOTS: Array<{ root: string; key: TabKey }> = [
  { root: "/analyze", key: "analyze" },
  { root: "/replay", key: "replay" },
  { root: "/social", key: "community" },
  { root: "/profile", key: "profile" },
];

const TAB_STATUS: Record<TabKey, string> = {
  overview: "Opening overview",
  analyze: "Opening analyze",
  replay: "Opening replay",
  community: "Opening community",
  profile: "Opening profile",
};

function getTabKey(pathname: string): TabKey {
  for (const { root, key } of TAB_ROOTS) {
    if (pathname === root || pathname.startsWith(`${root}/`)) return key;
  }
  return "overview";
}

/** Destination-specific motion, kept in the same geometric language as the
 * overview bar chart: compact, clay + focus-ring, one readable beat. */
function TabIcon({ tab }: { tab: TabKey }) {
  switch (tab) {
    case "analyze":
      return (
        <div className="tt-analyze" aria-hidden="true">
          <svg viewBox="0 0 48 48" width="48" height="48">
            <path
              className="tt-analyze-finder"
              d="M7 16V9h7M34 9h7v7M41 32v7h-7M14 39H7v-7"
            />
            <g className="tt-analyze-bones">
              <path d="M24 16v9M17.5 21h13M24 25l-6 11M24 25l6 11" />
            </g>
            <circle className="tt-analyze-lm tt-analyze-head" cx="24" cy="12" r="3.1" />
            <circle className="tt-analyze-lm" cx="17.5" cy="21" r="1.7" style={{ animationDelay: "0.12s" }} />
            <circle className="tt-analyze-lm" cx="30.5" cy="21" r="1.7" style={{ animationDelay: "0.12s" }} />
            <circle className="tt-analyze-lm" cx="24" cy="25" r="1.8" style={{ animationDelay: "0.24s" }} />
            <circle className="tt-analyze-lm" cx="18" cy="36" r="1.7" style={{ animationDelay: "0.36s" }} />
            <circle className="tt-analyze-lm" cx="30" cy="36" r="1.7" style={{ animationDelay: "0.36s" }} />
          </svg>
          <span className="tt-analyze-scan" />
        </div>
      );
    case "replay":
      return (
        <div className="tt-replay" aria-hidden="true">
          <svg viewBox="0 0 48 48" width="48" height="48">
            <ellipse
              className="tt-replay-ring"
              cx="24"
              cy="40"
              rx="16"
              ry="6"
            />
            <ellipse
              className="tt-replay-orbit"
              cx="24"
              cy="40"
              rx="16"
              ry="6"
            />
            <g className="tt-replay-figure">
              <circle cx="24" cy="11" r="4.2" />
              <path d="M24 16v12M16.5 22h15M24 28l-6.5 11M24 28l6.5 11" />
            </g>
          </svg>
        </div>
      );
    case "community":
      return (
        <div className="tt-people" aria-hidden="true">
          <span className="tt-person">
            <span className="tt-person-head" />
            <span className="tt-person-body" />
          </span>
          <span className="tt-person tt-person-lead">
            <span className="tt-person-head" />
            <span className="tt-person-body" />
          </span>
          <span className="tt-person">
            <span className="tt-person-head" />
            <span className="tt-person-body" />
          </span>
        </div>
      );
    case "profile":
      return (
        <div className="tt-avatar" aria-hidden="true">
          <svg viewBox="0 0 48 48" width="48" height="48">
            <circle className="tt-avatar-ring" cx="24" cy="24" r="18" />
            <circle className="tt-avatar-head" cx="24" cy="19" r="6.4" />
            <path
              className="tt-avatar-body"
              d="M13 37c2.4-7.2 6-10.5 11-10.5S32.6 29.8 35 37"
            />
          </svg>
        </div>
      );
    case "overview":
    default:
      return (
        <div className="tt-bars" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
      );
  }
}

/**
 * A brief themed overlay shown right after navigating between the app's
 * tabs. Next.js App Router navigations are typically near-instant once a
 * route is prefetched, so this isn't masking real load time — it's a
 * deliberate "beat" that ties the tab switch to FormChain's identity, with
 * a different, content-relevant animation for each destination.
 */
export default function TabTransitionLoader() {
  const pathname = usePathname();
  const previousPathname = useRef(pathname);
  const [phase, setPhase] = useState<Phase>("idle");
  const [tab, setTab] = useState<TabKey>(() => getTabKey(pathname));

  useEffect(() => {
    if (previousPathname.current === pathname) {
      return;
    }
    const nextTab = getTabKey(pathname);
    const previousTab = getTabKey(previousPathname.current);
    previousPathname.current = pathname;
    if (nextTab === previousTab) {
      return;
    }

    setTab(nextTab);
    setPhase("in");

    const exitTimer = setTimeout(() => setPhase("out"), ENTER_MS + HOLD_MS);
    const idleTimer = setTimeout(
      () => setPhase("idle"),
      ENTER_MS + HOLD_MS + EXIT_MS,
    );
    return () => {
      clearTimeout(exitTimer);
      clearTimeout(idleTimer);
    };
  }, [pathname]);

  if (phase === "idle") {
    return null;
  }

  return (
    <div
      className="tab-transition-overlay"
      data-phase={phase}
      data-tab={tab}
      role="status"
      aria-live="polite"
      aria-label={TAB_STATUS[tab]}
    >
      <div className="tab-transition-panel">
        <div className="tab-transition-icon">
          <TabIcon tab={tab} />
        </div>
        <p className="tab-transition-word">
          <span>FORM</span>CHAIN
        </p>
      </div>
    </div>
  );
}
