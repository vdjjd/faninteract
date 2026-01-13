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

function looksLikeUrl(v: any): boolean {
  return typeof v === "string" && /^https?:\/\//i.test(v.trim());
}

/**
 * Convert "background_type + background_value" into a CSS backgroundImage string:
 * - image -> `url(...)`
 * - gradient/color -> use string directly
 */
function toCssBg(background_type: any, background_value: any): string | null {
  const v = typeof background_value === "string" ? background_value.trim() : "";
  if (!v) return null;

  const t = typeof background_type === "string" ? background_type.trim().toLowerCase() : "";

  if (t === "image" || looksLikeUrl(v)) return `url(${v})`;
  return v; // gradient or any valid CSS background-image value
}

/**
 * Safe helper: some tables won't have background_* columns.
 * This attempts host_id + background_value, and if column missing, falls back to host_id only.
 */
async function fetchHostAndBgFromStandardTable(
  supabase: any,
  table: string,
  id: string,
  bgColumn = "background_value"
): Promise<{ host_id: string | null; cssBg: string | null }> {
  // 1) Attempt host_id + background_value
  {
    const { data, error } = await supabase
      .from(table)
      .select(`host_id, ${bgColumn}`)
      .eq("id", id)
      .single();

    if (!error && data) {
      const bgVal = data?.[bgColumn] ?? null;
      const cssBg = bgVal ? (looksLikeUrl(bgVal) ? `url(${bgVal})` : String(bgVal)) : null;
      return { host_id: data.host_id ?? null, cssBg };
    }

    const msg = String((error as any)?.message || "");
    const code = String((error as any)?.code || "");
    const isMissingColumn =
      code === "42703" ||
      msg.toLowerCase().includes("column") ||
      msg.toLowerCase().includes("does not exist");

    if (!isMissingColumn) {
      console.error(`❌ ${table} load error:`, error);
    }
  }

  // 2) Fallback host_id only
  {
    const { data, error } = await supabase
      .from(table)
      .select("host_id")
      .eq("id", id)
      .single();

    if (error) {
      console.error(`❌ ${table} host_id fallback error:`, error);
      return { host_id: null, cssBg: null };
    }

    return { host_id: data?.host_id ?? null, cssBg: null };
  }
}

/* -------------------------------------------------
   ✅ Accurate age calculation
------------------------------------------------- */
function calculateAgeFromDob(dobStr: string): number | null {
  if (!dobStr) return null;
  const dob = new Date(dobStr);
  if (Number.isNaN(dob.getTime())) return null;

  const today = new Date();
  let age = today.getFullYear() - dob.getFullYear();

  const m = today.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < dob.getDate())) age--;

  return age;
}

