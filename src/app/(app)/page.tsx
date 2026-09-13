import type { Metadata } from "next";
import HomeDashboard from "@/components/home-dashboard";

export const metadata: Metadata = {
  title: "Spotter — Today",
};

export default function HomePage() {
  return <HomeDashboard />;
}
