"use client";

import { useEffect, useRef } from "react";
import { supabase } from "@/lib/supabaseClient";
import * as THREE from "three";
import { CSS3DRenderer, CSS3DObject } from "three/examples/jsm/renderers/CSS3DRenderer.js";

/* ===========================================================
   HELPERS
=========================================================== */

function applyBrightness(bg: string, brightness: number) {
  return {
    background: bg,
    filter: `brightness(${brightness}%)`,
    transition: "background 0.8s ease, filter 0.5s ease",
  };
}

function normalizeEntries(list: any[] = []) {
  return list
    .filter((e) => `${e.status}`.toLowerCase().trim() === "approved")
    .map((e) => ({
      id: e.id,
      photo_url: e.photo_url?.trim() || null,
      first_name: e.first_name || e?.guest_profiles?.first_name || "",
      last_name: e.last_name || e?.guest_profiles?.last_name || "",
    }));
}

function shuffle<T>(arr: T[]) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function pickRandom<T>(arr: T[]) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function easeOutCubic(p: number) {
  return 1 - Math.pow(1 - p, 3);
}

/* ===========================================================
   MAIN
=========================================================== */

export default function ActivePrizeWheel3D({ wheel, entries }: any) {
  const mountRef = useRef<HTMLDivElement | null>(null);

  const wheelGroupRef = useRef<THREE.Group | null>(null);
  const wrapperRefs = useRef<HTMLElement[]>([]);
  const tileRefs = useRef<any[]>([]);

  const approvedPoolRef = useRef<any[]>([]);
  const tileDataRef = useRef<any[]>(Array(16).fill(null));

  const winnerRef = useRef({
    index: null as null | number,
    isFrozen: false,
    freezeStart: 0,
  });

  const bgRef = useRef<string>(
    wheel?.background_type === "image"
      ? `url(${wheel.background_value}) center/cover no-repeat`
      : wheel?.background_value || "linear-gradient(135deg,#1b2735,#090a0f)"
  );

  const brightnessRef = useRef<number>(wheel?.background_brightness || 100);

  const TILE_COUNT = 16;
  const TILE_SIZE = 820;
  const RADIUS = 2550;
  const TILE_STEP = (2 * Math.PI) / TILE_COUNT;

  // regular spin (auto)
  const spinRef = useRef({
    spinning: false,
    start: 0,
    duration: 9000,
    startRot: 0,
    endRot: 0,
  });

  // stopping from GO
  const stopRef = useRef({
    stopping: false,
    start: 0,
    duration: 2600,
    from: 0,
    to: 0,
  });

  // GO mode (infinite)
  const goRef = useRef({
    on: false,
    speed: 0.06, // radians/frame-ish (we'll scale by delta time)
    lastT: 0,
  });

  // idle drift
  const ambientRef = useRef({ speed: 0.0025 });

  const tileA = wheel?.tile_color_a || "#ffffff";
  const tileB = wheel?.tile_color_b || "#ffffff";
  const brightA = wheel?.tile_brightness_a ?? 100;
  const brightB = wheel?.tile_brightness_b ?? 100;

  const hostLogo =
    typeof wheel?.host?.branding_logo_url === "string"
      ? wheel.host.branding_logo_url.trim()
      : "";
  const logoUrl = hostLogo.length > 0 ? hostLogo : "/faninteractlogo.png";

  /* ===========================================================
     keep pool updated
=========================================================== */
  useEffect(() => {
    approvedPoolRef.current = normalizeEntries(entries);
  }, [entries]);

  /* ===========================================================
     DOM tile writer (fullscreen safe)
=========================================================== */
  function renderTile(i: number, entry: any | null) {
    const wrap = wrapperRefs.current[i];
    if (!wrap) return;

    const img = wrap.querySelector(".imgHolder") as HTMLElement | null;
    const name = wrap.querySelector(".nameHolder") as HTMLElement | null;
    if (!img || !name) return;

    if (!entry) {
      img.style.background = "rgba(0,0,0,0.25)";
      img.innerText = "IMG";
      name.innerText = "";
      return;
    }

    if (entry.photo_url) {
      img.style.background = `url(${entry.photo_url}) center/cover no-repeat`;
      img.innerText = "";
    } else {
      img.style.background = "rgba(0,0,0,0.25)";
      img.innerText = "IMG";
    }

    const ln = entry.last_name?.charAt(0)?.toUpperCase() || "";
    name.innerText = entry.first_name ? `${entry.first_name} ${ln}.` : "";
  }

  function setTileEntry(i: number, entry: any | null) {
    tileDataRef.current[i] = entry;
    renderTile(i, entry);
  }

  function initTileAssignments() {
    const pool = approvedPoolRef.current || [];
    if (!pool.length) {
      for (let i = 0; i < TILE_COUNT; i++) setTileEntry(i, null);
      return;
    }

    let list = shuffle(pool);
    while (list.length < TILE_COUNT) list.push(pickRandom(pool));
    list = list.slice(0, TILE_COUNT);

    for (let i = 0; i < TILE_COUNT; i++) setTileEntry(i, list[i]);
  }

  /* ===========================================================
     ✅ INJECT WHILE SPINNING (AUTO + GO)
     - still blocks during STOP and winner freeze
     - still only injects BACKSIDE tiles
=========================================================== */
  function injectBacksideRandoms() {
    const pool = approvedPoolRef.current || [];
    if (!pool.length) return;

    const wheelGroup = wheelGroupRef.current;
    if (!wheelGroup) return;

    // ✅ DO NOT change during stop curve or frozen winner (keeps winner stable)
    if (stopRef.current.stopping) return;
    if (winnerRef.current.isFrozen) return;

    // ✅ allow during AUTO spin + GO spin (this is what you asked for)
    // (no returns for spinRef.spinning / goRef.on)

    const frontSet = new Set<string>();
    const backIndices: number[] = [];

    for (let i = 0; i < TILE_COUNT; i++) {
      const effectiveAngle = i * TILE_STEP + wheelGroup.rotation.y;

      if (Math.cos(effectiveAngle) > 0) {
        const e = tileDataRef.current[i];
        if (e?.id) frontSet.add(e.id);
      } else {
        backIndices.push(i);
      }
    }

    for (const idx of backIndices) {
      const current = tileDataRef.current[idx];

      // prefer entries NOT on the visible front
      const candidates = pool.filter((p: any) => !frontSet.has(p.id));
      let chosen =
        (candidates.length ? pickRandom(candidates) : pickRandom(pool)) || null;

      // try to avoid "no visible change" by not reusing same entry for this tile
      if (current?.id && chosen?.id === current.id) {
        chosen =
          (candidates.length ? pickRandom(candidates) : pickRandom(pool)) || chosen;
      }

      setTileEntry(idx, chosen);
    }
  }

  /* ===========================================================
     ROTATION TARGET: make index be the front tile
=========================================================== */
  function rotationForWinnerIndex(winnerIndex: number) {
    const N = TILE_COUNT;
    const step = TILE_STEP;

    const kMod = ((N - (winnerIndex % N)) + N) % N; // 0..N-1
    return kMod * step;
  }

  function clearWinnerHighlight() {
    wrapperRefs.current.forEach((w) => {
      w.style.border = "none";
      w.style.animation = "none";
      w.style.boxShadow = "";
    });
  }

  function highlightIndex(idx: number) {
    clearWinnerHighlight();
    const wwrap = wrapperRefs.current[idx];
    if (!wwrap) return;

    wwrap.style.border = "12px solid gold";
    wwrap.style.boxShadow =
      "0 0 80px rgba(255,215,0,0.6), inset 0 0 20px rgba(255,215,0,0.4)";
    wwrap.style.animation = "winnerHalo 1.4s ease-in-out infinite";
  }

  /* ===========================================================
     BACKGROUND WATCHER
=========================================================== */
  useEffect(() => {
    if (!wheel?.id || !mountRef.current) return;

    const update = () => {
      const cont = mountRef.current?.parentElement?.parentElement;
      if (!cont) return;
      Object.assign(
        cont.style,
        applyBrightness(bgRef.current, brightnessRef.current)
      );
    };

    update();

    const int = setInterval(async () => {
      const { data } = await supabase
        .from("prize_wheels")
        .select("*")
        .eq("id", wheel.id)
        .single();

      if (!data) return;

      bgRef.current =
        data.background_type === "image"
          ? `url(${data.background_value}) center/cover no-repeat`
          : data.background_value;

      brightnessRef.current =
        typeof data.background_brightness === "number"
          ? data.background_brightness
          : brightnessRef.current;

      update();
    }, 4000);

    return () => clearInterval(int);
  }, [wheel?.id]);

  const toggleFullscreen = () =>
    !document.fullscreenElement
      ? document.documentElement.requestFullscreen().catch(() => {})
      : document.exitFullscreen();

  /* ===========================================================
     REALTIME EVENTS
=========================================================== */
  useEffect(() => {
    if (!wheel?.id) return;

    const ch = supabase
      .channel(`prizewheel-${wheel.id}`, {
        config: { broadcast: { self: true } },
      })
      .on("broadcast", { event: "spin_auto" }, (payload) => {
        const winnerIndex = payload?.payload?.winner_index;
        if (typeof winnerIndex !== "number") return;
        (window as any)._pw?._spinAuto?.start?.(winnerIndex);
      })
      .on("broadcast", { event: "spin_go" }, () => {
        (window as any)._pw?._spinGo?.start?.();
      })
      .on("broadcast", { event: "spin_stop" }, (payload) => {
        const winnerIndex = payload?.payload?.winner_index;
        if (typeof winnerIndex !== "number") return;
        (window as any)._pw?._spinGo?.stop?.(winnerIndex);
      })
      // backward compat: your old Spin Now event
      .on("broadcast", { event: "spin_trigger" }, () => {
        (window as any)._pw?._spinAuto?.random?.();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(ch);
    };
  }, [wheel?.id]);

  /* ===========================================================
     THREE INIT
=========================================================== */
  useEffect(() => {
    if (!mountRef.current) return;

    const container = mountRef.current;
    const width = container.clientWidth;
    const height = container.clientHeight;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(38, width / height, 1, 8000);
    camera.position.set(0, 0, 3800);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(window.devicePixelRatio);
    container.appendChild(renderer.domElement);

    const cssRenderer = new CSS3DRenderer();
    cssRenderer.setSize(width, height);
    cssRenderer.domElement.style.position = "absolute";
    cssRenderer.domElement.style.top = "0";
    cssRenderer.domElement.style.left = "0";
    container.appendChild(cssRenderer.domElement);

    function resize() {
      if (!mountRef.current) return;
      const w = mountRef.current.clientWidth;
      const h = mountRef.current.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
      cssRenderer.setSize(w, h);
    }

    window.addEventListener("resize", resize);
    document.addEventListener("fullscreenchange", resize);

    const wheelGroup = new THREE.Group();
    wheelGroupRef.current = wheelGroup;
    scene.add(wheelGroup);

    // Expose controller
    (window as any)._pw = {
      _spinAuto: {
        start: (winnerIndex: number) => {
          const wg = wheelGroupRef.current;
          if (!wg) return;

          // stop GO mode if running
          goRef.current.on = false;
          stopRef.current.stopping = false;

          const win = winnerRef.current;
          win.isFrozen = false;
          win.index = null;

          clearWinnerHighlight();

          const spin = spinRef.current;
          spin.spinning = true;
          spin.start = performance.now();
          spin.duration = 9000 + Math.random() * 3000;
          spin.startRot = wg.rotation.y;

          const base = rotationForWinnerIndex(winnerIndex);

          const fullSpins = 10 + Math.floor(Math.random() * 6);
          let target = base + fullSpins * Math.PI * 2;

          while (target <= spin.startRot) target += Math.PI * 2;

          spin.endRot = Math.round(target / TILE_STEP) * TILE_STEP;
        },

        random: () => {
          const randomIdx = Math.floor(Math.random() * TILE_COUNT);
          (window as any)._pw._spinAuto.start(randomIdx);
        },
      },

      _spinGo: {
        start: () => {
          const wg = wheelGroupRef.current;
          if (!wg) return;

          spinRef.current.spinning = false;
          stopRef.current.stopping = false;
          winnerRef.current.isFrozen = false;
          winnerRef.current.index = null;
          clearWinnerHighlight();

          goRef.current.on = true;
          goRef.current.lastT = performance.now();
        },

        stop: (winnerIndex: number) => {
          const wg = wheelGroupRef.current;
          if (!wg) return;

          goRef.current.on = false;

          const win = winnerRef.current;
          win.isFrozen = false;
          win.index = null;
          clearWinnerHighlight();

          const stop = stopRef.current;
          stop.stopping = true;
          stop.start = performance.now();
          stop.duration = 2600;
          stop.from = wg.rotation.y;

          const base = rotationForWinnerIndex(winnerIndex);

          let target = base + 6 * Math.PI * 2;
          while (target <= stop.from) target += Math.PI * 2;

          stop.to = Math.round(target / TILE_STEP) * TILE_STEP;
        },
      },
    };

    // ✅ backwards compat alias (your dashboard used _prizewheel)
    (window as any)._prizewheel = (window as any)._pw;

    // create tiles
    tileRefs.current = [];
    wrapperRefs.current = [];

    for (let i = 0; i < TILE_COUNT; i++) {
      const wrap = document.createElement("div");
      wrap.style.width = `${TILE_SIZE}px`;
      wrap.style.height = `${TILE_SIZE}px`;
      wrap.style.borderRadius = "32px";
      wrap.style.position = "relative";
      wrap.style.overflow = "hidden";
      wrap.style.display = "flex";
      wrap.style.alignItems = "center";
      wrap.style.justifyContent = "center";

      (wrap.style as any).backfaceVisibility = "hidden";
      (wrap.style as any).transformStyle = "preserve-3d";

      const isA = i % 2 === 0;
      wrap.style.background = isA ? tileA : tileB;
      wrap.style.filter = `brightness(${isA ? brightA : brightB}%)`;

      const img = document.createElement("div");
      img.className = "imgHolder";
      img.style.position = "absolute";
      img.style.width = "70%";
      img.style.height = "60%";
      img.style.top = "20%";
      img.style.left = "50%";
      img.style.transform = "translateX(-50%)";
      img.style.borderRadius = "22px";
      img.style.background = "rgba(0,0,0,0.25)";
      img.style.border = "4px solid rgba(255,255,255,0.5)";
      img.style.display = "flex";
      img.style.alignItems = "center";
      img.style.justifyContent = "center";
      img.style.color = "#fff";
      img.innerText = "IMG";
      wrap.appendChild(img);

      const name = document.createElement("div");
      name.className = "nameHolder";
      name.style.position = "absolute";
      name.style.top = "82%";
      name.style.left = "50%";
      name.style.transform = "translateX(-50%)";
      name.style.fontSize = "54px";
      name.style.fontWeight = "900";
      name.style.color = "#fff";
      name.style.textShadow =
        "2px 2px 2px #000,-2px 2px 2px #000,2px -2px 2px #000,-2px -2px 2px #000";
      wrap.appendChild(name);

      const tile = new CSS3DObject(wrap);
      const angle = i * TILE_STEP;
      tile.position.x = Math.sin(angle) * RADIUS;
      tile.position.z = Math.cos(angle) * RADIUS;
      tile.rotation.y = angle;

      tileRefs.current.push(tile);
      wrapperRefs.current.push(wrap);
      wheelGroup.add(tile);
    }

    initTileAssignments();

    // ✅ faster so you SEE people swapping during spin
    const injectTimer = window.setInterval(() => injectBacksideRandoms(), 700);

    function animate(t: number) {
      const wg = wheelGroupRef.current;
      if (!wg) {
        requestAnimationFrame(animate);
        return;
      }

      // unfreeze after 15s
      if (winnerRef.current.isFrozen && t - winnerRef.current.freezeStart > 15000) {
        winnerRef.current.isFrozen = false;
      }

      // GO spin (infinite)
      if (goRef.current.on) {
        const dt = Math.max(0, t - (goRef.current.lastT || t));
        goRef.current.lastT = t;
        wg.rotation.y += (goRef.current.speed * dt) / 16.67;
      }
      // AUTO spin
      else if (spinRef.current.spinning) {
        const spin = spinRef.current;
        const p = Math.min((t - spin.start) / spin.duration, 1);
        const eased = p * p * (3 - 2 * p);

        wg.rotation.y = spin.startRot + (spin.endRot - spin.startRot) * eased;

        if (p >= 1) {
          spin.spinning = false;

          const k = Math.round(wg.rotation.y / TILE_STEP);
          const idx = (((0 - k) % TILE_COUNT) + TILE_COUNT) % TILE_COUNT;

          winnerRef.current.index = idx;
          winnerRef.current.isFrozen = true;
          winnerRef.current.freezeStart = t;

          highlightIndex(idx);
        }
      }
      // STOP from GO
      else if (stopRef.current.stopping) {
        const stop = stopRef.current;
        const p = Math.min((t - stop.start) / stop.duration, 1);
        const eased = easeOutCubic(p);

        wg.rotation.y = stop.from + (stop.to - stop.from) * eased;

        if (p >= 1) {
          stop.stopping = false;

          const k = Math.round(wg.rotation.y / TILE_STEP);
          const idx = (((0 - k) % TILE_COUNT) + TILE_COUNT) % TILE_COUNT;

          winnerRef.current.index = idx;
          winnerRef.current.isFrozen = true;
          winnerRef.current.freezeStart = t;

          highlightIndex(idx);
        }
      }
      // idle drift
      else if (!winnerRef.current.isFrozen) {
        wg.rotation.y += ambientRef.current.speed;
      }

      // ✅ hard-hide backside tiles (keeps your “no backside cards” look)
      for (let i = 0; i < TILE_COUNT; i++) {
        const wrap = wrapperRefs.current[i];
        if (!wrap) continue;

        const effectiveAngle = i * TILE_STEP + wg.rotation.y;
        const isFront = Math.cos(effectiveAngle) > 0;

        // Hide backside entirely
        wrap.style.opacity = isFront ? "1" : "0";
      }

      renderer.render(scene, camera);
      cssRenderer.render(scene, camera);
      requestAnimationFrame(animate);
    }

    animate(0);

    return () => {
      window.clearInterval(injectTimer);
      window.removeEventListener("resize", resize);
      document.removeEventListener("fullscreenchange", resize);
      container.removeChild(renderer.domElement);
      container.removeChild(cssRenderer.domElement);
      renderer.dispose();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ===========================================================
     BULBS + RENDER
=========================================================== */
  const bulbColor = wheel?.tile_color_a || "#ffffff";

  function makeBulb(delay: number): React.CSSProperties {
    return {
      width: "40px",
      height: "40px",
      borderRadius: "50%",
      background: bulbColor,
      boxShadow: `0 0 40px ${bulbColor}`,
      margin: "12px",
      opacity: 0.7,
      animation: "twinkle 1.8s ease-in-out infinite",
      animationDelay: `${delay}s`,
      pointerEvents: "none",
    };
  }

  function BulbColumn({ side }: { side: "left" | "right" }) {
    return (
      <div
        style={{
          position: "absolute",
          top: "10vh",
          [side]: "calc(3vw - 40px)",
          height: "78vh",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          pointerEvents: "none",
          zIndex: 5,
        }}
      >
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} style={makeBulb(Math.random() * 1.5)} />
        ))}
      </div>
    );
  }

  function BulbBottom() {
    return (
      <div
        style={{
          position: "absolute",
          bottom: "calc(5vh - 10px)",
          left: "50%",
          transform: "translateX(-50%)",
          width: "70vw",
          display: "flex",
          justifyContent: "space-between",
          pointerEvents: "none",
          zIndex: 5,
        }}
      >
        {Array.from({ length: 12 }).map((_, i) => (
          <div key={i} style={makeBulb(Math.random() * 1.5)} />
        ))}
      </div>
    );
  }

  return (
    <div style={{ width: "100%", height: "100vh", position: "relative" }}>
      <style>
        {`
          @keyframes twinkle {
            0% { opacity: .45; transform: scale(.92);}
            50% { opacity: 1; transform: scale(1.06);}
            100% { opacity: .45; transform: scale(.92);}
          }

          @keyframes winnerHalo {
            0% {
              box-shadow: 0 0 60px rgba(255,215,0,.4),
                          inset 0 0 10px rgba(255,215,0,.6);
            }
            50% {
              box-shadow: 0 0 150px rgba(255,215,0,1),
                          inset 0 0 20px rgba(255,215,0,.8);
            }
            100% {
              box-shadow: 0 0 60px rgba(255,215,0,.4),
                          inset 0 0 10px rgba(255,215,0,.6);
            }
          }
        `}
      </style>

      <BulbColumn side="left" />
      <BulbColumn side="right" />
      <BulbBottom />

      <h1
        style={{
          position: "absolute",
          top: "-2vh",
          left: "50%",
          transform: "translateX(-50%)",
          color: "#fff",
          fontSize: "clamp(3rem,4vw,6rem)",
          fontWeight: 900,
          whiteSpace: "nowrap",
          textShadow:
            "2px 2px 2px #000,-2px 2px 2px #000,2px -2px 2px #000,-2px -2px 2px #000",
          zIndex: 20,
          pointerEvents: "none",
        }}
      >
        {wheel?.title || "Prize Wheel"}
      </h1>

      <div
        style={{
          position: "absolute",
          top: "10vh",
          left: "50%",
          transform: "translateX(-50%)",
          width: "90vw",
          height: "78vh",
          padding: 6,
          borderRadius: 24,
          backdropFilter: "blur(20px)",
          background: "rgba(255,255,255,.08)",
          border: "1px solid rgba(255,255,255,.15)",
          boxShadow: "0 0 40px rgba(0,0,0,.5)",
          overflow: "hidden",
        }}
      >
        <div ref={mountRef} style={{ width: "100%", height: "100%" }} />
      </div>

      <div
        style={{
          position: "absolute",
          bottom: "4.5vh",
          left: "2.25vw",
          width: "clamp(140px,14vw,220px)",
          height: "clamp(80px,8vw,140px)",
          borderRadius: 12,
          overflow: "hidden",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          zIndex: 9999,
        }}
      >
        <img
          src={logoUrl}
          style={{
            width: "100%",
            height: "100%",
            objectFit: "contain",
            filter: "drop-shadow(0 0 12px rgba(0,0,0,.7))",
          }}
        />
      </div>

      <button
        onClick={toggleFullscreen}
        style={{
          position: "absolute",
          bottom: "3vh",
          right: "2vw",
          width: 48,
          height: 48,
          borderRadius: 10,
          background: "rgba(255,255,255,.1)",
          backdropFilter: "blur(6px)",
          border: "1px solid rgba(255,255,255,.25)",
          color: "#fff",
          opacity: 0.3,
          cursor: "pointer",
          transition: ".25s",
          fontSize: "1.4rem",
          zIndex: 20,
        }}
      >
        ⛶
      </button>
    </div>
  );
}
