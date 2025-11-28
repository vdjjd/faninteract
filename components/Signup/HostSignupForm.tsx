"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { motion } from "framer-motion";
import Link from "next/link";
import { getSupabaseClient } from "@/lib/supabaseClient";
import { cn } from "@/lib/utils";

export default function HostSignupForm() {
  const router = useRouter();
  const supabase = getSupabaseClient();

  const [accountType, setAccountType] = useState<"master" | "host">("host");
  const [companyName, setCompanyName] = useState("");
  const [venueName, setVenueName] = useState("");
  const [masterId, setMasterId] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");   // ✔ correct
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPopup, setShowPopup] = useState(false);

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const { data, error: signUpError } = await supabase.auth.signUp({
        email,
        password,
        options: { emailRedirectTo: `${window.location.origin}/login` },
      });
      if (signUpError) throw signUpError;

      const userId = data.user?.id;
      if (!userId) throw new Error("Signup failed");

      if (accountType === "master") {
        const contact_name = `${firstName} ${lastName}`;
        const { error: insertError } = await supabase
          .from("master_accounts")
          .insert([
            { id: userId, company_name: companyName, contact_name, contact_email: email },
          ]);

        if (insertError) throw insertError;
      } else {
        const { error: insertError } = await supabase
          .from("hosts")
          .insert([
            {
              id: userId,
              master_id: masterId || null,
              venue_name: venueName,
              first_name: firstName,
              last_name: lastName,
              username,
              email,
            },
          ]);

        if (insertError) throw insertError;
      }

      setShowPopup(true);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className={cn("relative flex items-center justify-center min-h-screen w-full overflow-hidden text-white")}>

      {/* 🌌 Background */}
      <div className={cn('absolute inset-0 bg-[linear-gradient(135deg,#0a2540,#1b2b44,#000000)] bg-[length:200%_200%] animate-gradient-slow')} />
      <div className={cn('absolute inset-0 opacity-25 bg-[radial-gradient(circle_at_30%_30%,rgba(0,153,255,0.4),transparent_70%)]')} />
      <div className={cn('absolute inset-0 backdrop-blur-md bg-black/30')} />

      {/* ✨ Glass Card */}
      <motion.div
        initial={{ opacity: 0, y: 30, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
        className={cn('relative z-10 w-[95%] max-w-lg rounded-3xl p-8 shadow-[0_0_40px_rgba(0,150,255,0.3)] border border-white/10 bg-white/10 backdrop-blur-lg')}
      >
        {/* Logo */}
        <div className={cn('flex justify-center mb-6')}>
          <Image
            src="/faninteractlogo.png"
            alt="FanInteract"
            width={120}
            height={75}
            className={cn('w-[120px] md:w-[100px] drop-shadow-[0_0_30px_rgba(56,189,248,0.35)]')}
          />
        </div>

        {/* Glowing Header */}
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
          className={cn('text-2xl font-bold text-sky-300 mb-5 text-center tracking-wide')}
        >
          Create Your Account
        </motion.h2>

        {/* Form */}
        <form onSubmit={handleSignUp} className="space-y-3">
          <select
            value={accountType}
            onChange={(e) => setAccountType(e.target.value as "master" | "host")}
            className={cn('w-full p-3 rounded-xl bg-black/40 border border-white/20 focus:border-sky-400 outline-none')}
          >
            <option value="host">Host Account</option>
            <option value="master">Master Account</option>
          </select>

          {accountType === "master" ? (
            <input
              type="text"
              placeholder="Company Name"
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              className={cn('w-full p-3 rounded-xl bg-black/40 border border-white/20')}
              required
            />
          ) : (
            <>
              <input
                type="text"
                placeholder="Venue Name"
                value={venueName}
                onChange={(e) => setVenueName(e.target.value)}
                className={cn('w-full p-3 rounded-xl bg-black/40 border border-white/20')}
                required
              />
              <input
                type="text"
                placeholder="Master ID (optional)"
                value={masterId}
                onChange={(e) => setMasterId(e.target.value)}
                className={cn('w-full p-3 rounded-xl bg-black/40 border border-white/20')}
              />
            </>
          )}

          <input type="text" placeholder="First Name" value={firstName} onChange={(e)=>setFirstName(e.target.value)} className={cn('w-full p-3 rounded-xl bg-black/40 border border-white/20')} required />

          {/* ❗ FIX APPLIED RIGHT HERE */}
          <input type="text" placeholder="Last Name" value={lastName} onChange={(e)=>setLastName(e.target.value)} className={cn('w-full p-3 rounded-xl bg-black/40 border border-white/20')} required />

          <input type="text" placeholder="Username" value={username} onChange={(e)=>setUsername(e.target.value)} className={cn('w-full p-3 rounded-xl bg-black/40 border border-white/20')} required />
          <input type="email" placeholder="Email" value={email} onChange={(e)=>setEmail(e.target.value)} className={cn('w-full p-3 rounded-xl bg-black/40 border border-white/20')} required />
          <input type="password" placeholder="Password" value={password} onChange={(e)=>setPassword(e.target.value)} className={cn('w-full p-3 rounded-xl bg-black/40 border border-white/20')} required />

          <button disabled={loading} className={cn('w-full py-3 rounded-xl bg-gradient-to-r from-sky-500 to-blue-600 font-semibold hover:scale-[1.03] active:scale-[0.99] transition-all shadow-lg')}>
            {loading ? "Creating..." : "Create Account"}
          </button>

          {error && <p className={cn('text-red-400 text-center')}>{error}</p>}
        </form>

        <div className={cn('mt-6 text-sm text-center text-blue-200')}>
          Already have an account?{" "}
          <Link href="/login" className={cn('text-sky-400 hover:underline')}>
            Login
          </Link>
        </div>
      </motion.div>

      {/* Verification Popup */}
      {showPopup && (
        <div className={cn('fixed inset-0 flex items-center justify-center bg-black/70 backdrop-blur-sm z-50')}>
          <div className={cn('bg-[#0d1625] border border-blue-900/40 p-8 rounded-2xl shadow-lg text-center max-w-sm w-[90%]')}>
            <h2 className={cn('text-xl font-bold mb-2 text-sky-300')}>Verification Sent</h2>
            <p className={cn('text-sm text-gray-300 mb-4')}>
              A verification link has been sent to <strong>{email}</strong>.
            </p>
            <button
              onClick={() => {
                setShowPopup(false);
                router.push("/login");
              }}
              className={cn('px-6 py-2 rounded-xl bg-gradient-to-r from-sky-500 to-blue-600 font-semibold shadow-lg')}
            >
              OK
            </button>
          </div>
        </div>
      )}
    </main>
  );
}