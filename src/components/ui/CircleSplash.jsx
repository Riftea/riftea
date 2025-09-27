"use client";
import { useEffect } from "react";

/**
 * Overlay de círculos en expansión.
 * - show: boolean para mostrar/ocultar
 * - onFinish: callback al terminar la animación
 * - durationMs: duración total (ms)
 * - rings: cantidad de círculos
 */
export default function CircleSplash({
  show = true,
  onFinish,
  durationMs = 900,
  rings = 3,
}) {
  useEffect(() => {
    if (!show) return;
    const t = setTimeout(() => onFinish?.(), durationMs + (rings - 1) * 90 + 80);
    return () => clearTimeout(t);
  }, [show, durationMs, rings, onFinish]);

  if (!show) return null;

  const items = Array.from({ length: rings });

  return (
    <>
      <style jsx global>{`
        @keyframes circle-grow {
          0% { transform: scale(0.15); opacity: 0.45; }
          80% { opacity: 0.12; }
          100% { transform: scale(9); opacity: 0; }
        }
        .cs__overlay {
          position: fixed; inset: 0; z-index: 9999;
          display: flex; align-items: center; justify-content: center;
          pointer-events: none;
          background: radial-gradient(1000px 700px at 50% 45%,
            rgba(255,255,255,0.85), rgba(255,255,255,0.55) 45%,
            rgba(255,255,255,0.15) 70%, transparent 100%);
          backdrop-filter: blur(6px);
        }
        .cs__ring {
          position: absolute; width: 140px; height: 140px; border-radius: 9999px;
          background: conic-gradient(from 90deg, #ff7a00, #ffb703, #ff3d71, #ff7a00);
          filter: blur(6px);
          mix-blend-mode: multiply;
          animation: circle-grow var(--cs-dur) cubic-bezier(.16,1,.3,1) forwards;
          animation-delay: var(--cs-delay);
        }
        .cs__dot {
          width: 14px; height: 14px; border-radius: 9999px;
          background: linear-gradient(90deg, #f97316, #ec4899);
          box-shadow: 0 0 0 6px rgba(249,115,22,0.15);
          transform: translateY(-6px);
        }
      `}</style>

      <div className="cs__overlay">
        {items.map((_, i) => (
          <div
            key={i}
            className="cs__ring"
            style={{
              // escalonado sutil
              ["--cs-delay"]: `${i * 90}ms`,
              ["--cs-dur"]: `${durationMs}ms`,
            }}
          />
        ))}
        {/* centro opcional */}
        <div className="cs__dot" />
      </div>
    </>
  );
}
