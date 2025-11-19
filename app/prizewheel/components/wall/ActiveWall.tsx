'use client';

import { useEffect, useRef } from "react";
import { supabase } from "@/lib/supabaseClient";
import * as THREE from "three";
import { CSS3DRenderer, CSS3DObject } from "three/examples/jsm/renderers/CSS3DRenderer";

/* ===========================================================
   🔧 HELPER FUNCTIONS
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
    .filter((e) => e.status === "approved")
    .map((e) => ({
      photo_url: e.photo_url?.trim() || null,
      first_name: e.first_name || e?.guest_profiles?.first_name || null,
      last_name: e.last_name || e?.guest_profiles?.last_name || null,
    }));
}

function shuffleArray(arr: any[]) {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function clearWinnerStyles(wrapper: HTMLElement) {
  wrapper.style.border = "none";
  wrapper.style.animation = "none";
  wrapper.style.boxShadow = "";
}

function setWinnerStyles(wrapper: HTMLElement) {
  wrapper.style.border = "12px solid gold";
  wrapper.style.boxShadow =
    "0 0 80px rgba(255,215,0,0.6), inset 0 0 20px rgba(255,215,0,0.4)";
  wrapper.style.animation = "winnerHalo 1.4s ease-in-out infinite";
}

/* ===========================================================
   MAIN COMPONENT
   =========================================================== */

