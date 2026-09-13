"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { navigation, isRouteActive } from "@/lib/navigation";

export default function MobileTabBar() {
  const pathname = usePathname();
  return (
    <nav className="tab-bar" aria-label="Mobile navigation">
      {navigation
        .filter((route) => route.mobile)
        .map(({ href, mobileLabel, icon }) => {
          const active = isRouteActive(pathname, href);
          return (
            <Link
              key={href}
              href={href}
              className={active ? "tab-bar-item active" : "tab-bar-item"}
              aria-current={active ? "page" : undefined}
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                aria-hidden="true"
              >
                {icon}
              </svg>
              <span>{mobileLabel}</span>
            </Link>
          );
        })}
    </nav>
  );
}
