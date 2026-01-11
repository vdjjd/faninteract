'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { cn } from '@/lib/utils';
import { useRealtimeChannel } from '@/providers/SupabaseRealtimeProvider';

/* --------------------------------------------------------- */
/* ✅ TYPES */
/* --------------------------------------------------------- */
interface WheelEntry {
  id: string;
  wheel_id: string;
  guest_profile_id: string;
  status: 'pending' | 'approved' | 'rejected';
  created_at: string;
  photo_url?: string;

  guest_profiles?: {
    first_name: string | null;
    last_name: string | null;
    email: string | null;
    phone: string | null;
  };
}

function chunk<T>(arr: T[], size: number) {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

/* --------------------------------------------------------- */
/* ✅ MAIN MODAL */
/* --------------------------------------------------------- */
export default function PrizeWheelModerationModal({
  wheelId,
  onClose,
}: {
  wheelId: string;
  onClose: () => void;
}) {
  const [entries, setEntries] = useState<WheelEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<{ text: string; color: string } | null>(null);
  const [selectedPhoto, setSelectedPhoto] = useState<string | null>(null);
  const [bulkApproving, setBulkApproving] = useState(false);

  const rt = useRealtimeChannel();

  function showToast(text: string, color = '#00ff88') {
    setToast({ text, color });
    setTimeout(() => setToast(null), 2400);
  }

  /* --------------------------------------------------------- */
  /* Fetch a single entry WITH guest join (realtime payload fix) */
  /* --------------------------------------------------------- */
  async function fetchEntryWithGuest(id: string): Promise<WheelEntry | null> {
    const { data, error } = await supabase
      .from('wheel_entries')
      .select('*, guest_profiles(*)')
      .eq('id', id)
      .single();

    if (error) {
      console.error('❌ fetchEntryWithGuest error:', error);
      return null;
    }

    return (data ?? null) as WheelEntry | null;
  }

  /* --------------------------------------------------------- */
  /* ✅ Load ALL entries (pagination fixes 1000 cap) */
  /* --------------------------------------------------------- */
  async function loadAll() {
    setLoading(true);

    const pageSize = 1000;
    let from = 0;
    const all: WheelEntry[] = [];

    while (true) {
      const to = from + pageSize - 1;

      const { data, error } = await supabase
        .from('wheel_entries')
        .select('*, guest_profiles(*)')
        .eq('wheel_id', wheelId)
        .order('created_at', { ascending: false })
        .range(from, to);

      if (error) {
        console.error('❌ loadAll error:', error);
        break;
      }

      const rows = (data ?? []) as WheelEntry[];
      all.push(...rows);

      if (rows.length < pageSize) break;
      from += pageSize;
    }

    setEntries(all);
    setLoading(false);
  }

  /* --------------------------------------------------------- */
  /* Actions */
  /* --------------------------------------------------------- */
  async function handleApprove(id: string) {
    const { error } = await supabase.from('wheel_entries').update({ status: 'approved' }).eq('id', id);

    if (error) {
      showToast('❌ Approve failed', '#ff4444');
      return;
    }

    setEntries((e) => e.map((x) => (x.id === id ? { ...x, status: 'approved' } : x)));

    rt?.broadcast('wheel_entry_updated', { id, status: 'approved', wheelId });
    showToast('✅ Approved');
  }

  async function handleReject(id: string) {
    const { error } = await supabase.from('wheel_entries').update({ status: 'rejected' }).eq('id', id);

    if (error) {
      showToast('❌ Reject failed', '#ff4444');
      return;
    }

    setEntries((e) => e.map((x) => (x.id === id ? { ...x, status: 'rejected' } : x)));

    rt?.broadcast('wheel_entry_updated', { id, status: 'rejected', wheelId });
    showToast('🚫 Rejected', '#ff4444');
  }

  async function handleDelete(id: string) {
    const { error } = await supabase.from('wheel_entries').delete().eq('id', id);

    if (error) {
      showToast('❌ Delete failed', '#ff4444');
      return;
    }

    setEntries((e) => e.filter((x) => x.id !== id));

    rt?.broadcast('wheel_entry_deleted', { id, wheelId });
    showToast('🗑 Deleted', '#bbb');
  }

  /* --------------------------------------------------------- */
  /* ✅ APPROVE ALL (chunked) */
  /* --------------------------------------------------------- */
  async function handleApproveAll() {
    if (bulkApproving) return;

    const pendingNow = entries.filter((x) => x.status === 'pending');
    if (pendingNow.length === 0) return;

    setBulkApproving(true);

    const ids = pendingNow.map((p) => p.id);
    const chunks = chunk(ids, 500);

    for (const idsChunk of chunks) {
      const { error } = await supabase
        .from('wheel_entries')
        .update({ status: 'approved' })
        .eq('wheel_id', wheelId)
        .in('id', idsChunk);

      if (error) {
        console.error('❌ Approve All chunk failed:', error);
        showToast('❌ Approve All failed', '#ff4444');
        setBulkApproving(false);
        return;
      }
    }

    const idSet = new Set(ids);
    setEntries((e) => e.map((x) => (idSet.has(x.id) ? { ...x, status: 'approved' } : x)));

    rt?.broadcast('wheel_entries_bulk_updated', { wheelId, ids, status: 'approved' });

    showToast(`✅ Approved ${ids.length}`, '#00ff88');
    setBulkApproving(false);
  }

  /* --------------------------------------------------------- */
  /* Realtime sync (re-fetch join on insert/update) */
  /* --------------------------------------------------------- */
  useEffect(() => {
    let cancelled = false;

    loadAll();

    const channel = supabase
      .channel(`wheel_mod_${wheelId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'wheel_entries',
          filter: `wheel_id=eq.${wheelId}`,
        },
        async (payload) => {
          if (cancelled) return;

          if (payload.eventType === 'INSERT') {
            const newId = (payload.new as any)?.id as string;
            if (!newId) return;

            const full = await fetchEntryWithGuest(newId);
            if (!full || cancelled) return;

            setEntries((prev) => {
              if (prev.some((x) => x.id === full.id)) return prev;
              return [full, ...prev];
            });
          }

          if (payload.eventType === 'UPDATE') {
            const newId = (payload.new as any)?.id as string;
            if (!newId) return;

            const full = await fetchEntryWithGuest(newId);
            if (!full || cancelled) return;

            setEntries((prev) => prev.map((x) => (x.id === newId ? full : x)));
          }

          if (payload.eventType === 'DELETE') {
            const oldId = (payload.old as any)?.id as string;
            if (!oldId) return;

            setEntries((prev) => prev.filter((x) => x.id !== oldId));
          }
        }
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [wheelId]);

  /* --------------------------------------------------------- */
  /* Categorized Lists */
  /* --------------------------------------------------------- */
  const pending = entries.filter((x) => x.status === 'pending');
  const approved = entries.filter((x) => x.status === 'approved');
  const rejected = entries.filter((x) => x.status === 'rejected');

  /* --------------------------------------------------------- */
  /* UI */
  /* --------------------------------------------------------- */
  return (
    <div
      className={cn('fixed inset-0 bg-black/70 backdrop-blur-md z-[9999] flex items-center justify-center')}
      onClick={onClose}
    >
      <div
        className={cn(
          'relative w-[95vw] max-w-[1100px] max-h-[90vh] overflow-y-auto rounded-2xl',
          'bg-gradient-to-br from-[#0b0f1a]/95 to-[#111827]/95 p-6',
          'shadow-[0_0_40px_rgba(0,140,255,0.45)]'
        )}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close */}
        <button
          onClick={onClose}
          className={cn('absolute', 'top-3', 'right-3', 'text-white/70', 'hover:text-white', 'text-xl')}
        >
          ✕
        </button>

        {/* Header */}
        <h1 className={cn('text-center', 'text-2xl', 'font-bold', 'mb-4')}>Prize Wheel Moderation</h1>

        <Stats pending={pending.length} approved={approved.length} rejected={rejected.length} />

        {/* Approve All */}
        <div className={cn('flex', 'justify-center', 'mb-4')}>
          <button
            onClick={handleApproveAll}
            disabled={bulkApproving || pending.length === 0}
            className={cn(
              'px-4 py-2 rounded-lg font-semibold text-sm transition',
              pending.length === 0 || bulkApproving
                ? 'bg-white/10 text-white/40 cursor-not-allowed'
                : 'bg-green-600 text-white hover:bg-green-500'
            )}
          >
            {bulkApproving ? 'Approving…' : `Approve All (${pending.length})`}
          </button>
        </div>

        {loading ? (
          <p className="text-center">Loading…</p>
        ) : (
          <>
            <Section
              title="Pending"
              color="#ffd966"
              entries={pending}
              onApprove={handleApprove}
              onReject={handleReject}
              onImageClick={setSelectedPhoto}
            />

            <Section
              title="Approved"
              color="#00ff88"
              entries={approved}
              showDelete
              onDelete={handleDelete}
              onImageClick={setSelectedPhoto}
            />

            <Section
              title="Rejected"
              color="#ff4444"
              entries={rejected}
              showDelete
              onDelete={handleDelete}
              onImageClick={setSelectedPhoto}
            />
          </>
        )}

        {/* Toast */}
        {toast && (
          <div
            className={cn('fixed bottom-5 left-1/2 -translate-x-1/2 px-4 py-2 rounded-lg font-semibold')}
            style={{ background: toast.color }}
          >
            {toast.text}
          </div>
        )}

        {/* Photo Preview */}
        {selectedPhoto && (
          <div
            className={cn('fixed inset-0 bg-black/70 flex items-center justify-center z-[9999]')}
            onClick={() => setSelectedPhoto(null)}
          >
            <img src={selectedPhoto} className={cn('max-w-[90vw]', 'max-h-[90vh]', 'rounded-xl', 'shadow-xl')} />
          </div>
        )}
      </div>
    </div>
  );
}

/* --------------------------------------------------------- */
/* Stats Strip */
/* --------------------------------------------------------- */
function Stats({ pending, approved, rejected }: { pending: number; approved: number; rejected: number }) {
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
  entries,
  onApprove,
  onReject,
  onDelete,
  showDelete,
  onImageClick,
}: {
  title: string;
  color: string;
  entries: WheelEntry[];
  onApprove?: (id: string) => void;
  onReject?: (id: string) => void;
  onDelete?: (id: string) => void;
  showDelete?: boolean;
  onImageClick: (src: string) => void;
}) {
  return (
    <>
      <h2 style={{ marginBottom: 6, borderLeft: `4px solid ${color}`, paddingLeft: 8 }}>
        {title} ({entries.length})
      </h2>

      {entries.length === 0 ? (
        <p className={cn('text-gray-400', 'mb-4')}>None</p>
      ) : (
        <div className={cn('grid', 'gap-2', 'grid-cols-[repeat(auto-fill,minmax(240px,1fr))]', 'mb-6')}>
          {entries.map((e) => (
            <div
              key={e.id}
              className={cn('flex', 'bg-[#0b0f19]', 'rounded-lg', 'overflow-hidden', 'border', 'border-[#333]', 'h-[120px]')}
            >
              {/* Photo */}
              <div className={cn('w-[45%]', 'cursor-pointer')} onClick={() => e.photo_url && onImageClick(e.photo_url)}>
                {e.photo_url ? (
                  <img src={e.photo_url} className={cn('w-full', 'h-full', 'object-cover')} />
                ) : (
                  <div className={cn('w-full', 'h-full', 'flex', 'items-center', 'justify-center', 'bg-[#222]', 'text-gray-500')}>
                    No Img
                  </div>
                )}
              </div>

              {/* Details */}
              <div className={cn('flex', 'flex-col', 'justify-between', 'p-2', 'w-full')}>
                <div>
                  <strong className="text-xs">
                    {(e.guest_profiles?.first_name || '') + ' ' + (e.guest_profiles?.last_name || '')}
                  </strong>
                  <p className={cn('text-[11px]', 'text-gray-300')}>{e.guest_profiles?.email || 'no email'}</p>
                </div>

                {!showDelete ? (
                  <div className={cn('flex', 'gap-1', 'text-xs')}>
                    {onApprove && (
                      <button onClick={() => onApprove(e.id)} className={cn('flex-1', 'bg-green-600', 'text-white', 'rounded', 'px-1', 'py-[2px]')}>
                        ✅
                      </button>
                    )}
                    {onReject && (
                      <button onClick={() => onReject(e.id)} className={cn('flex-1', 'bg-red-600', 'text-white', 'rounded', 'px-1', 'py-[2px]')}>
                        🚫
                      </button>
                    )}
                  </div>
                ) : (
                  <button
                    onClick={() => onDelete?.(e.id)}
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
    </>
  );
}
