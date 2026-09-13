import type { Metadata } from "next";
import { AuthStart } from "@/components/auth-start";
import { auth0 } from "@/lib/auth0";
import { toPublicAuthUser } from "@/lib/auth-user";

export const metadata: Metadata = {
  title: "Create account — FormChain",
};

export default async function SignUpPage() {
  const session = await auth0.getSession();
  return <AuthStart mode="signup" user={toPublicAuthUser(session?.user)} />;
}
