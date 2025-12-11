"use client";

import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useCountdown } from "@/app/basketball/hooks/useCountdown";

const SHOW_DEBUG = true;

const CELL_COLORS = [
  "#FF3B30", "#FF9500", "#FFCC00", "#34C759", "#5AC8FA",
  "#007AFF", "#5856D6", "#AF52DE", "#FF2D55", "#A2845E",
];

/* ------------------------------------------------------------
   SVG BUTTON COMPONENT
------------------------------------------------------------ */
function SwipeButton({ x, y, size, laneColor }) {
  const radius = size / 2;
  const textRadius = radius * 0.75;
  const glow = `0 0 20px ${laneColor}, 0 0 40px ${laneColor}`;

  return (
    <svg
      width={size}
      height={size}
      style={{
        position: "absolute",
        left: x,
        top: y,
        transform: "translate(-50%, -50%)",
        filter: `drop-shadow(${glow})`,
        zIndex: 999,
        pointerEvents: "none",
      }}
    >
      <circle cx={radius} cy={radius} r={radius} fill={laneColor} />

      <path
        id="topArc"
        d={`M ${radius - textRadius} ${radius} A ${textRadius} ${textRadius} 0 0 1
            ${radius + textRadius} ${radius}`}
        fill="none"
      />

      <path
        id="bottomArc"
        d={`M ${radius + textRadius} ${radius} A ${textRadius} ${textRadius} 0 0 1
            ${radius - textRadius} ${radius}`}
        fill="none"
      />

      <text
        fill={laneColor}
        stroke="white"
        strokeWidth={3}
        fontSize={radius * 0.35}
        fontWeight="900"
        letterSpacing={2}
        textAnchor="middle"
      >
        <textPath href="#topArc" startOffset="50%">SWIPE UP</textPath>
      </text>

      <text
        fill={laneColor}
        stroke="white"
        strokeWidth={3}
        fontSize={radius * 0.32}
        fontWeight="900"
        letterSpacing={2}
        textAnchor="middle"
      >
        <textPath href="#bottomArc" startOffset="50%">FINGER HERE</textPath>
      </text>
    </svg>
  );
}

