"use client";

import { useState, useRef } from "react";
import {
  Sheet,
  SheetContent,
  SheetTrigger,
} from "@/components/ui/sheet";

import { Button } from "@/components/ui/button";
import { supabase } from "@/lib/supabaseClient";

import {
  User,
  Settings,
  CreditCard,
  LogOut,
  SlidersHorizontal,
  Upload,
  Trash2,
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

export default function HostProfilePanel({
  host,
  setHost,
}: HostProfilePanelProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [showEmailModal, setShowEmailModal] = useState(false);
  const [showPassModal, setShowPassModal] = useState(false);
  const [showGuestModal, setShowGuestModal] = useState(false);
  const [showTermsModal, setShowTermsModal] = useState(false);

  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [logoPreview, setLogoPreview] = useState(host?.branding_logo_url || "");

  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleLogout() {
    await supabase.auth.signOut();
    window.location.href = "/";
  }
/* ---------------------- EXPORT GUEST DATA ---------------------- */
function exportGuestsCSV() {
  if (!host?.id) return;
  window.open(`/api/export/guests?hostId=${host.id}`, "_blank");
}

function printGuestsPDF() {
  if (!host?.id) return;
  window.open(`/api/export/guests/print?hostId=${host.id}`, "_blank");
}

  async function updateGuestOption(field: string, value: boolean) {
    await supabase.from("hosts").update({ [field]: value }).eq("id", host.id);
    setHost((prev: any) => ({ ...prev, [field]: value }));
  }

  /* --------------------------- LOGO UPLOAD --------------------------- */
  async function handleLogoUpload(e: any) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingLogo(true);

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

      const finalFile = new File([blob], `${host.id}.png`, {
        type: "image/png",
      });

      const filePath = `${host.id}.png`;

      const { error: uploadError } = await supabase.storage
        .from("host-logos")
        .upload(filePath, finalFile, { upsert: true });

      if (uploadError) {
        alert("Upload failed.");
        setUploadingLogo(false);
        return;
      }

      const { data } = supabase.storage
        .from("host-logos")
        .getPublicUrl(filePath);

      const cacheBusted = `${data.publicUrl}?t=${Date.now()}`;

      await supabase
        .from("hosts")
        .update({ branding_logo_url: cacheBusted })
        .eq("id", host.id);

      setHost((prev: any) => ({ ...prev, branding_logo_url: cacheBusted }));
      setLogoPreview(cacheBusted);
    } catch (err) {
      console.error(err);
      alert("Image processing failed.");
    }

    setUploadingLogo(false);
  }

  /* --------------------------- DELETE LOGO --------------------------- */
  async function handleDeleteLogo() {
    if (!host?.branding_logo_url) return;

    const url: string = host.branding_logo_url;
    const filename = url.split("/").pop()?.split("?")[0];
    if (!filename) return alert("Could not extract logo filename.");

    const { error: deleteError } = await supabase.storage
      .from("host-logos")
      .remove([filename]);

    if (deleteError) {
      console.error(deleteError);
      alert("Delete failed.");
      return;
    }

    await supabase
      .from("hosts")
      .update({ branding_logo_url: null })
      .eq("id", host.id);

    setHost((prev: any) => ({ ...prev, branding_logo_url: null }));
    setLogoPreview("");
  }

  /* ------------------------- Guest Options Modal ------------------------ */
  const GuestOptionsModal = () => (
    <Modal isOpen={showGuestModal} onClose={() => setShowGuestModal(false)}>
      <div className="text-white">
        <h2 className={cn('text-xl', 'font-semibold', 'text-center', 'text-sky-300', 'mb-4')}>
          Guest Sign Up Options
        </h2>

        <div className="space-y-4">
          <div className={cn('flex', 'items-center', 'justify-between', 'p-2', 'bg-black/40', 'rounded-lg', 'border', 'border-white/10')}>
            <span className={cn('font-medium', 'text-gray-200')}>First Name</span>
            <span className={cn('text-gray-400', 'text-sm', 'italic')}>(always required)</span>
          </div>

          {[
            { key: "require_last_name", label: "Last Name" },
            { key: "require_email", label: "Email Address" },
            { key: "require_phone", label: "Phone Number" },
            { key: "require_street", label: "Street Address" },
            { key: "require_city", label: "City" },
            { key: "require_state", label: "State" },
            { key: "require_zip", label: "ZIP Code" },
            { key: "require_age", label: "Age" },
          ].map((field) => (
            <div
              key={field.key}
              className={cn('flex', 'items-center', 'justify-between', 'p-2', 'bg-black/40', 'rounded-lg', 'border', 'border-white/10')}
            >
              <span className="font-medium">{field.label}</span>
              <Switch
                checked={host[field.key]}
                onCheckedChange={(v) => updateGuestOption(field.key, v)}
              />
            </div>
          ))}
        </div>
      </div>
    </Modal>
  );

  /* --------------------------- RENDER PANEL --------------------------- */
  if (!host) {
    return (
      <div className={cn('flex', 'items-center', 'justify-center', 'text-gray-400', 'text-sm', 'py-6')}>
        Loading profile…
      </div>
    );
  }

  return (
    <Sheet open={isOpen} onOpenChange={setIsOpen}>
      {/* Trigger Button */}
      <SheetTrigger asChild>
        <button className={cn('rounded-full', 'w-10', 'h-10', 'overflow-hidden', 'border', 'border-gray-500', 'hover:ring-2', 'hover:ring-blue-500', 'transition-all')}>
          <div className={cn('bg-gray-700', 'w-full', 'h-full', 'flex', 'items-center', 'justify-center', 'text-gray-200', 'font-bold')}>
            {host?.first_name?.[0]?.toUpperCase() ||
              host?.venue_name?.[0]?.toUpperCase() ||
              "H"}
          </div>
        </button>
      </SheetTrigger>

      {/* SIDE PANEL */}
      <SheetContent
        side="right"
        className={cn(
          "w-80 bg-black/80 backdrop-blur-xl border-l border-gray-700 text-gray-100 overflow-y-auto"
        )}
      >
        {/* ⭐ NO HEADER HERE — CLEAN TOP ⭐ */}

        <div className={cn('mt-5', 'flex', 'flex-col', 'gap-6')}>
          {/* ---------------------- ACCOUNT ----------------------- */}
          <section>
            <div className={cn('flex', 'items-center', 'justify-center', 'gap-3', 'mb-3', 'text-blue-400', 'font-semibold')}>
              <User className={cn('w-5', 'h-5')} /> Account
            </div>

            <div className={cn('flex', 'flex-col', 'items-center', 'gap-3', 'text-center')}>
              {/* Avatar */}
              <div className={cn('w-24', 'h-24', 'rounded-full', 'overflow-hidden', 'border', 'border-gray-600', 'shadow-md', 'flex', 'items-center', 'justify-center', 'bg-gray-800')}>
                <span className={cn('text-3xl', 'font-semibold', 'text-gray-300')}>
                  {host?.first_name?.[0]?.toUpperCase() || "H"}
                </span>
              </div>

              {/* Logo Preview */}
              {logoPreview && (
                <img
                  src={logoPreview}
                  alt="Host Logo"
                  className={cn('w-28', 'h-28', 'object-contain', 'rounded-md', 'border', 'border-gray-700', 'bg-black/40', 'p-2', 'mt-3')}
                />
              )}

              {/* Upload */}
              <div className={cn('flex', 'gap-2', 'mt-2')}>
                <Button
                  onClick={() => fileInputRef.current?.click()}
                  className={cn('px-3', 'py-2', 'flex', 'items-center', 'gap-1', 'bg-blue-600', 'hover:bg-blue-700')}
                >
                  <Upload className={cn('w-4', 'h-4')} />
                  <span className="text-sm">
                    {uploadingLogo ? "Uploading…" : "Upload"}
                  </span>
                </Button>

                <Button
                  variant="destructive"
                  disabled={!logoPreview}
                  onClick={handleDeleteLogo}
                  className={cn('px-3', 'py-2', 'flex', 'items-center', 'gap-1')}
                >
                  <Trash2 className={cn('w-4', 'h-4')} />
                  <span className="text-sm">Delete</span>
                </Button>
              </div>

              <input
                type="file"
                accept="image/*"
                ref={fileInputRef}
                className="hidden"
                onChange={handleLogoUpload}
              />

              <p className={cn('text-xs', 'text-gray-400', 'mt-1', 'text-center')}>
                Best results:
                <br />
                <strong>1600 × 1600 PNG</strong> (transparent background)
              </p>

              {/* Name + Email */}
              <div className={cn('text-center', 'mt-4')}>
                <p className={cn('font-semibold', 'text-lg', 'text-white')}>
                  {host?.first_name && host?.last_name
                    ? `${host.first_name} ${host.last_name}`
                    : host?.venue_name || "Host User"}
                </p>
                <p className={cn('text-sm', 'text-gray-400')}>{host?.email}</p>
              </div>

              {/* Change Email + Pass */}
              <div className={cn('flex', 'flex-col', 'gap-2', 'w-full', 'mt-4')}>
                <Button variant="outline" onClick={() => setShowEmailModal(true)}>
                  Change Email
                </Button>
                <Button variant="outline" onClick={() => setShowPassModal(true)}>
                  Change Password
                </Button>
              </div>
            </div>
          </section>

          {/* ---------------------- SETTINGS ----------------------- */}
          <section>
            <div className={cn('flex', 'items-center', 'justify-center', 'gap-3', 'mb-3', 'text-blue-400', 'font-semibold')}>
              <Settings className={cn('w-5', 'h-5')} /> Settings
            </div>

            <p className={cn('text-sm', 'text-gray-400', 'text-center')}>
              Venue: {host?.venue_name}
            </p>
            <p className={cn('text-sm', 'text-gray-400', 'text-center')}>
              Username: {host?.username}
            </p>
            <p className={cn('text-sm', 'text-gray-400', 'text-center')}>
              Created: {new Date(host?.created_at).toLocaleDateString()}
            </p>

            <Button
              variant="outline"
              className={cn('w-full', 'mt-3', 'flex', 'items-center', 'justify-center', 'gap-2')}
              onClick={() => setShowGuestModal(true)}
            >
              <SlidersHorizontal className={cn('w-4', 'h-4')} />
              Guest Sign Up Options
            </Button>

            <Button
              variant="outline"
              className={cn('w-full', 'mt-2')}
              onClick={() => setShowTermsModal(true)}
            >
              Terms & Conditions For Guests
            </Button>

            <GuestOptionsModal />
          </section>

<Button
  variant="outline"
  className={cn("w-full", "mt-3")}
  onClick={exportGuestsCSV}
>
  Export Guests (CSV)
</Button>

<Button
  variant="outline"
  className={cn("w-full", "mt-2")}
  onClick={printGuestsPDF}
>
  Print Guests (PDF)
</Button>


          {/* ---------------------- BILLING ----------------------- */}
          <section>
            <div className={cn('flex', 'items-center', 'justify-center', 'gap-3', 'mb-3', 'text-blue-400', 'font-semibold')}>
              <CreditCard className={cn('w-5', 'h-5')} /> Billing
            </div>
            <Button variant="outline" className="w-full" disabled>
              Manage Billing (coming soon)
            </Button>
          </section>

          {/* ---------------------- SECURITY ----------------------- */}
          <section>
            <div className={cn('flex', 'items-center', 'justify-center', 'gap-3', 'mb-3', 'text-blue-400', 'font-semibold')}>
              <LogOut className={cn('w-5', 'h-5')} /> Security
            </div>
            <Button variant="destructive" className="w-full" onClick={handleLogout}>
              Logout
            </Button>
          </section>

          <div className="h-8" />
        </div>

        {/* EMAIL MODAL */}
        <Modal isOpen={showEmailModal} onClose={() => setShowEmailModal(false)}>
          <ChangeEmailModal onClose={() => setShowEmailModal(false)} />
        </Modal>

        {/* PASSWORD MODAL */}
        <Modal isOpen={showPassModal} onClose={() => setShowPassModal(false)}>
          <ChangePasswordModal onClose={() => setShowPassModal(false)} />
        </Modal>

        {/* TERMS MODAL */}
        <HostTermsModal
          isOpen={showTermsModal}
          onClose={() => setShowTermsModal(false)}
          host={host}
          setHost={setHost}
        />
      </SheetContent>
    </Sheet>
  );
}
