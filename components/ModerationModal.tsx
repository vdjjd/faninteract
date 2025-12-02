"use client";

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { cn } from "../lib/utils";
import { useRealtimeChannel } from '@/providers/SupabaseRealtimeProvider';

/* TYPES */
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

  const [autoApprove, setAutoApprove] = useState(false); // ⭐ Toggle uses same style as Ads Manager

  const rt = useRealtimeChannel();

  function showToast(text: string, color = '#00ff88') {
    setToast({ text, color });
    setTimeout(() => setToast(null), 2500);
  }

  async function loadAll() {
    if (!wallId) return;

    const { data } = await supabase
      .from('guest_posts')
      .select('*')
      .eq('fan_wall_id', wallId)
      .order('created_at', { ascending: false });

    setPosts(data || []);
    setLoading(false);
  }

  async function handleApprove(id: string) {
    await supabase.from("guest_posts").update({ status: "approved" }).eq("id", id);

    setPosts((p) => p.map((x) => (x.id === id ? { ...x, status: "approved" } : x)));

    rt?.current?.send({
      type: "broadcast",
      event: "post_updated",
      payload: { id, status: "approved", wallId },
    });

    showToast("✅ Approved");
  }

  async function handleReject(id: string) {
    await supabase.from("guest_posts").update({ status: "rejected" }).eq("id", id);

    setPosts((p) => p.map((x) => (x.id === id ? { ...x, status: "rejected" } : x)));

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
  /* REALTIME EVENT HANDLER WITH AUTO-APPROVE SUPPORT */
  /* --------------------------------------------------------- */
  useEffect(() => {
    if (!wallId) return;
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

          if (payload.eventType === "UPDATE") {
            setPosts((p) =>
              p.map((x) => (x.id === n.id ? n : x))
            );
          }

          if (payload.eventType === "DELETE") {
            setPosts((p) => p.filter((x) => x.id !== n.id));
          }
        }
      )
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, [wallId, autoApprove]);

  const pending = posts.filter((x) => x.status === "pending");
  const approved = posts.filter((x) => x.status === "approved");
  const rejected = posts.filter((x) => x.status === "rejected");

  /* --------------------------------------------------------- */
  /* UI */
  /* --------------------------------------------------------- */
  return (
    <div
      className={cn(
        "fixed inset-0 bg-black/70 backdrop-blur-md z-[9999] flex items-center justify-center"
      )}
      onClick={onClose}
    >
      <div
        className={cn(
          "relative w-[95vw] max-w-[1100px] max-h-[90vh] overflow-y-auto rounded-2xl",
          "bg-gradient-to-br from-[#0b0f1a]/95 to-[#111827]/95 p-6 shadow-[0_0_40px_rgba(0,140,255,0.45)]"
        )}
        onClick={(e) => e.stopPropagation()}
      >

        {/* HEADER ROW: Toggle left, title center, close button right */}
        <div className={cn('flex', 'items-center', 'justify-center', 'mb-6', 'relative')}>

          {/* LEFT: AUTO APPROVE TOGGLE (MATCHES ADS MANAGER STYLE) */}
          <div className={cn('absolute', 'left-0', 'flex', 'items-center', 'gap-2')}>
            <div
              onClick={() => setAutoApprove(!autoApprove)}
              className={cn(
                "relative w-14 h-7 rounded-full cursor-pointer transition-all",
                autoApprove ? "bg-green-500" : "bg-gray-600"
              )}
            >
              <span
                className={cn(
                  "absolute top-1 left-1 w-5 h-5 rounded-full bg-white shadow transition-all",
                  autoApprove ? "translate-x-7" : ""
                )}
              />
            </div>
            <span className={cn('text-sm', 'text-gray-300')}>Auto-Approve</span>
          </div>

          {/* CENTER: Title */}
          <h1 className={cn('text-2xl', 'font-bold', 'text-center')}>Moderation</h1>

          {/* RIGHT: Close Button */}
          <button
            onClick={onClose}
            className={cn('absolute', 'right-0', 'text-white/70', 'hover:text-white', 'text-xl')}
          >
            ✕
          </button>
        </div>

        <Stats pending={pending.length} approved={approved.length} rejected={rejected.length} />

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
              onImageClick={() => {}}
            />

            <Section
              title="Approved"
              color="#00ff88"
              data={approved}
              onDelete={handleDelete}
              showDelete
              onImageClick={() => {}}
            />

            <Section
              title="Rejected"
              color="#ff4444"
              data={rejected}
              onDelete={handleDelete}
              showDelete
              onImageClick={() => {}}
            />
          </div>
        )}

        {toast && (
          <div
            className={cn('fixed', 'bottom-5', 'left-1/2', '-translate-x-1/2', 'px-4', 'py-2', 'rounded-lg', 'font-semibold')}
            style={{ background: toast.color, color: "#000" }}
          >
            {toast.text}
          </div>
        )}
      </div>
    </div>
  );
}

/* --------------------------------------------------------- */
/* Stats Component */
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
/* Section Component */
/* --------------------------------------------------------- */
function Section({
  title,
  color,
  data,
  onApprove,
  onReject,
  onDelete,
  showDelete,
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
              {/* Thumbnail */}
              <div className={cn('flex-none', 'w-[45%]')}>
                {s.photo_url ? (
                  <img
                    src={s.photo_url}
                    className={cn('w-full', 'h-full', 'object-cover')}
                  />
                ) : (
                  <div className={cn('w-full', 'h-full', 'flex', 'items-center', 'justify-center', 'bg-[#222]', 'text-gray-500')}>
                    No Img
                  </div>
                )}
              </div>

              {/* Text + Buttons */}
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
                      onClick={() => onApprove(s.id)}
                      className={cn('flex-1', 'bg-green-600', 'text-white', 'rounded', 'px-1', 'py-[2px]')}
                    >
                      ✅
                    </button>
                    <button
                      onClick={() => onReject(s.id)}
                      className={cn('flex-1', 'bg-red-600', 'text-white', 'rounded', 'px-1', 'py-[2px]')}
                    >
                      🚫
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => onDelete(s.id)}
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
