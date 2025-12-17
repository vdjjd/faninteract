'use client';

import { useEffect, useState } from 'react';
import imageCompression from 'browser-image-compression';
import { supabase } from '@/lib/supabaseClient';
import { cn } from '@/lib/utils';
import Modal from './Modal';

const DEFAULT_GRADIENT = 'linear-gradient(135deg,#0d47a1,#1976d2)';
const PRESET_COLORS = [
  '#FF0000',
  '#FFA500',
  '#FFFF00',
  '#008000',
  '#0000FF',
  '#4B0082',
  '#EE82EE',
  '#A0522D',
];

/* ----------------------------- */
/* ⭐ OPTION GRADIENT HELPERS    */
/* ----------------------------- */
type OptionColor = {
  start: string; // top
  end: string;   // bottom
};

function buildOptionGradient(start: string, end: string) {
  return `linear-gradient(to bottom, ${start}, ${end})`;
}

/* ----------------------------- */
/* ⭐ GRADIENT HELPERS           */
/* ----------------------------- */
function applyBrightnessToGradient(gradient: string, brightness: number) {
  if (!gradient?.includes('linear-gradient')) return gradient;
  const mult = brightness / 100;
  return gradient.replace(/(#\w{6})(\w{2})/g, (match, hex, alpha) => {
    const base = alpha ? parseInt(alpha, 16) : 255;
    const newA = Math.min(255, Math.max(0, base * mult));
    return `${hex}${Math.round(newA).toString(16).padStart(2, '0')}`;
  });
}

function buildGradient(start: string, end: string, pos: number, brightness: number) {
  const mid1 = pos;
  const mid2 = Math.min(pos + 15, 100);
  const g = `
    linear-gradient(
      135deg,
      ${start} 0%,
      ${start}cc ${mid1}%,
      ${end}99 ${mid2}%,
      ${end} 100%
    )
  `.replace(/\s+/g, ' ');
  return applyBrightnessToGradient(g, brightness);
}

/* ----------------------------- */
/* ⭐ DURATION HELPERS           */
/* ----------------------------- */
const DURATION_LABELS = [
  'none',
  '5 min',
  '10 min',
  '15 min',
  '20 min',
  '30 min',
  '45 min',
  '60 min',
] as const;
type DurationLabel = typeof DURATION_LABELS[number];

function labelToMinutes(label: DurationLabel | string): number | null {
  if (String(label).toLowerCase() === 'none') return null;
  const m = parseInt(String(label).replace(/\D/g, ''), 10);
  return Number.isFinite(m) ? m : 5;
}

function minutesToLabel(mins?: number | null): DurationLabel {
  if (mins == null) return 'none';
  const map: Record<number, DurationLabel> = {
    5: '5 min',
    10: '10 min',
    15: '15 min',
    20: '20 min',
    30: '30 min',
    45: '45 min',
    60: '60 min',
  };
  return map[mins] ?? '5 min';
}

