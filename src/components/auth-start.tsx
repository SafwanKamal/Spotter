import Link from "next/link";
import { ButtonLink } from "@/components/ui/button";
import { authDisplayName, type PublicAuthUser } from "@/lib/auth-user";
import styles from "@/app/sign-in/sign-in.module.css";

type AuthMode = "login" | "signup";

const copy = {
  login: {
    eyebrow: "WELCOME BACK",
    title: "Sign in to Spotter",
    subtitle:
      "Sign in to open your movement lab. Your workout video is analysed on this device and never uploaded.",
    action: "Continue with Auth0",
    switchPrompt: "Don’t have an account?",
    switchHref: "/sign-up",
    switchLabel: "Create one",
  },
  signup: {
    eyebrow: "GET STARTED",
    title: "Create your Spotter account",
    subtitle:
      "You’ll finish creating the account with Auth0. Your workout video is still analysed on this device and never uploaded.",
    action: "Sign up with Auth0",
    switchPrompt: "Already have an account?",
    switchHref: "/sign-in",
    switchLabel: "Sign in",
  },
} as const;

function LockIcon() {
  return (
    <svg
      viewBox="0 0 20 20"
      width="16"
      height="16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      aria-hidden="true"
    >
      <rect x="4" y="9" width="12" height="8" rx="2" />
      <path d="M7 9V6a3 3 0 0 1 6 0v3" strokeLinecap="round" />
    </svg>
  );
}

/**
 * Start of the hosted-login flow, shared by /sign-in and /sign-up.
 *
 * There is deliberately no email or password field here. Credentials are
 * collected by Auth0 Universal Login on Auth0's own domain — a local form
 * could only forward what was typed as a `login_hint`, which duplicates
 * the one real action and adds a way to fail: the SDK forwards every
 * query parameter except `returnTo` straight to `/authorize`, so an
 * empty field submits `login_hint=` and the tenant rejects the request.
 * One button, one path.
 */
export function AuthStart({
  mode,
  user,
}: {
  mode: AuthMode;
  user: PublicAuthUser | null;
}) {
  const text = copy[mode];
  // A plain anchor, not next/link: /auth/login is served by the Auth0
  // proxy rather than the App Router, so a client-side navigation would
  // never reach it.
  const loginHref =
    mode === "signup"
      ? "/auth/login?screen_hint=signup&returnTo=%2F"
      : "/auth/login?returnTo=%2F";

  return (
    <div className={styles.page}>
      <div className={styles.nav}>
        <Link href="/welcome" className={styles.wordmark}>
          <span>SPOT</span>TER
        </Link>
      </div>

      <main className={styles.main}>
        <div className={styles.card}>
          {user ? (
            <>
              <p className={styles.eyebrow}>SIGNED IN</p>
              <h1 className={styles.title}>You’re already in.</h1>
              <p className={styles.subtitle}>
                Signed in as {authDisplayName(user)}.
              </p>
              <ButtonLink href="/" variant="primary" className={styles.submit}>
                Continue to Spotter
              </ButtonLink>
              <p className={styles.footNote}>
                <a href="/auth/logout">Sign out</a>
              </p>
            </>
          ) : (
            <>
              <p className={styles.eyebrow}>{text.eyebrow}</p>
              <h1 className={styles.title}>{text.title}</h1>
              <p className={styles.subtitle}>{text.subtitle}</p>

              <a href={loginHref} className={`button primary ${styles.submit}`}>
                <LockIcon />
                {text.action}
              </a>

              <p className={styles.footNote}>
                {text.switchPrompt}{" "}
                <Link href={text.switchHref} className={styles.linklike}>
                  {text.switchLabel}
                </Link>
              </p>
              <p className={styles.footNote}>
                <Link href="/welcome">← Back to the overview</Link>
              </p>
            </>
          )}
        </div>
      </main>

      <p className={styles.disclosure}>
        Signing in uses Auth0. Your workout video still stays on this device.
      </p>
    </div>
  );
}
