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
        "relative",
        "w-full",
        "h-screen",          // Force exact screen fit
        "flex",
        "flex-col",
        "items-center",
        "justify-center",    // Perfect centering
        "overflow-hidden",   // No scroll ever
        "text-white",
        "text-center"
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

      {/* HERO CONTENT */}
      <div className={cn('relative', 'z-10', 'flex', 'flex-col', 'items-center', 'gap-4')}>

        {/* LOGO — New file, pixel-perfect sizing */}
        <motion.div
          animate={{ scale: [1, 1.06, 1] }}
          transition={{ duration: 7, repeat: Infinity, ease: "easeInOut" }}
        >
          <div
  className={cn('mx-auto', 'drop-shadow-[0_0_30px_rgba(56,189,248,0.3)]', 'mt-[-175px]')}
            style={{
              width: "300px",     // 🔥 Perfect desktop size
              maxWidth: "90%",     // 🔥 Mobile auto-resize
              height: "auto",
            }}
          >
            <img
              src="/faninteractlogo-landing.png"
              alt="FanInteract Logo"
              style={{
                width: "100%",
                height: "auto",
                display: "block",
              }}
            />
          </div>
        </motion.div>

        {/* HEADLINE */}
        <h1
          className={cn(
            "text-4xl",
            "md:text-6xl",
            "font-extrabold",
            "tracking-tight",
            "bg-clip-text",
            "text-transparent",
            "bg-gradient-to-r",
            "from-sky-400",
            "via-blue-500",
            "to-indigo-400",
            "drop-shadow-[0_0_30px_rgba(56,189,248,0.25)]"
          )}
        >
          Turn Crowds Into Communities
        </h1>

        {/* SUBTEXT — Never wraps */}
        <p
          className={cn(
            "text-lg",
            "md:text-2xl",
            "text-gray-300",
            "leading-relaxed",
            "whitespace-nowrap",   // 🔥 Lock in one line
            "max-w-none"
          )}
          style={{
            overflow: "visible",
            whiteSpace: "nowrap",
          }}
        >
          FanInteract lets your audience post, vote, and play live — all on one wall.
        </p>

        {/* BUTTONS */}
        <div className={cn('flex', 'flex-wrap', 'justify-center', 'gap-6', 'pt-2')}>
          <button
            onClick={() => setShowSignup(true)}
            className={cn(
              "px-8",
              "py-4",
              "bg-gradient-to-r",
              "from-sky-500",
              "to-blue-600",
              "rounded-2xl",
              "font-semibold",
              "shadow-lg",
              "shadow-blue-600/40",
              "hover:scale-105",
              "hover:shadow-blue-500/60",
              "transition-all",
              "duration-300"
            )}
          >
            Get Started
          </button>

          <Link
            href="/login"
            className={cn(
              "px-8",
              "py-4",
              "border",
              "border-sky-400",
              "text-sky-400",
              "hover:bg-sky-400/10",
              "rounded-2xl",
              "font-semibold",
              "transition-all",
              "duration-300"
            )}
          >
            Login
          </Link>
        </div>
      </div>

      {/* Sign-up Modal */}
      <Modal isOpen={showSignup} onClose={() => setShowSignup(false)}>
        <HostSignupForm />
      </Modal>

      {/* FOOTER — always pinned, no scroll */}
      <footer
        className={cn(
          "absolute bottom-0 left-0 w-full py-6 text-center",
          "bg-[#0b111d]/80 backdrop-blur-sm",
          "border-t border-blue-900/40",
          "z-20"
        )}
      >
        <p className={cn('text-gray-500', 'text-sm')}>
          © {new Date().getFullYear()} FanInteract. All rights reserved.
        </p>
      </footer>
    </main>
  );
}
