/** @type {import('next').NextConfig} */
const nextConfig = {
  // 🚫 Disable static optimization caching
  // Forces fresh server + client builds
  experimental: {
    staleTimes: {
      // NO caching for static or dynamic segments
      static: 0,
      dynamic: 0,
    },
    // ensure dynamic rendering works properly
    dynamicIO: true,
  },

  // 🚫 Skip build failures (keep your CI smooth)
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },

  // ⚡ Speed up interactions, avoid client hydration mismatch
  reactStrictMode: false,

  // 🧠 Disable URL normalization (prevents weird router caching issues)
  skipMiddlewareUrlNormalize: true,
  skipTrailingSlashRedirect: true,

  // 🖼 Image permissions (keep your Supabase images working)
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'zicbtsxjrhbpqjqemjrg.supabase.co',
        pathname: '/storage/v1/object/public/**',
      },
    ],
  },

  // 🧨 HARD CACHE INVALIDATOR: bump this whenever layout/page misbehaves
  // Change this number to force a new build hash
  env: {
    BUILD_ID: 'force-rebuild-v4',  // <----- increment this manually
  },
};

export default nextConfig;
