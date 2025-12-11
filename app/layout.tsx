export const dynamic = "force-dynamic";

import "./globals.css";
import type { Metadata } from "next";
import ClientThemeWrapper from "@/components/ClientThemeWrapper";
import { SupabaseRealtimeProvider } from "@/providers/SupabaseRealtimeProvider"; // ✅ Safe version
import { cn } from "../lib/utils";

export const metadata: Metadata = {
  metadataBase: new URL("https://www.faninteract.com"),

  title: "FanInteract",
  description: "Turn crowds into communities with live walls, trivia, and real-time audience engagement.",

  openGraph: {
    title: "FanInteract — Turn Crowds Into Communities",
    description:
      "FanInteract lets your audience post photos, vote, spin prize wheels, and interact live — all on one screen.",
    url: "https://www.faninteract.com",
    siteName: "FanInteract",
    type: "website",
    images: [
      {
        url: "/og/faninteract-share.png",
        width: 1200,
        height: 630,
        alt: "FanInteract — Live Fan Walls, Prize Wheels & Polling",
      },
    ],
  },

  twitter: {
    card: "summary_large_image",
    title: "FanInteract — Turn Crowds Into Communities",
    description:
      "Live walls, instant voting, photo uploads, and interactive prize wheels for DJs and event hosts.",
    images: ["/og/faninteract-share.png"],
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
        className={cn("min-h-screen", "w-full", "text-white")}
        style={{ margin: 0, padding: 0 }}
      >
        {/* ✅ The corrected provider no longer interferes with Supabase Realtime */}
        <SupabaseRealtimeProvider>
          <ClientThemeWrapper>{children}</ClientThemeWrapper>
        </SupabaseRealtimeProvider>
      </body>
    </html>
  );
}
