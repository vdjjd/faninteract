"use client";

export default function Fire({
  x,
  y,
  size = 22,
}: {
  x: number;
  y: number;
  size?: number;
}) {
  return (
    <div
      style={{
        position: "absolute",
        left: `${x}%`,
        top: `${y}%`,
        width: `${size}%`,
        height: `${size}%`,
        transform: "translate(-50%, -50%)",
        pointerEvents: "none",
        zIndex: 2,
        opacity: 0.85,
        mixBlendMode: "screen",
      }}
    >
      {/* FLAME A */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: "radial-gradient(circle, rgba(255,180,0,0.9), rgba(255,60,0,0.4))",
          borderRadius: "50%",
          filter: "blur(10px)",
          animation: "firePulse 0.22s infinite alternate",
        }}
      />

      {/* FLAME B */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: "radial-gradient(circle, rgba(255,100,0,0.8), rgba(255,0,0,0.3))",
          borderRadius: "50%",
          filter: "blur(18px)",
          animation: "firePulse2 0.32s infinite alternate",
        }}
      />

      <style>{`
        @keyframes firePulse {
          0% { transform: scale(1); opacity: 0.65; }
          100% { transform: scale(1.25); opacity: 1; }
        }
        @keyframes firePulse2 {
          0% { transform: scale(0.8); opacity: 0.4; }
          100% { transform: scale(1.4); opacity: 0.9; }
        }
      `}</style>
    </div>
  );
}
