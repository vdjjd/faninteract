const nextConfig = {
  reactStrictMode: true,
  // 🚨 Force Vercel to NOT use any caching
  generateEtags: false,
  onDemandEntries: {
    maxInactiveAge: 0,
    pagesBufferLength: 0,
  },

  eslint: {
    ignoreDuringBuilds: true,
  },

  typescript: {
    ignoreBuildErrors: true,
  },

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
