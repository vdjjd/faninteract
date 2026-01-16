import { getSupabaseAdmin } from "@/lib/supabaseAdminClient";

export const runtime = "nodejs";

function escapeHtml(input: any) {
  const s = String(input ?? "");
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function safeUrl(input: any) {
  const s = String(input ?? "").trim();
  // Basic safety: allow empty, relative paths, http(s)
  if (!s) return "";
  if (s.startsWith("http://") || s.startsWith("https://") || s.startsWith("/")) return s;
  return s; // (If you store data: urls etc, adjust here)
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const wallId = (url.searchParams.get("wallId") || "").trim();

  if (!wallId) {
    return new Response("Missing wallId", { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return new Response("Supabase admin client unavailable (missing env vars).", { status: 500 });
  }

  // 1) Load wall + host logo (branding_logo_url)
  const { data: wallRow, error: wallErr } = await supabase
    .from("fan_walls")
    .select("id,title,host_title,background_type,background_value,background_brightness,host:host_id (id, branding_logo_url)")
    .eq("id", wallId)
    .maybeSingle();

  if (wallErr) {
    return new Response(`Error loading wall: ${wallErr.message}`, { status: 500 });
  }
  if (!wallRow) {
    return new Response("Wall not found", { status: 404 });
  }

  // 2) Load approved posts
  const { data: posts, error: postsErr } = await supabase
    .from("guest_posts")
    .select("id,nickname,message,photo_url,created_at")
    .eq("fan_wall_id", wallId)
    .eq("status", "approved")
    .order("created_at", { ascending: true });

  if (postsErr) {
    return new Response(`Error loading posts: ${postsErr.message}`, { status: 500 });
  }

  const title = wallRow.title || "Fan Zone Wall";

  // Logo: host.branding_logo_url else fallback
  const host = Array.isArray((wallRow as any).host) ? (wallRow as any).host[0] : (wallRow as any).host;
  const logoUrl =
    (host?.branding_logo_url && String(host.branding_logo_url).trim()) ? String(host.branding_logo_url).trim()
    : "/faninteractlogo.png";

  const bgType = wallRow.background_type || "gradient";
  const bgVal = wallRow.background_value || "linear-gradient(135deg,#1b2735,#090a0f)";
  const brightness = Number.isFinite(Number(wallRow.background_brightness))
    ? Number(wallRow.background_brightness)
    : 100;

  // Background CSS
  const backgroundCss =
    bgType === "image"
      ? `url(${safeUrl(bgVal)}) center/cover no-repeat`
      : String(bgVal);

  const rows = (posts || []) as any[];

  const pagesHtml =
    rows.length === 0
      ? `
        <div class="page">
          <div class="viewport" style="background:${escapeHtml(backgroundCss)}; filter:brightness(${brightness}%);">
            <div class="title">${escapeHtml(title)}</div>
            <div class="card">
              <div class="emptyNote">
                No approved posts yet.
              </div>
            </div>
          </div>
        </div>
      `
      : rows
          .map((p) => {
            const nick = p?.nickname || "Guest";
            const msg = p?.message || "";
            const photo = p?.photo_url || "/fallback.png";

            return `
              <div class="page">
                <div class="viewport" style="background:${escapeHtml(backgroundCss)}; filter:brightness(${brightness}%);">
                  <div class="title">${escapeHtml(title)}</div>

                  <div class="card">
                    <div class="photoWrap">
                      <img class="photo" src="${escapeHtml(safeUrl(photo))}" alt="Guest photo" />
                    </div>

                    <div class="rightPanel">
                      <div class="logoWrap">
                        <img class="logo" src="${escapeHtml(safeUrl(logoUrl))}" alt="Logo" />
                      </div>

                      <div class="greyBar"></div>

                      <div class="nickname">${escapeHtml(nick)}</div>

                      <div class="messageBox" data-autosize="1">
                        <div class="messageText">${escapeHtml(msg)}</div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            `;
          })
          .join("\n");

  const html = `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>${escapeHtml(title)} Guestbook</title>
  <style>
    /* Print settings */
    @page { size: landscape; margin: 0; }
    html, body { height: 100%; margin: 0; padding: 0; background: #000; }

    /* Each post = one printed page */
    .page { break-after: page; page-break-after: always; }

    /* This viewport is your “wall slide” */
    .viewport {
      width: 100vw;
      height: 100vh;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      overflow: hidden;
      position: relative;
    }

    .title {
      color: #fff;
      margin-top: -9vh;
      margin-bottom: -1vh;
      font-weight: 900;
      font-size: clamp(2.5rem,4vw,5rem);
      text-shadow:
        2px 2px 2px #000,
        -2px 2px 2px #000,
        2px -2px 2px #000,
        -2px -2px 2px #000;
      filter:
        drop-shadow(0 0 25px rgba(255,255,255,0.6))
        drop-shadow(0 0 40px rgba(255,255,255,0.3));
      text-align: center;
    }

    .card {
      width: min(92vw, 1800px);
      height: min(83vh, 950px);
      background: rgba(255,255,255,0.08);
      backdrop-filter: blur(20px);
      border-radius: 24px;
      border: 1px solid rgba(255,255,255,0.15);
      position: relative;
      overflow: hidden;
      display: flex;
    }

    .photoWrap {
      position: absolute;
      top: 4%;
      left: 2%;
      width: 46%;
      height: 92%;
      border-radius: 18px;
      overflow: hidden;
    }

    .photo {
      width: 100%;
      height: 100%;
      object-fit: cover;
      border-radius: 18px;
      display: block;
    }

    .rightPanel {
      flex-grow: 1;
      margin-left: 46%;
      padding-top: 4vh;
      display: flex;
      flex-direction: column;
      align-items: center;
      position: relative;
    }

    .logoWrap {
      width: clamp(400px, 28vw, 380px);
      height: clamp(180px, 18vw, 260px);
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .logo {
      width: 100%;
      height: 100%;
      object-fit: contain;
      filter: drop-shadow(0 0 14px rgba(0,0,0,0.85));
      display: block;
    }

    .greyBar {
      width: 90%;
      height: 14px;
      margin-top: 2vh;
      margin-bottom: 2vh;
      margin-left: 3.5%;
      background: linear-gradient(to right, #000, #4444);
      border-radius: 6px;
    }

    .nickname {
      font-size: clamp(3rem,4vw,5rem);
      font-weight: 900;
      color: #fff;
      text-transform: uppercase;
      margin: 0;
      text-shadow:
        2px 2px 2px #000,
        -2px 2px 2px #000,
        2px -2px 2px #000,
        -2px -2px 2px #000;
      text-align: center;
      padding: 0 2vw;
    }

    .messageBox {
      width: 90%;
      height: clamp(120px, 30vh, 220px);
      margin-top: 2vh;
      display: flex;
      align-items: center;
      justify-content: center;
      box-sizing: border-box;
      overflow: hidden;
      padding: 0 2vw;
    }

    .messageText {
      color: #fff;
      text-align: center;
      max-width: 100%;
      margin: 0;
      font-weight: 600;
      text-shadow:
        2px 2px 2px #000,
        -2px 2px 2px #000,
        2px -2px 2px #000,
        -2px -2px 2px #000;
      word-wrap: break-word;
      overflow: hidden;
      font-size: 56px; /* JS autosize will reduce as needed */
      line-height: 1.12;
    }

    .emptyNote {
      width: 100%;
      height: 100%;
      display:flex;
      align-items:center;
      justify-content:center;
      color:#fff;
      font-weight:800;
      font-size: clamp(1.5rem,2vw,2.4rem);
      text-shadow: 2px 2px 2px #000;
      text-align:center;
      padding: 0 4vw;
    }

    /* Keep it clean in print */
    @media print {
      body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    }
  </style>
</head>
<body>
  ${pagesHtml}

  <script>
    // Auto-scale each message to fit its messageBox (same idea as your React version)
    (function autosizeAll() {
      const boxes = document.querySelectorAll('.messageBox[data-autosize="1"]');
      boxes.forEach(box => {
        const textEl = box.querySelector('.messageText');
        if (!textEl) return;

        let fontSize = 56;
        const minFont = 10;
        textEl.style.fontSize = fontSize + 'px';

        let iterations = 0;
        while (textEl.scrollHeight > box.clientHeight && fontSize > minFont && iterations < 60) {
          fontSize -= 2;
          textEl.style.fontSize = fontSize + 'px';
          iterations++;
        }
      });
    })();
  </script>
</body>
</html>`;

  return new Response(html, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
