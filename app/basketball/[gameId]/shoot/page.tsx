"use client";

import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useCountdown } from "@/app/basketball/hooks/useCountdown";

const SHOW_DEBUG = true; // Shows red miss grid. Hit boxes removed.

const CELL_COLORS = [
  "#FF3B30", "#FF9500", "#FFCC00", "#34C759", "#5AC8FA",
  "#007AFF", "#5856D6", "#AF52DE", "#FF2D55", "#A2845E",
];

// Sizes for the invisible hitboxes (used for logic)
const HITBOX_SIZES = {
  zone1: { // 3PT rainbow shot
    easy: 220,
    medium: 150,
    hard: 90,
    expert: 45,
  },
  zone2: { // 2PT shot
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

  const [difficulty, setDifficulty] = useState<
    "easy" | "medium" | "hard" | "expert"
  >("medium");

  // Hit zone positions (invisible)
  const [zone1, setZone1] = useState({ x: 200, y: 200 });
  const [zone2, setZone2] = useState({ x: 200, y: 500 });

  // Load player ID
  useEffect(() => {
    const stored = localStorage.getItem("bb_player_id");
    if (stored) setPlayerId(stored);
  }, []);

  // Load game settings (difficulty + zone positions)
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

  // Load player info
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

  // Timer sync
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

  // ------------------------------------------------------------
  // MISS GRID — updated to 1×5, 3×5, 7×7, 9×9 and perfectly square
  // ------------------------------------------------------------
  function getMissGrid() {
    let rows = 5;
    let cols = 1;

    if (difficulty === "medium") {
      cols = 3;
      rows = 5;
    }

    if (difficulty === "hard") {
      cols = 7;
      rows = 7; // ⭐ Hard = 7×7
    }

    if (difficulty === "expert") {
      cols = 9;
      rows = 9; // ⭐ Expert = 9×9
    }

    // Create a perfectly square play area
    const width = window.innerWidth;
    const height = window.innerHeight;
    const size = Math.min(width, height);
    const offsetX = (width - size) / 2;
    const offsetY = (height - size) / 2;
    const cellSize = size / cols;

    const cells = [];

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        cells.push({
          row: r,
          col: c,
          x: offsetX + c * cellSize,
          y: offsetY + r * cellSize,
          w: cellSize,
          h: cellSize,
          type:
            r === 0 ? "miss_long" :
            r === rows - 1 ? "miss_short" :
            c === 0 ? "miss_left" :
            c === cols - 1 ? "miss_right" :
            "miss_far",
        });
      }
    }

    return cells;
  }

  // Hitbox detection
  function pointInBox(px, py, box) {
    return (
      px >= box.left &&
      px <= box.left + box.size &&
      py >= box.top &&
      py <= box.top + box.size
    );
  }

  // Send shot
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

  // Touch handler
  function handleTouchEnd(e) {
    if (displayCountdown !== null) return;

    const t = e.changedTouches[0];
    const x = t.clientX;
    const y = t.clientY;

    const size1 = HITBOX_SIZES.zone1[difficulty];
    const size2 = HITBOX_SIZES.zone2[difficulty];

    const z1 = {
      left: zone1.x - size1 / 2,
      top: zone1.y - size1 / 2,
      size: size1,
    };

    const z2 = {
      left: zone2.x - size2 / 2,
      top: zone2.y - size2 / 2,
      size: size2,
    };

    if (pointInBox(x, y, z1)) return sendShot("three_point", 3);
    if (pointInBox(x, y, z2)) return sendShot("two_point", 2);

    // MISS GRID fallback
    const cells = getMissGrid();
    for (const cell of cells) {
      if (
        x >= cell.x &&
        x <= cell.x + cell.w &&
        y >= cell.y &&
        y <= cell.y + cell.h
      ) {
        return sendShot(cell.type, 0);
      }
    }
  }

  // ------------------------------------------------------------
  // RENDER
  // ------------------------------------------------------------
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

      {/* MISS GRID ONLY */}
      {SHOW_DEBUG &&
        getMissGrid().map((cell, i) => (
          <div
            key={i}
            style={{
              position: "absolute",
              left: cell.x,
              top: cell.y,
              width: cell.w,
              height: cell.h,
              background: "rgba(255,0,0,0.15)",
              border: "2px solid red",
              color: "white",
              fontSize: 16,
              pointerEvents: "none",
              display: "flex",
              justifyContent: "center",
              alignItems: "center",
            }}
          >
            {cell.row},{cell.col}
          </div>
        ))}

      {/* SCORE + TIMER */}
      <div style={{
        position: "absolute",
        top: 20,
        left: 20,
        color: "white",
        fontSize: "2.5rem",
      }}>
        {score}
      </div>

      <div style={{
        position: "absolute",
        top: 20,
        right: 20,
        color: "white",
        fontSize: "2.5rem",
      }}>
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
