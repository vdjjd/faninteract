"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Image from "next/image";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

import { getSupabaseClient } from "@/lib/supabaseClient";
import { syncGuestProfile, getOrCreateGuestDeviceId } from "@/lib/syncGuest";
import TermsModal from "@/components/TermsModal";

const stateOptions = [
  "AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA",
  "HI","ID","IL","IN","IA","KS","KY","LA","ME","MD",
  "MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ",
  "NM","NY","NC","ND","OH","OK","OR","PA","RI","SC",
  "SD","TN","TX","UT","VT","VA","WA","WV","WI","WY"
];

// Normalize booleans from DB just in case
function toBool(val: any): boolean {
  if (val === true) return true;
  if (val === false || val == null) return false;
  if (typeof val === "number") return val === 1;
  if (typeof val === "string") {
    const v = val.toLowerCase().trim();
    return v === "true" || v === "t" || v === "1" || v === "yes";
  }
  return false;
}

export default function GuestSignupPage() {
  const router = useRouter();
  const params = useSearchParams();
  const supabase = getSupabaseClient();

  /* -------------------------------------------------
     🔥 NORMALIZE QR PARAMS
  ------------------------------------------------- */
  const redirect = params.get("redirect") || "";
  const wallId = params.get("wall");
  const wheelId = params.get("prizewheel");
  const basketballId = params.get("basketball");
  const triviaQueryId = params.get("trivia"); // may be null
  const hostParam = params.get("host");       // 👈 NEW: host from QR / redirect

  const rawType = params.get("type");
  let pollId = params.get("poll");

  // Handles malformed QR: ?type=poll=UUID
  if (!pollId && rawType?.startsWith("poll=")) {
    pollId = rawType.split("=")[1];
  }

  // Try to infer triviaId from redirect path if the query param is missing
  // e.g. redirect="/trivia/602344ef-6a73-4c1d-981e-3f034aa5db4a/join"
  let triviaId = triviaQueryId || null;
  if (!triviaId && redirect) {
    const match = redirect.match(
      /\/trivia\/([0-9a-fA-F-]{8}-[0-9a-fA-F-]{4}-[0-9a-fA-F-]{4}-[0-9a-fA-F-]{4}-[0-9a-fA-F-]{12})\/join/
    );
    if (match && match[1]) {
      triviaId = match[1];
    }
  }

  /* ------------------------------------------------- */
  const [wall, setWall] = useState<any>(null);

  // Host UUID that must go into guest_profiles.host_id
  const [hostIdFromContext, setHostIdFromContext] = useState<string | null>(null);
  const [hostSettings, setHostSettings] = useState<any | null>(null);
  const [loadingHost, setLoadingHost] = useState(true);

  const [hostTerms, setHostTerms] = useState("");
  const [masterTerms, setMasterTerms] = useState("");
  const [showTermsModal, setShowTermsModal] = useState(false);

  const [form, setForm] = useState({
    first_name: "",
    last_name: "",
    email: "",
    phone: "",
    street: "",
    city: "",
    state: "",
    zip: "",
    date_of_birth: "",
  });

  const [agree, setAgree] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  /* ------------------------------------------------- */
  useEffect(() => {
    if (typeof window !== "undefined") {
      getOrCreateGuestDeviceId();
    }
  }, []);

  /* -------------------------------------------------
     LOAD HOST CONTEXT (including trivia)
  ------------------------------------------------- */
  useEffect(() => {
    let cancelled = false;

    async function loadHostById(hostId: string) {
      if (!hostId) return;

      const { data: host, error } = await supabase
        .from("hosts")
        .select("*, master_id")
        .eq("id", hostId)
        .single();

      if (cancelled) return;
      if (error || !host) {
        console.error("❌ loadHostById error:", error);
        return;
      }

      const normalizedHost = {
        ...host,
        require_last_name: toBool(host.require_last_name),
        require_email: toBool(host.require_email),
        require_phone: toBool(host.require_phone),
        require_street: toBool(host.require_street),
        require_city: toBool(host.require_city),
        require_state: toBool(host.require_state),
        require_zip: toBool(host.require_zip),
        require_age: toBool(host.require_age),
      };

      setHostSettings(normalizedHost);
      setHostIdFromContext(hostId);

      if (host.host_terms_markdown) {
        setHostTerms(host.host_terms_markdown);
      }

      if (host.master_id) {
        const { data: master } = await supabase
          .from("master_accounts")
          .select("master_terms_markdown")
          .eq("id", host.master_id)
          .single();

        if (!cancelled && master?.master_terms_markdown) {
          setMasterTerms(master.master_terms_markdown);
        }
      }
    }

    async function loadContext() {
      setLoadingHost(true);

      try {
        // 🔑 0) If host is explicitly provided in the URL, trust that first.
        if (hostParam) {
          console.log("✅ Using host from URL:", hostParam);
          await loadHostById(hostParam);
          // Background is optional; if you really want trivia background here,
          // you can add a separate query, but skipping trivia_cards avoids the 400.
          return;
        }

        let foundHostId: string | null = null;
        let bgVal: string | null = null;

        console.log("🔎 Signup context:", {
          wallId,
          wheelId,
          pollId,
          basketballId,
          triviaId,
          redirect,
        });

        // 1) Fan Wall
        if (wallId) {
          const { data, error } = await supabase
            .from("fan_walls")
            .select("background_value, host_id")
            .eq("id", wallId)
            .single();

          if (!cancelled && data) {
            bgVal = data.background_value || null;
            foundHostId = data.host_id ?? null;
            console.log("✅ fan_walls host:", foundHostId);
          }
          if (error) console.error("❌ fan_walls load error:", error);
        }

        // 2) Prize Wheel
        if (!foundHostId && wheelId) {
          const { data, error } = await supabase
            .from("prize_wheels")
            .select("host_id")
            .eq("id", wheelId)
            .single();

          if (!cancelled && data?.host_id) {
            foundHostId = data.host_id;
            console.log("✅ prize_wheels host:", foundHostId);
          }
          if (error) console.error("❌ prize_wheels load error:", error);
        }

        // 3) Poll
        if (!foundHostId && pollId) {
          const { data, error } = await supabase
            .from("polls")
            .select("host_id")
            .eq("id", pollId)
            .single();

          if (!cancelled && data?.host_id) {
            foundHostId = data.host_id;
            console.log("✅ polls host:", foundHostId);
          }
          if (error) console.error("❌ polls load error:", error);
        }

        // 4) Basketball
        if (!foundHostId && basketballId) {
          const { data, error } = await supabase
            .from("bb_games")
            .select("host_id")
            .eq("id", basketballId)
            .single();

          if (!cancelled && data?.host_id) {
            foundHostId = data.host_id;
            console.log("✅ bb_games host:", foundHostId);
          }
          if (error) console.error("❌ bb_games load error:", error);
        }

        // 5) Trivia fallback (this is where your 400 was happening)
        // We'll leave it as a fallback for older QR codes that *don't* have ?host=...
        if (!foundHostId && triviaId) {
          const { data, error } = await supabase
            .from("trivia_cards")
            .select("background_type, background_value, host_id")
            .eq("id", triviaId)
            .single();

          if (!cancelled && data) {
            bgVal = data.background_value || null;
            if (data.host_id) {
              foundHostId = data.host_id;
              console.log("✅ trivia_cards host (fallback):", foundHostId);
            } else {
              console.log("⚠️ trivia_cards row found but host_id is null");
            }
          }
          if (error) {
            console.error("❌ trivia_cards load error (fallback):", error);
          }
        }

        if (!cancelled && bgVal) {
          setWall({ background_value: bgVal });
        }

        if (foundHostId) {
          await loadHostById(foundHostId);
        } else if (!cancelled) {
          // No host at all — use a minimal default so UI still renders.
          console.log(
            "⚠️ No host found for this signup context, using default hostSettings."
          );
          setHostSettings({
            id: null,
            require_last_name: false,
            require_email: false,
            require_phone: false,
            require_street: false,
            require_city: false,
            require_state: false,
            require_zip: false,
            require_age: false,
          });
          setHostIdFromContext(null);
        }
      } finally {
        if (!cancelled) setLoadingHost(false);
      }
    }

    loadContext();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wallId, wheelId, pollId, basketballId, triviaId, hostParam, redirect, supabase]);

  /* -------------------------------------------------
     AUTO-REDIRECT IF GUEST EXISTS
  ------------------------------------------------- */
  useEffect(() => {
    async function validateGuest() {
      if (typeof window === "undefined") return;

      const deviceId = localStorage.getItem("guest_device_id");
      const cached = localStorage.getItem("guest_profile");
      if (!deviceId || !cached) return;

      const { data, error } = await supabase
        .from("guest_profiles")
        .select("id")
        .eq("device_id", deviceId)
        .maybeSingle();

      if (error) {
        console.error("❌ guest_profiles check error:", error);
      }

      if (!data) {
        localStorage.removeItem("guest_profile");
        return;
      }

      // If coming from a page that gave us a redirect, go there first
      if (redirect) return router.push(redirect);
      if (wallId) return router.push(`/wall/${wallId}/submit`);
      if (wheelId) return router.push(`/prizewheel/${wheelId}/submit`);
      if (pollId) return router.push(`/polls/${pollId}/vote`);
      if (basketballId) return router.push(`/basketball/${basketballId}/submit`);
      if (triviaId) return router.push(`/trivia/${triviaId}/join`);
    }

    validateGuest();
  }, [redirect, wallId, wheelId, pollId, basketballId, triviaId, router, supabase]);

  /* -------------------------------------------------
     SUBMIT
  ------------------------------------------------- */
  async function handleSubmit(e: any) {
    e.preventDefault();
    if (!agree) return alert("You must agree to the Terms.");

    setSubmitting(true);

    try {
      const targetId =
        wallId ||
        wheelId ||
        pollId ||
        basketballId ||
        triviaId ||
        redirect.match(/([0-9a-fA-F-]{36})/)?.[0];

      const type =
        wallId ? "wall" :
        wheelId ? "prizewheel" :
        pollId ? "poll" :
        basketballId ? "basketball" :
        triviaId ? "trivia" :
        "";

      const payload = {
        ...form,
        age: form.date_of_birth
          ? Math.floor(
              (Date.now() - new Date(form.date_of_birth).getTime()) /
                (1000 * 60 * 60 * 24 * 365.25)
            )
          : null,
      };

      // This is the host UUID that goes to guest_profiles.host_id
      const hostIdForSync = hostIdFromContext || hostSettings?.id || null;

      console.log("🔍 hostIdForSync =>", hostIdForSync);

      const { profile } = await syncGuestProfile(
        type,
        targetId as string,
        payload,
        hostIdForSync as string
      );

      if (typeof window !== "undefined") {
        localStorage.setItem("guest_profile", JSON.stringify(profile));
      }

      // Redirect priority:
      if (redirect) router.push(redirect);
      else if (wallId) router.push(`/wall/${wallId}/submit`);
      else if (wheelId) router.push(`/prizewheel/${wheelId}/submit`);
      else if (pollId) router.push(`/polls/${pollId}/vote`);
      else if (basketballId) router.push(`/basketball/${basketballId}/submit`);
      else if (triviaId) router.push(`/trivia/${triviaId}/join`);
      else router.push("/");
    } catch (err) {
      console.error("❌ handleSubmit error:", err);
      alert("Error saving your information.");
    }

    setSubmitting(false);
  }

  /* -------------------------------------------------
     LOADING / GUARD
  ------------------------------------------------- */
  if (loadingHost || !hostSettings) {
    return (
      <main className={cn(
        "min-h-screen w-full flex items-center justify-center bg-black text-white"
      )}>
        Loading…
      </main>
    );
  }

  /* -------------------------------------------------
     RENDER
  ------------------------------------------------- */
  const bgImage =
    wall?.background_value?.includes("http")
      ? `url(${wall.background_value})`
      : wall?.background_value ||
        "linear-gradient(135deg,#0a2540,#1b2b44,#000000)";

  return (
    <main
      className={cn(
        "relative flex items-center justify-center",
        "min-h-screen w-full text-white"
      )}
    >
      <div
        className={cn("absolute inset-0 bg-cover bg-center")}
        style={{ backgroundImage: bgImage }}
      />
      <div className={cn("absolute inset-0 bg-black/60 backdrop-blur-md")} />

      <motion.div
        initial={{ opacity: 0, y: 30, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.5 }}
        className={cn(
          "relative z-10 w-[95%] max-w-md rounded-2xl p-8",
          "border border-white/10 bg-white/10 backdrop-blur-lg"
        )}
      >
        <div className={cn("flex justify-center mb-6")}>
          <Image
            src="/faninteractlogo.png"
            alt="FanInteract"
            width={360}
            height={120}
            className={cn("w-[240px] md:w-[320px]")}
          />
        </div>

        <motion.h2
          className={cn(
            "text-center text-2xl font-semibold text-sky-300 mb-6"
          )}
        >
          Join the Fan Zone
        </motion.h2>

        <form onSubmit={handleSubmit} className="space-y-3">
          {/* FIRST NAME (ALWAYS) */}
          <input
            required
            placeholder="First Name *"
            className={cn(
              "w-full p-3 rounded-xl bg-black/40 border border-white/20"
            )}
            value={form.first_name}
            onChange={(e) =>
              setForm({ ...form, first_name: e.target.value })
            }
          />

          {/* LAST NAME */}
          {hostSettings.require_last_name && (
            <input
              required
              placeholder="Last Name *"
              className={cn(
                "w-full p-3 rounded-xl bg-black/40 border border-white/20"
              )}
              value={form.last_name}
              onChange={(e) =>
                setForm({ ...form, last_name: e.target.value })
              }
            />
          )}

          {/* EMAIL */}
          {hostSettings.require_email && (
            <input
              required
              type="email"
              placeholder="Email *"
              className={cn(
                "w-full p-3 rounded-xl bg-black/40 border border-white/20"
              )}
              value={form.email}
              onChange={(e) =>
                setForm({ ...form, email: e.target.value })
              }
            />
          )}

          {/* PHONE */}
          {hostSettings.require_phone && (
            <input
              required
              type="tel"
              placeholder="Phone *"
              className={cn(
                "w-full p-3 rounded-xl bg-black/40 border border-white/20"
              )}
              value={form.phone}
              onChange={(e) =>
                setForm({ ...form, phone: e.target.value })
              }
            />
          )}

          {/* ADDRESS */}
          {hostSettings.require_street && (
            <input
              required
              placeholder="Street Address *"
              className={cn(
                "w-full p-3 rounded-xl bg-black/40 border border-white/20"
              )}
              value={form.street}
              onChange={(e) =>
                setForm({ ...form, street: e.target.value })
              }
            />
          )}

          {hostSettings.require_city && (
            <input
              required
              placeholder="City *"
              className={cn(
                "w-full p-3 rounded-xl bg-black/40 border border-white/20"
              )}
              value={form.city}
              onChange={(e) =>
                setForm({ ...form, city: e.target.value })
              }
            />
          )}

          {hostSettings.require_state && (
            <select
              required
              className={cn(
                "w-full p-3 rounded-xl bg-black/40 border border-white/20"
              )}
              value={form.state}
              onChange={(e) =>
                setForm({ ...form, state: e.target.value })
              }
            >
              <option value="">State *</option>
              {stateOptions.map((s) => (
                <option key={s} value={s} className="text-black">
                  {s}
                </option>
              ))}
            </select>
          )}

          {hostSettings.require_zip && (
            <input
              required
              placeholder="ZIP Code *"
              className={cn(
                "w-full p-3 rounded-xl bg-black/40 border border-white/20"
              )}
              value={form.zip}
              onChange={(e) =>
                setForm({ ...form, zip: e.target.value })
              }
            />
          )}

          {/* DOB → AGE */}
          {hostSettings.require_age && (
            <div className="relative">
              <input
                required
                type="date"
                max={new Date().toISOString().split("T")[0]}
                className={cn(
                  "w-full h-[52px] px-3 rounded-xl",
                  "bg-black/40 border border-white/20",
                  "text-white appearance-none [color-scheme:dark]"
                )}
                value={form.date_of_birth}
                onChange={(e) =>
                  setForm({
                    ...form,
                    date_of_birth: e.target.value,
                  })
                }
              />

              {!form.date_of_birth && (
                <span
                  className={cn(
                    "absolute left-3 top-1/2 -translate-y-1/2",
                    "text-gray-400 pointer-events-none select-none"
                  )}
                >
                  Enter D.O.B *
                </span>
              )}
            </div>
          )}

          {/* TERMS */}
          <label
            className={cn(
              "flex items-center gap-2 text-sm text-gray-300 mt-2"
            )}
          >
            <input
              type="checkbox"
              checked={agree}
              onChange={(e) => setAgree(e.target.checked)}
            />
            I agree to the{" "}
            <button
              type="button"
              onClick={() => setShowTermsModal(true)}
              className={cn("underline text-sky-400")}
            >
              Terms
            </button>
          </label>

          <button
            disabled={submitting}
            className={cn(
              "w-full py-3 rounded-xl",
              "bg-gradient-to-r from-sky-500 to-blue-600",
              "font-semibold"
            )}
          >
            {submitting ? "Submitting..." : "Continue"}
          </button>
        </form>
      </motion.div>

      <TermsModal
        isOpen={showTermsModal}
        onClose={() => setShowTermsModal(false)}
        hostTerms={hostTerms}
        masterTerms={masterTerms}
      />
    </main>
  );
}
