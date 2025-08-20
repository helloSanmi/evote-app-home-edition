// frontend/next.config.js
const backend = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5050";

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  async rewrites() {
    return [
      // proxy API + uploads to the backend (fixes JSON parse errors & CORS locally)
      { source: "/api/:path*", destination: `${backend}/api/:path*` },
      { source: "/uploads/:path*", destination: `${backend}/uploads/:path*` },
    ];
  },
};

module.exports = nextConfig;
