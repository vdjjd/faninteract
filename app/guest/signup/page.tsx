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

export default function GuestSignupPage() {
  const router = useRouter();
  const params = useSearchParams();
  const supabase = getSupabaseClient();

  /* -------------------------------------------------
     🔥 NORMALIZE QR PARAMS
  ------------------------------------------------- */
  const redirect = params.get("redirect");
  const wallId = params.get("wall");
  const wheelId = params.get("prizewheel");
  const basketballId = params.get("basketball");
  const triviaId = params.get("trivia"); // trivia source

  const rawType = params.get("type");
  let pollId = params.get("poll");

  if (!pollId && rawType?.startsWith("poll=")) {
    pollId = rawType.split("=")[1];
  }

  /* ------------------------------------------------- */
  const [hostSettings, setHostSettings] = useState<any>({});
  const [wall, setWall] = useState<any>(null);

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
  const [hostLoaded, setHostLoaded] = useState(false);

  /* ------------------------------------------------- */
  useEffect(() => {
    getOrCreateGuestDeviceId();
  }, []);

  /* -------------------------------------------------
     LOAD HOST CONTEXT
  ------------------------------------------------- */
  useEffect(() => {
    async function loadHostById(hostId: string) {
      const { data: host, error } = await supabase
        .from("hosts")
        .select("*, master_id")
        .eq("id", hostId)
        .single();

      if (error) {
        console.error("❌ loadHostById error:", error);
        setHostLoaded(true);
        return;
      }
      if (!host) {
        setHostLoaded(true);
        return;
      }

      setHostSettings(host);

      if (host.host_terms_markdown) setHostTerms(host.host_terms_markdown);

      if (host.master_id) {
        const { data: master, error: masterErr } = await supabase
          .from("master_accounts")
          .select("master_terms_markdown")
          .eq("id", host.master_id)
          .single();

        if (!masterErr && master?.master_terms_markdown) {
          setMasterTerms(master.master_terms_markdown);
        }
      }

      setHostLoaded(true);
    }

    async function loadContext() {
      try {
        if (wallId) {
          const { data, error } = await supabase
            .from("fan_walls")
            .select("background_value, host_id")
            .eq("id", wallId)
            .single();

          if (!error && data) {
            setWall(data);
            if (data.host_id) {
              await loadHostById(data.host_id);
              return;
            }
          }
        }

        if (wheelId) {
          const { data, error } = await supabase
            .from("prize_wheels")
            .select("host_id")
            .eq("id", wheelId)
            .single();

          if (!error && data?.host_id) {
            await loadHostById(data.host_id);
            return;
          }
        }

        if (pollId) {
          const { data, error } = await supabase
            .from("polls")
            .select("host_id")
            .eq("id", pollId)
            .single();

          if (!error && data?.host_id) {
            await loadHostById(data.host_id);
            return;
          }
        }

        if (basketballId) {
          const { data, error } = await supabase
            .from("bb_games")
            .select("host_id")
            .eq("id", basketballId)
            .single();

          if (!error && data?.host_id) {
            await loadHostById(data.host_id);
            return;
          }
        }

        // trivia QR → load host + background from trivia card
        if (triviaId) {
          const { data, error } = await supabase
            .from("trivia_cards")
            .select("background_type, background_value, host_id")
            .eq("id", triviaId)
            .single();

          if (!error && data) {
            setWall({
              background_value: data.background_value,
            });

            if (data.host_id) {
              await loadHostById(data.host_id);
              return;
            }
          }
        }

        // nothing gave us a host
        setHostLoaded(true);
      } catch (err) {
        console.error("loadContext error:", err);
        setHostLoaded(true);
      }
    }

    loadContext();
  }, [wallId, wheelId, pollId, basketballId, triviaId, supabase]);

  /* -------------------------------------------------
     AUTO-REDIRECT IF GUEST EXISTS
  ------------------------------------------------- */
  useEffect(() => {
    async function validateGuest() {
      const deviceId =
        typeof window !== "undefined"
          ? localStorage.getItem("guest_device_id")
          : null;
      const cached =
        typeof window !== "undefined"
          ? localStorage.getItem("guest_profile")
          : null;

      if (!deviceId || !cached) return;

      const { data, error } = await supabase
        .from("guest_profiles")
        .select("id")
        .eq("device_id", deviceId)
        .maybeSingle();

      if (error) {
        console.error("validateGuest error:", error);
        return;
      }

      if (!data) {
        localStorage.removeItem("guest_profile");
        return;
      }

      if (redirect) return router.push(redirect);
      if (wallId) return router.push(`/wall/${wallId}/submit`);
      if (wheelId) return router.push(`/prizewheel/${wheelId}/submit`);
      if (pollId) return router.push(`/polls/${pollId}/vote`);
      if (basketballId)
        return router.push(`/basketball/${basketballId}/submit`);
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
        redirect?.match(/([0-9a-fA-F-]{36})/)?.[0];

      const type =
        wallId
          ? "wall"
          : wheelId
          ? "prizewheel"
          : pollId
          ? "poll"
          : basketballId
          ? "basketball"
          : "";

      const payload = {
        ...form,
        age: form.date_of_birth
          ? Math.floor(
              (Date.now() - new Date(form.date_of_birth).getTime()) /
                (1000 * 60 * 60 * 24 * 365.25)
            )
          : null,
      };

      const { profile } = await syncGuestProfile(
        type,
        targetId,
        payload,
        hostSettings?.id || null
      );

      if (typeof window !== "undefined") {
        localStorage.setItem("guest_profile", JSON.stringify(profile));
      }

      if (redirect) router.push(redirect);
      else if (wallId) router.push(`/wall/${wallId}/submit`);
      else if (wheelId) router.push(`/prizewheel/${wheelId}/submit`);
      else if (pollId) router.push(`/polls/${pollId}/vote`);
      else if (basketballId) router.push(`/basketball/${basketballId}/submit`);
      else if (triviaId) router.push(`/trivia/${triviaId}/join`);
      else router.push("/");
    } catch (err) {
      console.error(err);
      alert("Error saving your information.");
    }

    setSubmitting(false);
  }

  /* -------------------------------------------------
     FIELD FLAGS — ONLY TRUE WHEN HOST SETS TRUE
  ------------------------------------------------- */
  const requireLastName = hostSettings?.require_last_name === true;
  const requireEmail    = hostSettings?.require_email === true;
  const requirePhone    = hostSettings?.require_phone === true;
  const requireStreet   = hostSettings?.require_street === true;
  const requireCity     = hostSettings?.require_city === true;
  const requireState    = hostSettings?.require_state === true;
  const requireZip      = hostSettings?.require_zip === true;
  const requireAge      = hostSettings?.require_age === true;

  /* -------------------------------------------------
     While host is loading, show dark loading screen
  ------------------------------------------------- */
  if (!hostLoaded) {
    return (
      <main className={cn('min-h-screen', 'w-full', 'flex', 'items-center', 'justify-center', 'bg-black', 'text-white')}>
        Loading…
      </main>
    );
  }

  /* -------------------------------------------------
     RENDER
  ------------------------------------------------- */
  return (
    <main className={cn(
      "relative flex items-center justify-center min-h-screen w-full text-white"
    )}>
      <div
        className={cn("absolute inset-0 bg-cover bg-center")}
        style={{
          backgroundImage: wall?.background_value?.includes("http")
            ? `url(${wall.background_value})`
            : wall?.background_value ||
              "linear-gradient(135deg,#0a2540,#1b2b44,#000000)",
        }}
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
          {/* ALWAYS required */}
          <input
            required
            placeholder="First Name *"
            className={cn(
              "w-full p-3 rounded-xl bg-black/40 border border-white/20"
            )}
            value={form.first_name}
            onChange={e => setForm({ ...form, first_name: e.target.value })}
          />

          {requireLastName && (
            <input
              required
              placeholder="Last Name *"
              className={cn(
                "w-full p-3 rounded-xl bg-black/40 border border-white/20"
              )}
              value={form.last_name}
              onChange={e => setForm({ ...form, last_name: e.target.value })}
            />
          )}

          {requireEmail && (
            <input
              required
              type="email"
              placeholder="Email *"
              className={cn(
                "w-full p-3 rounded-xl bg-black/40 border border-white/20"
              )}
              value={form.email}
              onChange={e => setForm({ ...form, email: e.target.value })}
            />
          )}

          {requirePhone && (
            <input
              required
              type="tel"
              placeholder="Phone *"
              className={cn(
                "w-full p-3 rounded-xl bg-black/40 border border-white/20"
              )}
              value={form.phone}
              onChange={e => setForm({ ...form, phone: e.target.value })}
            />
          )}

          {requireStreet && (
            <input
              required
              placeholder="Street Address *"
              className={cn(
                "w-full p-3 rounded-xl bg-black/40 border border-white/20"
              )}
              value={form.street}
              onChange={e => setForm({ ...form, street: e.target.value })}
            />
          )}

          {requireCity && (
            <input
              required
              placeholder="City *"
              className={cn(
                "w-full p-3 rounded-xl bg-black/40 border border-white/20"
              )}
              value={form.city}
              onChange={e => setForm({ ...form, city: e.target.value })}
            />
          )}

          {requireState && (
            <select
              required
              className={cn(
                "w-full p-3 rounded-xl bg-black/40 border border-white/20"
              )}
              value={form.state}
              onChange={e => setForm({ ...form, state: e.target.value })}
            >
              <option value="">State *</option>
              {stateOptions.map(s => (
                <option key={s} value={s} className="text-black">
                  {s}
                </option>
              ))}
            </select>
          )}

          {requireZip && (
            <input
              required
              placeholder="ZIP Code *"
              className={cn(
                "w-full p-3 rounded-xl bg-black/40 border border-white/20"
              )}
              value={form.zip}
              onChange={e => setForm({ ...form, zip: e.target.value })}
            />
          )}

          {requireAge && (
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
                onChange={e =>
                  setForm({ ...form, date_of_birth: e.target.value })
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

          <label
            className={cn(
              "flex items-center gap-2 text-sm text-gray-300 mt-2"
            )}
          >
            <input
              type="checkbox"
              checked={agree}
              onChange={e => setAgree(e.target.checked)}
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
