import Link from "next/link";
import type { ComponentProps } from "react";

const variants = {
  primary: "button primary",
  quiet: "button quiet",
  outline: "button outline",
  default: "button",
  sample: "sample-button",
  link: "link-button",
  cta: "cta-button",
  unstyled: "",
} as const;

type Appearance = { variant?: keyof typeof variants; className?: string };
function classes({ variant = "primary", className }: Appearance) {
  return [variants[variant], className].filter(Boolean).join(" ") || undefined;
}

/** Native props, refs and ARIA attributes pass through unchanged. */
export function Button({
  variant,
  className,
  ...props
}: ComponentProps<"button"> & Appearance) {
  return <button className={classes({ variant, className })} {...props} />;
}

/** Use a real link for navigation, with the same appearance variants. */
export function ButtonLink({
  variant,
  className,
  ...props
}: ComponentProps<typeof Link> & Appearance) {
  return <Link className={classes({ variant, className })} {...props} />;
}
