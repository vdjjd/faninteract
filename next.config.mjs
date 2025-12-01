/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: false,

  // Ignore linting in production
  eslint: {
    ignoreDuringBuilds: true,
  },

  // Ignore TypeScript errors in production
  typescript: {
    ignoreBuildErrors: true,
  },

  // No experimental flags (PREVENTS YOUR BUILD ERROR)
  experimental: {},

  // Allow Supabase images
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'zicbtsxjrhbpqjqemjrg.supabase.co',
        pathname: '/storage/v1/object/public/**',
      },
    ],
  },
};

export default nextConfig;
