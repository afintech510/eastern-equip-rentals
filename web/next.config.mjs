/** @type {import('next').NextConfig} */
const nextConfig = {
  // Standalone output so the Docker runner stage ships a minimal server bundle
  // (same pattern as the owner's sibling builds).
  output: 'standalone',
  reactStrictMode: true,
};

export default nextConfig;