/* ----------------------------- */
/* ⭐ COMPONENT                  */
/* ----------------------------- */
export default function OptionsModalPoll({
  poll,
  hostId,
  onClose,
  refreshPolls,
}: {
  poll: any;
  hostId: string;
  onClose: () => void;
  refreshPolls: () => Promise<void>;
}) {
  const [question, setQuestion] = useState('');
  const [privateTitle, setPrivateTitle] = useState('');
  const [options, setOptions] = useState<string[]>([]);
  const [optionColors, setOptionColors] = useState<OptionColor[]>([]);
  const [optionImages, setOptionImages] = useState<(string | null)[]>([]);
  const [saving, setSaving] = useState(false);

  const [bgType, setBgType] = useState('gradient');
  const [bgValue, setBgValue] = useState(DEFAULT_GRADIENT);
  const [colorStart, setColorStart] = useState('#0d47a1');
  const [colorEnd, setColorEnd] = useState('#1976d2');
  const [gradientPosition, setGradientPosition] = useState(60);
  const [brightness, setBrightness] = useState(100);
  const [uploading, setUploading] = useState(false);

  const [countdown, setCountdown] = useState('none');
  const [duration, setDuration] = useState<DurationLabel>('5 min');

  // NEW: display mode & per-option uploading indicator
  const [displayMode, setDisplayMode] = useState<'standard' | 'picture'>('standard');
  const [optionUploadingIndex, setOptionUploadingIndex] = useState<number | null>(null);

  const maxOptions = displayMode === 'picture' ? 5 : 8;

  /* ----------------------------- */
  /* Load from DB                  */
  /* ----------------------------- */
  useEffect(() => {
    if (!poll?.id) return;
    loadPoll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [poll?.id]);

  async function loadPoll() {
    try {
      const { data: opts } = await supabase
        .from('poll_options')
        .select('*')
        .eq('poll_id', poll.id);

      setQuestion(poll.question || '');
      setPrivateTitle(poll.host_title || '');
      setOptions(opts?.map((o: any) => o.option_text) || []);

      // Use gradient_start/gradient_end if present; otherwise fall back to bar_color
      setOptionColors(
        opts?.map((o: any, i: number) => ({
          start:
            o.gradient_start ||
            o.bar_color ||
            PRESET_COLORS[i % PRESET_COLORS.length],
          end:
            o.gradient_end ||
            o.bar_color ||
            PRESET_COLORS[(i + 1) % PRESET_COLORS.length],
        })) || []
      );

      // NEW: option images
      setOptionImages(
        opts?.map((o: any) => o.image_url || null) || []
      );

      const { data: pollData } = await supabase
        .from('polls')
        .select('*')
        .eq('id', poll.id)
        .maybeSingle();

      if (pollData) {
        setBgType(pollData.background_type || 'gradient');
        setBgValue(pollData.background_value || DEFAULT_GRADIENT);
        setColorStart(pollData.color_start || '#0d47a1');
        setColorEnd(pollData.color_end || '#1976d2');
        setGradientPosition(pollData.gradient_pos || 60);
        setBrightness(pollData.background_brightness ?? 100);
        setCountdown(pollData.countdown || 'none');
        setDuration(minutesToLabel(pollData.duration_minutes));
        setDisplayMode(
          (pollData.display_mode as 'standard' | 'picture') || 'standard'
        );
      }
    } catch (err) {
      console.error('❌ Failed to load poll:', err);
    }
  }

  /* ----------------------------- */
  /* Option helpers                */
  /* ----------------------------- */
  function updateOption(i: number, val: string) {
    setOptions((prev) => prev.map((o, idx) => (idx === i ? val : o)));
  }

  function updateOptionColor(i: number, part: 'start' | 'end', value: string) {
    setOptionColors((prev) =>
      prev.map((c, idx) =>
        idx === i ? { ...c, [part]: value } : c
      )
    );
  }

  function addOption() {
    if (options.length >= maxOptions) return;
    const idx = options.length;
    setOptions((prev) => [...prev, '']);
    setOptionColors((prev) => [
      ...prev,
      {
        start: PRESET_COLORS[idx % PRESET_COLORS.length],
        end: PRESET_COLORS[(idx + 1) % PRESET_COLORS.length],
      },
    ]);
    setOptionImages((prev) => [...prev, null]);
  }

  function removeOption(i: number) {
    if (options.length <= 2) return;
    setOptions((prev) => prev.filter((_, idx) => idx !== i));
    setOptionColors((prev) => prev.filter((_, idx) => idx !== i));
    setOptionImages((prev) => prev.filter((_, idx) => idx !== i));
  }

  /* ----------------------------- */
  /* Per-option image upload (picture mode)                        */
  /* ----------------------------- */
  async function handleOptionImageUpload(
    index: number,
    e: React.ChangeEvent<HTMLInputElement>
  ) {
    try {
      const file = e.target.files?.[0];
      if (!file || !poll?.id || !hostId) return;

      setOptionUploadingIndex(index);

      const compressed = await imageCompression(file, {
        maxWidthOrHeight: 1900,
        useWebWorker: true,
      });

      const ext = file.type.split('/')[1] || 'jpg';
      const path = `host_${hostId}/poll_${poll.id}/option_${index}-${Date.now()}.${ext}`;

      const { error: uploadErr } = await supabase.storage
        .from('wall-backgrounds') // reuse existing bucket
        .upload(path, compressed, { upsert: true });

      if (uploadErr) {
        console.error('❌ Option image upload error:', uploadErr);
        return;
      }

      const { data } = supabase.storage.from('wall-backgrounds').getPublicUrl(path);

      setOptionImages((prev) => {
        const next = [...prev];
        next[index] = data.publicUrl;
        return next;
      });
    } catch (err) {
      console.error('❌ Option image upload exception:', err);
    } finally {
      setOptionUploadingIndex(null);
    }
  }

  /* ----------------------------- */
  /* Background Upload/Delete       */
  /* ----------------------------- */
  async function handleImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    try {
      const file = e.target.files?.[0];
      if (!file) return;
      setUploading(true);

      const compressed = await imageCompression(file, {
        maxWidthOrHeight: 1900,
        useWebWorker: true,
      });

      const ext = file.type.split('/')[1];
      const path = `host_${hostId}/poll_${poll.id}/background-${Date.now()}.${ext}`;

      const { error: uploadErr } = await supabase.storage
        .from('wall-backgrounds')
        .upload(path, compressed, { upsert: true });

      if (uploadErr) throw uploadErr;

      const { data } = supabase.storage.from('wall-backgrounds').getPublicUrl(path);

      await supabase
        .from('polls')
        .update({
          background_type: 'image',
          background_value: data.publicUrl,
        })
        .eq('id', poll.id);

      setBgType('image');
      setBgValue(data.publicUrl);
    } catch (err) {
      console.error('❌ Upload Error:', err);
    } finally {
      setUploading(false);
    }
  }

  async function handleDeleteBackground() {
    try {
      if (bgType === 'image' && bgValue.includes('supabase.co')) {
        const parts = bgValue.split('/wall-backgrounds/')[1];
        if (parts) {
          await supabase.storage.from('wall-backgrounds').remove([decodeURIComponent(parts)]);
        }
      }

      await supabase
        .from('polls')
        .update({
          background_type: 'gradient',
          background_value: DEFAULT_GRADIENT,
        })
        .eq('id', poll.id);

      setBgType('gradient');
      setBgValue(DEFAULT_GRADIENT);
    } catch (err) {
      console.error('❌ Delete Background Error:', err);
    }
  }

  /* ----------------------------- */
  /* ⭐ PATCHED SAVE               */
  /* ----------------------------- */
  async function handleSave() {
    if (!question.trim()) return alert('Public Question required');
    const filled = options.map((o) => o.trim()).filter(Boolean);
    if (filled.length < 2) return alert('At least 2 options required');

    setSaving(true);
    try {
      const finalBg =
        bgType === 'gradient'
          ? applyBrightnessToGradient(bgValue, brightness)
          : bgValue;

      const duration_minutes = labelToMinutes(duration);

      /* 1️⃣ Save poll */
      await supabase
        .from('polls')
        .update({
          question,
          host_title: privateTitle,
          background_type: bgType,
          background_value: finalBg,
          color_start: colorStart,
          color_end: colorEnd,
          gradient_pos: gradientPosition,
          background_brightness: brightness,

          /* ⭐ Countdown fields */
          countdown,
          countdown_active: false,

          status: 'inactive',
          duration_minutes,

          // NEW: display mode
          display_mode: displayMode,
        })
        .eq('id', poll.id);

      /* 2️⃣ Broadcast to router + inactive wall — FIXED */
      await supabase
        .channel(`poll-${poll.id}`)
        .send({
          type: 'broadcast',
          event: 'poll_update',
          payload: {
            id: poll.id,
            countdown: countdown,
            countdown_active: countdown !== 'none',
            status: 'inactive',
          },
        });

      /* 3️⃣ Reset poll options */
      await supabase.from('poll_options').delete().eq('poll_id', poll.id);

      const rows = filled.map((text, i) => ({
        poll_id: poll.id,
        option_text: text,
        vote_count: 0,

        // legacy/simple solid color
        bar_color: optionColors[i]?.start || PRESET_COLORS[i % PRESET_COLORS.length],

        // gradient columns for this bar (used in standard mode)
        gradient_start: optionColors[i]?.start || PRESET_COLORS[i % PRESET_COLORS.length],
        gradient_end: optionColors[i]?.end || PRESET_COLORS[(i + 1) % PRESET_COLORS.length],

        // only actually used in standard mode
        use_gradient: displayMode === 'standard',

        // NEW: per-option image (picture mode)
        image_url: optionImages[i] || null,
      }));

      const { error: insertErr } = await supabase.from('poll_options').insert(rows);
      if (insertErr) throw insertErr;

      await refreshPolls();
      onClose();
    } catch (err) {
      console.error('❌ Error saving poll changes:', err);
      alert('Error saving poll changes');
    } finally {
      setSaving(false);
    }
  }

  /* ----------------------------- */
  /* ⭐ FULL UI (NO TRUNCATION)   */
  /* ----------------------------- */
  if (!poll) return null;

  return (
    <Modal isOpen={!!poll} onClose={onClose}>
      <div
        className={cn(
          'space-y-4 text-white overflow-y-auto max-h-[80vh] pr-2'
        )}
      >
        <h2 className={cn('text-xl font-semibold text-center mb-2')}>
          ⚙ Edit Poll Settings
        </h2>

        {/* PUBLIC QUESTION */}
        <div>
          <label className={cn('block text-sm font-semibold mb-1')}>
            Public Poll Question / Title
          </label>
          <input
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="Visible on Active & Inactive Wall"
            className={cn(
              'w-full px-3 py-2 rounded-lg bg-black/40 border border-white/10'
            )}
          />
        </div>

        {/* PRIVATE TITLE */}
        <div>
          <label className={cn('block text-sm font-semibold mb-1')}>
            Private Dashboard Title
          </label>
          <input
            value={privateTitle}
            onChange={(e) => setPrivateTitle(e.target.value)}
            placeholder="Visible only in Host Dashboard"
            className={cn(
              'w-full px-3 py-2 rounded-lg bg-black/40 border border-white/10'
            )}
          />
        </div>

        {/* DISPLAY MODE */}
        <div>
          <label className={cn('block text-sm font-semibold mb-1')}>
            Display Mode
          </label>
          <select
            value={displayMode}
            onChange={(e) =>
              setDisplayMode(e.target.value as 'standard' | 'picture')
            }
            className={cn(
              'w-full px-3 py-2 rounded-lg bg-black/40 border border-white/10'
            )}
          >
            <option value="standard">Standard (up to 8 options, gradient bars)</option>
            <option value="picture">Picture Background (up to 5 options)</option>
          </select>
          <p className={cn('text-xs', 'text-gray-300', 'mt-1')}>
            {displayMode === 'standard'
              ? 'Standard mode with gradient bars.'
              : 'Picture mode: each option can have an image that fills the bar background.'}
          </p>
        </div>

        {/* COUNTDOWN */}
        <div>
          <label className={cn('block text-sm font-semibold mb-1')}>
            Countdown Timer
          </label>
          <select
            value={countdown}
            onChange={(e) => setCountdown(e.target.value)}
            className={cn(
              'w-full px-3 py-2 rounded-lg bg-black/40 border border-white/10'
            )}
          >
            {['none', '30 sec', '1 min', '2 min', '3 min', '4 min', '5 min'].map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>

        {/* DURATION */}
        <div>
          <label className={cn('block text-sm font-semibold mb-1')}>
            Poll Duration
          </label>
          <select
            value={duration}
            onChange={(e) => setDuration(e.target.value as DurationLabel)}
            className={cn(
              'w-full px-3 py-2 rounded-lg bg-black/40 border border-white/10'
            )}
          >
            {DURATION_LABELS.map((d) => (
              <option key={d} value={d}>
                {d === 'none' ? 'No Duration (Runs Until Stopped)' : d}
              </option>
            ))}
          </select>
        </div>

        {/* OPTIONS */}
        <div>
          <label className={cn('block text-sm font-semibold mb-1')}>Options</label>
          {options.map((opt, i) => (
            <div key={i} className="mb-4">
              <div className={cn('flex gap-2 mb-1')}>
                <input
                  value={opt}
                  onChange={(e) => updateOption(i, e.target.value)}
                  placeholder={`Option ${i + 1}`}
                  className={cn(
                    'flex-1 px-3 py-2 rounded-lg bg-black/40 border border-white/10'
                  )}
                />
                {options.length > 2 && (
                  <button
                    onClick={() => removeOption(i)}
                    className={cn(
                      'px-3 rounded-lg bg-white/10 hover:bg-white/15'
                    )}
                  >
                    ✕
                  </button>
                )}
              </div>

              {/* Per-option gradient controls (always available; used in standard mode) */}
              <div className={cn('flex gap-4 justify-center items-center mb-2')}>
                <div>
                  <label className={cn('block text-xs mb-1')}>Top</label>
                  <input
                    type="color"
                    value={optionColors[i]?.start ?? PRESET_COLORS[0]}
                    onChange={(e) =>
                      updateOptionColor(i, 'start', e.target.value)
                    }
                  />
                </div>

                <div>
                  <label className={cn('block text-xs mb-1')}>Bottom</label>
                  <input
                    type="color"
                    value={optionColors[i]?.end ?? PRESET_COLORS[1]}
                    onChange={(e) =>
                      updateOptionColor(i, 'end', e.target.value)
                    }
                  />
                </div>

                <div
                  className={cn(
                    'w-6 h-10 rounded-md border border-white/20 shadow-inner'
                  )}
                  style={{
                    background: buildOptionGradient(
                      optionColors[i]?.start ?? PRESET_COLORS[0],
                      optionColors[i]?.end ?? PRESET_COLORS[1]
                    ),
                  }}
                />
              </div>

              {/* Picture mode: per-option image upload */}
              {displayMode === 'picture' && (
                <div className="mt-1">
                  <label
                    className={cn(
                      'flex items-center justify-between mb-1 text-[11px]'
                    )}
                  >
                    <span>Option Image (Background)</span>
                    <span className={cn('ml-2', 'text-[10px]', 'text-red-400', 'font-semibold')}>
                      Best Resolution 900 x 1400 w/ 96 PPI
                    </span>
                  </label>
                  <div className={cn('flex', 'items-center', 'gap-2')}>
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      onChange={(e) => handleOptionImageUpload(i, e)}
                      className="text-xs"
                    />
                    {optionUploadingIndex === i && (
                      <span className={cn('text-xs', 'text-emerald-300')}>
                        Uploading...
                      </span>
                    )}
                  </div>
                  {optionImages[i] && (
                    <p className={cn('text-[10px]', 'text-gray-300', 'mt-1')}>
                      {optionImages[i]?.split('/').pop()}
                    </p>
                  )}
                </div>
              )}
            </div>
          ))}

          <button
            onClick={addOption}
            disabled={options.length >= maxOptions}
            className={cn(
              'px-3 py-2 rounded-lg border border-white/10 transition',
              options.length >= maxOptions
                ? 'opacity-40 cursor-not-allowed'
                : 'bg-white/10 hover:bg-white/15'
            )}
          >
            + Add Option
          </button>
          {options.length >= maxOptions && (
            <p className={cn('text-xs text-red-400 mt-1 text-center')}>
              Maximum of {maxOptions} options allowed in this mode.
            </p>
          )}
        </div>

        {/* BACKGROUND PREVIEW */}
        <div className={cn('mt-6 text-center')}>
          <div
            className={cn(
              'w-[140px] h-[80px] rounded-md border border-white/20 shadow-inner mx-auto'
            )}
            style={{
              background:
                bgType === 'image'
                  ? `url(${bgValue}) center/cover no-repeat`
                  : bgValue,
            }}
          />
          <p className={cn('text-xs text-gray-300 mt-2')}>
            {bgType === 'image'
              ? 'Current Background Image'
              : 'Current Gradient Background'}
          </p>
        </div>

        {/* COLOR PICKERS */}
        <div className={cn('flex justify-center gap-6 mt-4')}>
          <div>
            <label className={cn('block text-xs mb-1')}>Left Color</label>
            <input
              type="color"
              value={colorStart}
              onChange={(e) => {
                const newStart = e.target.value;
                setColorStart(newStart);
                setBgType('gradient');
                setBgValue(buildGradient(newStart, colorEnd, gradientPosition, brightness));
              }}
            />
          </div>

          <div>
            <label className={cn('block text-xs mb-1')}>Right Color</label>
            <input
              type="color"
              value={colorEnd}
              onChange={(e) => {
                const newEnd = e.target.value;
                setColorEnd(newEnd);
                setBgType('gradient');
                setBgValue(buildGradient(colorStart, newEnd, gradientPosition, brightness));
              }}
            />
          </div>
        </div>

        {/* SLIDERS */}
        <div className={cn('flex flex-col items-center mt-4')}>
          <label className={cn('text-xs mb-1')}>Gradient Position</label>
          <input
            type="range"
            min="0"
            max="100"
            value={gradientPosition}
            onChange={(e) => {
              const pos = Number(e.target.value);
              setGradientPosition(pos);
              setBgType('gradient');
              setBgValue(buildGradient(colorStart, colorEnd, pos, brightness));
            }}
            className={cn('w-[140px] accent-blue-400')}
          />
          <p className={cn('text-xs mt-1')}>{gradientPosition}%</p>
        </div>

        <div className={cn('flex flex-col items-center mt-4')}>
          <label className={cn('text-xs mb-1')}>Background Brightness</label>
          <input
            type="range"
            min="20"
            max="150"
            value={brightness}
            onChange={(e) => {
              const val = Number(e.target.value);
              setBrightness(val);
              if (bgType === 'gradient') {
                setBgValue(buildGradient(colorStart, colorEnd, gradientPosition, val));
              }
            }}
            className={cn('w-[140px] accent-blue-400')}
          />
          <p className={cn('text-xs mt-1')}>{brightness}%</p>
        </div>

        {/* IMAGE UPLOAD */}
        <div className={cn('flex flex-col items-center mt-6')}>
          <p className={cn('text-sm font-semibold mb-2')}>Upload Background</p>
          <label
            htmlFor="fileUpload"
            className={cn(
              'px-4 py-2 rounded-md bg-blue-600 hover:bg-blue-700 text-white font-semibold cursor-pointer'
            )}
          >
            Choose File
          </label>
          <input
            id="fileUpload"
            type="file"
            accept="image/png,image/jpeg,image/webp"
            onChange={handleImageUpload}
            className="hidden"
          />

          <p className={cn('text-xs text-gray-300 mt-2')}>
            {uploading
              ? 'Uploading...'
              : bgType === 'image'
              ? bgValue?.split('/').pop()
              : 'No file chosen'}
          </p>
        </div>

        {/* FOOTER */}
        <div
          className={cn(
            'flex justify-between items-center pt-2 border-t border-white/10',
            'sticky bottom-0 bg-[#0b0f1a]/90 backdrop-blur-sm py-2'
          )}
        >
          <button
            onClick={handleDeleteBackground}
            className={cn(
              'px-3 py-1.5 rounded-md bg-red-600/80 hover:bg-red-700 text-sm font-semibold'
            )}
          >
            Delete Background
          </button>

          <div className={cn('flex gap-2')}>
            <button
              onClick={onClose}
              className={cn(
                'px-3 py-1.5 rounded-md bg-white/10 hover:bg-white/15 text-sm'
              )}
            >
              Cancel
            </button>

            <button
              disabled={saving}
              onClick={handleSave}
              className={cn(
                'px-3 py-1.5 rounded-md border text-sm',
                saving
                  ? 'opacity-60 cursor-wait'
                  : 'bg-emerald-600/80 border-emerald-500 hover:bg-emerald-600'
              )}
            >
              {saving ? 'Saving…' : 'Save Changes'}
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
