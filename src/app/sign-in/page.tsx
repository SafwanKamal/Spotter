import type { Metadata } from "next";
import { AuthStart } from "@/components/auth-start";
import { auth0 } from "@/lib/auth0";
import { toPublicAuthUser } from "@/lib/auth-user";

export const metadata: Metadata = {
  title: "Sign in — FormChain",
};

export default async function SignInPage() {
  const session = await auth0.getSession();
  return <AuthStart mode="login" user={toPublicAuthUser(session?.user)} />;
}
