import type { Metadata } from "next";
import AnalyzeSwitcher from "@/components/analyze-switcher";

export const metadata: Metadata = {
  title: "Analyze movement — Spotter",
};

export default function AnalyzePage() {
  return <AnalyzeSwitcher />;
}