/* ------------------------------------------------------------
   SHOOTER PAGE
------------------------------------------------------------ */
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

  /* ------------------------------------------------------------
     Load player ID
  ------------------------------------------------------------ */
  useEffect(() => {
    const stored = localStorage.getItem("bb_player_id");
    if (stored) setPlayerId(stored);
  }, []);

  /* ------------------------------------------------------------
     Load Player
  ------------------------------------------------------------ */
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
    const i = setInterval(loadPlayer, 1000);
    return () => clearInterval(i);
  }, [playerId]);

  /* ------------------------------------------------------------
     Load Game Settings
  ------------------------------------------------------------ */
  useEffect(() => {
    async function loadGame() {
      const { data } = await supabase
        .from("bb_games")
        .select("*")
        .eq("id", gameId)
        .single();
      if (data) setDifficulty(data.difficulty);
    }
    loadGame();
  }, [gameId]);

  /* ------------------------------------------------------------
     GRID LAYOUT
  ------------------------------------------------------------ */
  function getGrid() {
    let rows = 5, cols = 3;
    if (difficulty === "medium") { rows = 10; cols = 5; }
    if (difficulty === "hard") { rows = 14; cols = 7; }
    if (difficulty === "expert") { rows = 18; cols = 9; }

    const W = window.innerWidth;
    const H = window.innerHeight;
    const cellSize = Math.min(W / cols, H / rows);

    const totalW = cols * cellSize;
    const totalH = rows * cellSize;

    const offsetX = (W - totalW) / 2;
    const offsetY = (H - totalH) / 2;

    const cells = [];
    for (let r = 0; r < rows; r++)
      for (let c = 0; c < cols; c++)
        cells.push({
          r, c,
          x: offsetX + c * cellSize,
          y: offsetY + r * cellSize,
          w: cellSize,
          h: cellSize
        });

    return { cells, cellSize };
  }

  /* ------------------------------------------------------------
     HITBOX MAP
  ------------------------------------------------------------ */
  function getHitboxMap() {
    if (difficulty === "easy")
      return { three: { r: 0, c: 1 }, two: { r: 2, c: 1 } };

    if (difficulty === "medium")
      return { three: { r: 1, c: 2 }, two: { r: 4, c: 2 } };

    if (difficulty === "hard")
      return { three: { r: 1, c: 3 }, two: { r: 6, c: 3 } };

    return { three: { r: 1, c: 4 }, two: { r: 6, c: 4 } };
  }

  /* ------------------------------------------------------------
     BUTTON CELL
  ------------------------------------------------------------ */
  function getButtonCell() {
    if (difficulty === "easy") return { r: 4, c: 1 };
    if (difficulty === "medium") return { r: 8, c: 2 };
    if (difficulty === "hard") return { r: 12, c: 3 };
    return { r: 16, c: 4 };
  }

  /* ------------------------------------------------------------
     SEND SHOT EVENT — FIXED FOR BROADCAST
  ------------------------------------------------------------ */
  function sendShot(payload: { type: string; animation: string | null }) {
    if (!playerId || laneIndex === null) return;

    supabase
      .channel(`basketball-${gameId}`, {
        config: { broadcast: { ack: true } }
      })
      .send({
        type: "broadcast",
        event: "shot_fired",
        payload: {
          lane_index: laneIndex,
          pathType: payload.type,
          animation: payload.animation,
          points: 0,
        },
      });
  }

  /* ------------------------------------------------------------
     TOUCH HANDLER
  ------------------------------------------------------------ */
  function handleTouchEnd(e) {
    if (displayCountdown !== null) return;

    const t = e.changedTouches[0];
    const x = t.clientX, y = t.clientY;

    const { cells } = getGrid();
    const btn = getButtonCell();

    for (const cell of cells) {
      if (cell.r === btn.r && cell.c === btn.c) return;

      // SPECIAL SHORT MISS — EASY MODE (3,1)
      if (
        difficulty === "easy" &&
        cell.r === 3 &&
        cell.c === 1 &&
        x >= cell.x && x <= cell.x + cell.w &&
        y >= cell.y && y <= cell.y + cell.h
      ) {
        sendShot({
          type: "short_miss",
          animation: "short_two_point_miss",
        });
        return;
      }

      // NORMAL MISS
      if (
        x >= cell.x && x <= cell.x + cell.w &&
        y >= cell.y && y <= cell.y + cell.h
      ) {
        sendShot({ type: "miss", animation: null });
        return;
      }
    }
  }

  /* ------------------------------------------------------------
     RENDER
  ------------------------------------------------------------ */
  const { cells } = getGrid();
  const buttonCell = getButtonCell();
  const btnCell = cells.find(c => c.r === buttonCell.r && c.c === buttonCell.c);
  const hit = getHitboxMap();

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
      {/* GRID DEBUG */}
      {SHOW_DEBUG &&
        cells.map((cell, i) => {
          let bg = "rgba(255,0,0,0.15)";
          let border = "2px solid red";

          if (cell.r === hit.three.r && cell.c === hit.three.c) {
            bg = "rgba(0,255,0,0.45)";
            border = "3px solid #00ff00";
          }
          if (cell.r === hit.two.r && cell.c === hit.two.c) {
            bg = "rgba(0,150,0,0.45)";
            border = "3px solid #009900";
          }

          return (
            <div
              key={i}
              style={{
                position: "absolute",
                left: cell.x,
                top: cell.y,
                width: cell.w,
                height: cell.h,
                background: bg,
                border,
                color: "white",
                pointerEvents: "none",
                display: "flex",
                justifyContent: "center",
                alignItems: "center",
              }}
            >
              {cell.r},{cell.c}
            </div>
          );
        })}

      {/* BUTTON */}
      {btnCell && (
        <SwipeButton
          x={btnCell.x + btnCell.w / 2}
          y={btnCell.y + btnCell.h / 2}
          size={160}
          laneColor={laneColor}
        />
      )}

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

      {/* COUNTDOWN OVERLAY */}
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
            fontSize: "clamp(4rem,10vw,12rem)",
            fontWeight: 900,
            zIndex: 500,
          }}
        >
          {displayCountdown > 0 ? displayCountdown : "START!"}
        </div>
      )}
    </div>
  );
}
