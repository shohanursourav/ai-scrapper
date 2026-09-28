import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Allow cloud dev previews / tunnels to load dev assets. Add your own host if needed.
  allowedDevOrigins: ["*.e2b.app", "**.e2b.app", "*.ngrok-free.app", "*.trycloudflare.com"],
  // cheerio is server-only; keep it out of client bundles
  serverExternalPackages: ["cheerio"],
};

export default nextConfig;
