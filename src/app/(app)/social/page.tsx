import type { Metadata } from "next";
import SocialFeed from "@/components/social-feed";

export const metadata: Metadata = {
  title: "Community — FormChain",
  description:
    "A prototype community feed for trainer-led exercise tips and transparent AI movement observations.",
};

export default function SocialPage() {
  return <SocialFeed />;
}
