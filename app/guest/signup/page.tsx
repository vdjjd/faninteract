"use client";

import { useEffect, useState, useMemo } from "react";
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

function toCssBg(background_type: any, background_value: any): string | null {
  const v = typeof background_value === "string" ? background_value.trim() : "";
  if (!v) return null;

  const t =
    typeof background_type === "string"
      ? background_type.trim().toLowerCase()
      : "";

  if (t === "image" || looksLikeUrl(v)) return `url(${v})`;
  return v;
}

async function fetchHostAndBgFromStandardTable(
  supabase: any,
  table: string,
  id: string,
  bgColumn = "background_value"
): Promise<{ host_id: string | null; cssBg: string | null }> {
  {
    const { data, error } = await supabase
      .from(table)
      .select(`host_id, ${bgColumn}`)
      .eq("id", id)
      .single();

    if (!error && data) {
      const bgVal = data?.[bgColumn] ?? null;
      const cssBg = bgVal
        ? looksLikeUrl(bgVal)
          ? `url(${bgVal})`
          : String(bgVal)
        : null;
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

/* -------------------------------------------------
   ✅ Normalize minimum age from host settings
------------------------------------------------- */
function normalizeMinAge(val: any): 18 | 21 | null {
  const n = Number(val);
  if (n === 18) return 18;
  if (n === 21) return 21;
  return null;
}

type GuestProfileRow = {
  id: string;
  device_id: string | null;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  street: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  date_of_birth: string | null;
  total_visit_count: number | null;
};

export default function GuestSignupPage() {
  const router = useRouter();
  const params = useSearchParams();
  const supabase = getSupabaseClient();

  const redirect = params.get("redirect") || "";
  const wallId = params.get("wall");
  const wheelId = params.get("prizewheel");
  const basketballId = params.get("basketball");
  const triviaQueryId = params.get("trivia");
  const hostParam = params.get("host");

  const rawType = params.get("type");
  let pollId = params.get("poll");
  if (!pollId && rawType?.startsWith("poll=")) {
    pollId = rawType.split("=")[1];
  }

  let triviaId = triviaQueryId || null;
  if (!triviaId && redirect) {
    const match = redirect.match(
      /\/trivia\/([0-9a-fA-F-]{8}-[0-9a-fA-F-]{4}-[0-9a-fA-F-]{4}-[0-9a-fA-F-]{4}-[0-9a-fA-F-]{12})\/join/
    );
    if (match?.[1]) triviaId = match[1];
  }

  const [bgCss, setBgCss] = useState<string | null>(null);

  const [hostIdFromContext, setHostIdFromContext] = useState<string | null>(null);
  const [hostSettings, setHostSettings] = useState<any | null>(null);
  const [loadingHost, setLoadingHost] = useState(true);

  const [hostTerms, setHostTerms] = useState("");
  const [masterTerms, setMasterTerms] = useState("");
  const [showTermsModal, setShowTermsModal] = useState(false);

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

  const [existingProfile, setExistingProfile] = useState<GuestProfileRow | null>(null);
  const [checkingExisting, setCheckingExisting] = useState(true);
  const [missingFields, setMissingFields] = useState<string[]>([]);

  // ✅ Age block UI state
  const [ageBlocked, setAgeBlocked] = useState(false);
  const [ageBlockedMin, setAgeBlockedMin] = useState<18 | 21 | null>(null);

  useEffect(() => {
    if (typeof window !== "undefined") {
      getOrCreateGuestDeviceId();
    }
  }, []);

  /* -------------------------------------------------
     LOAD HOST CONTEXT + BACKGROUND
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
          venue_terms_enabled,
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

      setHostTerms(host.host_terms_markdown || "");

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

      if (host.active_terms_set_id) {
        const { data: termsSet, error: termsErr } = await supabase
          .from("host_terms_sets")
          .select("venue_terms_markdown")
          .eq("id", host.active_terms_set_id)
          .maybeSingle();

        if (termsErr) {
          console.error("❌ host_terms_sets load error:", termsErr);
          setVenueTerms("");
        } else if (termsSet) {
          setVenueTerms(termsSet.venue_terms_markdown || "");
        } else {
          setVenueTerms("");
        }
      } else {
        setVenueTerms("");
      }

      setVenueTermsEnabled(toBool(host.venue_terms_enabled));
    }

    async function loadContext() {
      setLoadingHost(true);

      try {
        let foundHostId: string | null = null;
        let foundBgCss: string | null = null;

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
            minimum_age: null,
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
     REQUIRED FIELD LOGIC
  ------------------------------------------------- */
  const requiredKeys = useMemo(() => {
    if (!hostSettings) return ["first_name"];
    const keys = ["first_name"];
    if (hostSettings.require_last_name) keys.push("last_name");
    if (hostSettings.require_email) keys.push("email");
    if (hostSettings.require_phone) keys.push("phone");
    if (hostSettings.require_street) keys.push("street");
    if (hostSettings.require_city) keys.push("city");
    if (hostSettings.require_state) keys.push("state");
    if (hostSettings.require_zip) keys.push("zip");
    if (hostSettings.require_age) keys.push("date_of_birth");
    return keys;
  }, [hostSettings]);

  function computeMissing(profile: GuestProfileRow | null) {
    const missing: string[] = [];
    for (const k of requiredKeys) {
      const val =
        k === "date_of_birth"
          ? (profile?.date_of_birth ?? "")
          : (profile as any)?.[k] ?? "";

      if (!String(val ?? "").trim()) missing.push(k);
    }
    return missing;
  }

  const isReturning = !!existingProfile?.id;

  const showField = (key: string) => {
    if (!isReturning) {
      if (key === "first_name") return true;
      return requiredKeys.includes(key);
    }
    return missingFields.includes(key);
  };

  /* -------------------------------------------------
     LOAD EXISTING GUEST BY device_id
     + ✅ AGE BLOCK CHECK BEFORE REDIRECT
  ------------------------------------------------- */
  useEffect(() => {
    let cancelled = false;

    async function run() {
      if (typeof window === "undefined") return;
      if (loadingHost || !hostSettings) return;

      setCheckingExisting(true);
      setAgeBlocked(false);
      setAgeBlockedMin(null);

      const deviceId = localStorage.getItem("guest_device_id");
      if (!deviceId) {
        setExistingProfile(null);
        setMissingFields([]);
        setCheckingExisting(false);
        return;
      }

      const { data, error } = await supabase
        .from("guest_profiles")
        .select(
          "id, device_id, first_name, last_name, email, phone, street, city, state, zip, date_of_birth, total_visit_count"
        )
        .eq("device_id", deviceId)
        .maybeSingle();

      if (cancelled) return;

      if (error) {
        console.error("❌ guest_profiles check error:", error);
        setExistingProfile(null);
        setMissingFields([]);
        setCheckingExisting(false);
        return;
      }

      if (!data) {
        localStorage.removeItem("guest_profile");
        setExistingProfile(null);
        setMissingFields([]);
        setCheckingExisting(false);
        return;
      }

      const profile = data as GuestProfileRow;
      setExistingProfile(profile);

      setForm((prev) => ({
        ...prev,
        first_name: profile.first_name ?? "",
        last_name: profile.last_name ?? "",
        email: profile.email ?? "",
        phone: profile.phone ?? "",
        street: profile.street ?? "",
        city: profile.city ?? "",
        state: profile.state ?? "",
        zip: profile.zip ?? "",
        date_of_birth: profile.date_of_birth ?? "",
      }));

      // ✅ AGE BLOCK: if host requires age and has minimum_age, and we have DOB -> block immediately if underage
      const minAge = hostSettings?.require_age ? normalizeMinAge(hostSettings?.minimum_age) : null;
      if (minAge && profile.date_of_birth) {
        const a = calculateAgeFromDob(profile.date_of_birth);
        if (typeof a === "number" && a < minAge) {
          setAgeBlocked(true);
          setAgeBlockedMin(minAge);
          setMissingFields([]);
          setCheckingExisting(false);
          return;
        }
      }

      const missing = computeMissing(profile);
      setMissingFields(missing);

      if (missing.length === 0) {
        localStorage.setItem("guest_profile", JSON.stringify(profile));

        if (redirect) return router.push(redirect);
        if (wallId) return router.push(`/wall/${wallId}/submit`);
        if (wheelId) return router.push(`/prizewheel/${wheelId}/submit`);
        if (pollId) return router.push(`/polls/${pollId}/vote`);
        if (basketballId) return router.push(`/basketball/${basketballId}/submit`);
        if (triviaId) return router.push(`/trivia/${triviaId}/join`);
      }

      setCheckingExisting(false);
    }

    run();
    return () => {
      cancelled = true;
    };
  }, [
    loadingHost,
    hostSettings,
    requiredKeys,
    redirect,
    wallId,
    wheelId,
    pollId,
    basketballId,
    triviaId,
    router,
    supabase,
  ]);

  /* -------------------------------------------------
     SUBMIT + ✅ AGE ENFORCEMENT
     ✅ PATCH: catch AGE_RESTRICTED from syncGuestProfile
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

      const merged: any = { ...(existingProfile ?? {}) };
      for (const key of Object.keys(form) as (keyof typeof form)[]) {
        const v = (form[key] ?? "").toString().trim();
        if (v.length > 0) merged[key] = v;
      }

      const dob = merged.date_of_birth ? String(merged.date_of_birth) : null;
      const computedAge = dob ? calculateAgeFromDob(dob) : null;

      const payload = {
        first_name: merged.first_name ?? "",
        last_name: merged.last_name ?? "",
        email: merged.email ?? "",
        phone: merged.phone ?? "",
        street: merged.street ?? "",
        city: merged.city ?? "",
        state: merged.state ?? "",
        zip: merged.zip ?? "",
        date_of_birth: dob,
        age: computedAge,
      };

      const hostIdForSync = hostIdFromContext || hostSettings?.id || null;

      if (toBool(hostSettings?.require_age) && !dob) {
        alert("Please enter your date of birth.");
        setSubmitting(false);
        return;
      }

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
    } catch (err: any) {
      console.error("❌ handleSubmit error:", err);

      // ✅ NEW: underage blocked by syncGuestProfile (server-side enforcement)
      if (err?.code === "AGE_RESTRICTED") {
        const min = normalizeMinAge(err?.minimum_age);
        setAgeBlocked(true);
        setAgeBlockedMin(min);
        setSubmitting(false);
        return;
      }

      // Optional: DOB required (server-side)
      if (err?.code === "AGE_DOB_REQUIRED") {
        alert("Please enter your date of birth.");
        setSubmitting(false);
        return;
      }

      alert("Error saving your information.");
    }

    setSubmitting(false);
  }

  /* -------------------------------------------------
     LOADING / GUARD
  ------------------------------------------------- */
  if (loadingHost || !hostSettings || checkingExisting) {
    return (
      <main className={cn("min-h-screen w-full flex items-center justify-center bg-black text-white")}>
        Loading…
      </main>
    );
  }

  const bgImage = bgCss || "linear-gradient(135deg,#0a2540,#1b2b44,#000000)";

  const logoSrc =
    hostSettings?.branding_logo_url ||
    hostSettings?.logo_url ||
    "/faninteractlogo.png";

  const logoAlt = hostSettings?.venue_name
    ? `${hostSettings.venue_name} Logo`
    : "FanInteract";

  const isRemoteLogo = typeof logoSrc === "string" && logoSrc.startsWith("http");

  const hostVenueChunks: string[] = [];
  if (hostTerms && hostTerms.trim().length > 0) hostVenueChunks.push(hostTerms);
  if (venueTermsEnabled && venueTerms.trim().length > 0) hostVenueChunks.push(venueTerms);
  const hostVenueTermsMarkdown = hostVenueChunks.join("\n\n---\n\n");

  const showReturningNotice = isReturning && missingFields.length > 0;
  const visitCount = existingProfile?.total_visit_count ?? null;

  // ✅ AGE BLOCK SCREEN (hard stop)
  if (ageBlocked) {
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
            "border border-white/10 bg-white/10 backdrop-blur-lg text-center"
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

          <h2 className={cn("text-2xl font-semibold text-red-300 mb-3")}>Age Restricted</h2>
          <p className={cn("text-gray-200")}>
            You must be <span className="font-semibold">{ageBlockedMin ?? "of required age"}+</span> to participate.
          </p>
          <p className={cn("text-sm text-gray-400 mt-2")}>
            If you believe this is a mistake, please check your date of birth.
          </p>

          <button
            onClick={() => setShowTermsModal(true)}
            className={cn("mt-5 underline text-sky-400 text-sm")}
            type="button"
          >
            View Terms
          </button>
        </motion.div>

        <TermsModal
          isOpen={showTermsModal}
          onClose={() => setShowTermsModal(false)}
          hostTerms={hostVenueTermsMarkdown}
          masterTerms={masterTerms}
        />
      </main>
    );
  }

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

        <motion.h2 className={cn("text-center text-2xl font-semibold text-sky-300 mb-3")}>
          {showReturningNotice ? "Quick Update" : "Join the Fan Zone"}
        </motion.h2>

        {showReturningNotice && (
          <div className={cn("mb-5 p-3 rounded-xl border border-white/10 bg-black/30 text-sm text-gray-200")}>
            <div className={cn("font-medium", "text-white")}>
              Welcome back{existingProfile?.first_name ? `, ${existingProfile.first_name}` : ""}.
            </div>
            <div className={cn("text-gray-300", "mt-1")}>
              We just need {missingFields.length} more thing{missingFields.length === 1 ? "" : "s"} to finish your profile.
              {typeof visitCount === "number" && visitCount > 0 ? (
                <span className="text-gray-400"> (Visits: {visitCount})</span>
              ) : null}
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-3">
          {showField("first_name") && (
            <input
              required
              placeholder="First Name *"
              className={cn("w-full p-3 rounded-xl bg-black/40 border border-white/20")}
              value={form.first_name}
              onChange={(e) => setForm({ ...form, first_name: e.target.value })}
            />
          )}

          {showField("last_name") && (
            <input
              required
              placeholder="Last Name *"
              className={cn("w-full p-3 rounded-xl bg-black/40 border border-white/20")}
              value={form.last_name}
              onChange={(e) => setForm({ ...form, last_name: e.target.value })}
            />
          )}

          {showField("email") && (
            <input
              required
              type="email"
              placeholder="Email *"
              className={cn("w-full p-3 rounded-xl bg-black/40 border border-white/20")}
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
            />
          )}

          {showField("phone") && (
            <input
              required
              type="tel"
              placeholder="Phone *"
              className={cn("w-full p-3 rounded-xl bg-black/40 border border-white/20")}
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
            />
          )}

          {showField("street") && (
            <input
              required
              placeholder="Street Address *"
              className={cn("w-full p-3 rounded-xl bg-black/40 border border-white/20")}
              value={form.street}
              onChange={(e) => setForm({ ...form, street: e.target.value })}
            />
          )}

          {showField("city") && (
            <input
              required
              placeholder="City *"
              className={cn("w-full p-3 rounded-xl bg-black/40 border border-white/20")}
              value={form.city}
              onChange={(e) => setForm({ ...form, city: e.target.value })}
            />
          )}

          {showField("state") && (
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

          {showField("zip") && (
            <input
              required
              placeholder="ZIP Code *"
              className={cn("w-full p-3 rounded-xl bg-black/40 border border-white/20")}
              value={form.zip}
              onChange={(e) => setForm({ ...form, zip: e.target.value })}
            />
          )}

          {showField("date_of_birth") && (
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
        hostTerms={hostVenueTermsMarkdown}
        masterTerms={masterTerms}
      />
    </main>
  );
}
