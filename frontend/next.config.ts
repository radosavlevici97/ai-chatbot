import type { NextConfig } from "next";

const backendUrl = process.env.BACKEND_URL; // e.g. https://xxx.railway.app

const nextConfig: NextConfig = {
  output: process.env.STANDALONE === "true" ? "standalone" : undefined,
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "*.railway.app",
      },
    ],
  },
  env: {
    // When proxying, the frontend calls itself at /api/v1 (same-origin)
    NEXT_PUBLIC_API_URL: backendUrl ? "/api/v1" : process.env.NEXT_PUBLIC_API_URL,
  },
  async rewrites() {
    if (!backendUrl) return [];

    return [
      {
        // Proxy all /api/v1/* requests to the Railway backend
        source: "/api/v1/:path*",
        destination: `${backendUrl}/api/v1/:path*`,
      },
    ];
  },
};

export default nextConfig;
