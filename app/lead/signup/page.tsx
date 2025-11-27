"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import Image from "next/image";
import { cn } from "@/lib/utils";
import { getSupabaseClient } from "@/lib/supabaseClient";

export default function PriorityLeadSignup() {
  const params = useSearchParams();
  const router = useRouter();
  const supabase = getSupabaseClient();

  const adId = params.get("ad");
  const hostId = params.get("host");
  const source = params.get("src") || "qr";

  const [host, setHost] = useState<any>(null);
  const [submitting, setSubmitting] = useState(false);

  /* FORM STATE */
  const [form, setForm] = useState({
    first_name: "",
    last_name: "",
    email: "",
    phone: "",
    zip: "",
    product_interest: "",
    wants_contact: true,
    notes: "",
  });

  const updateField = (key: string, value: any) =>
    setForm((f) => ({ ...f, [key]: value }));

  /* LOAD HOST FOR BRANDING */
  useEffect(() => {
    async function load() {
      if (!hostId) return;

      const { data } = await supabase
        .from("hosts")
        .select("venue_name, branding_logo_url")
        .eq("id", hostId)
        .single();

      setHost(data);
    }
    load();
  }, [hostId]);

  /* SUBMIT LEAD */
  async function handleSubmit(e: any) {
    e.preventDefault();
    if (!adId || !hostId) return alert("Invalid QR Code — Missing IDs");

    setSubmitting(true);

    try {
      const device_id =
        localStorage.getItem("guest_device_id") ||
        (() => {
          const id = crypto.randomUUID();
          localStorage.setItem("guest_device_id", id);
          return id;
        })();

      const { data, error } = await supabase
        .from("priority_leads")
        .insert([
          {
            ad_slide_id: adId,
            host_id: hostId,
            first_name: form.first_name.trim(),
            last_name: form.last_name.trim(),
            email: form.email.trim(),
            phone: form.phone.trim(),
            zip: form.zip.trim(),
            product_interest: form.product_interest,
            wants_contact: form.wants_contact,
            notes: form.notes.trim(),
            device_id,
            source,
          },
        ])
        .select()
        .single();

      if (error) throw error;

      router.push(`/thanks/${data.id}?type=lead`);
    } catch (err) {
      console.error("Lead submit error:", err);
      alert("Something went wrong submitting your request.");
    }

    setSubmitting(false);
  }

  /* ------------------------------ UI ------------------------------ */

  return (
    <main
      className={cn(
        "relative flex items-center justify-center min-h-screen w-full text-white"
      )}
    >
      {/* BACKGROUND */}
      <div
        className={cn("absolute inset-0 bg-gradient-to-br from-[#0a1a2f] to-[#030712]")}
      />

      <div className={cn('absolute', 'inset-0', 'bg-black/60', 'backdrop-blur-md')} />

      {/* CARD */}
      <motion.div
        initial={{ opacity: 0, y: 25 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className={cn(
          "relative z-10 w-[95%] max-w-md rounded-2xl p-8",
          "shadow-[0_0_40px_rgba(0,150,255,0.25)]",
          "border border-white/10 bg-white/10 backdrop-blur-lg"
        )}
      >
        {/* LOGO */}
        <div className={cn('flex', 'justify-center', 'mb-6')}>
          <Image
            src={
              host?.branding_logo_url?.trim()
                ? host.branding_logo_url
                : "/faninteractlogo.png"
            }
            alt="Logo"
            width={360}
            height={120}
            className={cn('w-[240px]', 'drop-shadow-[0_0_24px_rgba(56,189,248,0.4)]')}
          />
        </div>

        <h2 className={cn('text-center', 'text-2xl', 'font-semibold', 'text-sky-300', 'mb-6')}>
          Request Information
        </h2>

        {/* FORM */}
        <form onSubmit={handleSubmit} className="space-y-4">

          <input
            required
            placeholder="First Name *"
            className={cn('w-full', 'p-3', 'rounded-xl', 'bg-black/40', 'border', 'border-white/20')}
            value={form.first_name}
            onChange={(e) => updateField("first_name", e.target.value)}
          />

          <input
            required
            placeholder="Last Name *"
            className={cn('w-full', 'p-3', 'rounded-xl', 'bg-black/40', 'border', 'border-white/20')}
            value={form.last_name}
            onChange={(e) => updateField("last_name", e.target.value)}
          />

          <input
            required
            type="email"
            placeholder="Email *"
            className={cn('w-full', 'p-3', 'rounded-xl', 'bg-black/40', 'border', 'border-white/20')}
            value={form.email}
            onChange={(e) => updateField("email", e.target.value)}
          />

          <input
            required
            type="tel"
            placeholder="Phone *"
            className={cn('w-full', 'p-3', 'rounded-xl', 'bg-black/40', 'border', 'border-white/20')}
            value={form.phone}
            onChange={(e) => updateField("phone", e.target.value)}
          />

          <input
            required
            placeholder="ZIP Code *"
            className={cn('w-full', 'p-3', 'rounded-xl', 'bg-black/40', 'border', 'border-white/20')}
            value={form.zip}
            onChange={(e) => updateField("zip", e.target.value)}
          />

          <input
            placeholder="Product Interest (optional)"
            className={cn('w-full', 'p-3', 'rounded-xl', 'bg-black/40', 'border', 'border-white/20')}
            value={form.product_interest}
            onChange={(e) => updateField("product_interest", e.target.value)}
          />

          <textarea
            placeholder="Notes / Comments (optional)"
            rows={3}
            className={cn('w-full', 'p-3', 'rounded-xl', 'bg-black/40', 'border', 'border-white/20')}
            value={form.notes}
            onChange={(e) => updateField("notes", e.target.value)}
          />

          {/* CONTACT TOGGLE */}
          <label className={cn('flex', 'items-center', 'gap-2', 'text-sm', 'mt-1')}>
            <input
              type="checkbox"
              checked={form.wants_contact}
              onChange={(e) =>
                updateField("wants_contact", e.target.checked)
              }
            />
            I want to be contacted
          </label>

          <button
            disabled={submitting}
            className={cn(
              "w-full py-3 rounded-xl bg-gradient-to-r",
              "from-sky-500 to-blue-600 font-semibold shadow-lg",
              "hover:scale-[1.03] active:scale-[0.97] transition-all"
            )}
          >
            {submitting ? "Submitting..." : "Submit Request"}
          </button>
        </form>
      </motion.div>
    </main>
  );
}
