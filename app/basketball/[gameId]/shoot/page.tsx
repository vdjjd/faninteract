"use client";

import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useCountdown } from "@/app/basketball/hooks/useCountdown";

const SHOW_DEBUG = true; // shows red MISS GRID

const CELL_COLORS = [
  "#FF3B30", "#FF9500", "#FFCC00", "#34C759", "#5AC8FA",
  "#007AFF", "#5856D6", "#AF52DE", "#FF2D55", "#A2845E",
];

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
  >("easy");

  // Load player ID
  useEffect(() => {
    const stored = localStorage.getItem("bb_player_id");
    if (stored) setPlayerId(stored);
  }, []);

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

  // Load game settings
  useEffect(() => {
    async function loadGame() {
      const { data } = await supabase
        .from("bb_games")
        .select("*")
        .eq("id", gameId)
        .single();

      if (data) {
        setDifficulty(data.difficulty ?? "easy");
      }
    }
    loadGame();
  }, [gameId]);

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
      try {
        supabase.removeChannel(channel);
      } catch {}
    };
  }, [gameId]);

  // ------------------------------------------------------------
  // MISS GRID SYSTEM — FINAL LAYOUT
  // ------------------------------------------------------------
  function getMissGrid() {
    let rows: number;
    let cols: number;

    if (difficulty === "easy") {
      // 🤍 Easy: 3 columns x 5 rows (center column "active", sides still cells)
      cols = 3;
      rows = 5;
    } else if (difficulty === "medium") {
      // 🟡 Medium: 5 columns x 10 rows
      cols = 5;
      rows = 10;
    } else if (difficulty === "hard") {
      // 🔴 Hard: 7 columns x 14 rows
      cols = 7;
      rows = 14;
    } else {
      // 🖤 Expert: 9 columns x 18 rows
      cols = 9;
      rows = 18;
    }

    const W = window.innerWidth;
    const H = window.innerHeight;

    // All modes: same sizing rule → equal cells, centered grid
    const cellSize = Math.min(W / cols, H / rows);

    const totalW = cols * cellSize;
    const totalH = rows * cellSize;

    // Center the grid
    const offsetX = (W - totalW) / 2;
    const offsetY = (H - totalH) / 2;

    const cells: {
      row: number;
      col: number;
      x: number;
      y: number;
      w: number;
      h: number;
      type: string;
    }[] = [];

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

  // For now everything is a "miss" until we define hitboxes
  function sendShot(pathType: string) {
    if (!playerId || laneIndex === null) return;

    supabase.channel(`basketball-${gameId}`).send({
      type: "broadcast",
      event: "shot_fired",
      payload: {
        lane_index: laneIndex,
        pathType,
        points: 0,
      },
    });
  }

  function handleTouchEnd(e: React.TouchEvent<HTMLDivElement>) {
    if (displayCountdown !== null) return;

    const t = e.changedTouches[0];
    const x = t.clientX;
    const y = t.clientY;

    const grid = getMissGrid();

    for (const cell of grid) {
      if (
        x >= cell.x &&
        x <= cell.x + cell.w &&
        y >= cell.y &&
        y <= cell.y + cell.h
      ) {
        sendShot(cell.type);
        return;
      }
    }
  }

  // ------------------------------------------------------------
  // RENDER PAGE
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
      {/* MISS GRID */}
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
              fontSize: 12,
              pointerEvents: "none",
              display: "flex",
              justifyContent: "center",
              alignItems: "center",
            }}
          >
            {cell.row},{cell.col}
          </div>
        ))}

      {/* SCORE */}
      <div
        style={{
          position: "absolute",
          top: 20,
          left: 20,
          color: "white",
          fontSize: "2.5rem",
        }}
      >
        {score}
      </div>

      {/* TIMER */}
      <div
        style={{
          position: "absolute",
          top: 20,
          right: 20,
          color: "white",
          fontSize: "2.5rem",
        }}
      >
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
