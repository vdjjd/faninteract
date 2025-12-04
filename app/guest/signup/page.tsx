"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Image from "next/image";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

import { getSupabaseClient } from "@/lib/supabaseClient";
import { syncGuestProfile, getOrCreateGuestDeviceId } from "@/lib/syncGuest";

import TermsModal from "@/components/TermsModal";

/* ----------------------------------------------------------
 * 🔥 STATE OPTIONS
 * ---------------------------------------------------------- */
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

  const redirect = params.get("redirect");
  const wallId = params.get("wall");
  const wheelId = params.get("prizewheel");
  const pollId = params.get("poll");

  // ⭐ NEW — BASKETBALL SUPPORT
  const basketballId = params.get("basketball");

  const supabase = getSupabaseClient();

  const [wall, setWall] = useState<any>(null);
  const [hostSettings, setHostSettings] = useState<any>(null);

  const [hostTerms, setHostTerms] = useState("");
  const [masterTerms, setMasterTerms] = useState("");

  const [showTermsModal, setShowTermsModal] = useState(false);

  /* ----------------------------------------------------------
   * FORM
   * ---------------------------------------------------------- */
  const [form, setForm] = useState({
    first_name: "",
    last_name: "",
    email: "",
    phone: "",
    street: "",
    city: "",
    state: "",
    zip: "",
    age: "",
  });

  const [agree, setAgree] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  /* ----------------------------------------------------------
   * Ensure device_id exists
   * ---------------------------------------------------------- */
  useEffect(() => {
    getOrCreateGuestDeviceId();
  }, []);

  /* ----------------------------------------------------------
   * LOAD HOST + MASTER TERMS (Now includes BASKETBALL)
   * ---------------------------------------------------------- */
  useEffect(() => {
    async function loadHostForWall() {
      if (!wallId) return;
      const { data } = await supabase
        .from("fan_walls")
        .select("background_value, host_id")
        .eq("id", wallId)
        .single();
      setWall(data);
      if (data?.host_id) loadHost(data.host_id);
    }

    async function loadHostForWheel() {
      if (!wheelId) return;
      const { data } = await supabase
        .from("prize_wheels")
        .select("host_id")
        .eq("id", wheelId)
        .single();
      if (data?.host_id) loadHost(data.host_id);
    }

    async function loadHostForPoll() {
      if (!pollId) return;
      const { data } = await supabase
        .from("polls")
        .select("host_id")
        .eq("id", pollId)
        .single();
      if (data?.host_id) loadHost(data.host_id);
    }

    // ⭐ NEW — Load host for Basketball Game
    async function loadHostForBasketball() {
      if (!basketballId) return;
      const { data } = await supabase
        .from("bb_games")
        .select("host_id")
        .eq("id", basketballId)
        .single();
      if (data?.host_id) loadHost(data.host_id);
    }

    loadHostForWall();
    loadHostForWheel();
    loadHostForPoll();
    loadHostForBasketball(); // ⭐ NEW

  }, [wallId, wheelId, pollId, basketballId]);

  async function loadHost(hostId: string) {
    const { data: host } = await supabase
      .from("hosts")
      .select("*, master_id")
      .eq("id", hostId)
      .single();

    if (host?.host_terms_markdown) {
      setHostTerms(host.host_terms_markdown);
    }

    setHostSettings(host);

    if (host?.master_id) {
      const { data: master } = await supabase
        .from("master_accounts")
        .select("master_terms_markdown")
        .eq("id", host.master_id)
        .single();
      if (master?.master_terms_markdown)
        setMasterTerms(master.master_terms_markdown);
    }
  }

  /* ----------------------------------------------------------
   * AUTO-FORWARD RETURNING GUESTS — NOW SUPPORTS BASKETBALL
   * ---------------------------------------------------------- */
  useEffect(() => {
    async function validateGuest() {
      const deviceId = localStorage.getItem("guest_device_id");
      const cached = localStorage.getItem("guest_profile");
      if (!deviceId || !cached) return;

      const { data } = await supabase
        .from("guest_profiles")
        .select("id")
        .eq("device_id", deviceId)
        .maybeSingle();

      if (!data) {
        localStorage.removeItem("guest_profile");
        return;
      }

      if (redirect) return router.push(redirect);
      if (wallId) return router.push(`/wall/${wallId}/submit`);
      if (wheelId) return router.push(`/prizewheel/${wheelId}/submit`);
      if (pollId) return router.push(`/polls/${pollId}/vote`);
      
      // ⭐ NEW for basketball auto-forward
      if (basketballId) return router.push(`/basketball/${basketballId}`);
    }

    validateGuest();
  }, [redirect, wallId, wheelId, pollId, basketballId]);

  /* ----------------------------------------------------------
   * SUBMIT FORM (NOW SUPPORTS BASKETBALL)
   * ---------------------------------------------------------- */
  const handleSubmit = async (e: any) => {
    e.preventDefault();
    if (!agree) return alert("You must agree to the Terms.");

    setSubmitting(true);

    try {
      let targetId =
        wallId ||
        wheelId ||
        pollId ||
        basketballId || // ⭐ NEW
        redirect?.match(/([0-9a-fA-F-]{36})/)?.[0];

      if (!targetId && redirect?.startsWith("/polls/"))
        targetId = redirect.split("/")[2];

      const type =
        wallId ? "wall" :
        wheelId ? "prizewheel" :
        pollId ? "poll" :
        basketballId ? "basketball" : // ⭐ NEW
        "";

      const { profile } = await syncGuestProfile(type, targetId, form);

      localStorage.setItem("guest_profile", JSON.stringify(profile));

      // Redirect logic
      if (redirect) router.push(redirect);
      else if (wallId) router.push(`/wall/${wallId}/submit`);
      else if (wheelId) router.push(`/prizewheel/${wheelId}/submit`);
      else if (pollId) router.push(`/polls/${pollId}/vote`);
      else if (basketballId) router.push(`/basketball/${basketballId}`); // ⭐ NEW
      else router.push("/");
    } catch (err) {
      console.error(err);
      alert("Error saving your information.");
    }

    setSubmitting(false);
  };

  /* ----------------------------------------------------------
   * FORM FIELD HELPER
   * ---------------------------------------------------------- */
  const renderField = (
    key: string,
    placeholder: string,
    type: string = "text",
    required: boolean = false
  ) => (
    <input
      key={key}
      name={key}
      type={type}
      required={required}
      placeholder={placeholder}
      value={(form as any)[key]}
      onChange={(e) => setForm({ ...form, [key]: e.target.value })}
      className={cn(
        "w-full p-3 rounded-xl bg-black/40 border border-white/20",
        "focus:border-sky-400 outline-none"
      )}
    />
  );

  if (!hostSettings)
    return (
      <main className={cn("text-white flex items-center justify-center h-screen")}>
        Loading…
      </main>
    );

  /* ----------------------------------------------------------
   * RENDER PAGE
   * ---------------------------------------------------------- */
  return (
    <main className={cn("relative flex items-center justify-center min-h-screen w-full text-white")}>
      {/* BACKGROUND */}
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

      {/* CARD */}
      <motion.div
        initial={{ opacity: 0, y: 30, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.5 }}
        className={cn(
          "relative z-10 w-[95%] max-w-md rounded-2xl p-8",
          "shadow-[0_0_40px_rgba(0,150,255,0.25)]",
          "border border-white/10 bg-white/10 backdrop-blur-lg"
        )}
      >
        {/* LOGO */}
        <div className={cn("flex justify-center mb-6")}>
          <Image
            src="/faninteractlogo.png"
            alt="FanInteract"
            width={360}
            height={120}
            className={cn("w-[240px] md:w-[320px] drop-shadow-[0_0_32px_rgba(56,189,248,0.4)]")}
          />
        </div>

        {/* TITLE */}
        <motion.h2
          animate={{
            textShadow: [
              "0 0 12px rgba(56,189,248,0.9)",
              "0 0 28px rgba(56,189,248,0.6)",
              "0 0 12px rgba(56,189,248,0.9)"
            ],
          }}
          transition={{ duration: 2, repeat: Infinity }}
          className={cn("text-center text-2xl font-semibold text-sky-300 mb-6")}
        >
          Join the Fan Zone
        </motion.h2>

        {/* FORM */}
        <form onSubmit={handleSubmit} className="space-y-3">

          {renderField("first_name", "First Name *", "text", true)}

          {hostSettings.require_last_name &&
            renderField("last_name", "Last Name *", "text", true)}

          {hostSettings.require_email &&
            renderField("email", "Email *", "email", true)}

          {hostSettings.require_phone &&
            renderField("phone", "Phone *", "tel", true)}

          {hostSettings.require_street &&
            renderField("street", "Street Address *", "text", true)}

          {hostSettings.require_city &&
            renderField("city", "City *", "text", true)}

          {hostSettings.require_state && (
            <select
              name="state"
              required
              value={form.state}
              onChange={(e) =>
                setForm({ ...form, state: e.target.value })
              }
              className={cn(
                "w-full p-3 rounded-xl bg-black/40 border border-white/20",
                "focus:border-sky-400 outline-none text-white"
              )}
            >
              <option value="">State *</option>
              {stateOptions.map((s) => (
                <option key={s} value={s} className="text-black">
                  {s}
                </option>
              ))}
            </select>
          )}

          {hostSettings.require_zip &&
            renderField("zip", "ZIP Code *", "tel", true)}

          {hostSettings.require_age &&
            renderField("age", "Age *", "number", true)}

          {/* TERMS CHECKBOX WITH MODAL BUTTON */}
          <label className={cn("flex items-center gap-2 text-sm text-gray-300 mt-2")}>
            <input
              type="checkbox"
              className={cn("w-4 h-4 accent-sky-400")}
              checked={agree}
              onChange={(e) => setAgree(e.target.checked)}
            />
            I agree to the{" "}
            <button
              type="button"
              onClick={() => setShowTermsModal(true)}
              className={cn("text-sky-400 underline")}
            >
              Terms
            </button>
          </label>

          <button
            disabled={submitting}
            className={cn(
              "w-full py-3 rounded-xl bg-gradient-to-r",
              "from-sky-500 to-blue-600 font-semibold shadow-lg",
              "hover:scale-[1.03] active:scale-[0.97] transition-all"
            )}
          >
            {submitting ? "Submitting..." : "Continue"}
          </button>
        </form>
      </motion.div>

      {/* TERMS MODAL */}
      <TermsModal
        isOpen={showTermsModal}
        onClose={() => setShowTermsModal(false)}
        hostTerms={hostTerms}
        masterTerms={masterTerms}
      />
    </main>
  );
}