export default function ActivePrizeWheel3D({ wheel, entries }) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const currentWheelGroup = useRef<any>(null);
  const tileRefs = useRef<any[]>([]);
  const wrapperRefs = useRef<HTMLElement[]>([]);

  const selectedEntriesRef = useRef<any[] | null>(null);

  const winnerRef = useRef({
    winnerIndex: null as null | number,
    freezeStart: 0,
    isFrozen: false,
  });

  const bgRef = useRef<string>(
    wheel?.background_type === "image"
      ? `url(${wheel.background_value}) center/cover no-repeat`
      : wheel?.background_value ||
        "linear-gradient(135deg, #1b2735, #090a0f)"
  );

  const brightnessRef = useRef<number>(wheel?.background_brightness || 100);

  const tileA = wheel?.tile_color_a || "#ffffff";
  const tileB = wheel?.tile_color_b || "#ffffff";
  const brightA = wheel?.tile_brightness_a ?? 100;
  const brightB = wheel?.tile_brightness_b ?? 100;

  /* ---------------------------------------------- */
  /* HOST LOGO LOGIC — MATCHES FAN WALL EXACTLY     */
  /* ---------------------------------------------- */
  const logoUrl =
    wheel?.host?.branding_logo_url &&
    wheel.host.branding_logo_url.trim() !== ""
      ? wheel.host.branding_logo_url
      : "/faninteractlogo.png";

  /* ASSIGN ENTRIES */
  function assignEntriesToTiles(normalized: any[]) {
    if (!normalized?.length) return;

    if (!selectedEntriesRef.current) {
      const shuffled = shuffleArray(normalized);
      selectedEntriesRef.current = shuffled.slice(0, 16);
    }

    const selected = selectedEntriesRef.current;

    wrapperRefs.current.forEach((wrap, i) => {
      const entry = selected[i % selected.length];
      const imgHolder = wrap.querySelector(".imgHolder") as HTMLElement | null;
      const nameHolder = wrap.querySelector(".nameHolder") as HTMLElement | null;

      if (!imgHolder || !nameHolder) return;

      if (entry.photo_url) {
        imgHolder.style.background = `url(${entry.photo_url}) center/cover no-repeat`;
        imgHolder.innerText = "";
      } else {
        imgHolder.style.background = "rgba(0,0,0,0.25)";
        imgHolder.innerText = "IMG";
      }

      imgHolder.style.border = "4px solid rgba(255,255,255,0.5)";

      if (entry.first_name) {
        const ln = entry.last_name?.charAt(0)?.toUpperCase() || "";
        nameHolder.innerText = `${entry.first_name} ${ln}.`;
      } else {
        nameHolder.innerText = "";
      }
    });
  }

  /* BACKGROUND WATCHER */
  useEffect(() => {
    if (!wheel?.id || !mountRef.current) return;

    const apply = () => {
      const container = mountRef.current?.parentElement?.parentElement;
      if (!container) return;
      Object.assign(container.style, applyBrightness(bgRef.current, brightnessRef.current));
    };

    apply();

    const interval = setInterval(async () => {
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

      if (typeof data.background_brightness === "number")
        brightnessRef.current = data.background_brightness;

      apply();
    }, 4000);

    return () => clearInterval(interval);
  }, [wheel?.id]);

  /* FULLSCREEN */
  const toggleFullscreen = () =>
    !document.fullscreenElement
      ? document.documentElement.requestFullscreen().catch(() => {})
      : document.exitFullscreen();

  /* CONSTANTS */
  const TILE_SIZE = 820;
  const TILE_COUNT = 16;
  const RADIUS = 2550;
  const TILE_STEP = (2 * Math.PI) / TILE_COUNT;

  /* SPIN STATE */
  const spinRef = useRef({
    spinning: false,
    startTime: 0,
    duration: 8000,
    startRot: 0,
    endRot: 0,
  });

  const driftRef = useRef({
    drifting: false,
    start: 0,
    duration: 850,
    from: 0,
    to: 0,
  });

  const ambientRef = useRef({ speed: 0.0025 });

  function freezeOnWinner(tileIndex: number) {
    const w = winnerRef.current;
    w.winnerIndex = tileIndex;
    w.freezeStart = performance.now();
    w.isFrozen = true;

    wrapperRefs.current.forEach(clearWinnerStyles);

    const winnerTile = wrapperRefs.current[tileIndex];
    if (winnerTile) setWinnerStyles(winnerTile);
  }

  /* SPIN CHANNEL LISTENER */
  useEffect(() => {
    if (!wheel?.id) return;

    const channel = supabase
      .channel(`prizewheel-${wheel.id}`)
      .on("broadcast", { event: "spin_trigger" }, () => {
        (window as any)._prizewheel?._spin?.start();
      })
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, [wheel?.id]);

  /* ===========================================================
     THREE.JS INIT
     =========================================================== */
  useEffect(() => {
    if (!mountRef.current) return;

    const container = mountRef.current;
    let width = container.clientWidth;
    let height = container.clientHeight;

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

    function handleResize() {
      if (!mountRef.current) return;

      const w = mountRef.current.clientWidth;
      const h = mountRef.current.clientHeight;

      camera.aspect = w / h;
      camera.updateProjectionMatrix();

      renderer.setSize(w, h);
      cssRenderer.setSize(w, h);
    }

    window.addEventListener("resize", handleResize);
    document.addEventListener("fullscreenchange", handleResize);

    /* Wheel group */
    const wheelGroup = new THREE.Group();
    currentWheelGroup.current = wheelGroup;
    wheelGroup.rotation.y = 0;
    scene.add(wheelGroup);

    /* SPIN CONTROLLER */
    (window as any)._prizewheel = {
      _spin: {
        start: () => {
          const spin = spinRef.current;
          const drift = driftRef.current;

          spin.spinning = false;
          drift.drifting = false;

          const w = winnerRef.current;
          w.isFrozen = false;
          w.winnerIndex = null;

          wrapperRefs.current.forEach(clearWinnerStyles);

          spin.spinning = true;
          spin.startTime = performance.now();
          spin.duration = 8000 + Math.random() * 7000;
          spin.startRot = wheelGroup.rotation.y;

          const fullSpins = 6 + Math.random() * 4;
          let rawEnd = spin.startRot + Math.PI * 2 * fullSpins;

          rawEnd = Math.round(rawEnd / TILE_STEP) * TILE_STEP;

          spin.endRot = rawEnd;
        },
      },
    };

    /* Build Tiles */
    tileRefs.current = [];
    wrapperRefs.current = [];

    for (let i = 0; i < TILE_COUNT; i++) {
      const wrapper = document.createElement("div");

      wrapper.style.width = `${TILE_SIZE}px`;
      wrapper.style.height = `${TILE_SIZE}px`;
      wrapper.style.borderRadius = "32px";
      wrapper.style.display = "flex";
      wrapper.style.flexDirection = "column";
      wrapper.style.alignItems = "center";
      wrapper.style.justifyContent = "center";
      wrapper.style.position = "relative";
      wrapper.style.overflow = "hidden";

      const isA = i % 2 === 0;

      wrapper.style.background = isA ? tileA : tileB;
      wrapper.style.filter = `brightness(${isA ? brightA : brightB}%)`;

      /* IMG HOLDER */
      const imgHolder = document.createElement("div");
      imgHolder.className = "imgHolder";
      imgHolder.style.position = "absolute";
      imgHolder.style.width = "70%";
      imgHolder.style.height = "60%";
      imgHolder.style.top = "20%";
      imgHolder.style.left = "50%";
      imgHolder.style.transform = "translateX(-50%)";
      imgHolder.style.borderRadius = "22px";
      imgHolder.style.background = "rgba(0,0,0,0.25)";
      imgHolder.style.border = "4px solid rgba(255,255,255,0.5)";
      imgHolder.style.display = "flex";
      imgHolder.style.alignItems = "center";
      imgHolder.style.justifyContent = "center";
      imgHolder.style.color = "#fff";
      imgHolder.style.textShadow = "0 0 14px rgba(0,0,0,0.9)";
      imgHolder.style.fontSize = "48px";
      imgHolder.innerText = "IMG";

      wrapper.appendChild(imgHolder);

      /* NAME HOLDER */
      const nameHolder = document.createElement("div");
      nameHolder.className = "nameHolder";
      nameHolder.style.position = "absolute";
      nameHolder.style.top = "82%";
      nameHolder.style.left = "50%";
      nameHolder.style.transform = "translateX(-50%)";
      nameHolder.style.fontSize = "54px";
      nameHolder.style.fontWeight = "900";
      nameHolder.style.color = "#fff";
      nameHolder.style.textShadow = "0 0 18px rgba(0,0,0,0.8)";
      nameHolder.innerText = "Name L.";

      wrapper.appendChild(nameHolder);

      const tile = new CSS3DObject(wrapper);

      const angle = i * TILE_STEP;

      tile.position.x = Math.sin(angle) * RADIUS;
      tile.position.z = Math.cos(angle) * RADIUS;
      tile.rotation.y = angle;

      tileRefs.current.push(tile);
      wrapperRefs.current.push(wrapper);

      wheelGroup.add(tile);
    }

    assignEntriesToTiles(normalizeEntries(entries));

    function animate(time: number) {
      const spin = spinRef.current;
      const drift = driftRef.current;
      const winner = winnerRef.current;

      if (winner.isFrozen && time - winner.freezeStart > 15000) {
        winner.isFrozen = false;
      }

      if (!spin.spinning && !drift.drifting && !winner.isFrozen) {
        wheelGroup.rotation.y += ambientRef.current.speed;
      }

      if (spin.spinning) {
        const t = Math.min((time - spin.startTime) / spin.duration, 1);
        const eased = t * t * (3 - 2 * t);

        wheelGroup.rotation.y =
          spin.startRot + (spin.endRot - spin.startRot) * eased;

        if (t >= 1) {
          spin.spinning = false;

          drift.drifting = true;
          drift.start = performance.now();
          drift.from = wheelGroup.rotation.y;

          const nearest = Math.round(drift.from / TILE_STEP);
          drift.to = nearest * TILE_STEP;

          freezeOnWinner(nearest);
        }
      }

      if (drift.drifting) {
        const t = Math.min((time - drift.start) / drift.duration, 1);
        const easeOut = 1 - Math.pow(1 - t, 3);

        wheelGroup.rotation.y =
          drift.from + (drift.to - drift.from) * easeOut;

        if (t >= 1) drift.drifting = false;
      }

      renderer.render(scene, camera);
      cssRenderer.render(scene, camera);
      requestAnimationFrame(animate);
    }

    animate(0);

    return () => {
      window.removeEventListener("resize", handleResize);
      document.removeEventListener("fullscreenchange", handleResize);

      container.removeChild(renderer.domElement);
      container.removeChild(cssRenderer.domElement);

      renderer.dispose();
    };
  }, []);

  /* UPDATE ENTRIES */
  useEffect(() => {
    if (!wrapperRefs.current.length) return;
    assignEntriesToTiles(normalizeEntries(entries));
  }, [entries]);

  /* ===========================================================
     BULB LOGIC
     =========================================================== */

  const bulbColor = wheel?.tile_color_a || "#ffffff";

  function makeBulb(delay: number) {
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
            0%   { opacity: 0.45; transform: scale(0.92); }
            50%  { opacity: 1;    transform: scale(1.06); }
            100% { opacity: 0.45; transform: scale(0.92); }
          }

          @keyframes winnerHalo {
            0% {
              box-shadow: 0 0 60px rgba(255,215,0,0.4),
                          inset 0 0 10px rgba(255,215,0,0.6);
            }
            50% {
              box-shadow: 0 0 150px rgba(255,215,0,1),
                          inset 0 0 20px rgba(255,215,0,0.8);
            }
            100% {
              box-shadow: 0 0 60px rgba(255,215,0,0.4),
                          inset 0 0 10px rgba(255,215,0,0.6);
            }
          }
        `}
      </style>

      {/* BULBS */}
      <BulbColumn side="left" />
      <BulbColumn side="right" />
      <BulbBottom />

      {/* TITLE */}
      <h1
        style={{
          position: "absolute",
          top: "-1vh",
          left: "50%",
          transform: "translateX(-50%)",
          color: "#ffffff",
          fontSize: "clamp(3rem,4vw,6rem)",
          fontWeight: 900,
          textShadow: `
            2px 2px 2px #000,
            -2px 2px 2px #000,
            2px -2px 2px #000,
            -2px -2px 2px #000
          `,
          zIndex: 20,
          margin: 0,
          pointerEvents: "none",
        }}
      >
        {wheel.title || "Prize Wheel"}
      </h1>

      {/* FROSTED PANEL */}
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
          background: "rgba(255,255,255,0.08)",
          border: "1px solid rgba(255,255,255,0.15)",
          boxShadow: "0 0 40px rgba(0,0,0,0.5)",
          overflow: "hidden",
        }}
      >
        <div ref={mountRef} style={{ width: "100%", height: "100%" }} />
      </div>

      {/* HOST LOGO — Lower Left */}
      <div
        style={{
          position: "absolute",
          bottom: "4.5vh",
          left: "2.25vw",
          width: "clamp(140px, 14vw, 220px)",
          height: "clamp(80px, 8vw, 140px)",
          border: "0px solid red",
          borderRadius: "12px",
          background: "rgba(0,0,0,0.0)",
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
            filter: "drop-shadow(0 0 12px rgba(0,0,0,0.7))",
          }}
        />
      </div>

      {/* FULLSCREEN BUTTON */}
      <button
        onClick={toggleFullscreen}
        style={{
          position: "absolute",
          bottom: "3vh",
          right: "2vw",
          width: 48,
          height: 48,
          borderRadius: 10,
          background: "rgba(255,255,255,0.1)",
          backdropFilter: "blur(6px)",
          border: "1px solid rgba(255,255,255,0.25)",
          color: "#fff",
          opacity: 0.25,
          cursor: "pointer",
          transition: "0.25s",
          fontSize: "1.4rem",
          zIndex: 20,
        }}
      >
        ⛶
      </button>
    </div>
  );
}
