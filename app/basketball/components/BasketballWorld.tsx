"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import * as THREE from "three";
import { MTLLoader } from "three/examples/jsm/loaders/MTLLoader.js";
import { OBJLoader } from "three/examples/jsm/loaders/OBJLoader.js";

export type BasketballWorldProps = {
  showTuningUI?: boolean;
  targetModelMaxDim?: number;
  groundAtY?: number;
  // Lane defaults
  laneLength?: number;
  laneWidth?: number;
};

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function NumSlider(props: {
  label: string;
  value: number;
  setValue: (n: number) => void;
  min: number;
  max: number;
  step: number;
  digits?: number;
  ui: {
    row: CSSProperties;
    label: CSSProperties;
    input: CSSProperties;
    val: CSSProperties;
  };
}) {
  const { label, value, setValue, min, max, step, digits = 2, ui } = props;

  const onNumber = (raw: string) => {
    const n = Number(raw);
    if (Number.isFinite(n)) setValue(clamp(n, min, max));
  };

  return (
    <div style={ui.row}>
      <div style={ui.label}>{label}</div>

      <input
        style={ui.input}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => setValue(Number(e.target.value))}
      />

      <input
        type="number"
        value={Number.isFinite(value) ? value : 0}
        min={min}
        max={max}
        step={step}
        onChange={(e) => onNumber(e.target.value)}
        style={{
          width: 76,
          padding: "6px 8px",
          borderRadius: 10,
          border: "1px solid rgba(255,255,255,0.16)",
          background: "rgba(255,255,255,0.06)",
          color: "white",
          fontSize: 12,
          outline: "none",
        }}
      />

      <div style={ui.val}>{value.toFixed(digits)}</div>
    </div>
  );
}