export default function GuestSignupPage() {
  const router = useRouter();
  const params = useSearchParams();
  const supabase = getSupabaseClient();

  /* -------------------------------------------------
     NORMALIZE QR PARAMS
  ------------------------------------------------- */
  const redirect = params.get("redirect") || "";
  const wallId = params.get("wall");
  const wheelId = params.get("prizewheel");
  const basketballId = params.get("basketball");
  const triviaQueryId = params.get("trivia"); // may be null

  // Legacy-only fallback. Ideally remove once all QRs carry wall/poll/etc.
  const hostParam = params.get("host");

  const rawType = params.get("type");
  let pollId = params.get("poll");

  // Handles malformed QR: ?type=poll=UUID
  if (!pollId && rawType?.startsWith("poll=")) {
    pollId = rawType.split("=")[1];
  }

  // Infer triviaId from redirect if missing
  let triviaId = triviaQueryId || null;
  if (!triviaId && redirect) {
    const match = redirect.match(
      /\/trivia\/([0-9a-fA-F-]{8}-[0-9a-fA-F-]{4}-[0-9a-fA-F-]{4}-[0-9a-fA-F-]{4}-[0-9a-fA-F-]{12})\/join/
    );
    if (match?.[1]) triviaId = match[1];
  }

  /* ------------------------------------------------- */
  const [bgCss, setBgCss] = useState<string | null>(null);

  const [hostIdFromContext, setHostIdFromContext] = useState<string | null>(null);
  const [hostSettings, setHostSettings] = useState<any | null>(null);
  const [loadingHost, setLoadingHost] = useState(true);

  const [hostTerms, setHostTerms] = useState("");
  const [masterTerms, setMasterTerms] = useState("");
  const [showTermsModal, setShowTermsModal] = useState(false);

  // ⭐ Venue terms from host_terms_sets
  const [venueTerms, setVenueTerms] = useState("");
  const [venueTermsEnabled, setVenueTermsEnabled] = useState(false);

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
     LOAD HOST CONTEXT + BACKGROUND from the QR source
  ------------------------------------------------- */
  useEffect(() => {
    let cancelled = false;

    async function loadHostById(hostId: string) {
      if (!hostId) return;

      const { data: host, error } = await supabase
        .from("hosts")
        .select(`
          id,
          master_id,
          venue_name,
          branding_logo_url,
          logo_url,
          require_last_name,
          require_email,
          require_phone,
          require_street,
          require_city,
          require_state,
          require_zip,
          require_age,
          minimum_age,
          host_terms_markdown,
          active_terms_set_id,
          loyalty_enabled,
          loyalty_show_badge,
          loyalty_show_visit_count
        `)
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

      // Host-level terms
      setHostTerms(host.host_terms_markdown || "");

      // Master / platform terms (FanInteract)
      if (host.master_id) {
        const { data: master, error: masterErr } = await supabase
          .from("master_accounts")
          .select("master_terms_markdown")
          .eq("id", host.master_id)
          .single();

        if (!cancelled) {
          if (masterErr) console.error("❌ master_accounts load error:", masterErr);
          setMasterTerms(master?.master_terms_markdown || "");
        }
      } else {
        setMasterTerms("");
      }

      // Venue terms (active_terms_set_id)
      if (host.active_terms_set_id) {
        const { data: termsSet, error: termsErr } = await supabase
          .from("host_terms_sets")
          .select("venue_terms_markdown, venue_terms_enabled")
          .eq("id", host.active_terms_set_id)
          .maybeSingle();

        if (termsErr) {
          console.error("❌ host_terms_sets load error:", termsErr);
          setVenueTerms("");
          setVenueTermsEnabled(false);
        } else if (termsSet) {
          setVenueTerms(termsSet.venue_terms_markdown || "");

          // ⭐ Treat null/undefined as ON for backwards compatibility
          const rawEnabled = (termsSet as any).venue_terms_enabled;
          const enabled =
            rawEnabled === null || rawEnabled === undefined
              ? true
              : toBool(rawEnabled);

          setVenueTermsEnabled(enabled);
        } else {
          setVenueTerms("");
          setVenueTermsEnabled(false);
        }
      } else {
        setVenueTerms("");
        setVenueTermsEnabled(false);
      }
    }

    async function loadContext() {
      setLoadingHost(true);

      try {
        let foundHostId: string | null = null;
        let foundBgCss: string | null = null;

        // 1) Fan Wall
        if (wallId) {
          const { host_id, cssBg } = await fetchHostAndBgFromStandardTable(
            supabase,
            "fan_walls",
            wallId,
            "background_value"
          );
          foundHostId = host_id;
          foundBgCss = cssBg;
        }

        // 2) Prize Wheel
        if (!foundHostId && wheelId) {
          const { data, error } = await supabase
            .from("prize_wheels")
            .select("host_id, background_type, background_value")
            .eq("id", wheelId)
            .single();

          if (error) console.error("❌ prize_wheels load error:", error);

          if (!cancelled && data) {
            foundHostId = data.host_id ?? null;
            foundBgCss = toCssBg(data.background_type, data.background_value);
          }
        }

        // 3) Poll
        if (!foundHostId && pollId) {
          const { host_id, cssBg } = await fetchHostAndBgFromStandardTable(
            supabase,
            "polls",
            pollId,
            "background_value"
          );
          foundHostId = host_id;
          foundBgCss = cssBg ?? foundBgCss;
        }

        // 4) Basketball
        if (!foundHostId && basketballId) {
          const { host_id, cssBg } = await fetchHostAndBgFromStandardTable(
            supabase,
            "bb_games",
            basketballId,
            "background_value"
          );
          foundHostId = host_id;
          foundBgCss = cssBg ?? foundBgCss;
        }

        // 5) Trivia
        if (!foundHostId && triviaId) {
          const { host_id, cssBg } = await fetchHostAndBgFromStandardTable(
            supabase,
            "trivia_cards",
            triviaId,
            "background_value"
          );
          foundHostId = host_id;
          foundBgCss = cssBg ?? foundBgCss;
        }

        // Legacy fallback
        if (!foundHostId && hostParam) {
          console.warn("⚠️ Using host from URL as fallback (legacy QR):", hostParam);
          foundHostId = hostParam;
        }

        if (!cancelled) setBgCss(foundBgCss);

        if (foundHostId) {
          await loadHostById(foundHostId);
        } else if (!cancelled) {
          setHostSettings({
            id: null,
            venue_name: null,
            branding_logo_url: null,
            logo_url: null,
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
          setHostTerms("");
          setMasterTerms("");
          setVenueTerms("");
          setVenueTermsEnabled(false);
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

      if (error) console.error("❌ guest_profiles check error:", error);

      if (!data) {
        localStorage.removeItem("guest_profile");
        return;
      }

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

      const dob = form.date_of_birth ? form.date_of_birth : null;

      const payload = {
        ...form,
        date_of_birth: dob,
        age: dob ? calculateAgeFromDob(dob) : null,
      };

      const hostIdForSync = hostIdFromContext || hostSettings?.id || null;

      const { profile } = await syncGuestProfile(
        type,
        targetId as string,
        payload,
        hostIdForSync as string
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
      <main className={cn("min-h-screen w-full flex items-center justify-center bg-black text-white")}>
        Loading…
      </main>
    );
  }

  // ✅ Background
  const bgImage = bgCss || "linear-gradient(135deg,#0a2540,#1b2b44,#000000)";

  // ✅ Logo
  const logoSrc =
    hostSettings?.branding_logo_url ||
    hostSettings?.logo_url ||
    "/faninteractlogo.png";

  const logoAlt = hostSettings?.venue_name
    ? `${hostSettings.venue_name} Logo`
    : "FanInteract";

  const isRemoteLogo = typeof logoSrc === "string" && logoSrc.startsWith("http");

  // ✅ Terms ordering: Host → Venue → FanInteract
  const hostVenueChunks: string[] = [];
  if (hostTerms && hostTerms.trim().length > 0) {
    hostVenueChunks.push(hostTerms);
  }
  if (venueTermsEnabled && venueTerms.trim().length > 0) {
    hostVenueChunks.push(venueTerms);
  }
  const hostVenueTermsMarkdown = hostVenueChunks.join("\n\n---\n\n");

  return (
    <main className={cn("relative flex items-center justify-center min-h-screen w-full text-white")}>
      <div className={cn("absolute inset-0 bg-cover bg-center")} style={{ backgroundImage: bgImage }} />
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
          {isRemoteLogo ? (
            <img
              src={logoSrc}
              alt={logoAlt}
              className={cn("w-[240px] md:w-[320px] object-contain")}
              style={{ maxHeight: 120 }}
            />
          ) : (
            <Image
              src={logoSrc}
              alt={logoAlt}
              width={360}
              height={120}
              className={cn("w-[240px] md:w-[320px] object-contain")}
              priority
            />
          )}
        </div>

        <motion.h2 className={cn("text-center text-2xl font-semibold text-sky-300 mb-6")}>
          Join the Fan Zone
        </motion.h2>

        <form onSubmit={handleSubmit} className="space-y-3">
          <input
            required
            placeholder="First Name *"
            className={cn("w-full p-3 rounded-xl bg-black/40 border border-white/20")}
            value={form.first_name}
            onChange={(e) => setForm({ ...form, first_name: e.target.value })}
          />

          {hostSettings.require_last_name && (
            <input
              required
              placeholder="Last Name *"
              className={cn("w-full p-3 rounded-xl bg-black/40 border border-white/20")}
              value={form.last_name}
              onChange={(e) => setForm({ ...form, last_name: e.target.value })}
            />
          )}

          {hostSettings.require_email && (
            <input
              required
              type="email"
              placeholder="Email *"
              className={cn("w-full p-3 rounded-xl bg-black/40 border border-white/20")}
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
            />
          )}

          {hostSettings.require_phone && (
            <input
              required
              type="tel"
              placeholder="Phone *"
              className={cn("w-full p-3 rounded-xl bg-black/40 border border-white/20")}
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
            />
          )}

          {hostSettings.require_street && (
            <input
              required
              placeholder="Street Address *"
              className={cn("w-full p-3 rounded-xl bg-black/40 border border-white/20")}
              value={form.street}
              onChange={(e) => setForm({ ...form, street: e.target.value })}
            />
          )}

          {hostSettings.require_city && (
            <input
              required
              placeholder="City *"
              className={cn("w-full p-3 rounded-xl bg-black/40 border border-white/20")}
              value={form.city}
              onChange={(e) => setForm({ ...form, city: e.target.value })}
            />
          )}

          {hostSettings.require_state && (
            <select
              required
              className={cn("w-full p-3 rounded-xl bg-black/40 border border-white/20")}
              value={form.state}
              onChange={(e) => setForm({ ...form, state: e.target.value })}
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
              className={cn("w-full p-3 rounded-xl bg-black/40 border border-white/20")}
              value={form.zip}
              onChange={(e) => setForm({ ...form, zip: e.target.value })}
            />
          )}

          {hostSettings.require_age && (
            <div className="relative">
              <input
                required
                type="date"
                max={new Date().toISOString().split("T")[0]}
                className={cn(
                  "w-full h/[52px] px-3 rounded-xl",
                  "bg-black/40 border border-white/20",
                  "text-white appearance-none [color-scheme:dark]"
                )}
                value={form.date_of_birth}
                onChange={(e) => setForm({ ...form, date_of_birth: e.target.value })}
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

          <label className={cn("flex items-center gap-2 text-sm text-gray-300 mt-2")}>
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
        // Host + Venue (in that order)
        hostTerms={hostVenueTermsMarkdown}
        // FanInteract platform terms last
        masterTerms={masterTerms}
      />
    </main>
  );
}
