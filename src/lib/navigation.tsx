/** Shared route order and presentation metadata for both navigation surfaces. */
export const navigation = [
  {
    href: "/",
    label: "Overview",
    mobileLabel: "Today",
    mobile: true,
    icon: (
      <path
        d="M4 12.5 12 5l8 7.5M6.5 11v8h11v-8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    ),
  },
  {
    href: "/analyze",
    label: "Analyze",
    mobileLabel: "Analyze",
    mobile: true,
    icon: (
      <path
        d="M12 4c3 3.6 5 6.6 5 9.2a5 5 0 1 1-10 0C7 10.6 9 7.6 12 4Z"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    ),
  },
  {
    href: "/replay",
    label: "Replay",
    mobileLabel: "Replay",
    mobile: true,
    icon: (
      <>
        <rect x="4.5" y="6" width="15" height="12" rx="2.4" />
        <path
          d="M10.4 9.2v5.6L16.2 12 10.4 9.2Z"
          fill="currentColor"
          stroke="none"
        />
      </>
    ),
  },
  {
    href: "/social",
    label: "Community",
    mobileLabel: "Community",
    mobile: true,
    icon: (
      <>
        <circle cx="8.5" cy="8.2" r="2.6" />
        <path d="M3.2 19.5c.7-3.2 2.4-4.8 5.3-4.8 2.6 0 4.4 1.4 5.2 4" strokeLinecap="round" />
        <circle cx="15.6" cy="8" r="2.8" />
        <path d="M10.8 19.5c.9-3.6 2.8-5.3 5.6-5.3s4.7 1.7 5.6 5.3" strokeLinecap="round" />
      </>
    ),
  },
  {
    href: "/profile",
    label: "Profile",
    mobileLabel: "Profile",
    mobile: true,
    icon: (
      <>
        <circle cx="12" cy="8" r="3.5" />
        <path d="M5 21v-2a7 7 0 0 1 14 0v2" strokeLinecap="round" />
      </>
    ),
  },
];

export function isRouteActive(pathname: string, href: string) {
  return pathname === href || (href !== "/" && pathname.startsWith(`${href}/`));
}
