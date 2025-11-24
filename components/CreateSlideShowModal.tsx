'use client';

import { useState } from 'react';
import Modal from '@/components/Modal';
import { getSupabaseClient } from '@/lib/supabaseClient';
import { cn } from "../lib/utils";

interface CreateSlideShowModalProps {
  isOpen: boolean;
  onClose: () => void;
  hostId: string;
  refreshSlideshows: () => Promise<void>;
}

export default function CreateSlideShowModal({
  isOpen,
  onClose,
  hostId,
  refreshSlideshows,
}: CreateSlideShowModalProps) {

  const supabase = getSupabaseClient();
  const [title, setTitle] = useState('');
  const [saving, setSaving] = useState(false);

  async function handleCreate() {
    if (!title.trim() || !hostId) return;

    try {
      setSaving(true);

      // Insert row into slide_shows
      const { data, error } = await supabase
        .from('slide_shows')
        .insert([
          {
            host_id: hostId,
            name: title.trim(),
            slide_ids: [],
            transition: 'Fade In / Fade Out',
            duration_seconds: 8,
            is_playing: false,    // Now valid after adding column
          },
        ])
        .select()
        .single();

      if (error) {
        console.error('❌ Error creating slideshow:', error);
        alert("Error creating slideshow. Check console for details.");
        return;
      }

      await refreshSlideshows(); // Refresh UI
      setTitle('');
      onClose();

    } catch (err) {
      console.error('❌ Unexpected error creating slideshow:', err);
      alert("Unexpected error creating slideshow.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose}>
      <h2 className={cn('text-xl font-bold text-center mb-4')}>
        🖼️ New Slide Show
      </h2>

      {/* Name Input */}
      <input
        type="text"
        placeholder="Enter slideshow name..."
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        className={cn(
          'w-full px-3 py-2',
          'rounded-lg text-black text-sm',
          'mb-4'
        )}
      />

      {/* Buttons */}
      <div className={cn('flex justify-center gap-3')}>
        <button
          onClick={handleCreate}
          disabled={saving}
          className={cn(
            'bg-green-600 hover:bg-green-700',
            'px-4 py-2 rounded-lg font-semibold'
          )}
        >
          {saving ? 'Creating…' : '✅ Create'}
        </button>

        <button
          onClick={onClose}
          disabled={saving}
          className={cn(
            'bg-red-600 hover:bg-red-700',
            'px-4 py-2 rounded-lg font-semibold'
          )}
        >
          ✖ Cancel
        </button>
      </div>
    </Modal>
  );
}
