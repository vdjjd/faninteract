"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabaseClient";
import { cn } from "@/lib/utils";
import { Switch } from "@/components/ui/switch";

interface HostTermsModalProps {
  isOpen: boolean;
  onClose: () => void;
  host: any;
  setHost: (h: any) => void;
}

type TermsMode = "host" | "venue";

interface HostTermsSet {
  id: string;
  label: string;
  venue_terms_markdown: string | null;
  created_at?: string;
}

export default function HostTermsModal({
  isOpen,
  onClose,
  host,
  setHost,
}: HostTermsModalProps) {
  const [mode, setMode] = useState<TermsMode>("host");

  // Host-level terms
  const [hostContent, setHostContent] = useState<string>(
    host?.host_terms_markdown || ""
  );

  // Venue terms sets
  const [venueSets, setVenueSets] = useState<HostTermsSet[]>([]);
  const [venueLoading, setVenueLoading] = useState(false);
  const [venueError, setVenueError] = useState<string | null>(null);
  const [selectedVenueId, setSelectedVenueId] = useState<string | null>(
    host?.active_terms_set_id || null
  );
  const [venueLabel, setVenueLabel] = useState<string>("");
  const [venueContent, setVenueContent] = useState<string>("");

  const [saving, setSaving] = useState(false);

  // ✅ global toggle: should we use venue terms at all for this host?
  const [venueTermsEnabled, setVenueTermsEnabled] = useState<boolean>(
    !!host?.venue_terms_enabled
  );

  // keep local toggle in sync when host changes
  useEffect(() => {
    setVenueTermsEnabled(!!host?.venue_terms_enabled);
  }, [host?.venue_terms_enabled]);

  async function setActiveTermsSet(id: string | null) {
    if (!host?.id) return;

    try {
      const { error } = await supabase
        .from("hosts")
        .update({ active_terms_set_id: id })
        .eq("id", host.id);

      if (error) {
        console.error("SET ACTIVE VENUE ERROR:", error);
        return;
      }

      setHost({ ...host, active_terms_set_id: id });
    } catch (err) {
      console.error("SET ACTIVE VENUE ERROR:", err);
    }
  }

  // ✅ toggle venue terms ON/OFF for this host
  async function toggleVenueTerms(enabled: boolean) {
    if (!host?.id) return;
    setVenueTermsEnabled(enabled);

    try {
      const { error } = await supabase
        .from("hosts")
        .update({ venue_terms_enabled: enabled })
        .eq("id", host.id);

      if (error) {
        console.error("venue_terms_enabled update error:", error);
        // roll back local if DB fails
        setVenueTermsEnabled(!!host.venue_terms_enabled);
        return;
      }

      setHost({ ...host, venue_terms_enabled: enabled });
    } catch (err) {
      console.error("venue_terms_enabled update error:", err);
      setVenueTermsEnabled(!!host.venue_terms_enabled);
    }
  }

  // Reset when opened
  useEffect(() => {
    if (!isOpen || !host?.id) return;

    setHostContent(host?.host_terms_markdown || "");
    setSelectedVenueId(host?.active_terms_set_id || null);

    let cancelled = false;

    async function loadVenueSets() {
      try {
        setVenueLoading(true);
        setVenueError(null);

        const { data, error } = await supabase
          .from("host_terms_sets")
          .select("id,label,venue_terms_markdown,created_at")
          .eq("host_id", host.id)
          .order("created_at", { ascending: true });

        if (cancelled) return;

        if (error && (error as any).message) {
          console.error("loadVenueSets error:", error);
          setVenueError(
            (error as any).message || "Unable to load venue terms."
          );
          setVenueSets([]);
          setSelectedVenueId(null);
          setVenueLabel("");
          setVenueContent("");
          return;
        }

        const sets = (data || []) as HostTermsSet[];
        setVenueSets(sets);

        if (sets.length === 0) {
          setSelectedVenueId(null);
          setVenueLabel("");
          setVenueContent("");
          return;
        }

        const activeId = host?.active_terms_set_id;
        const byActive =
          activeId && sets.find((s) => s.id === activeId)
            ? activeId
            : sets[0]?.id || null;

        setSelectedVenueId(byActive);

        if (byActive) {
          const activeSet = sets.find((s) => s.id === byActive)!;
          setVenueLabel(activeSet.label);
          setVenueContent(activeSet.venue_terms_markdown || "");
        } else {
          setVenueLabel("");
          setVenueContent("");
        }
      } finally {
        if (!cancelled) setVenueLoading(false);
      }
    }

    loadVenueSets();

    return () => {
      cancelled = true;
    };
  }, [isOpen, host?.id, host?.active_terms_set_id, host?.host_terms_markdown]);

  if (!isOpen) return null;

  /* ---------------------- SAVE HOST TERMS ---------------------- */
  async function saveHostTerms() {
    if (!host?.id) return;
    try {
      setSaving(true);

      const { error } = await supabase
        .from("hosts")
        .update({ host_terms_markdown: hostContent })
        .eq("id", host.id);

      if (error) throw error;

      setHost({ ...host, host_terms_markdown: hostContent });
      onClose();
    } catch (err) {
      console.error("SAVE HOST TERMS ERROR:", err);
    } finally {
      setSaving(false);
    }
  }

  function clearHostTerms() {
    if (
      hostContent &&
      !confirm("Clear host default terms? This will remove all text from this box.")
    ) {
      return;
    }
    setHostContent("");
  }

  /* ---------------------- VENUE TERMS HELPERS ---------------------- */

  function selectVenueSet(id: string) {
    const set = venueSets.find((s) => s.id === id);
    setSelectedVenueId(id);

    if (set) {
      setVenueLabel(set.label);
      setVenueContent(set.venue_terms_markdown || "");
    } else {
      setVenueLabel("");
      setVenueContent("");
    }

    setActiveTermsSet(id);
  }

  async function createVenueSet() {
    if (!host?.id) return;
    const defaultLabel = "New Venue";

    try {
      setSaving(true);
      setVenueError(null);

      const { data, error } = await supabase
        .from("host_terms_sets")
        .insert({
          host_id: host.id,
          label: defaultLabel,
          venue_terms_markdown: "",
        })
        .select("id,label,venue_terms_markdown,created_at")
        .single();

      if (error) throw error;

      const newSet = data as HostTermsSet;
      const updated = [...venueSets, newSet];
      setVenueSets(updated);
      setSelectedVenueId(newSet.id);
      setVenueLabel(newSet.label);
      setVenueContent(newSet.venue_terms_markdown || "");

      setActiveTermsSet(newSet.id);
      setMode("venue");
    } catch (err: any) {
      console.error("CREATE VENUE TERMS ERROR:", err);
      setVenueError(err?.message || "Unable to create venue terms.");
    } finally {
      setSaving(false);
    }
  }

  async function saveVenueTerms() {
    if (!host?.id || !selectedVenueId) return;

    try {
      setSaving(true);
      setVenueError(null);

      const { error } = await supabase
        .from("host_terms_sets")
        .update({
          label: venueLabel || "Untitled Venue",
          venue_terms_markdown: venueContent,
        })
        .eq("id", selectedVenueId)
        .eq("host_id", host.id);

      if (error) throw error;

      const updatedSets = venueSets.map((s) =>
        s.id === selectedVenueId
          ? {
              ...s,
              label: venueLabel || "Untitled Venue",
              venue_terms_markdown: venueContent,
            }
          : s
      );
      setVenueSets(updatedSets);
    } catch (err: any) {
      console.error("SAVE VENUE TERMS ERROR:", err);
      setVenueError(err?.message || "Unable to save venue terms.");
    } finally {
      setSaving(false);
    }
  }

  async function deleteVenueSet() {
    if (!host?.id || !selectedVenueId) return;
    if (!confirm("Delete this venue terms set? This cannot be undone.")) return;

    try {
      setSaving(true);
      setVenueError(null);

      const { error } = await supabase
        .from("host_terms_sets")
        .delete()
        .eq("id", selectedVenueId)
        .eq("host_id", host.id);

      if (error) throw error;

      const remaining = venueSets.filter((s) => s.id !== selectedVenueId);
      setVenueSets(remaining);

      let nextId: string | null = null;
      if (remaining.length > 0) {
        nextId = remaining[0].id;
        const set = remaining[0];
        setVenueLabel(set.label);
        setVenueContent(set.venue_terms_markdown || "");
      } else {
        setVenueLabel("");
        setVenueContent("");
      }
      setSelectedVenueId(nextId);

      await setActiveTermsSet(nextId);
    } catch (err: any) {
      console.error("DELETE VENUE TERMS ERROR:", err);
      setVenueError(err?.message || "Unable to delete venue terms.");
    } finally {
      setSaving(false);
    }
  }

  /* ---------------------- SHARED EDITOR INSERT ---------------------- */

  function insert(before: string, after: string = "") {
    const textarea = document.getElementById(
      "terms-editor"
    ) as HTMLTextAreaElement;

    if (!textarea) return;

    const currentContent = mode === "host" ? hostContent : venueContent;
    const setCurrent = mode === "host" ? setHostContent : setVenueContent;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selected = currentContent.substring(start, end);

    const newText =
      currentContent.substring(0, start) +
      before +
      selected +
      after +
      currentContent.substring(end);

    setCurrent(newText);

    setTimeout(() => {
      textarea.focus();
      textarea.selectionStart = start + before.length;
      textarea.selectionEnd = end + before.length;
    }, 10);
  }

  const currentContent = mode === "host" ? hostContent : venueContent;
  const canEditVenue = mode === "venue" && !!selectedVenueId;

  return (
    <div
      className={cn(
        "fixed inset-0 bg-black/70 backdrop-blur-md z-[9999] flex items-center justify-center"
      )}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className={cn(
          "relative w-full max-w-[1000px] h-[92vh] max-h-[92vh] rounded-2xl",
          "border border-blue-500/30 shadow-[0_0_40px_rgba(0,140,255,0.45)]",
          "bg-gradient-to-br from-[#020617]/95 via-[#020617]/95 to-[#020617]/95",
          "p-6 text-white",
          "flex flex-col"
        )}
      >
        <button
          onClick={onClose}
          className={cn(
            "absolute",
            "top-3",
            "right-3",
            "text-white/80",
            "hover:text-white",
            "text-xl"
          )}
        >
          ✕
        </button>

        <h3
          className={cn(
            "text-center",
            "text-xl",
            "font-semibold",
            "mb-3"
          )}
        >
          ✍ Guest Terms & Conditions
        </h3>

        {/* Mode toggle */}
        <div
          className={cn(
            "flex",
            "justify-center",
            "gap-3",
            "mb-2"
          )}
        >
          <button
            onClick={() => setMode("host")}
            className={cn(
              "px-4 py-1.5 rounded-full text-xs font-medium border",
              mode === "host"
                ? "bg-blue-600 border-blue-400 text-white"
                : "bg-white/5 border-white/15 text-gray-300 hover:bg-white/10"
            )}
          >
            Host Default Terms
          </button>
          <button
            onClick={() => setMode("venue")}
            className={cn(
              "px-4 py-1.5 rounded-full text-xs font-medium border",
              mode === "venue"
                ? "bg-blue-600 border-blue-400 text-white"
                : "bg-white/5 border-white/15 text-gray-300 hover:bg-white/10"
            )}
          >
            Venue-Specific Terms
          </button>
        </div>

        {/* Host buttons */}
        {mode === "host" && (
          <div
            className={cn(
              "mb-3",
              "flex",
              "justify-end",
              "gap-2"
            )}
          >
            <button
              type="button"
              onClick={clearHostTerms}
              disabled={saving}
              className={cn(
                "px-4 py-1.5 rounded-md text-xs border font-medium",
                "bg-red-900/60 border-red-500 text-red-100 hover:bg-red-800"
              )}
            >
              Clear Host Terms
            </button>
            <button
              type="button"
              onClick={saveHostTerms}
              disabled={saving}
              className={
                saving
                  ? "px-4 py-1.5 rounded-md text-xs border font-medium opacity-60 cursor-wait"
                  : "px-4 py-1.5 rounded-md text-xs border font-medium bg-emerald-600/80 border-emerald-500 hover:bg-emerald-600"
              }
            >
              {saving ? "Saving…" : "Save Host Terms"}
            </button>
          </div>
        )}

        {/* Venue pills + controls */}
        {mode === "venue" && (
          <div className={cn("mb-3", "space-y-2")}>
            <div className={cn("flex", "flex-wrap", "gap-2")}>
              {venueSets.map((v) => (
                <button
                  key={v.id}
                  onClick={() => selectVenueSet(v.id)}
                  className={cn(
                    "px-3 py-1 rounded-full text-xs border",
                    selectedVenueId === v.id
                      ? "bg-blue-500/80 border-blue-300 text-white"
                      : "bg-white/5 border-white/15 text-gray-300 hover:bg-white/10"
                  )}
                >
                  {v.label || "Untitled Venue"}
                </button>
              ))}
              <button
                onClick={createVenueSet}
                className={cn(
                  "px-3 py-1 rounded-full text-xs border border-dashed",
                  "border-emerald-400/60 text-emerald-300 hover:bg-emerald-500/10"
                )}
              >
                + Add Venue Terms
              </button>
            </div>

            {venueLoading && (
              <p className={cn("text-xs", "text-gray-400")}>
                Loading venue terms…
              </p>
            )}

            {venueError && (
              <p className={cn("text-xs", "text-red-400")}>{venueError}</p>
            )}

            {selectedVenueId && (
              <>
                <input
                  type="text"
                  value={venueLabel}
                  onChange={(e) => setVenueLabel(e.target.value)}
                  className={cn(
                    "mt-2 w-full px-3 py-1.5 rounded-md text-sm",
                    "bg-black/40 border border-white/15 text-white"
                  )}
                  placeholder="Venue name (e.g. Mavericks Saloon)"
                />

                {/* ⬅ toggle on left, Save/Delete on right */}
                <div
                  className={cn(
                    "mt-2",
                    "flex",
                    "items-center",
                    "justify-between",
                    "gap-3"
                  )}
                >
                  <div className={cn("flex", "items-center", "gap-2")}>
                    <Switch
                      checked={venueTermsEnabled}
                      onCheckedChange={toggleVenueTerms}
                    />
                    <span className={cn('text-xs', 'text-gray-300')}>
                      Off / On
                    </span>
                  </div>

                  <div className={cn("flex", "gap-2")}>
                    <button
                      type="button"
                      onClick={saveVenueTerms}
                      disabled={saving}
                      className={cn(
                        "px-3 py-1.5 rounded-md text-xs border font-medium",
                        "bg-emerald-600/80 border-emerald-400 text-white hover:bg-emerald-600"
                      )}
                    >
                      {saving ? "Saving…" : "Save"}
                    </button>
                    <button
                      type="button"
                      onClick={deleteVenueSet}
                      disabled={saving}
                      className={cn(
                        "px-3 py-1.5 rounded-md text-xs border font-medium",
                        "bg-red-600/80 border-red-400 text-white hover:bg-red-600"
                      )}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </>
            )}

            {!selectedVenueId && !venueLoading && (
              <p className={cn("text-xs", "text-gray-400")}>
                No venue terms yet. Click <strong>+ Add Venue Terms</strong> to
                create the first one.
              </p>
            )}
          </div>
        )}

        {/* Toolbar */}
        <div
          className={cn(
            "flex",
            "gap-1.5",
            "mb-3",
            "justify-center",
            "flex-wrap"
          )}
        >
          {[
            { label: "B", action: () => insert("**", "**"), class: "font-bold" },
            { label: "I", action: () => insert("*", "*"), class: "italic" },
            { label: "U", action: () => insert("__", "__"), class: "underline" },
            { label: "🔗", action: () => insert("[", "](https://)") },
            { label: "•", action: () => insert("- ") },
            { label: "1.", action: () => insert("1. ") },
          ].map((btn, i) => (
            <button
              key={i}
              onClick={btn.action}
              disabled={mode === "venue" && !canEditVenue}
              className={cn(
                "px-2 py-1 rounded-md text-xs",
                "bg-white/5 hover:bg-white/15",
                "border border-white/10",
                "transition-all",
                btn.class,
                mode === "venue" &&
                  !canEditVenue &&
                  "opacity-50 cursor-not-allowed"
              )}
            >
              {btn.label}
            </button>
          ))}
        </div>

        {/* Editor */}
        <textarea
          id="terms-editor"
          value={currentContent}
          onChange={(e) =>
            mode === "host"
              ? setHostContent(e.target.value)
              : setVenueContent(e.target.value)
          }
          className={cn(
            "flex-grow w-full p-4 rounded-lg",
            "bg-[#020617] border border-white/10",
            "text-white resize-none overflow-y-auto text-sm leading-relaxed"
          )}
          style={{ minHeight: 0 }}
          disabled={mode === "venue" && !canEditVenue}
        />
      </div>
    </div>
  );
}
