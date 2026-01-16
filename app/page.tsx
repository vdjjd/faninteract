"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import Link from "next/link";
import Modal from "@/components/Modal";
import HostSignupForm from "@/components/Signup/HostSignupForm";
import { cn } from "../lib/utils";

export default function LandingPage() {
  const [showSignup, setShowSignup] = useState(false);

  return (
    <main
      className={cn(
        "relative w-full",
        "min-h-screen",              // ✅ scroll allowed on small phones
        "flex flex-col items-center justify-center",
        "overflow-x-hidden",         // ❗ NEVER allow horizontal overflow
        "text-white text-center",
        "px-4 md:px-0"               // mobile padding, removed on desktop
      )}
    >
      {/* Background */}
      <div
        className={cn(
          "absolute inset-0",
          "bg-[linear-gradient(135deg,#0a2540,#1b2b44,#000000)]",
          "bg-[length:200%_200%]",
          "animate-gradient-slow"
        )}
      />
      <div
        className={cn(
          "absolute inset-0 opacity-25",
          "bg-[radial-gradient(circle_at_30%_30%,rgba(0,153,255,0.4),transparent_70%)]"
        )}
      />

      {/* Optional top-right nav */}
      <div className={cn('absolute', 'top-4', 'right-4', 'z-20')}>
        <Link
          href="/about"
          className={cn(
            "text-sm font-semibold",
            "text-sky-300/90 hover:text-sky-200",
            "px-3 py-2 rounded-xl",
            "border border-sky-400/20 hover:border-sky-300/40",
            "bg-white/0 hover:bg-white/5",
            "transition-all duration-200"
          )}
        >
          About Us
        </Link>
      </div>

      {/* HERO CONTENT */}
      <div className={cn('relative', 'z-10', 'flex', 'flex-col', 'items-center', 'gap-4', 'w-full')}>
        {/* LOGO (fully responsive) */}
        <motion.div
          animate={{ scale: [1, 1.06, 1] }}
          transition={{ duration: 7, repeat: Infinity, ease: "easeInOut" }}
        >
          <div
            className={cn(
              "mx-auto drop-shadow-[0_0_30px_rgba(56,189,248,0.3)]",
              "mt-[-60px]",            // mobile
              "sm:mt-[-100px]",        // tablets
              "md:mt-[-150px]",        // monitors
              "lg:mt-[-200px]"         // ultrawide monitors
            )}
            style={{
              width: "240px",          // mobile
              maxWidth: "90%",
            }}
          >
            <img
              src="/faninteractlogo-landing.png"
              alt="FanInteract Logo"
              className={cn('w-full', 'h-auto')}
            />
          </div>
        </motion.div>

        {/* HEADLINE */}
        <h1
          className={cn(
            "font-extrabold tracking-tight",
            "bg-clip-text text-transparent bg-gradient-to-r from-sky-400 via-blue-500 to-indigo-400",
            "drop-shadow-[0_0_30px_rgba(56,189,248,0.25)]",
            "text-3xl",       // mobile
            "sm:text-4xl",    // tablets
            "md:text-6xl",    // desktop monitors
            "lg:text-7xl"     // large monitors
          )}
        >
          Turn Crowds Into Communities
        </h1>

        {/* SUBTEXT */}
        <p
          className={cn(
            "text-gray-300 leading-relaxed mx-auto",
            "max-w-[90%]",
            "text-base",      // mobile
            "sm:text-lg",
            "md:text-2xl"     // desktop monitors
          )}
        >
          FanInteract lets your audience post, vote, and play live — all on one wall.
        </p>

        {/* BUTTONS */}
        <div
          className={cn(
            "flex flex-wrap justify-center",
            "gap-4 sm:gap-6",
            "pt-4 md:pt-6"
          )}
        >
          <button
            onClick={() => setShowSignup(true)}
            className={cn(
              "px-8 py-4",
              "bg-gradient-to-r from-sky-500 to-blue-600",
              "rounded-2xl font-semibold",
              "shadow-lg shadow-blue-600/40",
              "hover:scale-105 hover:shadow-blue-500/60",
              "transition-all duration-300"
            )}
          >
            Get Started
          </button>

          <Link
            href="/login"
            className={cn(
              "px-8 py-4",
              "border border-sky-400 text-sky-400",
              "hover:bg-sky-400/10",
              "rounded-2xl font-semibold",
              "transition-all duration-300"
            )}
          >
            Login
          </Link>

          {/* Optional third button */}
          <Link
            href="/about"
            className={cn(
              "px-8 py-4",
              "border border-white/15 text-white/80",
              "hover:bg-white/5 hover:text-white",
              "rounded-2xl font-semibold",
              "transition-all duration-300"
            )}
          >
            About Us
          </Link>
        </div>
      </div>

      {/* SIGNUP MODAL */}
      <Modal isOpen={showSignup} onClose={() => setShowSignup(false)}>
        <HostSignupForm />
      </Modal>

      {/* FOOTER */}
      <footer
        className={cn(
          "absolute bottom-0 left-0 w-full py-6",
          "bg-[#0b111d]/80 backdrop-blur-sm",
          "border-t border-blue-900/40",
          "z-20"
        )}
      >
        <div className={cn('flex', 'flex-col', 'items-center', 'justify-center', 'gap-2', 'text-center')}>
          <div className={cn('flex', 'items-center', 'justify-center', 'gap-4', 'text-sm')}>
            <Link href="/about" className={cn('text-sky-300/80', 'hover:text-sky-200', 'transition-colors')}>
              About Us
            </Link>
            <span className="text-gray-600">•</span>
            <Link href="/privacy" className={cn('text-sky-300/80', 'hover:text-sky-200', 'transition-colors')}>
              Privacy
            </Link>
            <span className="text-gray-600">•</span>
            <Link href="/terms" className={cn('text-sky-300/80', 'hover:text-sky-200', 'transition-colors')}>
              Terms
            </Link>
          </div>

          <p className={cn('text-gray-500', 'text-sm')}>
            © {new Date().getFullYear()} FanInteract. All rights reserved.
          </p>
        </div>
      </footer>
    </main>
  );
}
