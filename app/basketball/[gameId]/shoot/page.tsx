"use client";

import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useCountdown } from "@/app/basketball/hooks/useCountdown";

const SHOW_DEBUG = true; // Toggle grid visibility

const CELL_COLORS = [
  "#FF3B30", "#FF9500", "#FFCC00", "#34C759", "#5AC8FA",
  "#007AFF", "#5856D6", "#AF52DE", "#FF2D55", "#A2845E",
];

// ===========================================
// SVG SWIPE BUTTON COMPONENT
// ===========================================
function SwipeButton({ x, y, size, laneColor }) {
  const glow = `0 0 20px ${laneColor}, 0 0 40px ${laneColor}`;
  const radius = size / 2;
  const textRadius = radius * 0.75;

  return (
    <svg
      width={size}
      height={size}
      style={{
        position: "absolute",
        left: x,
        top: y,
        transform: "translate(-50%, -50%)",
        overflow: "visible",
        filter: `drop-shadow(${glow})`,
        zIndex: 999,
      }}
    >
      {/* Circle */}
      <circle cx={radius} cy={radius} r={radius} fill={laneColor} />

      {/* TOP ARC */}
      <path
        id="topArc"
        d={`M ${radius - textRadius} ${radius}
           A ${textRadius} ${textRadius} 0 0 1
             ${radius + textRadius} ${radius}`}
        fill="none"
      />

      {/* BOTTOM ARC */}
      <path
        id="bottomArc"
        d={`M ${radius + textRadius} ${radius}
           A ${textRadius} ${textRadius} 0 0 1
             ${radius - textRadius} ${radius}`}
        fill="none"
      />

      {/* TOP TEXT */}
      <text
        fill={laneColor}
        stroke="white"
        strokeWidth={3}
        fontSize={radius * 0.35}
        fontWeight="900"
        letterSpacing={2}
        textAnchor="middle"
      >
        <textPath href="#topArc" startOffset="50%">
          SWIPE UP
        </textPath>
      </text>

      {/* BOTTOM TEXT */}
      <text
        fill={laneColor}
        stroke="white"
        strokeWidth={3}
        fontSize={radius * 0.32}
        fontWeight="900"
        letterSpacing={2}
        textAnchor="middle"
      >
        <textPath href="#bottomArc" startOffset="50%">
          FINGER HERE
        </textPath>
      </text>
    </svg>
  );
}

// ===========================================
// SHOOTER PAGE
// ===========================================
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

  // Load playerId
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
    const i = setInterval(loadPlayer, 1000);
    return () => clearInterval(i);
  }, [playerId]);

  // Load difficulty
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

  // ------------------------------------------------------------
  // GRID LAYOUT FUNCTION
  // ------------------------------------------------------------
  function getGrid() {
    let rows = 5, cols = 3; // EASY BASE

    if (difficulty === "medium") {
      cols = 5; rows = 10;
    } else if (difficulty === "hard") {
      cols = 7; rows = 14;
    } else if (difficulty === "expert") {
      cols = 9; rows = 18;
    }

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
          h: cellSize,
        });

    return { cells, cellSize };
  }

  // ------------------------------------------------------------
  // HITBOX COORDS
  // ------------------------------------------------------------
  function getHitboxes() {
    if (difficulty === "easy")
      return { three: { r: 0, c: 1 }, two: { r: 2, c: 1 } };

    if (difficulty === "medium")
      return { three: { r: 1, c: 2 }, two: { r: 4, c: 2 } };

    if (difficulty === "hard")
      return { three: { r: 1, c: 3 }, two: { r: 6, c: 3 } };

    return { three: { r: 1, c: 4 }, two: { r: 6, c: 4 } };
  }

  // ------------------------------------------------------------
  // BUTTON PLACEMENT
  // ------------------------------------------------------------
  function getButtonPosition(cells, cellSize) {
    const btn = 160;
    let target = null;

    if (difficulty === "easy") {
      target = cells.find(c => c.r === 4 && c.c === 1);
    }
    if (difficulty === "medium") {
      target = cells.find(c => c.r === 8 && c.c === 2);
    }
    if (difficulty === "hard") {
      target = cells.find(c => c.r === 12 && c.c === 3);
    }
    if (difficulty === "expert") {
      target = cells.find(c => c.r === 16 && c.c === 4);
    }

    if (!target) return { x: 200, y: 200 };

    return {
      x: target.x + target.w / 2,
      y: target.y + target.h / 2,
    };
  }

  // ------------------------------------------------------------
  // TOUCH HANDLER → SEND MISS FOR NOW
  // ------------------------------------------------------------
  function sendShot(type) {
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

  function handleTouchEnd(e) {
    if (displayCountdown !== null) return;

    const t = e.changedTouches[0];
    const x = t.clientX;
    const y = t.clientY;

    const { cells } = getGrid();
    for (const cell of cells) {
      if (x >= cell.x && x <= cell.x + cell.w &&
          y >= cell.y && y <= cell.y + cell.h) {
        sendShot("miss");
        return;
      }
    }
  }

  // ------------------------------------------------------------
  // RENDER
  // ------------------------------------------------------------
  const { cells, cellSize } = getGrid();
  const buttonPos = getButtonPosition(cells, cellSize);

  return (
    <div
      style={{
        width: "100vw",
        height: "100vh",
        background: "black",
        border: `8px solid ${laneColor}`,
        position: "relative",
        overflow: "hidden",
      }}
      onTouchEnd={handleTouchEnd}
    >
      {/* GRID DEBUG */}
      {SHOW_DEBUG &&
        cells.map((cell, i) => (
          <div
            key={i}
            style={{
              position: "absolute",
              left: cell.x,
              top: cell.y,
              width: cell.w,
              height: cell.h,
              background: "rgba(255,0,0,0.15)",
              border: "1px solid red",
              color: "white",
              fontSize: 12,
              pointerEvents: "none",
              display: "flex",
              justifyContent: "center",
              alignItems: "center",
            }}
          >
            {cell.r},{cell.c}
          </div>
        ))}

      {/* ALWAYS VISIBLE SWIPE BUTTON */}
      <SwipeButton
        x={buttonPos.x}
        y={buttonPos.y}
        size={160}
        laneColor={laneColor}
      />

      {/* SCORE + TIMER */}
      <div style={{ position:"absolute", top:20, left:20, color:"white", fontSize:"2.5rem" }}>
        {score}
      </div>
      <div style={{ position:"absolute", top:20, right:20, color:"white", fontSize:"2.5rem" }}>
        {timeLeft ?? "--"}
      </div>

      {/* COUNTDOWN */}
      {displayCountdown !== null && (
        <div
          style={{
            position:"absolute",
            inset:0,
            background:"rgba(0,0,0,0.88)",
            display:"flex",
            justifyContent:"center",
            alignItems:"center",
            color:"white",
            fontSize:"clamp(4rem, 10vw, 12rem)",
            fontWeight:900,
            textShadow:"0 0 40px red",
            zIndex:500,
          }}
        >
          {displayCountdown > 0 ? displayCountdown : "START!"}
        </div>
      )}
    </div>
  );
}
