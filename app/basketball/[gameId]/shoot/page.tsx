"use client";

import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useCountdown } from "@/app/basketball/hooks/useCountdown";

const SHOW_DEBUG = true; // shows grid + hit boxes

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

  const [difficulty, setDifficulty] =
    useState<"easy" | "medium" | "hard" | "expert">("easy");

  // Load player ID
  useEffect(() => {
    const stored = localStorage.getItem("bb_player_id");
    if (stored) setPlayerId(stored);
  }, []);

  // Load player row/column color + score
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

  // Load difficulty from DB
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

  // Game timer sync
  async function syncGameStart() {
    const { data } = await supabase
      .from("bb_games")
      .select("*")
      .eq("id", gameId)
      .single();

    if (!data?.game_running || !data.game_timer_start) return;

    const start = new Date(data.game_timer_start).getTime();
    const elapsed = Math.floor((Date.now() - start) / 1000);
    setTimeLeft(Math.max(data.duration_seconds - elapsed, 0));
  }

  useEffect(() => {
    const ch = supabase
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
        supabase.removeChannel(ch);
      } catch {}
    };
  }, [gameId]);

  // ------------------------------------------------------------
  // GRID LAYOUT
  // ------------------------------------------------------------
  function getMissGrid() {
    let rows = 5;
    let cols = 3; // EASY default

    if (difficulty === "medium") {
      cols = 5;
      rows = 10;
    } else if (difficulty === "hard") {
      cols = 7;
      rows = 14;
    } else if (difficulty === "expert") {
      cols = 9;
      rows = 18;
    }

    const W = window.innerWidth;
    const H = window.innerHeight;

    // perfect squares
    const cellSize = Math.min(W / cols, H / rows);

    // centered
    const totalW = cols * cellSize;
    const totalH = rows * cellSize;

    const offsetX = (W - totalW) / 2;
    const offsetY = (H - totalH) / 2;

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
        });
      }
    }
    return cells;
  }

  // ------------------------------------------------------------
  // HITBOX MAP (GREEN CELLS)
  // ------------------------------------------------------------
  function getHitboxMap() {
    if (difficulty === "easy") {
      return {
        three: { r: 0, c: 1 },
        two: { r: 2, c: 1 },
      };
    }
    if (difficulty === "medium") {
      return {
        three: { r: 1, c: 2 },
        two: { r: 4, c: 2 },
      };
    }
    if (difficulty === "hard") {
      return {
        three: { r: 1, c: 3 },
        two: { r: 6, c: 3 },
      };
    }
    return {
      three: { r: 1, c: 4 },
      two: { r: 6, c: 4 },
    };
  }

  // ------------------------------------------------------------
  // SENDING SHOT (miss only for now)
  // ------------------------------------------------------------
  function sendShot(type: string) {
    if (!playerId || laneIndex === null) return;

    supabase.channel(`basketball-${gameId}`).send({
      type: "broadcast",
      event: "shot_fired",
      payload: {
        lane_index: laneIndex,
        pathType: type,
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
      if (x >= cell.x && x <= cell.x + cell.w && y >= cell.y && y <= cell.y + cell.h) {
        sendShot("miss");
        return;
      }
    }
  }

  // ------------------------------------------------------------
  // RENDER PAGE
  // ------------------------------------------------------------
  const hitboxes = getHitboxMap();

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
      {/* GRID VISUALS */}
      {SHOW_DEBUG &&
        getMissGrid().map((cell, idx) => {
          let bg = "rgba(255,0,0,0.15)";
          let border = "2px solid red";

          // Highlight 3-pointer
          if (cell.row === hitboxes.three.r && cell.col === hitboxes.three.c) {
            bg = "rgba(0,255,0,0.45)";
            border = "3px solid #00ff00";
          }

          // Highlight 2-pointer
          if (cell.row === hitboxes.two.r && cell.col === hitboxes.two.c) {
            bg = "rgba(0,150,0,0.45)";
            border = "3px solid #009900";
          }

          return (
            <div
              key={idx}
              style={{
                position: "absolute",
                left: cell.x,
                top: cell.y,
                width: cell.w,
                height: cell.h,
                background: bg,
                border,
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
          );
        })}

      {/* SCORE */}
      <div style={{
        position: "absolute",
        top: 20,
        left: 20,
        color: "white",
        fontSize: "2.5rem",
      }}>
        {score}
      </div>

      {/* TIMER */}
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
