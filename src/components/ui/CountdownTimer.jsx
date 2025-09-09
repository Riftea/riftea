// src/components/ui/CountdownTimer.jsx
"use client";
import { useEffect, useMemo, useState } from "react";

/**
 * CountdownTimer
 * - Recibe: endsAt (Date|string), opcionalmente onExpire (callback)
 * - Muestra: dd:hh:mm:ss + barrita de progreso opcional si pasas startAt
 */
export default function CountdownTimer({
  endsAt,
  startAt,             // opcional (para barra de progreso)
  onExpire,            // opcional
  className = "",
  showLabels = false,  // si quieres "días / hs / min / seg"
  compact = false,     // estilo compacto  (p.ej. 02:11:45)
}) {
  const ends = useMemo(() => (endsAt ? new Date(endsAt) : null), [endsAt]);
  const start = useMemo(() => (startAt ? new Date(startAt) : null), [startAt]);

  const [now, setNow] = useState(() => new Date());
  const [expired, setExpired] = useState(() => (ends ? now >= ends : false));

  useEffect(() => {
    if (!ends) return;
    const id = setInterval(() => {
      const current = new Date();
      setNow(current);
      if (current >= ends) {
        setExpired(true);
        clearInterval(id);
        onExpire?.();
      }
    }, 1000);
    return () => clearInterval(id);
  }, [ends, onExpire]);

  if (!ends) {
    return (
      <div className={`text-white/70 text-sm ${className}`}>
        Sin fecha límite
      </div>
    );
  }

  if (expired) {
    return (
      <div className={`text-rose-300 text-sm font-semibold ${className}`}>
        Finalizado
      </div>
    );
  }

  const diffMs = Math.max(0, ends - now);
  const totalSec = Math.floor(diffMs / 1000);
  const days = Math.floor(totalSec / 86400);
  const hours = Math.floor((totalSec % 86400) / 3600);
  const mins = Math.floor((totalSec % 3600) / 60);
  const secs = totalSec % 60;

  const pad = (n) => String(n).padStart(2, "0");

  // progreso (opcional) si pasás startAt
  let progressPct = null;
  if (start && ends > start) {
    const total = ends - start;
    const elapsed = now - start;
    progressPct = Math.min(100, Math.max(0, (elapsed / total) * 100));
  }

  return (
    <div className={`inline-flex flex-col gap-2 ${className}`}>
      {/* panel traslúcido */}
      <div className="rounded-xl bg-white/10 border border-white/15 backdrop-blur-md px-3 py-2">
        {compact ? (
          <div className="text-white font-mono text-sm">
            {days > 0 ? `${days}d ` : ""}
            {pad(hours)}:{pad(mins)}:{pad(secs)}
          </div>
        ) : (
          <div className="flex items-baseline gap-2 text-white">
            <span className="font-mono text-lg">
              {days > 0 ? `${days}d ` : ""}
              {pad(hours)}:{pad(mins)}:{pad(secs)}
            </span>
            {showLabels && (
              <span className="text-white/60 text-xs">
                {days > 0 ? "días" : ""} {days > 0 ? "•" : ""} hh:mm:ss
              </span>
            )}
          </div>
        )}
      </div>

      {progressPct !== null && (
        <div className="h-1.5 w-full bg-white/10 rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-emerald-400 to-cyan-400"
            style={{ width: `${progressPct}%` }}
          />
        </div>
      )}
    </div>
  );
}
