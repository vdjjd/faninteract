/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: false,

  typescript: {
    ignoreBuildErrors: true,
  },

  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "zicbtsxjrhbpqjqemjrg.supabase.co",
        pathname: "/storage/v1/object/public/**",
      },
    ],
  },
};

export default nextConfig;
