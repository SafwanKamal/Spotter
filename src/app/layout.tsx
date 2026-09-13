import type { Metadata } from "next";
import { Newsreader, Public_Sans } from "next/font/google";
import type { ReactNode } from "react";
import "./globals.css";

const newsreader = Newsreader({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  style: ["normal", "italic"],
  variable: "--font-newsreader",
  display: "swap",
});

const publicSans = Public_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-public-sans",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Spotter — Move with intention",
  description: "A movement lab for reviewing squat repetitions, keyframes, and coaching cues.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html
      lang="en"
      data-scroll-behavior="smooth"
      className={`${newsreader.variable} ${publicSans.variable}`}
    >
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
