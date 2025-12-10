"use client";

import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useCountdown } from "@/app/basketball/hooks/useCountdown";

const SHOW_DEBUG = true; // turn off later

const CELL_COLORS = [
  "#FF3B30", "#FF9500", "#FFCC00", "#34C759", "#5AC8FA",
  "#007AFF", "#5856D6", "#AF52DE", "#FF2D55", "#A2845E",
];

// --------------------------------------------------
// HIT BOX SIZE TABLE
// --------------------------------------------------
const HITBOX_SIZES = {
  zone1: { // 3-point
    easy: 220,
    medium: 150,
    hard: 90,
    expert: 45,
  },
  zone2: { // 2-point
    easy: 260,
    medium: 180,
    hard: 120,
    expert: 45,
  }
};

export default function ShooterPage() {
  const { gameId } = useParams() as { gameId: string };

  const countdownValue = useCountdown(gameId);
  const [localCountdown, setLocalCountdown] = useState<number | null>(null);
  const displayCountdown = localCountdown ?? countdownValue;

  const [playerId, setPlayerId] = useState<string | null>(null);
  const [laneIndex, setLaneIndex] = useState<number | null>(null);
  const [laneColor, setLaneColor] = useState("#222");
  const [score, setScore] = useState(0);
  const [timeLeft, setTimeLeft] = useState<number | null>(null);

  // Game config from DB
  const [difficulty, setDifficulty] = useState<"easy" | "medium" | "hard" | "expert">("medium");
  const [zone1, setZone1] = useState({ x: 200, y: 200 });
  const [zone2, setZone2] = useState({ x: 200, y: 500 });

  // --------------------------------------------------
  // Load player ID
  // --------------------------------------------------
  useEffect(() => {
    const stored = localStorage.getItem("bb_player_id");
    if (stored) setPlayerId(stored);
  }, []);

  // --------------------------------------------------
  // Load difficulty + zone positions from DB
  // --------------------------------------------------
  useEffect(() => {
    async function loadGame() {
      const { data } = await supabase
        .from("bb_games")
        .select("*")
        .eq("id", gameId)
        .single();

      if (!data) return;

      setDifficulty(data.difficulty ?? "medium");
      setZone1({ x: data.zone1_x ?? 200, y: data.zone1_y ?? 200 });
      setZone2({ x: data.zone2_x ?? 200, y: data.zone2_y ?? 500 });
    }
    loadGame();
  }, [gameId]);

  // --------------------------------------------------
  // Load player data repeatedly
  // --------------------------------------------------
  useEffect(() => {
    if (!playerId) return;

    async function loadPlayer() {
      const { data } = await supabase
        .from("bb_game_players")
        .select("*")
        .eq("id", playerId)
        .single();

      if (!data) return;
      setLaneIndex(data.lane_index);
      setLaneColor(CELL_COLORS[data.lane_index]);
      setScore(data.score ?? 0);
    }

    loadPlayer();
    const interval = setInterval(loadPlayer, 1000);
    return () => clearInterval(interval);
  }, [playerId]);

  // --------------------------------------------------
  // Load timer on game start
  // --------------------------------------------------
  async function syncGameStart() {
    const { data } = await supabase
      .from("bb_games")
      .select("*")
      .eq("id", gameId)
      .single();

    if (!data?.game_running || !data.game_timer_start) return;

    const startMS = new Date(data.game_timer_start).getTime();
    const elapsed = Math.floor((Date.now() - startMS) / 1000);
    setTimeLeft(Math.max(data.duration_seconds - elapsed, 0));
  }

  useEffect(() => {
    if (!gameId) return;

    const channel = supabase
      .channel(`basketball-${gameId}`)
      .on("broadcast", { event: "start_countdown" }, () =>
        setLocalCountdown(10)
      )
      .on("broadcast", { event: "start_game" }, () =>
        syncGameStart()
      )
      .on("broadcast", { event: "reset_game" }, () => {
        setLocalCountdown(null);
        setTimeLeft(null);
      })
      .subscribe();

    return () => {
      try { supabase.removeChannel(channel); } catch {}
    };
  }, [gameId]);

  // --------------------------------------------------
  // Build MISS GRID based on difficulty
  // --------------------------------------------------
  function getMissGrid() {
    const rows = 5;
    let cols = 1;

    if (difficulty === "medium") cols = 3;
    if (difficulty === "hard" || difficulty === "expert") cols = 5;

    const width = window.innerWidth;
    const height = window.innerHeight;

    const cellW = width / cols;
    const cellH = height / rows;

    const cells = [];

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        cells.push({
          x: c * cellW,
          y: r * cellH,
          w: cellW,
          h: cellH,
          // assign miss type:
          type:
            c === 0 ? "miss_left" :
            c === cols - 1 ? "miss_right" :
            r === rows - 1 ? "miss_short" :
            r === 0 ? "miss_long" :
            "miss_far",
        });
      }
    }
    return cells;
  }

  // --------------------------------------------------
  // HIT DETECTION
  // --------------------------------------------------
  function pointInBox(px, py, box) {
    return (
      px >= box.left &&
      px <= box.left + box.size &&
      py >= box.top &&
      py <= box.top + box.size
    );
  }

  // --------------------------------------------------
  // Send shot to ActiveWall
  // --------------------------------------------------
  function sendShot(pathType, points) {
    if (!playerId || laneIndex === null) return;

    supabase.channel(`basketball-${gameId}`).send({
      type: "broadcast",
      event: "shot_fired",
      payload: {
        lane_index: laneIndex,
        pathType,
        points,
      },
    });
  }

  // --------------------------------------------------
  // Touch Handler
  // --------------------------------------------------
  function handleTouchEnd(e) {
    if (displayCountdown !== null) return;

    const t = e.changedTouches[0];
    const x = t.clientX;
    const y = t.clientY;

    const zone1Size = HITBOX_SIZES.zone1[difficulty];
    const zone2Size = HITBOX_SIZES.zone2[difficulty];

    const z1 = {
      left: zone1.x - zone1Size / 2,
      top: zone1.y - zone1Size / 2,
      size: zone1Size,
    };

    const z2 = {
      left: zone2.x - zone2Size / 2,
      top: zone2.y - zone2Size / 2,
      size: zone2Size,
    };

    // check 3-pt hit
    if (pointInBox(x, y, z1)) {
      sendShot("three_point", 3);
      return;
    }

    // check 2-pt hit
    if (pointInBox(x, y, z2)) {
      sendShot("two_point", 2);
      return;
    }

    // else, detect MISS GRID
    const grid = getMissGrid();
    for (const cell of grid) {
      if (
        x >= cell.x &&
        x <= cell.x + cell.w &&
        y >= cell.y &&
        y <= cell.y + cell.h
      ) {
        sendShot(cell.type, 0);
        return;
      }
    }
  }

  // --------------------------------------------------
  // RENDER
  // --------------------------------------------------
  return (
    <div
      style={{
        width: "100vw",
        height: "100vh",
        background: "black",
        border: `8px solid ${laneColor}`,
        position: "relative",
        overflow: "hidden",
        touchAction: "none",
      }}
      onTouchEnd={handleTouchEnd}
    >

      {/* HIT ZONES */}
      {SHOW_DEBUG && (
        <>
          {/* ZONE 1 — THREE POINT */}
          <div
            style={{
              position: "absolute",
              left: zone1.x - HITBOX_SIZES.zone1[difficulty] / 2,
              top: zone1.y - HITBOX_SIZES.zone1[difficulty] / 2,
              width: HITBOX_SIZES.zone1[difficulty],
              height: HITBOX_SIZES.zone1[difficulty],
              background: "rgba(0,255,0,0.35)",
              border: "3px solid #00FF00",
              borderRadius: 6,
              zIndex: 100,
            }}
          ></div>

          {/* ZONE 2 — TWO POINT */}
          <div
            style={{
              position: "absolute",
              left: zone2.x - HITBOX_SIZES.zone2[difficulty] / 2,
              top: zone2.y - HITBOX_SIZES.zone2[difficulty] / 2,
              width: HITBOX_SIZES.zone2[difficulty],
              height: HITBOX_SIZES.zone2[difficulty],
              background: "rgba(0,255,0,0.35)",
              border: "3px solid #00FF00",
              borderRadius: 6,
              zIndex: 100,
            }}
          ></div>
        </>
      )}

      {/* MISS GRID */}
      {SHOW_DEBUG &&
        getMissGrid().map((cell, idx) => (
          <div
            key={idx}
            style={{
              position: "absolute",
              left: cell.x,
              top: cell.y,
              width: cell.w,
              height: cell.h,
              background: "rgba(255,0,0,0.18)",
              border: "2px solid red",
              color: "white",
              fontSize: 18,
              display: "flex",
              justifyContent: "center",
              alignItems: "center",
              pointerEvents: "none",
            }}
          >
            {cell.type}
          </div>
        ))}

      {/* UI: Score + Time */}
      <div style={{ position: "absolute", top: 20, left: 20, color: "white", fontSize: "2.5rem" }}>
        {score}
      </div>

      <div style={{ position: "absolute", top: 20, right: 20, color: "white", fontSize: "2.5rem" }}>
        {timeLeft ?? "--"}
      </div>

      {/* COUNTDOWN */}
      {displayCountdown !== null && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: "rgba(0,0,0,0.88)",
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            color: "white",
            fontSize: "clamp(4rem, 10vw, 12rem)",
            fontWeight: 900,
            textShadow: "0 0 40px red",
            zIndex: 500,
          }}
        >
          {displayCountdown > 0 ? displayCountdown : "START!"}
        </div>
      )}
    </div>
  );
}
