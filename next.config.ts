import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Codex previews this local app through 127.0.0.1 while Next starts on
  // localhost. Allow that loopback hostname so the client bundle hydrates.
  allowedDevOrigins: ["127.0.0.1"],
};

export default nextConfig;
