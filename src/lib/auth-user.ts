import type { User } from "@auth0/nextjs-auth0/types";

export type PublicAuthUser = {
  name: string | null;
  email: string | null;
};

export function toPublicAuthUser(
  user: User | null | undefined,
): PublicAuthUser | null {
  if (!user) return null;
  return {
    name: user.name ?? user.nickname ?? null,
    email: user.email ?? null,
  };
}

export function authDisplayName(user: PublicAuthUser) {
  return user.name || user.email || "Account";
}
