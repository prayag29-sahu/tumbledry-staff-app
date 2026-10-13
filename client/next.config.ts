import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: process.env.NEXT_PUBLIC_API_URL 
          ? `${process.env.NEXT_PUBLIC_API_URL.replace(/\/+$/, '')}/api/:path*` 
          : 'http://localhost:5000/api/:path*',
      },
    ];
  },
};

export default nextConfig;
