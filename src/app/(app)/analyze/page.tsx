import type { Metadata } from "next";
import AnalyzeSwitcher from "@/components/analyze-switcher";

export const metadata: Metadata = {
  title: "Analyze movement — FormChain",
};

export default function AnalyzePage() {
  return <AnalyzeSwitcher />;
}
