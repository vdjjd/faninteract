export const dynamic = 'force-dynamic';

import './globals.css';
import type { Metadata } from 'next';
import ClientThemeWrapper from '@/components/ClientThemeWrapper';
import { SupabaseRealtimeProvider } from '@/providers/SupabaseRealtimeProvider';
import { cn } from "../lib/utils";

export const metadata: Metadata = {
  title: "FanInteract",
  description: "Turn crowds into communities with live walls, trivia, and polling.",

  openGraph: {
    title: "FanInteract — Turn Crowds Into Communities",
    description:
      "Live audience engagement: photo walls, live voting, trivia, and instant interaction for DJs, venues, and events.",
    url: "https://www.faninteract.com",
    siteName: "FanInteract",
    type: "website",
    images: [
      {
        url: "/og-image.jpg",   // 🔥 make sure this exists in /public
        width: 1200,
        height: 630,
        alt: "FanInteract Landing Page Preview",
      },
    ],
  },

  twitter: {
    card: "summary_large_image",
    title: "FanInteract — Turn Crowds Into Communities",
    description:
      "Live walls, photo posts, voting, trivia, and crowd interaction for events.",
    images: ["/og-image.jpg"], // 🔥 same OG image
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body
        suppressHydrationWarning
        className={cn(
          "min-h-screen",
          "w-full",
          "text-white"
        )}
        style={{
          margin: 0,
          padding: 0,
        }}
      >
        <SupabaseRealtimeProvider>
          <ClientThemeWrapper>{children}</ClientThemeWrapper>
        </SupabaseRealtimeProvider>
      </body>
    </html>
  );
}
