"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { motion } from "framer-motion";
import Link from "next/link";
import { getSupabaseClient } from "@/lib/supabaseClient";
import { cn } from "../../lib/utils";

export default function LoginPage() {
  const router = useRouter();
  const supabase = getSupabaseClient();

  const [form, setForm] = useState({ usernameOrEmail: "", password: "" });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleChange = (e: any) =>
    setForm({ ...form, [e.target.name]: e.target.value });

  const handleLogin = async (e: any) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const resolveRes = await fetch("/api/resolve-username", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: form.usernameOrEmail.includes("@")
            ? null
            : form.usernameOrEmail,
          email: form.usernameOrEmail.includes("@")
            ? form.usernameOrEmail
            : null,
        }),
      });

      const resolveData = await resolveRes.json();
      if (!resolveRes.ok || !resolveData.found)
        throw new Error("No matching account found.");

      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: resolveData.email,
        password: form.password,
      });
      if (signInError) throw signInError;

      router.push(
        resolveData.type === "master"
          ? "/admin/master-dashboard"
          : "/admin/dashboard"
      );
    } catch (err: any) {
      setError(err.message || "Login failed.");
    } finally {
      setLoading(false);
    }
  };

  return (
      <main className={cn("relative flex items-center justify-center min-h-screen w-full overflow-hidden text-white")}>
  
        {/* 🌌 Background */}
        <div className={cn('absolute', 'inset-0', 'bg-[linear-gradient(135deg,#0a2540,#1b2b44,#000000)]', 'bg-[length:200%_200%]', 'animate-gradient-slow')}></div>
        <div className={cn('absolute', 'inset-0', 'opacity-25', 'bg-[radial-gradient(circle_at_30%_30%,rgba(0,153,255,0.4),transparent_70%)]')}></div>
        <div className={cn('absolute', 'inset-0', 'backdrop-blur-md', 'bg-black/30')}></div>
  
        {/* ✨ Glass Card */}
        <motion.div
          initial={{ opacity: 0, y: 30, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.5, ease: "easeOut" }}
          className={cn('relative', 'z-10', 'w-[95%]', 'max-w-lg', 'rounded-3xl', 'p-8', 'shadow-[0_0_40px_rgba(0,150,255,0.3)]', 'border', 'border-white/10', 'bg-white/10', 'backdrop-blur-lg')}
        >
          {/* ✅ Logo */}
          <div className={cn('flex', 'justify-center', 'mb-6')}>
            <Image
              src="/faninteractlogo.png"
              alt="FanInteract"
              width={360}
              height={150}
              className={cn('w-[150px]', 'md:w-[120px]', 'drop-shadow-[0_0_30px_rgba(56,189,248,0.35)]')}
            />
          </div>

{/* ✅ Glowing Header - pulse glow only, no fading out */}
<motion.h2
  animate={{
    scale: [1, 1.03, 1],
    textShadow: [
      "0 0 10px rgba(56,189,248,0.6)",
      "0 0 22px rgba(56,189,248,0.75)",
      "0 0 10px rgba(56,189,248,0.6)",
    ],
  }}
  transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
  className={cn(
    "text-3xl",
    "font-bold",
    "text-sky-300",
    "mb-5",
    "text-center",
    "tracking-wide"
  )}
>
  Welcome Back
</motion.h2>

        <form onSubmit={handleLogin} className="space-y-3">
          <input
            type="text"
            name="usernameOrEmail"
            placeholder="Username or Email"
            value={form.usernameOrEmail}
            onChange={handleChange}
            className={cn('w-full', 'p-3', 'rounded-xl', 'bg-black/40', 'border', 'border-white/20', 'focus:border-sky-400', 'outline-none')}
            required
          />

          <input
            type="password"
            name="password"
            placeholder="Password"
            value={form.password}
            onChange={handleChange}
            className={cn('w-full', 'p-3', 'rounded-xl', 'bg-black/40', 'border', 'border-white/20', 'focus:border-sky-400', 'outline-none')}
            required
          />

          <button
            disabled={loading}
            className={cn('w-full', 'py-3', 'rounded-xl', 'bg-gradient-to-r', 'from-sky-500', 'to-blue-600', 'font-semibold', 'hover:scale-[1.03]', 'active:scale-[0.99]', 'transition-all', 'shadow-lg')}
          >
            {loading ? "Signing In..." : "Login"}
          </button>

          {error && <p className={cn('text-red-400', 'text-center')}>{error}</p>}
        </form>

        <div className={cn('mt-6', 'text-sm', 'text-center', 'text-blue-200')}>
          Don't have an account?{" "}
          <Link href="/signup" className={cn('text-sky-400', 'hover:underline')}>
            Create an account
          </Link>
        </div>
      </motion.div>
    </main>
  );
}
