import type { Metadata } from "next";
import ReplayWorkspace from "@/components/replay-workspace";

export const metadata: Metadata = {
  title: "Motion replay — FormChain",
};

export default function ReplayPage() {
  return <ReplayWorkspace />;
}
