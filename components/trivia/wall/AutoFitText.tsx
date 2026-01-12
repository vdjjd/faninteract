"use client";

import React, { CSSProperties, useLayoutEffect, useMemo, useRef, useState } from "react";

type Props = {
  text: string;
  maxFontPx: number;
  minFontPx: number;
  /** optional: if you want fewer jumps (default 1px) */
  stepPx?: number;
  /** styling applied to the INNER text node */
  style?: CSSProperties;
  /** styling applied to the OUTER wrapper (must define box size via parent) */
  wrapperStyle?: CSSProperties;
};

export default function AutoFitText({
  text,
  maxFontPx,
  minFontPx,
  stepPx = 1,
  style,
  wrapperStyle,
}: Props) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const textRef = useRef<HTMLDivElement | null>(null);
  const [fontPx, setFontPx] = useState(maxFontPx);

  const safeText = useMemo(() => (text ?? "").toString(), [text]);

  useLayoutEffect(() => {
    const wrap = wrapRef.current;
    const node = textRef.current;
    if (!wrap || !node) return;

    // reset to max first
    let lo = minFontPx;
    let hi = maxFontPx;

    const fits = (px: number) => {
      node.style.fontSize = `${px}px`;

      // allow layout to apply before measuring
      const w = wrap.clientWidth;
      const h = wrap.clientHeight;

      // node scroll sizes vs wrapper client sizes
      const sh = node.scrollHeight;
      const sw = node.scrollWidth;

      return sh <= h + 0.5 && sw <= w + 0.5;
    };

    // binary search best-fit font
    let best = lo;

    while (lo <= hi) {
      const mid = Math.floor((lo + hi) / 2);
      if (fits(mid)) {
        best = mid;
        lo = mid + 1;
      } else {
        hi = mid - 1;
      }
    }

    // snap down to stepPx
    const snapped = Math.max(
      minFontPx,
      Math.min(maxFontPx, Math.floor(best / stepPx) * stepPx)
    );

    setFontPx(snapped);
  }, [safeText, maxFontPx, minFontPx, stepPx]);

  return (
    <div
      ref={wrapRef}
      style={{
        width: "100%",
        height: "100%",
        overflow: "hidden",
        ...wrapperStyle,
      }}
    >
      <div
        ref={textRef}
        style={{
          fontSize: `${fontPx}px`,
          width: "100%",
          height: "100%",
          overflow: "hidden",
          // wrapping rules
          whiteSpace: "normal",
          wordBreak: "break-word",
          overflowWrap: "anywhere",
          ...style,
        }}
      >
        {safeText}
      </div>
    </div>
  );
}
