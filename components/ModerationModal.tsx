"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { cn } from "../lib/utils";
import { useRealtimeChannel } from "@/providers/SupabaseRealtimeProvider";

/* --------------------------------------------------------- */
/* TYPES */
/* --------------------------------------------------------- */
interface GuestPost {
  id: string;
  fan_wall_id: string;
  nickname?: string;
  message?: string;
  photo_url?: string;
  status: string;
  created_at?: string;
}

/* --------------------------------------------------------- */
/* MODERATION MODAL */
/* --------------------------------------------------------- */
export default function ModerationModal({
  wallId,
  onClose,
}: {
  wallId: string;
  onClose: () => void;
}) {
  const [posts, setPosts] = useState<GuestPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<{ text: string; color: string } | null>(null);

  /* Persisted auto-approve state */
  const [autoApprove, setAutoApprove] = useState(false);

  /* Confirmation modal state */
  const [showConfirm, setShowConfirm] = useState(false);
  const [pendingToggleValue, setPendingToggleValue] = useState(false);

  /* Image Viewer State */
  const [fullImage, setFullImage] = useState<string | null>(null);

  const rt = useRealtimeChannel();

  function showToast(text: string, color = "#00ff88") {
    setToast({ text, color });
    setTimeout(() => setToast(null), 2500);
  }

  /* --------------------------------------------------------- */
  /* LOAD POSTS */
  /* --------------------------------------------------------- */
  async function loadAll() {
    const { data } = await supabase
      .from("guest_posts")
      .select("*")
      .eq("fan_wall_id", wallId)
      .order("created_at", { ascending: false });

    setPosts(data || []);
    setLoading(false);
  }

  /* --------------------------------------------------------- */
  /* LOAD AUTO-APPROVE SETTING FROM DB */
  /* --------------------------------------------------------- */
  async function loadModerationSetting() {
    const { data } = await supabase
      .from("fan_walls")
      .select("auto_approve_enabled")
      .eq("id", wallId)
      .single();

    if (data) {
      setAutoApprove(Boolean(data.auto_approve_enabled));
    }
  }

  /* --------------------------------------------------------- */
  /* SAVE AUTO-APPROVE (with final behavior)                  
     ON  → auto-approve ALL pending posts                     
     OFF → nothing changes, new posts must be approved         
  ----------------------------------------------------------- */
  async function saveAutoApprove(next: boolean) {
    setAutoApprove(next);

    await supabase
      .from("fan_walls")
      .update({ auto_approve_enabled: next })
      .eq("id", wallId);

    /* Turning OFF → do nothing else */
    if (!next) return;

    /* Turning ON → approve ALL pending posts */
    const { data: pendingPosts } = await supabase
      .from("guest_posts")
      .select("id")
      .eq("fan_wall_id", wallId)
      .eq("status", "pending");

    if (pendingPosts && pendingPosts.length > 0) {
      await supabase
        .from("guest_posts")
        .update({ status: "approved" })
        .eq("fan_wall_id", wallId)
        .eq("status", "pending");

      pendingPosts.forEach((post) => {
        rt?.current?.send({
          type: "broadcast",
          event: "post_updated",
          payload: { id: post.id, status: "approved", wallId },
        });
      });

      setPosts((prev) =>
        prev.map((p) =>
          p.status === "pending" ? { ...p, status: "approved" } : p
        )
      );

      showToast(`Auto-approved ${pendingPosts.length} pending posts`);
    }
  }

  /* --------------------------------------------------------- */
  /* APPROVE / REJECT / DELETE */
  /* --------------------------------------------------------- */
  async function handleApprove(id: string) {
    await supabase.from("guest_posts").update({ status: "approved" }).eq("id", id);

    setPosts((p) =>
      p.map((x) => (x.id === id ? { ...x, status: "approved" } : x))
    );

    rt?.current?.send({
      type: "broadcast",
      event: "post_updated",
      payload: { id, status: "approved", wallId },
    });

    showToast("✅ Approved");
  }

  async function handleReject(id: string) {
    await supabase.from("guest_posts").update({ status: "rejected" }).eq("id", id);

    setPosts((p) =>
      p.map((x) => (x.id === id ? { ...x, status: "rejected" } : x))
    );

    rt?.current?.send({
      type: "broadcast",
      event: "post_updated",
      payload: { id, status: "rejected", wallId },
    });

    showToast("🚫 Rejected", "#ff4444");
  }

  async function handleDelete(id: string) {
    await supabase.from("guest_posts").delete().eq("id", id);

    setPosts((p) => p.filter((x) => x.id !== id));

    rt?.current?.send({
      type: "broadcast",
      event: "post_deleted",
      payload: { id, wallId },
    });

    showToast("🗑 Deleted", "#bbb");
  }

  /* --------------------------------------------------------- */
  /* REALTIME LISTENER + auto-approve for new INSERTS */
  /* --------------------------------------------------------- */
  useEffect(() => {
    if (!wallId) return;

    loadModerationSetting();
    loadAll();

    const channel = supabase
      .channel(`moderation_${wallId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "guest_posts",
          filter: `fan_wall_id=eq.${wallId}`,
        },
        async (payload) => {
          const n = payload.new as GuestPost;

          /* NEW POST */
          if (payload.eventType === "INSERT") {
            if (autoApprove && n.status === "pending") {
              await supabase
                .from("guest_posts")
                .update({ status: "approved" })
                .eq("id", n.id);

              rt?.current?.send({
                type: "broadcast",
                event: "post_updated",
                payload: { id: n.id, status: "approved", wallId },
              });

              n.status = "approved";
            }

            setPosts((prev) => [n, ...prev]);
          }

          /* UPDATE */
          if (payload.eventType === "UPDATE") {
            setPosts((p) => p.map((x) => (x.id === n.id ? n : x)));
          }

          /* DELETE */
          if (payload.eventType === "DELETE") {
            setPosts((p) => p.filter((x) => x.id !== n.id));
          }
        }
      )
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, [wallId, autoApprove]);

  /* --------------------------------------------------------- */
  /* FILTERED LISTS */
  /* --------------------------------------------------------- */
  const pending = posts.filter((x) => x.status === "pending");
  const approved = posts.filter((x) => x.status === "approved");
  const rejected = posts.filter((x) => x.status === "rejected");

  /* --------------------------------------------------------- */
  /* UI */
  /* --------------------------------------------------------- */
  return (
    <div
      className={cn("fixed inset-0 bg-black/70 backdrop-blur-md z-[9999] flex items-center justify-center")}
      onClick={onClose}
    >
      <div
        className={cn(
          "relative w-[95vw] max-w-[1100px] max-h-[90vh] overflow-y-auto rounded-2xl",
          "bg-gradient-to-br from-[#0b0f1a]/95 to-[#111827]/95 p-6 shadow-[0_0_40px_rgba(0,140,255,0.45)]"
        )}
        onClick={(e) => e.stopPropagation()}
      >

        {/* HEADER */}
        <div className={cn('flex', 'items-center', 'justify-center', 'mb-6', 'relative')}>

          {/* AUTO-APPROVE TOGGLE */}
          <div className={cn('absolute', 'left-0', 'flex', 'items-center', 'gap-2')}>
            <div
              onClick={() => {
                const next = !autoApprove;

                if (next === true) {
                  setPendingToggleValue(true);
                  setShowConfirm(true);
                  return;
                }

                saveAutoApprove(false);
              }}
              className={cn(
                "relative w-14 h-7 rounded-full cursor-pointer transition-all",
                (pendingToggleValue || autoApprove)
                  ? "bg-green-500"
                  : "bg-gray-600"
              )}
            >
              <span
                className={cn(
                  "absolute top-1 left-1 w-5 h-5 rounded-full bg-white shadow transition-all",
                  (pendingToggleValue || autoApprove)
                    ? "translate-x-7"
                    : ""
                )}
              />
            </div>
            <span className={cn('text-sm', 'text-gray-300')}>Auto-Approve</span>
          </div>

          {/* TITLE */}
          <h1 className={cn('text-2xl', 'font-bold', 'text-center')}>Moderation</h1>

          {/* CLOSE */}
          <button
            onClick={onClose}
            className={cn('absolute', 'right-0', 'text-white/70', 'hover:text-white', 'text-xl')}
          >
            ✕
          </button>
        </div>

        {/* STATS */}
        <Stats pending={pending.length} approved={approved.length} rejected={rejected.length} />

        {/* CONTENT */}
        {loading ? (
          <p className="text-center">Loading…</p>
        ) : (
          <div className={cn('flex', 'flex-col', 'gap-5')}>
            <Section
              title="Pending"
              color="#ffd966"
              data={pending}
              onApprove={handleApprove}
              onReject={handleReject}
              onDoubleImageClick={setFullImage}
            />

            <Section
              title="Approved"
              color="#00ff88"
              data={approved}
              onDelete={handleDelete}
              showDelete
              onDoubleImageClick={setFullImage}
            />

            <Section
              title="Rejected"
              color="#ff4444"
              data={rejected}
              onDelete={handleDelete}
              showDelete
              onDoubleImageClick={setFullImage}
            />
          </div>
        )}

        {/* TOAST */}
        {toast && (
          <div
            className={cn('fixed', 'bottom-5', 'left-1/2', '-translate-x-1/2', 'px-4', 'py-2', 'rounded-lg', 'font-semibold')}
            style={{ background: toast.color, color: "#000" }}
          >
            {toast.text}
          </div>
        )}

        {/* FULLSCREEN IMAGE VIEWER */}
        {fullImage && (
          <div
            className={cn('fixed', 'inset-0', 'bg-black/80', 'backdrop-blur-sm', 'flex', 'items-center', 'justify-center', 'z-[999999]')}
            onClick={() => setFullImage(null)}
          >
            {/* CLOSE BUTTON */}
            <button
              className={cn('absolute', 'top-4', 'right-4', 'text-white/80', 'hover:text-white', 'text-3xl')}
              onClick={() => setFullImage(null)}
            >
              ✕
            </button>

            <img
              src={fullImage}
              className={cn('max-w-[95vw]', 'max-h-[95vh]', 'rounded-xl', 'shadow-2xl')}
            />
          </div>
        )}

        {/* CONFIRMATION MODAL */}
        {showConfirm && (
          <div className={cn('fixed', 'inset-0', 'bg-black/60', 'backdrop-blur-sm', 'flex', 'items-center', 'justify-center', 'z-[999999]')}>
            <div className={cn('bg-[#0d1625]', 'border', 'border-red-600/40', 'p-6', 'rounded-2xl', 'shadow-xl', 'w-[90%]', 'max-w-md', 'text-center')}>

              <h2 className={cn('text-xl', 'font-bold', 'text-red-400', 'mb-3')}>
                Enable Auto-Approve?
              </h2>

              <p className={cn('text-sm', 'text-gray-300', 'mb-6', 'leading-relaxed')}>
                When Auto-Approve is enabled, <strong>all new posts go directly to the screen</strong> without moderation.<br/><br/>
                <span className={cn('text-red-300', 'font-semibold')}>
                  Inappropriate or unsafe content could appear instantly.
                </span><br/><br/>
                Are you sure you want to enable Auto-Approve?
              </p>

              <div className={cn('flex', 'justify-center', 'gap-4')}>
                <button
                  onClick={() => {
                    setShowConfirm(false);
                    setPendingToggleValue(false);
                    saveAutoApprove(true);
                  }}
                  className={cn('px-6', 'py-2', 'rounded-xl', 'bg-green-500', 'text-black', 'font-semibold', 'shadow', 'hover:bg-green-400')}
                >
                  Yes, Enable
                </button>

                <button
                  onClick={() => {
                    setShowConfirm(false);
                    setPendingToggleValue(false);
                    setAutoApprove(false);
                  }}
                  className={cn('px-6', 'py-2', 'rounded-xl', 'bg-gray-600', 'text-white', 'font-semibold', 'shadow', 'hover:bg-gray-500')}
                >
                  No
                </button>
              </div>

            </div>
          </div>
        )}

      </div>
    </div>
  );
}

/* --------------------------------------------------------- */
/* STATS */
/* --------------------------------------------------------- */
function Stats({ pending, approved, rejected }) {
  return (
    <div className={cn('flex', 'justify-center', 'gap-8', 'text-sm', 'mb-4', 'opacity-90')}>
      <span>🕓 {pending} Pending</span>
      <span>✅ {approved} Approved</span>
      <span>🚫 {rejected} Rejected</span>
    </div>
  );
}

/* --------------------------------------------------------- */
/* SECTION */
/* --------------------------------------------------------- */
function Section({
  title,
  color,
  data,
  onApprove,
  onReject,
  onDelete,
  showDelete,
  onDoubleImageClick,
}) {
  return (
    <div>
      <h2
        style={{
          marginBottom: 6,
          borderLeft: `4px solid ${color}`,
          paddingLeft: 8,
        }}
      >
        {title} ({data.length})
      </h2>

      {data.length === 0 ? (
        <p className="text-gray-400">None</p>
      ) : (
        <div className={cn('grid', 'gap-2', 'grid-cols-[repeat(auto-fill,minmax(220px,1fr))]')}>
          {data.map((s) => (
            <div
              key={s.id}
              className={cn('flex', 'bg-[#0b0f19]', 'rounded-lg', 'overflow-hidden', 'border', 'border-[#333]', 'h-[110px]')}
            >
              {/* IMAGE */}
              <div className={cn('flex-none', 'w-[45%]')}>
                {s.photo_url ? (
                  <img
                    src={s.photo_url}
                    className={cn('w-full', 'h-full', 'object-cover', 'cursor-pointer')}
                    onDoubleClick={() => onDoubleImageClick(s.photo_url)}
                  />
                ) : (
                  <div className={cn('w-full', 'h-full', 'flex', 'items-center', 'justify-center', 'bg-[#222]', 'text-gray-500')}>
                    No Img
                  </div>
                )}
              </div>

              {/* TEXT + CONTROLS */}
              <div className={cn('flex', 'flex-col', 'justify-between', 'p-2', 'w-full')}>
                <div>
                  <strong className="text-xs">{s.nickname || "Anonymous"}</strong>
                  <p className={cn('text-[11px]', 'text-gray-300', 'line-clamp-3')}>
                    {s.message || "(no message)"}
                  </p>
                </div>

                {!showDelete ? (
                  <div className={cn('flex', 'gap-1', 'text-xs')}>
                    <button
                      onClick={() => onApprove?.(s.id)}
                      className={cn('flex-1', 'bg-green-600', 'text-white', 'rounded', 'px-1', 'py-[2px]')}
                    >
                      ✅
                    </button>
                    <button
                      onClick={() => onReject?.(s.id)}
                      className={cn('flex-1', 'bg-red-600', 'text-white', 'rounded', 'px-1', 'py-[2px]')}
                    >
                      🚫
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => onDelete?.(s.id)}
                    className={cn('w-full', 'bg-[#444]', 'text-white', 'rounded', 'px-1', 'py-[2px]', 'text-xs')}
                  >
                    🗑
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
