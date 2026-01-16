import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

function escapeHtml(v: any) {
  return String(v ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function resolveBackgroundCss(background_type?: string, background_value?: string) {
  const val = String(background_value || '').trim();

  if (background_type === 'image' && val) {
    return `background: url('${val}') center / cover no-repeat;`;
  }

  if (val) {
    return val.includes('gradient(')
      ? `background-image: ${val};`
      : `background: ${val};`;
  }

  return `background: linear-gradient(135deg,#1b2735,#090a0f);`;
}

function numClamp(n: any, min: number, max: number, fallback: number) {
  const v = Number(n);
  if (!Number.isFinite(v)) return fallback;
  return Math.max(min, Math.min(max, v));
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const wallId = String(searchParams.get('wallId') || '').trim();

  if (!wallId) {
    return new NextResponse('Missing wallId', { status: 400 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !(serviceRole || anonKey)) {
    return new NextResponse('Supabase env vars missing', { status: 500 });
  }

  const supabase = createClient(supabaseUrl, serviceRole || (anonKey as string), {
    auth: { persistSession: false },
  });

  // 1) Load wall (tries join to hosts; falls back if join fails)
  let wall: any = null;

  {
    const attempt = await supabase
      .from('fan_walls')
      .select(
        'id,title,host_title,background_type,background_value,background_brightness,branding_logo_url,host:hosts(branding_logo_url)'
      )
      .eq('id', wallId)
      .maybeSingle();

    if (!attempt.error && attempt.data) {
      wall = attempt.data;
    } else {
      const fallback = await supabase
        .from('fan_walls')
        .select('id,title,host_title,background_type,background_value,background_brightness,branding_logo_url')
        .eq('id', wallId)
        .maybeSingle();

      if (fallback.error || !fallback.data) {
        return new NextResponse('Wall not found', { status: 404 });
      }
      wall = fallback.data;
    }
  }

  // 2) Load approved posts (NO loyalty badge fields, NO visit_count)
  const { data: posts, error: postsErr } = await supabase
    .from('guest_posts')
    .select('id,photo_url,nickname,message,status,created_at')
    .eq('fan_wall_id', wallId)
    .eq('status', 'approved')
    .order('created_at', { ascending: true });

  if (postsErr) {
    return new NextResponse(`Error loading posts: ${postsErr.message}`, { status: 500 });
  }

  const title = String(wall?.title || wall?.host_title || 'Fan Zone Wall');
  const brightness = numClamp(wall?.background_brightness ?? 100, 30, 140, 100);

  const bgCss = resolveBackgroundCss(wall?.background_type, wall?.background_value);

  const logoUrl =
    String(wall?.branding_logo_url || '').trim() ||
    String(wall?.host?.branding_logo_url || '').trim() ||
    '/faninteractlogo.png';

  const safeTitle = escapeHtml(title);

  const pagesHtml = (posts || []).map((p: any, idx: number) => {
    const photoUrl = String(p?.photo_url || '').trim() || '/fallback.png';
    const nicknameRaw = (p?.nickname ?? 'Guest');
    const nickname = escapeHtml(String(nicknameRaw).trim() || 'Guest');
    const message = escapeHtml(p?.message || '');

    return `
      <section class="page">
        <div class="page-inner" style="filter: brightness(${brightness}%); ${bgCss}">
          <h1 class="title">${safeTitle}</h1>

          <div class="card">
            <div class="photo">
              <img src="${escapeHtml(photoUrl)}" alt="Guest photo ${idx + 1}" />
            </div>

            <div class="right">
              <div class="logoBox">
                <img src="${escapeHtml(logoUrl)}" alt="Logo" />
              </div>

              <div class="greyBar"></div>

              <div class="nickname">${nickname}</div>

              <div class="messageBox">
                <div class="message">${message}</div>
              </div>
            </div>
          </div>
        </div>
      </section>
    `;
  });

  const emptyHtml =
    !pagesHtml.length
      ? `<div class="empty">
           <h2>No approved posts yet</h2>
           <p>Approve posts in Moderation, then export again.</p>
         </div>`
      : pagesHtml.join('\n');

  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${safeTitle} - Guestbook Export</title>

  <style>
    @page { size: 11in 8.5in; margin: 0; }

    html, body {
      height: 100%;
      margin: 0;
      padding: 0;
      background: #000;
      color: #fff;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
      font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, "Apple Color Emoji", "Segoe UI Emoji";
    }

    .page { page-break-after: always; }
    .page:last-child { page-break-after: auto; }

    .page-inner {
      width: 11in;
      height: 8.5in;
      position: relative;
      overflow: hidden;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
    }

    .title {
      color: #fff;
      margin: 0;
      margin-top: -0.6in;
      margin-bottom: 0.1in;
      font-weight: 900;
      font-size: 0.55in;
      text-shadow:
        2px 2px 2px #000,
        -2px 2px 2px #000,
        2px -2px 2px #000,
        -2px -2px 2px #000;
      filter:
        drop-shadow(0 0 25px rgba(255,255,255,0.35))
        drop-shadow(0 0 40px rgba(255,255,255,0.20));
      text-align: center;
      width: 100%;
      padding: 0 0.5in;
      box-sizing: border-box;
    }

    .card {
      width: 10.2in;
      height: 6.9in;
      background: rgba(255,255,255,0.08);
      backdrop-filter: blur(20px);
      border-radius: 24px;
      border: 1px solid rgba(255,255,255,0.15);
      position: relative;
      overflow: hidden;
      display: flex;
    }

    .photo {
      position: absolute;
      top: 4%;
      left: 2%;
      width: 46%;
      height: 92%;
      border-radius: 18px;
      overflow: hidden;
    }

    .photo img {
      width: 100%;
      height: 100%;
      object-fit: cover;
      border-radius: 18px;
    }

    .right {
      flex-grow: 1;
      margin-left: 46%;
      padding-top: 0.35in;
      display: flex;
      flex-direction: column;
      align-items: center;
      position: relative;
      box-sizing: border-box;
    }

    .logoBox {
      width: 3.3in;
      height: 2.0in;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .logoBox img {
      width: 100%;
      height: 100%;
      object-fit: contain;
      filter: drop-shadow(0 0 14px rgba(0,0,0,0.85));
    }

    .greyBar {
      width: 90%;
      height: 14px;
      margin-top: 0.15in;
      margin-bottom: 0.15in;
      margin-left: 3.5%;
      background: linear-gradient(to right, #000, #4444);
      border-radius: 6px;
    }

    .nickname {
      font-size: 0.52in;
      font-weight: 900;
      color: #fff;
      text-transform: uppercase;
      margin: 0;
      text-shadow:
        2px 2px 2px #000,
        -2px 2px 2px #000,
        2px -2px 2px #000,
        -2px -2px 2px #000;
      padding: 0 0.35in;
      text-align: center;
      box-sizing: border-box;
      width: 100%;
    }

    .messageBox {
      width: 90%;
      height: 2.2in;
      margin-top: 0.2in;
      display: flex;
      align-items: center;
      justify-content: center;
      box-sizing: border-box;
      overflow: hidden;
      padding: 0 0.2in;
    }

    .message {
      color: #fff;
      text-align: center;
      max-width: 100%;
      margin: 0;
      font-weight: 600;
      font-size: 0.32in;
      line-height: 1.1;
      text-shadow:
        2px 2px 2px #000,
        -2px 2px 2px #000,
        2px -2px 2px #000,
        -2px -2px 2px #000;
      word-wrap: break-word;
      overflow: hidden;
      display: -webkit-box;
      -webkit-line-clamp: 8;
      -webkit-box-orient: vertical;
    }

    .empty {
      width: 100vw;
      height: 100vh;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      text-align: center;
      padding: 24px;
      box-sizing: border-box;
      background: #0b1220;
    }
    .empty h2 { margin: 0 0 8px; font-size: 24px; }
    .empty p { margin: 0; opacity: 0.8; }

    @media print { .no-print { display: none !important; } }

    .toolbar {
      position: fixed;
      top: 12px;
      right: 12px;
      z-index: 9999;
      display: flex;
      gap: 8px;
    }
    .toolbar button {
      border: 0;
      border-radius: 10px;
      padding: 10px 12px;
      font-weight: 800;
      cursor: pointer;
      background: rgba(255,255,255,0.9);
      color: #000;
    }
  </style>
</head>

<body>
  <div class="toolbar no-print">
    <button onclick="window.print()">Print / Save as PDF</button>
  </div>

  ${emptyHtml}
</body>
</html>`;

  return new NextResponse(html, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
}
