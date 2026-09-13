import Link from "next/link";
import type { ComponentProps, HTMLAttributes } from "react";

const variants = {
  profile: "profile-card",
  rewards: "rewards-panel",
  hero: "hero-card",
  cta: "cta-card",
  custom: "",
} as const;
type Appearance = { variant?: keyof typeof variants; className?: string };
function classes({ variant = "profile", className }: Appearance) {
  return ["ui-card", variants[variant], className].filter(Boolean).join(" ");
}

export function Card({
  as: Tag = "section",
  variant,
  className,
  ...props
}: HTMLAttributes<HTMLElement> &
  Appearance & { as?: "section" | "article" | "div" }) {
  return <Tag className={classes({ variant, className })} {...props} />;
}
export function CardLink({
  variant,
  className,
  ...props
}: ComponentProps<typeof Link> & Appearance) {
  return <Link className={classes({ variant, className })} {...props} />;
}
