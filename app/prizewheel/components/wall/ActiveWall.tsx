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

function easeOutQuart(p: number) {
  return 1 - Math.pow(1 - p, 4);
}

/**
 * Compute a target rotation that lands `winnerIndex` on the front tile.
 * Uses current rotation, adds extra full spins, and snaps to the correct tile step.
 */
function computeTargetRotation(currentRot: number, winnerIndex: number, tileStep: number, extraSpins: number) {
  const twoPi = Math.PI * 2;

  // When rotation is exactly k*tileStep, the "front index" is: (-k mod N)
  // To make winnerIndex be front: k == -winnerIndex mod N
  const N = Math.round(twoPi / tileStep);
  const k = (N - (winnerIndex % N)) % N;
  const targetMod = k * tileStep;

  const currentMod = ((currentRot % twoPi) + twoPi) % twoPi;
  const deltaMod = (targetMod - currentMod + twoPi) % twoPi;

  return currentRot + deltaMod + extraSpins * twoPi;
}

/* ===========================================================
   MAIN
=========================================================== */

export default function ActivePrizeWheel3D({ wheel, entries }: any) {
  const mountRef = useRef<HTMLDivElement | null>(null);

  const wheelGroupRef = useRef<THREE.Group | null>(null);
  const wrapperRefs = useRef<HTMLElement[]>([]);
  const tileRefs = useRef<any[]>([]);

  // ✅ pool of approved entries (updates when props.entries changes)
  const approvedPoolRef = useRef<any[]>([]);

  // ✅ current entry assignment per tile index (kept stable without React state)
  const tileDataRef = useRef<any[]>(Array(16).fill(null));

  const winnerRef = useRef({
    index: null as null | number,
    isFrozen: false,
    freezeStart: 0,
  });

  const pendingWinnerRef = useRef<{
    index: number | null;
    entry: any | null;
    spinSessionId: string | null;
  }>({ index: null, entry: null, spinSessionId: null });

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

  // GO mode (infinite spin)
  const goRef = useRef({
    active: false,
    speed: 0.0,
    targetSpeed: 0.035, // tune
    accel: 0.0009,      // tune
  });

  // Stop animation (used by STOP and AUTO)
  const stopAnimRef = useRef({
    active: false,
    start: 0,
    duration: 4200,
    from: 0,
    to: 0,
    winnerIndex: null as null | number,
  });

  // Legacy auto spin (random) fallback
  const legacySpinRef = useRef({
    spinning: false,
    start: 0,
    duration: 9000,
    startRot: 0,
    endRot: 0,
  });

  // Backside inject controls
  const driftRef = useRef({
    drifting: false,
    start: 0,
    duration: 850,
    from: 0,
    to: 0,
  });

  const ambientRef = useRef({ speed: 0.0025 });

  const tileA = wheel?.tile_color_a || "#ffffff";
  const tileB = wheel?.tile_color_b || "#ffffff";
  const brightA = wheel?.tile_brightness_a ?? 100;
  const brightB = wheel?.tile_brightness_b ?? 100;

  const logoUrl =
    wheel?.host?.branding_logo_url?.trim() !== ""
      ? wheel.host.branding_logo_url
      : "/faninteractlogo.png";

  /* ===========================================================
     ✅ keep pool updated from props
=========================================================== */
  useEffect(() => {
    approvedPoolRef.current = normalizeEntries(entries);
  }, [entries]);

  /* ===========================================================
     ✅ DOM tile writer (no React state = fullscreen safe)
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

  function clearWinnerHighlight() {
    wrapperRefs.current.forEach((w) => {
      w.style.border = "none";
      w.style.animation = "none";
      w.style.boxShadow = "";
    });
  }

  function highlightWinner(idx: number) {
    clearWinnerHighlight();
    const wwrap = wrapperRefs.current[idx];
    if (!wwrap) return;

    wwrap.style.border = "12px solid gold";
    wwrap.style.boxShadow =
      "0 0 80px rgba(255,215,0,0.6), inset 0 0 20px rgba(255,215,0,0.4)";
    wwrap.style.animation = "winnerHalo 1.4s ease-in-out infinite";
  }

  /* ===========================================================
     ✅ INITIAL FILL (random approved entries, repeat to 16)
=========================================================== */
  function initTileAssignments() {
    const pool = approvedPoolRef.current || [];
    if (!pool.length) {
      for (let i = 0; i < TILE_COUNT; i++) setTileEntry(i, null);
      return;
    }

    let list = shuffle(pool);

    while (list.length < TILE_COUNT) {
      list.push(pickRandom(pool));
    }

    list = list.slice(0, TILE_COUNT);

    for (let i = 0; i < TILE_COUNT; i++) {
      setTileEntry(i, list[i]);
    }
  }

  /* ===========================================================
     ✅ BACKSIDE AUTO-INJECT (IDLE ONLY)
=========================================================== */
  function injectBacksideRandoms() {
    const pool = approvedPoolRef.current || [];
    if (!pool.length) return;

    const wheelGroup = wheelGroupRef.current;
    if (!wheelGroup) return;

    // never swap while GO or stopping or legacy spin/drift/frozen
    if (goRef.current.active) return;
    if (stopAnimRef.current.active) return;
    if (legacySpinRef.current.spinning) return;
    if (driftRef.current.drifting) return;
    if (winnerRef.current.isFrozen) return;

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

    if (!backIndices.length) return;

    for (const idx of backIndices) {
      const candidates = pool.filter((p: any) => !frontSet.has(p.id));
      const chosen = (candidates.length ? pickRandom(candidates) : pickRandom(pool)) || null;
      setTileEntry(idx, chosen);
    }
  }

  /* ===========================================================
     BACKGROUND WATCHER
=========================================================== */
  useEffect(() => {
    if (!wheel?.id || !mountRef.current) return;

    const update = () => {
      const cont = mountRef.current?.parentElement?.parentElement;
      if (!cont) return;
      Object.assign(cont.style, applyBrightness(bgRef.current, brightnessRef.current));
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
     ✅ AUTHORITATIVE CHANNEL EVENTS
     - spin_go_start: start infinite spin (no winner)
     - spin_stop: stop with persisted winner_index + winner entry
     - spin_auto_start: auto spin and land on winner_index
=========================================================== */
  useEffect(() => {
    if (!wheel?.id) return;

    const ch = supabase
      .channel(`prizewheel-${wheel.id}`)
      .on("broadcast", { event: "spin_go_start" }, ({ payload }: any) => {
        // reset winner visuals
        winnerRef.current.isFrozen = false;
        winnerRef.current.index = null;
        pendingWinnerRef.current = {
          index: null,
          entry: null,
          spinSessionId: payload?.spinSessionId ?? null,
        };

        clearWinnerHighlight();

        // start GO
        goRef.current.active = true;
        goRef.current.speed = Math.max(goRef.current.speed, 0.01);
      })
      .on("broadcast", { event: "spin_stop" }, ({ payload }: any) => {
        const idx = typeof payload?.winner_index === "number" ? payload.winner_index : null;
        const entry = payload?.winner ?? null;

        if (idx == null) return;

        // cache pending winner
        pendingWinnerRef.current = {
          index: idx,
          entry,
          spinSessionId: payload?.spinSessionId ?? null,
        };

        // Force winner tile data so when it arrives front, it's correct
        if (entry) setTileEntry(idx, entry);

        // stop GO
        goRef.current.active = false;

        // start STOP animation (ease out)
        const wg = wheelGroupRef.current;
        if (!wg) return;

        stopAnimRef.current.active = true;
        stopAnimRef.current.start = performance.now();
        stopAnimRef.current.duration = 5200; // STOP curve
        stopAnimRef.current.from = wg.rotation.y;
        stopAnimRef.current.to = computeTargetRotation(wg.rotation.y, idx, TILE_STEP, 2);
        stopAnimRef.current.winnerIndex = idx;

        // clear winner visuals now (we re-apply at end)
        winnerRef.current.isFrozen = false;
        winnerRef.current.index = null;
        clearWinnerHighlight();
      })
      .on("broadcast", { event: "spin_auto_start" }, ({ payload }: any) => {
        const idx = typeof payload?.winner_index === "number" ? payload.winner_index : null;
        const entry = payload?.winner ?? null;

        if (idx == null) return;

        pendingWinnerRef.current = {
          index: idx,
          entry,
          spinSessionId: payload?.spinSessionId ?? null,
        };

        if (entry) setTileEntry(idx, entry);

        // ensure GO is off
        goRef.current.active = false;

        // start AUTO stop animation (longer spin)
        const wg = wheelGroupRef.current;
        if (!wg) return;

        stopAnimRef.current.active = true;
        stopAnimRef.current.start = performance.now();
        stopAnimRef.current.duration = Math.max(6000, (wheel?.spin_duration ?? 10) * 1000);
        stopAnimRef.current.from = wg.rotation.y;
        stopAnimRef.current.to = computeTargetRotation(wg.rotation.y, idx, TILE_STEP, 6);
        stopAnimRef.current.winnerIndex = idx;

        winnerRef.current.isFrozen = false;
        winnerRef.current.index = null;
        clearWinnerHighlight();
      })
      // Legacy support (if anything still sends "spin_trigger")
      .on("broadcast", { event: "spin_trigger" }, () => {
        const wg = wheelGroupRef.current;
        if (!wg) return;

        // stop GO
        goRef.current.active = false;

        // random legacy spin (no authoritative winner)
        legacySpinRef.current.spinning = true;
        legacySpinRef.current.start = performance.now();
        legacySpinRef.current.duration = 8000 + Math.random() * 7000;
        legacySpinRef.current.startRot = wg.rotation.y;

        const fullSpins = 6 + Math.random() * 4;
        const raw = legacySpinRef.current.startRot + fullSpins * Math.PI * 2;
        legacySpinRef.current.endRot = Math.round(raw / TILE_STEP) * TILE_STEP;

        winnerRef.current.isFrozen = false;
        winnerRef.current.index = null;
        clearWinnerHighlight();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(ch);
    };
  }, [wheel?.id, wheel?.spin_duration]);

  /* ===========================================================
     RELOAD CHANNEL (⚠️ reload exits fullscreen)
=========================================================== */
  useEffect(() => {
    if (!wheel?.id) return;

    const ch = supabase
      .channel(`prizewheel-${wheel.id}`)
      .on("broadcast", { event: "reload_trigger" }, () => {
        window.location.reload();
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

    // CREATE TILES
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

    // initial tile fill (random approved)
    initTileAssignments();

    // backside inject timer (idle only)
    const injectTimer = window.setInterval(() => {
      injectBacksideRandoms();
    }, 2500);

    function animate(t: number) {
      const win = winnerRef.current;

      // Unfreeze after a while (visual only)
      if (win.isFrozen && t - win.freezeStart > 15000) {
        win.isFrozen = false;
      }

      // 1) STOP animation takes priority
      if (stopAnimRef.current.active) {
        const p = Math.min((t - stopAnimRef.current.start) / stopAnimRef.current.duration, 1);
        const eased = easeOutQuart(p);

        wheelGroup.rotation.y =
          stopAnimRef.current.from + (stopAnimRef.current.to - stopAnimRef.current.from) * eased;

        if (p >= 1) {
          stopAnimRef.current.active = false;

          const idx = stopAnimRef.current.winnerIndex;
          if (typeof idx === "number") {
            win.index = idx;
            win.isFrozen = true;
            win.freezeStart = t;
            highlightWinner(idx);
          }
        }
      }
      // 2) GO infinite spin
      else if (goRef.current.active) {
        // accelerate to target speed
        if (goRef.current.speed < goRef.current.targetSpeed) {
          goRef.current.speed = Math.min(
            goRef.current.targetSpeed,
            goRef.current.speed + goRef.current.accel
          );
        }
        wheelGroup.rotation.y += goRef.current.speed;
      }
      // 3) Legacy random spin (fallback only)
      else if (legacySpinRef.current.spinning) {
        const spin = legacySpinRef.current;
        const p = Math.min((t - spin.start) / spin.duration, 1);
        const eased = p * p * (3 - 2 * p);

        wheelGroup.rotation.y = spin.startRot + (spin.endRot - spin.startRot) * eased;

        if (p >= 1) {
          spin.spinning = false;

          // drift snap (legacy)
          driftRef.current.drifting = true;
          driftRef.current.start = performance.now();
          driftRef.current.from = wheelGroup.rotation.y;
          driftRef.current.to = Math.round(driftRef.current.from / TILE_STEP) * TILE_STEP;

          const idx =
            (((0 - Math.round(driftRef.current.to / TILE_STEP)) % TILE_COUNT) + TILE_COUNT) %
            TILE_COUNT;

          win.index = idx;
          win.isFrozen = true;
          win.freezeStart = t;
          highlightWinner(idx);
        }
      }
      // 4) Drift snap (legacy)
      else if (driftRef.current.drifting) {
        const drift = driftRef.current;
        const p = Math.min((t - drift.start) / drift.duration, 1);
        const easeOut = 1 - Math.pow(1 - p, 3);

        wheelGroup.rotation.y = drift.from + (drift.to - drift.from) * easeOut;
        if (p >= 1) drift.drifting = false;
      }
      // 5) Ambient idle
      else if (!win.isFrozen) {
        wheelGroup.rotation.y += ambientRef.current.speed;
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
     BULBS
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

  /* ===========================================================
     RENDER
=========================================================== */

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
        {wheel.title || "Prize Wheel"}
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
