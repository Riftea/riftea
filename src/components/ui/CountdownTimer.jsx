// src/components/ui/CountdownTimer.jsx
"use client";
import { useEffect, useMemo, useState } from "react";

/**
 * CountdownTimer
 * - Recibe:
 *   - endsAt   (Date|string): instante objetivo (p.ej. drawAt o fecha límite)
 *   - startAt  (Date|string, opcional): para calcular barra de progreso (de start → ends)
 *   - onExpire (fn, opcional): callback al llegar a 0
 *   - mode     ('deadline' | 'draw'): en 'draw' el texto al expirar es "Listo para sortear"
 * - UI extra:
 *   - className (string)
 *   - showLabels (bool): muestra "días • hh:mm:ss"
 *   - compact (bool): formato compacto "02:11:45" (+ "Xd" si aplica)
 */
export default function CountdownTimer({
  endsAt,
  startAt,             // opcional (para barra de progreso)
  onExpire,            // opcional
  className = "",
  showLabels = false,  // si querés "días / hh:mm:ss"
  compact = false,     // estilo compacto (p.ej. 02:11:45)
  mode = "deadline",   // 'deadline' | 'draw'
}) {
  const ends = useMemo(() => (endsAt ? new Date(endsAt) : null), [endsAt]);
  const start = useMemo(() => (startAt ? new Date(startAt) : null), [startAt]);

  const [now, setNow] = useState(() => new Date());
  const [expired, setExpired] = useState(() => (ends ? new Date() >= ends : false));

  useEffect(() => {
    if (!ends) return;
    // resetea expiración si cambia ends
    setExpired(new Date() >= ends);

    const id = setInterval(() => {
      const current = new Date();
      setNow(current);
      if (current >= ends) {
        setExpired(true);
        clearInterval(id);
        try {
          onExpire?.();
        } catch {
          // no-op
        }
      }
    }, 1000);
    return () => clearInterval(id);
  }, [ends, onExpire]);

  // Mensajes cuando no hay fecha o expiró
  if (!ends) {
    return (
      <div className={`text-white/70 text-sm ${className}`}>
        {mode === "draw" ? "Sin sorteo programado" : "Sin fecha límite"}
      </div>
    );
  }

  if (expired) {
    const text = mode === "draw" ? "Listo para sortear" : "Finalizado";
    const style =
      mode === "draw"
        ? "text-emerald-300"
        : "text-rose-300";
    return (
      <div className={`${style} text-sm font-semibold ${className}`}>
        {text}
      </div>
    );
  }

  // Cálculo de tiempo restante
  const diffMs = Math.max(0, ends.getTime() - now.getTime());
  const totalSec = Math.floor(diffMs / 1000);
  const days = Math.floor(totalSec / 86400);
  const hours = Math.floor((totalSec % 86400) / 3600);
  const mins = Math.floor((totalSec % 3600) / 60);
  const secs = totalSec % 60;

  const pad = (n) => String(n).padStart(2, "0");

  // progreso (opcional) si pasás startAt
  let progressPct = null;
  if (start && ends > start) {
    const total = ends.getTime() - start.getTime();
    const elapsed = now.getTime() - start.getTime();
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
            className={`h-full ${mode === "draw" ? "bg-gradient-to-r from-emerald-400 to-cyan-400" : "bg-gradient-to-r from-indigo-400 to-purple-400"}`}
            style={{ width: `${progressPct}%` }}
          />
        </div>
      )}
    </div>
  );
}
