import type { Metadata } from "next";
import Link from "next/link";
import { ButtonLink } from "@/components/ui/button";
import { auth0 } from "@/lib/auth0";
import { toPublicAuthUser } from "@/lib/auth-user";
import styles from "./welcome.module.css";

export const metadata: Metadata = {
  title: "Spotter — See your form the way a coach would",
  description:
    "Spotter reviews your reps on your own device, reflects them back in plain language, and lets you carry the receipts if you want.",
};

/**
 * Marketing landing page. Lives outside the (app) route group so it
 * renders without the app header/tab bar — this is the "front door,"
 * not another app tab. The judged squat-review flow at "/" is untouched.
 */
export default async function WelcomePage() {
  const session = await auth0.getSession();
  const user = toPublicAuthUser(session?.user);

  return (
    <div className={styles.page}>
      <nav className={styles.nav} aria-label="Site">
        <Link href="/welcome" className={styles.wordmark}>
          <span>SPOT</span>TER
        </Link>
        <div className={styles.navActions}>
          {user ? (
            <Link href="/profile" className={styles.navSignIn}>
              Account
            </Link>
          ) : (
            <>
              <Link href="/sign-in" className={styles.navSignIn}>
                Sign in
              </Link>
              <Link href="/sign-up" className={styles.navSignIn}>
                Create account
              </Link>
            </>
          )}
          <ButtonLink href={user ? "/" : "/sign-up"} variant="primary">
            {user ? "Open Spotter" : "Get started"}
          </ButtonLink>
        </div>
      </nav>

      <main>
        <section className={styles.hero}>
          <div className={styles.heroCopy}>
            <p className={styles.eyebrow}>LOCAL-FIRST MOVEMENT COACHING</p>
            <h1 className={styles.heroTitle}>
              See your form the way a coach would.
            </h1>
            <p className={styles.heroBody}>
              Spotter reviews your reps on your own device, reflects them
              back in plain language, and — if you want — lets you carry the
              receipts.
            </p>
            <div className={styles.heroActions}>
              <ButtonLink href={user ? "/" : "/sign-up"} variant="primary">
                {user ? "Open Spotter" : "Get started free"}
              </ButtonLink>
              {user ? (
                <Link href="/profile" className={styles.navSignIn}>
                  Account
                </Link>
              ) : (
                <Link href="/sign-in" className={styles.navSignIn}>
                  Sign in
                </Link>
              )}
            </div>
            <p className={styles.heroFinePrint}>
              Free to create an account. Your video never leaves your
              device.
            </p>
          </div>

          <div className={styles.heroPreview} aria-hidden="true">
            <div className={styles.previewCard}>
              <p className={styles.previewEyebrow}>THIS WEEK</p>
              <h2 className={styles.previewTitle}>Steady practice.</h2>
              <p className={styles.previewBody}>3 sessions logged, 1 to go.</p>
              <div className={styles.previewBar}>
                <div className={styles.previewBarFill} />
              </div>
              <div className={styles.previewChip}>
                <span className={styles.previewChipIcon} />
                <div>
                  <p className={styles.previewChipTitle}>Squat, reflected</p>
                  <p className={styles.previewChipBody}>
                    Good control, minor drift
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className={styles.features}>
          <div className={`${styles.featureCard} reveal`}>
            <svg
              className={styles.featureIcon}
              viewBox="0 0 40 40"
              width="40"
              height="40"
              fill="none"
              stroke="var(--focus-ring)"
              strokeWidth="2"
              aria-hidden="true"
            >
              <circle cx="20" cy="20" r="16" />
              <circle
                cx="20"
                cy="20"
                r="5"
                fill="var(--focus-ring)"
                stroke="none"
              />
            </svg>
            <h3 className={styles.featureTitle}>See every rep</h3>
            <p className={styles.featureBody}>
              On-device pose tracking breaks your set into reps and flags
              what to fix — without uploading a thing.
            </p>
          </div>

          <div
            className={`${styles.featureCard} reveal`}
            style={{ animationDelay: "0.08s" }}
          >
            <svg
              className={styles.featureIcon}
              viewBox="0 0 40 40"
              width="40"
              height="40"
              fill="none"
              aria-hidden="true"
            >
              <rect x="2" y="2" width="36" height="36" rx="10" fill="var(--rose)" />
              <path
                d="M9 24c4 0 4-10 8-10s4 10 8 10 4-8 8-8"
                stroke="var(--text-warning)"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
            <h3 className={styles.featureTitle}>Reflect, don’t just record</h3>
            <p className={styles.featureBody}>
              A short, honest reflection after every session — the pattern,
              not just the number.
            </p>
          </div>

          <div
            className={`${styles.featureCard} reveal`}
            style={{ animationDelay: "0.16s" }}
          >
            <svg
              className={styles.featureIcon}
              viewBox="0 0 40 40"
              width="40"
              height="40"
              fill="none"
              stroke="var(--illustration-stroke)"
              strokeWidth="2"
              aria-hidden="true"
            >
              <path d="M20 4v6M20 30v6M4 20h6M30 20h6" strokeLinecap="round" />
              <circle cx="20" cy="20" r="10" />
            </svg>
            <h3 className={styles.featureTitle}>Own your progress</h3>
            <p className={styles.featureBody}>
              Optional, verifiable workout receipts you control — never
              required to use Spotter.
            </p>
          </div>
        </section>

        <section className={`${styles.trustBand} reveal`}>
          <div className={styles.trustBandInner}>
            <h2 className={styles.trustTitle}>Local-first, always.</h2>
            <p className={styles.trustBody}>
              Your camera roll and your reps stay on your device unless you
              choose to sync. Your account identifies you — it never moves
              your video off this machine.
            </p>
          </div>
        </section>
      </main>
    </div>
  );
}
