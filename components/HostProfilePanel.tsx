"use client";

import { useState, useRef, useEffect, useMemo } from "react";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { supabase } from "@/lib/supabaseClient";

import {
  User,
  CreditCard,
  LogOut,
  SlidersHorizontal,
  Upload,
  Trash2,
  AlertTriangle,
} from "lucide-react";

import ChangeEmailModal from "@/components/ChangeEmailModal";
import ChangePasswordModal from "@/components/ChangePasswordModal";
import HostTermsModal from "@/components/HostTermsModal";

import Modal from "@/components/Modal";
import { Switch } from "@/components/ui/switch";
import { cn } from "../lib/utils";

interface HostProfilePanelProps {
  host: any;
  setHost: React.Dispatch<React.SetStateAction<any>>;
}

const LOGO_BUCKET = "host-logos";
const SLOT_COUNT = 10;

function stripQuery(u: string) {
  return u.split("?")[0];
}

function slotFilename(slotIndex: number) {
  return `slot-${String(slotIndex + 1).padStart(2, "0")}.png`;
}

function buildSlotPath(hostId: string, slotIndex: number) {
  return `${hostId}/${slotFilename(slotIndex)}`;
}

export default function HostProfilePanel({ host, setHost }: HostProfilePanelProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [showEmailModal, setShowEmailModal] = useState(false);
  const [showPassModal, setShowPassModal] = useState(false);
  const [showGuestModal, setShowGuestModal] = useState(false);
  const [showTermsModal, setShowTermsModal] = useState(false);

  const [billingLoading, setBillingLoading] = useState(false);

  const [showClearGuestsModal, setShowClearGuestsModal] = useState(false);
  const [clearGuestsLoading, setClearGuestsLoading] = useState(false);
  const [clearGuestsError, setClearGuestsError] = useState<string | null>(null);

  const [activeTermsLabel, setActiveTermsLabel] = useState<string | null>(null);
  const [activeTermsLoading, setActiveTermsLoading] = useState(false);

  const [logoSlots, setLogoSlots] = useState<(string | null)[]>(
    Array.from({ length: SLOT_COUNT }, () => null)
  );
  const [selectedLogoSlot, setSelectedLogoSlot] = useState<number | null>(null);
  const [logoBusy, setLogoBusy] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleLogout() {
    await supabase.auth.signOut();
    window.location.href = "/";
  }

  /* ---------------------- EXPORT GUEST / LEAD DATA ---------------------- */
  function exportGuestsCSV() {
    if (!host?.id) return;
    window.open(`/api/export/guests?hostId=${host.id}`, "_blank");
  }

  function printGuestsPDF() {
    if (!host?.id) return;
    window.open(`/api/export/guests/print?hostId=${host.id}`, "_blank");
  }

  async function updateGuestOption(field: string, value: boolean) {
    if (!host?.id) return;
    await supabase.from("hosts").update({ [field]: value }).eq("id", host.id);
    setHost((prev: any) => ({ ...prev, [field]: value }));
  }

  /* ---------------------- BILLING: STRIPE PORTAL ---------------------- */
  async function handleManageBilling() {
    try {
      if (!host?.id) return alert("Host not ready.");

      setBillingLoading(true);

      const { data } = await supabase.auth.getSession();
      const token = data?.session?.access_token;
      if (!token) {
        alert("You must be logged in.");
        return;
      }

      const res = await fetch("/api/stripe/create-portal-session", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ hostId: host.id }),
      });

      const payload = await res.json().catch(() => ({}));

      if (!res.ok) {
        alert(payload?.error || "Could not open billing portal.");
        return;
      }

      if (!payload?.url) {
        alert("Billing portal response missing url.");
        return;
      }

      window.location.href = payload.url;
    } catch (e: any) {
      console.error("handleManageBilling error:", e);
      alert(e?.message || "Billing portal error");
    } finally {
      setBillingLoading(false);
    }
  }

  /* ---------------- AGE (COLLECT) + AGE BLOCKERS ---------------- */
  const collectAgeEnabled = !!host?.require_age;
  const minimumAge = host?.minimum_age ?? null;

  async function setCollectAge(enabled: boolean) {
    if (!host?.id) return;

    if (!enabled) {
      await supabase
        .from("hosts")
        .update({ require_age: false, minimum_age: null })
        .eq("id", host.id);
      setHost((prev: any) => ({ ...prev, require_age: false, minimum_age: null }));
      return;
    }

    await supabase.from("hosts").update({ require_age: true }).eq("id", host.id);
    setHost((prev: any) => ({ ...prev, require_age: true }));
  }

  async function setAgeBlocker(age: 18 | 21, enabled: boolean) {
    if (!host?.id) return;
    if (!collectAgeEnabled) return;

    if (enabled) {
      await supabase
        .from("hosts")
        .update({ require_age: true, minimum_age: age })
        .eq("id", host.id);
      setHost((prev: any) => ({ ...prev, require_age: true, minimum_age: age }));
      return;
    }

    if (Number(minimumAge) === age) {
      await supabase
        .from("hosts")
        .update({ require_age: true, minimum_age: null })
        .eq("id", host.id);
      setHost((prev: any) => ({ ...prev, require_age: true, minimum_age: null }));
    }
  }

  const blockUnder18 = collectAgeEnabled && Number(minimumAge) === 18;
  const blockUnder21 = collectAgeEnabled && Number(minimumAge) === 21;

  /* ---------------------- VENUE LOGO LIBRARY HELPERS ---------------------- */
  const activeLogoBase = useMemo(() => {
    const u = host?.branding_logo_url;
    return u ? stripQuery(String(u)) : "";
  }, [host?.branding_logo_url]);

  const activeSlotIndex = useMemo(() => {
    if (!activeLogoBase) return null;
    for (let i = 0; i < logoSlots.length; i++) {
      const slotUrl = logoSlots[i];
      if (slotUrl && stripQuery(slotUrl) === activeLogoBase) return i;
    }
    return null;
  }, [activeLogoBase, logoSlots]);

  async function refreshLogoSlots() {
    if (!host?.id) return;

    try {
      setLogoBusy(true);

      const { data: files, error } = await supabase.storage
        .from(LOGO_BUCKET)
        .list(host.id, { limit: 100, offset: 0 });

      if (error) {
        console.error("logo list error:", error);
        return;
      }

      const nextSlots = Array.from({ length: SLOT_COUNT }, () => null) as (string | null)[];
      const fileSet = new Set((files ?? []).map((f) => f.name));

      for (let i = 0; i < SLOT_COUNT; i++) {
        const name = slotFilename(i);
        if (fileSet.has(name)) {
          const path = buildSlotPath(host.id, i);
          const { data } = supabase.storage.from(LOGO_BUCKET).getPublicUrl(path);
          nextSlots[i] = data.publicUrl;
        }
      }

      if (!nextSlots[0] && fileSet.has(`${host.id}.png`)) {
        const legacyPath = `${host.id}.png`;
        const { data } = supabase.storage.from(LOGO_BUCKET).getPublicUrl(legacyPath);
        nextSlots[0] = data.publicUrl;
      }

      setLogoSlots(nextSlots);
    } finally {
      setLogoBusy(false);
    }
  }

  useEffect(() => {
    if (!host?.id) return;
    refreshLogoSlots();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [host?.id, isOpen]);

  async function handleLogoUpload(e: any) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    if (!host?.id) return alert("Host not ready.");
    if (selectedLogoSlot == null) return alert("Select a slot first.");

    setLogoBusy(true);

    try {
      const bitmap = await createImageBitmap(file);
      const maxSize = 1600;
      const size = Math.min(maxSize, bitmap.width, bitmap.height);

      const canvas = document.createElement("canvas");
      canvas.width = size;
      canvas.height = size;

      const ctx = canvas.getContext("2d")!;
      ctx.fillStyle = "rgba(0,0,0,0)";
      ctx.fillRect(0, 0, size, size);

      const scale = Math.min(size / bitmap.width, size / bitmap.height);
      const w = bitmap.width * scale;
      const h = bitmap.height * scale;
      const x = (size - w) / 2;
      const y = (size - h) / 2;

      ctx.drawImage(bitmap, x, y, w, h);

      const blob = await new Promise<Blob>((resolve) =>
        canvas.toBlob((b) => resolve(b as Blob), "image/png")
      );

      const finalFile = new File([blob], slotFilename(selectedLogoSlot), { type: "image/png" });
      const path = buildSlotPath(host.id, selectedLogoSlot);

      const { error: uploadError } = await supabase.storage.from(LOGO_BUCKET).upload(path, finalFile, {
        upsert: true,
      });

      if (uploadError) {
        console.error(uploadError);
        alert("Upload failed.");
        return;
      }

      await refreshLogoSlots();
    } catch (err) {
      console.error(err);
      alert("Image processing failed.");
    } finally {
      setLogoBusy(false);
    }
  }

  async function handleLogoDelete() {
    if (!host?.id) return alert("Host not ready.");
    if (selectedLogoSlot == null) return alert("Select a slot first.");

    const slotUrl = logoSlots[selectedLogoSlot];
    if (!slotUrl) return alert("That slot is empty.");

    setLogoBusy(true);

    try {
      const path = buildSlotPath(host.id, selectedLogoSlot);

      const { error: deleteError } = await supabase.storage.from(LOGO_BUCKET).remove([path]);

      if (deleteError) {
        console.error(deleteError);
        alert("Delete failed.");
        return;
      }

      const slotBase = stripQuery(slotUrl);
      if (activeLogoBase && slotBase === activeLogoBase) {
        await supabase.from("hosts").update({ branding_logo_url: null }).eq("id", host.id);
        setHost((prev: any) => ({ ...prev, branding_logo_url: null }));
      }

      await refreshLogoSlots();
    } finally {
      setLogoBusy(false);
    }
  }

  async function handleSetActiveLogo() {
    if (!host?.id) return alert("Host not ready.");
    if (selectedLogoSlot == null) return alert("Select a slot first.");

    const slotUrl = logoSlots[selectedLogoSlot];
    if (!slotUrl) return alert("That slot is empty.");

    setLogoBusy(true);

    try {
      const cacheBusted = `${stripQuery(slotUrl)}?t=${Date.now()}`;
      await supabase.from("hosts").update({ branding_logo_url: cacheBusted }).eq("id", host.id);
      setHost((prev: any) => ({ ...prev, branding_logo_url: cacheBusted }));
    } catch (e) {
      console.error(e);
      alert("Unable to set active logo.");
    } finally {
      setLogoBusy(false);
    }
  }

  async function handleConfirmClearGuests() {
    if (!host?.id) return;
    setClearGuestsLoading(true);
    setClearGuestsError(null);

    try {
      const { error } = await supabase.rpc("clear_host_guests_hard", { p_host_id: host.id });

      if (error) {
        console.error("clear_host_guests_hard error:", error);
        setClearGuestsError(error.message || "Unable to clear guest / lead data.");
        return;
      }

      setShowClearGuestsModal(false);
      alert("Guest and lead data cleared for this host.");
    } catch (e: any) {
      console.error("handleConfirmClearGuests error:", e);
      setClearGuestsError(e?.message || "Unable to clear guest / lead data.");
    } finally {
      setClearGuestsLoading(false);
    }
  }

  useEffect(() => {
    let cancelled = false;

    async function loadActiveTermsLabel() {
      if (!host?.active_terms_set_id) {
        setActiveTermsLabel(null);
        return;
      }

      setActiveTermsLoading(true);
      try {
        const { data, error } = await supabase
          .from("host_terms_sets")
          .select("label")
          .eq("id", host.active_terms_set_id)
          .maybeSingle();

        if (cancelled) return;

        if (error) {
          console.warn("host_terms_sets fetch error:", error);
          setActiveTermsLabel(null);
          return;
        }

        setActiveTermsLabel(data?.label ?? null);
      } finally {
        if (!cancelled) setActiveTermsLoading(false);
      }
    }

    loadActiveTermsLabel();
    return () => {
      cancelled = true;
    };
  }, [host?.active_terms_set_id]);

  /* ------------------------- Guest Options Modal ------------------------ */
  const GuestOptionsModal = () => (
    <Modal isOpen={showGuestModal} onClose={() => setShowGuestModal(false)}>
      <div className="text-white">
        <h2 className={cn("text-xl", "font-semibold", "text-center", "text-sky-300", "mb-4")}>
          Guest Sign Up Options
        </h2>

        <div className="space-y-4">
          <div
            className={cn(
              "flex",
              "items-center",
              "justify-between",
              "p-2",
              "bg-black/40",
              "rounded-lg",
              "border",
              "border-white/10"
            )}
          >
            <span className={cn("font-medium", "text-gray-200")}>First Name</span>
            <span className={cn("text-gray-400", "text-sm", "italic")}>(always required)</span>
          </div>

          {[
            { key: "require_last_name", label: "Last Name" },
            { key: "require_email", label: "Email Address" },
            { key: "require_phone", label: "Phone Number" },
            { key: "require_street", label: "Street Address" },
            { key: "require_city", label: "City" },
            { key: "require_state", label: "State" },
            { key: "require_zip", label: "ZIP Code" },
          ].map((field) => (
            <div
              key={field.key}
              className={cn(
                "flex",
                "items-center",
                "justify-between",
                "p-2",
                "bg-black/40",
                "rounded-lg",
                "border",
                "border-white/10"
              )}
            >
              <span className="font-medium">{field.label}</span>
              <Switch checked={!!host[field.key]} onCheckedChange={(v) => updateGuestOption(field.key, v)} />
            </div>
          ))}

          <div className={cn("p-3", "bg-black/40", "rounded-lg", "border", "border-white/10", "space-y-3")}>
            <div className={cn("flex", "items-center", "justify-between")}>
              <span className={cn("font-medium")}>Age</span>
              <Switch checked={collectAgeEnabled} onCheckedChange={(v) => setCollectAge(v)} />
            </div>

            <div className={cn(!collectAgeEnabled ? "opacity-40 pointer-events-none" : "")}>
              <div className={cn("flex", "items-center", "justify-between")}>
                <span className={cn("font-medium")}>Block under 18</span>
                <Switch checked={blockUnder18} onCheckedChange={(v) => setAgeBlocker(18, v)} />
              </div>
            </div>

            <div className={cn(!collectAgeEnabled ? "opacity-40 pointer-events-none" : "")}>
              <div className={cn("flex", "items-center", "justify-between")}>
                <span className={cn("font-medium")}>Block under 21</span>
                <Switch checked={blockUnder21} onCheckedChange={(v) => setAgeBlocker(21, v)} />
              </div>
            </div>
          </div>
        </div>
      </div>
    </Modal>
  );

  /* --------------------------- RENDER PANEL --------------------------- */
  if (!host) {
    return (
      <div className={cn("flex", "items-center", "justify-center", "text-gray-400", "text-sm", "py-6")}>
        Loading profile…
      </div>
    );
  }

  const loyaltyEnabled = !!host.loyalty_enabled;

  return (
    <Sheet open={isOpen} onOpenChange={setIsOpen}>
      <SheetTrigger asChild>
        <button
          className={cn(
            "rounded-full",
            "w-10",
            "h-10",
            "overflow-hidden",
            "border",
            "border-gray-500",
            "hover:ring-2",
            "hover:ring-blue-500",
            "transition-all"
          )}
        >
          <div
            className={cn(
              "bg-gray-700",
              "w-full",
              "h-full",
              "flex",
              "items-center",
              "justify-center",
              "text-gray-200",
              "font-bold"
            )}
          >
            {host?.first_name?.[0]?.toUpperCase() || host?.venue_name?.[0]?.toUpperCase() || "H"}
          </div>
        </button>
      </SheetTrigger>

      <SheetContent
        side="right"
        className={cn("w-80 bg-black/80 backdrop-blur-xl border-l border-gray-700 text-gray-100 overflow-y-auto")}
      >
        <div className={cn("mt-5", "flex", "flex-col", "gap-6")}>
          {/* ---------------------- ACCOUNT ----------------------- */}
          <section>
            <div
              className={cn(
                "flex",
                "items-center",
                "justify-center",
                "gap-3",
                "mb-3",
                "text-blue-400",
                "font-semibold"
              )}
            >
              <User className={cn("w-5", "h-5")} /> Account
            </div>

            <div className={cn("flex", "flex-col", "items-center", "gap-3", "text-center")}>
              <div
                className={cn(
                  "w-24",
                  "h-24",
                  "rounded-full",
                  "overflow-hidden",
                  "border",
                  "border-gray-600",
                  "shadow-md",
                  "flex",
                  "items-center",
                  "justify-center",
                  "bg-gray-800"
                )}
              >
                <span className={cn("text-3xl", "font-semibold", "text-gray-300")}>
                  {host?.first_name?.[0]?.toUpperCase() || "H"}
                </span>
              </div>

              {/* ✅ MOVED BLOCK ABOVE LOGO LIBRARY */}
              <div className={cn("text-center", "mt-2")}>
                <p className={cn("font-semibold", "text-lg", "text-white")}>
                  {host?.first_name && host?.last_name
                    ? `${host.first_name} ${host.last_name}`
                    : host?.venue_name || "Host User"}
                </p>

                <p className={cn("text-sm", "text-gray-400")}>{host?.email}</p>

                <div className={cn("mt-2", "space-y-1")}>
                  <p className={cn("text-xs", "text-gray-400")}>Venue: {host?.venue_name}</p>
                  <p className={cn("text-xs", "text-gray-400")}>Username: {host?.username}</p>
                  <p className={cn("text-xs", "text-gray-400")}>
                    Created: {new Date(host?.created_at).toLocaleDateString()}
                  </p>
                </div>
              </div>

              {/* ---------------- VENUE LOGO LIBRARY ---------------- */}
              <div className={cn("w-full", "mt-2")}>
                <div className={cn("text-sm", "text-gray-200", "font-semibold", "text-center")}>
                  Venue Logo Library
                </div>

                <div className={cn("mt-3", "grid", "grid-cols-5", "gap-2", "justify-items-center")}>
                  {Array.from({ length: SLOT_COUNT }).map((_, i) => {
                    const url = logoSlots[i];
                    const isSelected = selectedLogoSlot === i;
                    const isActive = activeSlotIndex === i;

                    return (
                      <button
                        key={i}
                        type="button"
                        onClick={() => setSelectedLogoSlot(i)}
                        className={cn(
                          "w-12",
                          "h-12",
                          "rounded-md",
                          "border",
                          "overflow-hidden",
                          "flex",
                          "items-center",
                          "justify-center",
                          "bg-black/30",
                          isSelected ? "border-sky-400 ring-2 ring-sky-400/40" : "border-white/10",
                          isActive ? "ring-2 ring-yellow-400/40 border-yellow-400/60" : ""
                        )}
                        title={
                          isActive
                            ? `Slot ${i + 1} (Active)`
                            : isSelected
                            ? `Slot ${i + 1} (Selected)`
                            : `Slot ${i + 1}`
                        }
                      >
                        {url ? (
                          <img
                            src={url}
                            alt={`Logo slot ${i + 1}`}
                            className={cn("w-full", "h-full", "object-contain", "p-1")}
                          />
                        ) : (
                          <span className={cn("text-xs", "text-gray-500")}>{i + 1}</span>
                        )}
                      </button>
                    );
                  })}
                </div>

                <div className={cn("mt-3", "flex", "justify-center", "gap-2")}>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={logoBusy || selectedLogoSlot == null || !logoSlots[selectedLogoSlot ?? 0]}
                    onClick={handleSetActiveLogo}
                    className={cn(
                      "h-9",
                      "px-3",
                      "border-yellow-500/60",
                      "text-yellow-300",
                      "hover:bg-yellow-500/10",
                      "flex",
                      "items-center",
                      "justify-center",
                      "gap-2"
                    )}
                  >
                    <AlertTriangle className={cn("w-4", "h-4")} />
                    Set Active
                  </Button>

                  <Button
                    type="button"
                    disabled={logoBusy || selectedLogoSlot == null}
                    onClick={() => {
                      if (selectedLogoSlot == null) return alert("Select a slot first.");
                      fileInputRef.current?.click();
                    }}
                    className={cn(
                      "h-9",
                      "px-3",
                      "bg-blue-600",
                      "hover:bg-blue-700",
                      "flex",
                      "items-center",
                      "justify-center",
                      "gap-2"
                    )}
                  >
                    <Upload className={cn("w-4", "h-4")} />
                    Upload
                  </Button>

                  <Button
                    type="button"
                    variant="destructive"
                    disabled={logoBusy || selectedLogoSlot == null || !logoSlots[selectedLogoSlot ?? 0]}
                    onClick={handleLogoDelete}
                    className={cn("h-9", "px-3", "flex", "items-center", "justify-center", "gap-2")}
                  >
                    <Trash2 className={cn("w-4", "h-4")} />
                    Delete
                  </Button>
                </div>

                <input type="file" accept="image/*" ref={fileInputRef} className="hidden" onChange={handleLogoUpload} />

                <p className={cn("text-xs", "text-gray-400", "mt-2", "text-center")}>
                  Best results:
                  <br />
                  <strong>1600 × 1600 PNG</strong> (transparent background)
                </p>
              </div>

              <div className={cn("flex", "flex-col", "gap-2", "w-full", "mt-2")}>
                <Button variant="outline" onClick={() => setShowEmailModal(true)}>
                  Change Email
                </Button>
                <Button variant="outline" onClick={() => setShowPassModal(true)}>
                  Change Password
                </Button>
              </div>
            </div>
          </section>

          {/* ---------------------- REST OF PANEL (unchanged) ----------------------- */}
          <section>
            <div
              className={cn(
                "mt-4",
                "flex",
                "items-center",
                "justify-between",
                "p-3",
                "bg-black/40",
                "rounded-lg",
                "border",
                "border-white/10"
              )}
            >
              <div className={cn("flex", "flex-col")}>
                <span className={cn("font-medium", "text-gray-200")}>🏅 Guest Loyalty</span>
                <span className={cn("text-xs", "text-gray-400")}>Track return visits and show badges</span>
              </div>

              <Switch checked={!!host.loyalty_enabled} onCheckedChange={(v) => updateGuestOption("loyalty_enabled", v)} />
            </div>

            <Button
              variant="outline"
              className={cn("w-full", "mt-3", "flex", "items-center", "justify-center", "gap-2")}
              onClick={() => setShowGuestModal(true)}
            >
              <SlidersHorizontal className={cn("w-4", "h-4")} />
              Guest Sign Up Options
            </Button>

            <Button variant="outline" className={cn("w-full", "mt-2")} onClick={() => setShowTermsModal(true)}>
              Terms & Conditions For Guests
            </Button>

            <div className={cn("mt-1", "text-center")}>
              {activeTermsLoading ? (
                <p className={cn("text-xs", "text-gray-500")}>Loading active venue terms…</p>
              ) : activeTermsLabel ? (
                <p className={cn("text-xs", "text-gray-300")}>
                  Active venue terms: <span className="font-medium">{activeTermsLabel}</span>
                </p>
              ) : (
                <p className={cn("text-xs", "text-gray-500")}>Using host default terms only.</p>
              )}
            </div>

            <GuestOptionsModal />

            <div
              className={cn(
                "mt-5",
                "p-3",
                "bg-black/40",
                "rounded-lg",
                "border",
                "border-red-500/40",
                "space-y-2"
              )}
            >
              <div className={cn("flex", "items-center", "justify-between")}>
                <span className={cn("font-semibold", "text-red-300")}>Guest & Lead Data Management</span>
                <Trash2 className={cn("w-4", "h-4", "text-red-400")} />
              </div>

              <p className={cn("text-xs", "text-gray-400")}>
                This will clear data attached to this host: event guest buckets and priority lead forms.
                {!!host.loyalty_enabled ? (
                  <>
                    {" "}
                    Your loyalty guests & badges are kept — only per-show buckets and lead capture for this host are
                    cleared.
                  </>
                ) : (
                  <>
                    {" "}
                    Because loyalty is off, this will also delete stored guests for this host (perfect for rodeos,
                    tours, or festivals that don&apos;t need long-term data).
                  </>
                )}
              </p>

              <Button
                variant="destructive"
                className={cn("w-full", "mt-1", "text-sm")}
                onClick={() => setShowClearGuestsModal(true)}
              >
                {!!host.loyalty_enabled ? "Clear Event Guest & Lead Data" : "Clear All Guest & Lead Data for This Host"}
              </Button>

              {clearGuestsError && <p className={cn("text-xs", "text-red-400", "mt-1")}>{clearGuestsError}</p>}
            </div>
          </section>

          <Button variant="outline" className={cn("w-full", "mt-3")} onClick={exportGuestsCSV}>
            Export Guests & Leads (CSV)
          </Button>

          <Button variant="outline" className={cn("w-full", "mt-2")} onClick={printGuestsPDF}>
            Print Guests (PDF)
          </Button>

          <section>
            <div
              className={cn(
                "flex",
                "items-center",
                "justify-center",
                "gap-3",
                "mb-3",
                "text-blue-400",
                "font-semibold"
              )}
            >
              <CreditCard className={cn("w-5", "h-5")} /> Billing
            </div>

            <Button
              variant="outline"
              className="w-full"
              onClick={handleManageBilling}
              disabled={billingLoading || !host?.stripe_customer_id}
            >
              {billingLoading ? "Opening Billing…" : "Manage Billing"}
            </Button>

            {!host?.stripe_customer_id ? (
              <p className={cn("text-xs", "text-gray-400", "mt-2", "text-center")}>
                No billing profile yet — subscribe first.
              </p>
            ) : null}
          </section>

          <section>
            <div
              className={cn(
                "flex",
                "items-center",
                "justify-center",
                "gap-3",
                "mb-3",
                "text-blue-400",
                "font-semibold"
              )}
            >
              <LogOut className={cn("w-5", "h-5")} /> Security
            </div>
            <Button variant="destructive" className="w-full" onClick={handleLogout}>
              Logout
            </Button>
          </section>

          <div className="h-8" />
        </div>

        <Modal isOpen={showEmailModal} onClose={() => setShowEmailModal(false)}>
          <ChangeEmailModal onClose={() => setShowEmailModal(false)} />
        </Modal>

        <Modal isOpen={showPassModal} onClose={() => setShowPassModal(false)}>
          <ChangePasswordModal onClose={() => setShowPassModal(false)} />
        </Modal>

        <HostTermsModal isOpen={showTermsModal} onClose={() => setShowTermsModal(false)} host={host} setHost={setHost} />

        <Modal
          isOpen={showClearGuestsModal}
          onClose={() => {
            if (!clearGuestsLoading) {
              setShowClearGuestsModal(false);
              setClearGuestsError(null);
            }
          }}
        >
          <div className={cn("text-white", "max-w-sm")}>
            <h2 className={cn("text-lg", "font-semibold", "text-center", "text-red-300", "mb-3")}>
              {!!host.loyalty_enabled ? "Clear Event Guests & Leads?" : "Clear All Guests & Leads for This Host?"}
            </h2>

            <p className={cn("text-sm", "text-gray-300", "mb-4")}>
              {!!host.loyalty_enabled ? (
                <>
                  This will clear the guest/event buckets and priority_leads tied to this host, but will{" "}
                  <strong>keep</strong> your loyalty guests and badge history.
                </>
              ) : (
                <>This will clear event buckets, priority_leads, and stored guest profiles linked to this host.</>
              )}
            </p>

            {clearGuestsError && <p className={cn("text-xs", "text-red-400", "mb-3")}>{clearGuestsError}</p>}

            <div className={cn("flex", "items-center", "justify-end", "gap-2")}>
              <Button
                variant="outline"
                disabled={clearGuestsLoading}
                onClick={() => {
                  if (!clearGuestsLoading) {
                    setShowClearGuestsModal(false);
                    setClearGuestsError(null);
                  }
                }}
              >
                Cancel
              </Button>
              <Button variant="destructive" disabled={clearGuestsLoading} onClick={handleConfirmClearGuests}>
                {clearGuestsLoading ? "Clearing…" : "Yes, Clear Data"}
              </Button>
            </div>
          </div>
        </Modal>
      </SheetContent>
    </Sheet>
  );
}
