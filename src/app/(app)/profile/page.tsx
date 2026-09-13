import type { Metadata } from "next";
import ProfileWorkspace from "@/components/profile-workspace";
import { auth0 } from "@/lib/auth0";
import { toPublicAuthUser } from "@/lib/auth-user";

export const metadata: Metadata = { title: "Profile — Spotter" };

export default async function ProfilePage() {
  const session = await auth0.getSession();
  return <ProfileWorkspace user={toPublicAuthUser(session?.user)} />;
}
