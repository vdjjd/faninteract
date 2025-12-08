"use client";

export default function Rainbow({
  x,
  y,
  size = 26,
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
        zIndex: 1,
        opacity: 0.9,
        mixBlendMode: "screen",
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          borderRadius: "50%",
          background:
            "conic-gradient(red, orange, yellow, lime, cyan, blue, magenta, red)",
          filter: "blur(14px)",
          animation: "rainbowSpin 1.4s linear infinite",
        }}
      />

      <style>{`
        @keyframes rainbowSpin {
          0% { transform: rotate(0deg) scale(1); }
          100% { transform: rotate(360deg) scale(1.05); }
        }
      `}</style>
    </div>
  );
}
