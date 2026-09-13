import type { Metadata } from "next";
import ReplayWorkspace from "@/components/replay-workspace";

export const metadata: Metadata = {
  title: "Motion replay — Spotter",
};

export default function ReplayPage() {
  return <ReplayWorkspace />;
}