export default function BasketballWorld({
  showTuningUI = false,
  targetModelMaxDim = 7.0,
  groundAtY = 0,
  laneLength = 60,
  laneWidth = 14,
}: BasketballWorldProps) {
  const mountRef = useRef<HTMLDivElement | null>(null);

  // ---------------------------
  // UI toggles
  // ---------------------------
  const [debug, setDebug] = useState(false);
  const [wireframe, setWireframe] = useState(false);
  const [lockLookToRim, setLockLookToRim] = useState(true);

  const [loading, setLoading] = useState(true);
  const [loadErr, setLoadErr] = useState<string | null>(null);

  // ---------------------------
  // Camera tuning
  // ---------------------------
  const [fov, setFov] = useState(28);
  const [camX, setCamX] = useState(0);
  const [camY, setCamY] = useState(6);
  const [camZ, setCamZ] = useState(22);

  const [lookX, setLookX] = useState(0);
  const [lookY, setLookY] = useState(2.5);
  const [lookZ, setLookZ] = useState(0);

  // ---------------------------
  // LaneRoot tuning (moves the whole world)
  // ---------------------------
  const [laneScale, setLaneScale] = useState(1);
  const [laneX, setLaneX] = useState(0);
  const [laneY, setLaneY] = useState(0);
  const [laneZ, setLaneZ] = useState(0);
  const [laneRotY, setLaneRotY] = useState(0);

  // ---------------------------
  // Rim tuning (relative to laneRoot)
  // ---------------------------
  const [rimScale, setRimScale] = useState(1);
  const [rimX, setRimX] = useState(0);
  const [rimY, setRimY] = useState(0);
  const [rimZ, setRimZ] = useState(-22); // default: put rim down-lane (-Z)

  // ---------------------------
  // Lighting
  // ---------------------------
  const [exposure, setExposure] = useState(1.35);
  const [keyIntensity, setKeyIntensity] = useState(2.3);
  const [fillIntensity, setFillIntensity] = useState(1.4);
  const [hemiIntensity, setHemiIntensity] = useState(1.1);
  const [headlightIntensity, setHeadlightIntensity] = useState(1.8);

  // Model paths
  const MODEL_BASE = "/models/hoopLane01/";
  const OBJ_FILE = "Rim.obj";
  const MTL_FILE = "Rim.mtl";

  // Three refs
  const laneRootRef = useRef<THREE.Group | null>(null);
  const rimRootRef = useRef<THREE.Group | null>(null);
  const rimCenterWorldRef = useRef<THREE.Vector3>(new THREE.Vector3());

  const tuningRef = useRef({
    fov,
    camX,
    camY,
    camZ,
    lookX,
    lookY,
    lookZ,
    laneScale,
    laneX,
    laneY,
    laneZ,
    laneRotY,
    rimScale,
    rimX,
    rimY,
    rimZ,
    debug,
    wireframe,
    lockLookToRim,
    exposure,
    keyIntensity,
    fillIntensity,
    hemiIntensity,
    headlightIntensity,
  });

  useEffect(() => {
    tuningRef.current = {
      fov,
      camX,
      camY,
      camZ,
      lookX,
      lookY,
      lookZ,
      laneScale,
      laneX,
      laneY,
      laneZ,
      laneRotY,
      rimScale,
      rimX,
      rimY,
      rimZ,
      debug,
      wireframe,
      lockLookToRim,
      exposure,
      keyIntensity,
      fillIntensity,
      hemiIntensity,
      headlightIntensity,
    };
  }, [
    fov,
    camX,
    camY,
    camZ,
    lookX,
    lookY,
    lookZ,
    laneScale,
    laneX,
    laneY,
    laneZ,
    laneRotY,
    rimScale,
    rimX,
    rimY,
    rimZ,
    debug,
    wireframe,
    lockLookToRim,
    exposure,
    keyIntensity,
    fillIntensity,
    hemiIntensity,
    headlightIntensity,
  ]);

  const copySettings = async () => {
    const s = tuningRef.current;
    const text =
      `// Camera\n` +
      `const CAM_FOV = ${s.fov};\n` +
      `const CAM_POS = new THREE.Vector3(${s.camX}, ${s.camY}, ${s.camZ});\n` +
      `const LOOK_AT = new THREE.Vector3(${s.lookX}, ${s.lookY}, ${s.lookZ});\n\n` +
      `// LaneRoot\n` +
      `const LANE_SCALE = ${s.laneScale};\n` +
      `const LANE_POS = new THREE.Vector3(${s.laneX}, ${s.laneY}, ${s.laneZ});\n` +
      `const LANE_ROT_Y_DEG = ${s.laneRotY};\n\n` +
      `// Rim (relative to laneRoot)\n` +
      `const RIM_SCALE = ${s.rimScale};\n` +
      `const RIM_POS = new THREE.Vector3(${s.rimX}, ${s.rimY}, ${s.rimZ});\n\n` +
      `// Lighting\n` +
      `const EXPOSURE = ${s.exposure};\n` +
      `const KEY_INTENSITY = ${s.keyIntensity};\n` +
      `const FILL_INTENSITY = ${s.fillIntensity};\n` +
      `const HEMI_INTENSITY = ${s.hemiIntensity};\n` +
      `const HEADLIGHT_INTENSITY = ${s.headlightIntensity};\n`;
    try {
      await navigator.clipboard.writeText(text);
    } catch {}
  };

  const lookAtRimOnce = () => {
    const c = rimCenterWorldRef.current;
    setLookX(c.x);
    setLookY(c.y);
    setLookZ(c.z);
  };

  const snapLanePOV = () => {
    // Lane POV: center of lane, low height, looking down lane at rim
    const c = rimCenterWorldRef.current;
    setCamX(0);
    setCamY(3.2);
    setCamZ(22);
    setFov(30);

    setLookX(c.x);
    setLookY(c.y);
    setLookZ(c.z);
  };

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    setLoading(true);
    setLoadErr(null);
    mount.innerHTML = "";

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x000000);

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: false,
      powerPreference: "high-performance",
    });
    renderer.setPixelRatio(window.devicePixelRatio || 1);
    renderer.setClearColor(0x000000, 1);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.35;

    mount.appendChild(renderer.domElement);

    const camera = new THREE.PerspectiveCamera(28, 16 / 9, 0.1, 4000);

    // Lighting
    const hemi = new THREE.HemisphereLight(0xffffff, 0x223355, 1.1);
    scene.add(hemi);

    const key = new THREE.DirectionalLight(0xffffff, 2.3);
    key.position.set(8, 14, 10);
    scene.add(key);

    const fill = new THREE.DirectionalLight(0xffffff, 1.4);
    fill.position.set(-10, 8, 12);
    scene.add(fill);

    const rimLight = new THREE.DirectionalLight(0xffffff, 0.9);
    rimLight.position.set(0, 12, -16);
    scene.add(rimLight);

    const headlight = new THREE.PointLight(0xffffff, 1.8, 400);
    scene.add(headlight);

    // Debug helpers
    const axisHelper = new THREE.AxesHelper(5);
    axisHelper.visible = false;
    scene.add(axisHelper);

    const gridHelper = new THREE.GridHelper(120, 120, 0x334155, 0x0f172a);
    gridHelper.position.y = groundAtY;
    gridHelper.visible = false;
    scene.add(gridHelper);

    const targetSphere = new THREE.Mesh(
      new THREE.SphereGeometry(0.15, 16, 16),
      new THREE.MeshBasicMaterial({ color: 0xff00ff })
    );
    targetSphere.visible = false;
    scene.add(targetSphere);

    // ✅ laneRoot: everything in your world goes inside this
    const laneRoot = new THREE.Group();
    laneRootRef.current = laneRoot;
    scene.add(laneRoot);

    // Lane floor (simple visual)
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(laneWidth, laneLength),
      new THREE.MeshStandardMaterial({ color: 0x121212, roughness: 0.95, metalness: 0.05 })
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(0, groundAtY, -laneLength / 2);
    laneRoot.add(floor);

    // Two lane rails for reference
    const railMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.25 });
    const railGeo = new THREE.BoxGeometry(0.15, 0.05, laneLength);
    const leftRail = new THREE.Mesh(railGeo, railMat);
    leftRail.position.set(-laneWidth / 2, groundAtY + 0.03, -laneLength / 2);
    laneRoot.add(leftRail);

    const rightRail = new THREE.Mesh(railGeo, railMat);
    rightRail.position.set(laneWidth / 2, groundAtY + 0.03, -laneLength / 2);
    laneRoot.add(rightRail);

    // Rim root inside laneRoot (so rim moves with laneRoot)
    const rimRoot = new THREE.Group();
    rimRootRef.current = rimRoot;
    laneRoot.add(rimRoot);

    // Fallback cube (in rimRoot)
    const fallbackBox = new THREE.Mesh(
      new THREE.BoxGeometry(1.2, 1.2, 1.2),
      new THREE.MeshStandardMaterial({ color: 0x22c55e })
    );
    fallbackBox.position.set(0, groundAtY + 1.2, 0);
    rimRoot.add(fallbackBox);

    let cancelled = false;

    const mtlLoader = new MTLLoader();
    mtlLoader.setPath(MODEL_BASE);
    mtlLoader.setResourcePath(MODEL_BASE);

    const objLoader = new OBJLoader();
    objLoader.setPath(MODEL_BASE);

    const applySafeMaterialFixes = (obj: THREE.Object3D) => {
      obj.traverse((child: any) => {
        if (!child?.isMesh) return;
        child.geometry?.computeVertexNormals?.();
        const mats = Array.isArray(child.material) ? child.material : [child.material];
        mats.forEach((m: any) => {
          if (!m) return;
          if ("side" in m) m.side = THREE.DoubleSide;
          if (m.color?.set) m.color.set(1, 1, 1);
          if (m.map) {
            m.map.colorSpace = THREE.SRGBColorSpace;
            m.map.needsUpdate = true;
          }
          if ("wireframe" in m) m.wireframe = tuningRef.current.wireframe;
          m.needsUpdate = true;
        });
      });
    };

    const normalizeModel = (obj: THREE.Object3D) => {
      obj.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(obj);
      const center = box.getCenter(new THREE.Vector3());
      obj.position.sub(center);

      obj.updateMatrixWorld(true);
      const box2 = new THREE.Box3().setFromObject(obj);
      const size = box2.getSize(new THREE.Vector3());
      const maxDim = Math.max(size.x, size.y, size.z, 0.0001);
      const scale = targetModelMaxDim / maxDim;
      obj.scale.setScalar(scale);

      // drop to ground
      obj.updateMatrixWorld(true);
      const box3 = new THREE.Box3().setFromObject(obj);
      const minY = box3.min.y;
      obj.position.y += groundAtY - minY;
    };

    mtlLoader.load(
      MTL_FILE,
      (materials) => {
        if (cancelled) return;
        materials.preload();

        Object.values(materials.materials).forEach((mat: any) => {
          if (mat?.map) {
            mat.map.colorSpace = THREE.SRGBColorSpace;
            mat.map.needsUpdate = true;
          }
          if (mat?.color?.set) mat.color.set(1, 1, 1);
          mat.needsUpdate = true;
        });

        objLoader.setMaterials(materials);

        objLoader.load(
          OBJ_FILE,
          (obj) => {
            if (cancelled) return;

            rimRoot.remove(fallbackBox);

            applySafeMaterialFixes(obj);
            normalizeModel(obj);

            rimRoot.add(obj);
            setLoading(false);
          },
          undefined,
          (err) => {
            console.error("OBJ load error:", err);
            if (cancelled) return;
            setLoading(false);
            setLoadErr(`OBJ failed to load: ${MODEL_BASE}${OBJ_FILE}`);
          }
        );
      },
      undefined,
      (err) => {
        console.error("MTL load error:", err);
        if (cancelled) return;
        setLoading(false);
        setLoadErr(`MTL failed to load: ${MODEL_BASE}${MTL_FILE}`);
      }
    );

    function resize() {
      const w = mount.clientWidth;
      const h = mount.clientHeight;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    }

    resize();
    window.addEventListener("resize", resize);
    document.addEventListener("fullscreenchange", resize);

    let raf = 0;
    const render = () => {
      const s = tuningRef.current;

      renderer.toneMappingExposure = s.exposure;

      hemi.intensity = s.hemiIntensity;
      key.intensity = s.keyIntensity;
      fill.intensity = s.fillIntensity;

      // laneRoot transform
      laneRoot.scale.setScalar(s.laneScale);
      laneRoot.position.set(s.laneX, s.laneY, s.laneZ);
      laneRoot.rotation.y = THREE.MathUtils.degToRad(s.laneRotY);

      // rimRoot transform (relative to laneRoot)
      rimRoot.scale.setScalar(s.rimScale);
      rimRoot.position.set(s.rimX, s.rimY, s.rimZ);

      // Compute rim center in WORLD coords (after transforms)
      const rimBox = new THREE.Box3().setFromObject(rimRoot);
      rimCenterWorldRef.current.copy(rimBox.getCenter(new THREE.Vector3()));

      // If locked, FORCE look target = rim center
      if (s.lockLookToRim) {
        const c = rimCenterWorldRef.current;
        // Only update the ref values (so rendering uses it),
        // AND update state occasionally so the UI shows it.
        // (State update every frame is bad, so keep UI "approx" with button.)
        tuningRef.current.lookX = c.x;
        tuningRef.current.lookY = c.y;
        tuningRef.current.lookZ = c.z;
      }

      // Camera
      camera.fov = s.fov;
      camera.position.set(s.camX, s.camY, s.camZ);

      headlight.intensity = s.headlightIntensity;
      headlight.position.copy(camera.position);

      const look = s.lockLookToRim ? rimCenterWorldRef.current : new THREE.Vector3(s.lookX, s.lookY, s.lookZ);
      camera.lookAt(look);

      axisHelper.visible = s.debug;
      gridHelper.visible = s.debug;
      targetSphere.visible = s.debug;
      targetSphere.position.copy(look);

      // wireframe live toggle
      rimRoot.traverse((child: any) => {
        if (!child?.isMesh || !child?.material) return;
        const mats = Array.isArray(child.material) ? child.material : [child.material];
        mats.forEach((m: any) => {
          if (m && "wireframe" in m) m.wireframe = s.wireframe;
        });
      });

      camera.updateProjectionMatrix();
      renderer.render(scene, camera);
      raf = requestAnimationFrame(render);
    };

    raf = requestAnimationFrame(render);

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);

      window.removeEventListener("resize", resize);
      document.removeEventListener("fullscreenchange", resize);

      rimRoot.traverse((child: any) => {
        if (child?.geometry) child.geometry.dispose?.();
        if (child?.material) {
          const mats = Array.isArray(child.material) ? child.material : [child.material];
          mats.forEach((m: any) => {
            if (m?.map) m.map.dispose?.();
            if (m?.normalMap) m.normalMap.dispose?.();
            if (m?.roughnessMap) m.roughnessMap.dispose?.();
            if (m?.metalnessMap) m?.metalnessMap.dispose?.();
            if (m?.aoMap) m?.aoMap.dispose?.();
            m?.dispose?.();
          });
        }
      });

      renderer.dispose();
      try {
        mount.removeChild(renderer.domElement);
      } catch {}
      mount.innerHTML = "";
    };
  }, [targetModelMaxDim, groundAtY, laneLength, laneWidth]);

  const ui = useMemo(() => {
    const row: CSSProperties = {
      display: "grid",
      gridTemplateColumns: "120px 1fr 84px 64px",
      gap: 10,
      alignItems: "center",
      marginBottom: 10,
    };
    const label: CSSProperties = { color: "white", fontSize: 12, opacity: 0.9 };
    const input: CSSProperties = { width: "100%" };
    const val: CSSProperties = { color: "white", fontSize: 12, opacity: 0.85, textAlign: "right" };
    const title: CSSProperties = { fontWeight: 900, letterSpacing: 0.4 };
    const section: CSSProperties = { fontWeight: 800, fontSize: 12, opacity: 0.9, margin: "10px 0 6px" };
    const btn: CSSProperties = {
      padding: "6px 10px",
      borderRadius: 10,
      border: "1px solid rgba(255,255,255,0.16)",
      color: "white",
      cursor: "pointer",
      fontWeight: 800,
      fontSize: 12,
      background: "rgba(255,255,255,0.08)",
      whiteSpace: "nowrap",
    };
    return { row, label, input, val, title, section, btn } as const;
  }, []);

  return (
    <div style={{ width: "100%", height: "100%", position: "relative", background: "black" }}>
      <div ref={mountRef} style={{ position: "absolute", inset: 0 }} />

      {showTuningUI && (
        <div
          style={{
            position: "absolute",
            top: 16,
            left: 16,
            width: 480,
            padding: 14,
            borderRadius: 14,
            background: "rgba(0,0,0,0.55)",
            border: "1px solid rgba(255,255,255,0.14)",
            backdropFilter: "blur(8px)",
            color: "white",
            zIndex: 20,
          }}
        >
          <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 10 }}>
            <div style={ui.title}>LANE ROOT + LOCK LOOK</div>

            <button
              onClick={() => setDebug((v) => !v)}
              style={{
                ...ui.btn,
                marginLeft: "auto",
                background: debug ? "rgba(34,197,94,0.28)" : "rgba(255,255,255,0.08)",
              }}
            >
              {debug ? "DEBUG ON" : "DEBUG OFF"}
            </button>

            <button
              onClick={() => setWireframe((v) => !v)}
              style={{
                ...ui.btn,
                background: wireframe ? "rgba(245,158,11,0.28)" : "rgba(255,255,255,0.08)",
              }}
            >
              {wireframe ? "WIREFRAME" : "SOLID"}
            </button>

            <button onClick={copySettings} style={{ ...ui.btn, background: "rgba(59,130,246,0.22)" }}>
              Copy
            </button>
          </div>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 10 }}>
            <button
              onClick={() => setLockLookToRim((v) => !v)}
              style={{
                ...ui.btn,
                background: lockLookToRim ? "rgba(147,51,234,0.26)" : "rgba(255,255,255,0.08)",
              }}
            >
              {lockLookToRim ? "LOCK LOOK: ON" : "LOCK LOOK: OFF"}
            </button>

            <button onClick={lookAtRimOnce} style={{ ...ui.btn, background: "rgba(34,197,94,0.20)" }}>
              LOOK AT RIM ONCE
            </button>

            <button onClick={snapLanePOV} style={{ ...ui.btn, background: "rgba(59,130,246,0.22)" }}>
              LANE POV
            </button>
          </div>

          <div style={{ opacity: 0.8, fontSize: 12, lineHeight: 1.35, marginBottom: 12 }}>
            Status: <b>{loading ? "Loading…" : loadErr ? "Load Error" : "Loaded"}</b>
            {loadErr ? <span style={{ color: "#ff9f9f" }}> — {loadErr}</span> : null}
            <br />
            Tip: keep <b>LOCK LOOK</b> ON. Then only adjust camera position + laneRoot/rim position.
          </div>

          <div style={ui.section}>Camera</div>
          <NumSlider label="FOV" value={fov} setValue={setFov} min={16} max={75} step={0.5} digits={1} ui={ui} />
          <NumSlider label="camX" value={camX} setValue={setCamX} min={-150} max={200} step={0.05} digits={2} ui={ui} />
          <NumSlider label="camY" value={camY} setValue={setCamY} min={-20} max={200} step={0.05} digits={2} ui={ui} />
          <NumSlider label="camZ" value={camZ} setValue={setCamZ} min={-150} max={250} step={0.05} digits={2} ui={ui} />

          {!lockLookToRim && (
            <>
              <div style={ui.section}>Look Target</div>
              <NumSlider label="lookX" value={lookX} setValue={setLookX} min={-150} max={200} step={0.05} digits={2} ui={ui} />
              <NumSlider label="lookY" value={lookY} setValue={setLookY} min={-20} max={200} step={0.05} digits={2} ui={ui} />
              <NumSlider label="lookZ" value={lookZ} setValue={setLookZ} min={-150} max={250} step={0.05} digits={2} ui={ui} />
            </>
          )}

          <div style={ui.section}>LaneRoot (moves the entire world)</div>
          <NumSlider label="laneScale" value={laneScale} setValue={setLaneScale} min={0.1} max={10} step={0.01} digits={2} ui={ui} />
          <NumSlider label="laneX" value={laneX} setValue={setLaneX} min={-150} max={200} step={0.05} digits={2} ui={ui} />
          <NumSlider label="laneY" value={laneY} setValue={setLaneY} min={-50} max={100} step={0.05} digits={2} ui={ui} />
          <NumSlider label="laneZ" value={laneZ} setValue={setLaneZ} min={-150} max={250} step={0.05} digits={2} ui={ui} />
          <NumSlider label="laneRotY°" value={laneRotY} setValue={setLaneRotY} min={-180} max={180} step={0.25} digits={2} ui={ui} />

          <div style={ui.section}>Rim (relative to laneRoot)</div>
          <NumSlider label="rimScale" value={rimScale} setValue={setRimScale} min={0.1} max={10} step={0.01} digits={2} ui={ui} />
          <NumSlider label="rimX" value={rimX} setValue={setRimX} min={-150} max={200} step={0.05} digits={2} ui={ui} />
          <NumSlider label="rimY" value={rimY} setValue={setRimY} min={-50} max={100} step={0.05} digits={2} ui={ui} />
          <NumSlider label="rimZ" value={rimZ} setValue={setRimZ} min={-250} max={250} step={0.05} digits={2} ui={ui} />
        </div>
      )}
    </div>
  );
}
