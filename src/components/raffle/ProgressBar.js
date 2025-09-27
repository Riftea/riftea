// src/components/raffle/ProgressBar.js
import React, { useEffect, useState, useMemo } from "react";

/**
 * Barra de progreso con "olita" interna animada:
 * - La barra crece sólo cuando cambia `current` (como ahora).
 * - La olita se mueve de izq→der dentro del área pintada (visual).
 * - Clamp 0..100, globito centrado y sin desbordes en 0%/100%.
 */
const ProgressBar = ({
  current = 0,
  target = 100,
  title = "Progreso",
  mode = "count",
  currency = "ARS",
  animated = true,
  raffleStatus = "ACTIVE",
  showCta = false,
  onCtaClick = null,
  // Opcionales:
  wave = true,           // activar/desactivar olita
  waveSpeed = "2.8s",    // velocidad de la olita (CSS duration)
}) => {
  const safeTarget = Math.max(1, Number(target) || 1);
  const safeCurrent = Math.max(0, Number(current) || 0);

  // % real (clamp 0..100)
  const actualPercent = useMemo(() => {
    const raw = (safeCurrent / safeTarget) * 100;
    return Math.max(0, Math.min(100, raw));
  }, [safeCurrent, safeTarget]);

  const [displayPercent, setDisplayPercent] = useState(0);
  const [isComplete, setIsComplete] = useState(false);
  const [justCompleted, setJustCompleted] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => {
      setDisplayPercent(actualPercent);
      if (actualPercent >= 100 && !isComplete) {
        setIsComplete(true);
        setJustCompleted(true);
        setTimeout(() => setJustCompleted(false), 3000);
      } else if (actualPercent < 100 && isComplete) {
        setIsComplete(false);
      }
    }, 120);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [actualPercent]);

  const fmtMoney = (n) =>
    new Intl.NumberFormat("es-AR", {
      style: "currency",
      currency,
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(n);

  const labelLeft = mode === "money" ? "Recaudado" : "Aplicados";
  const labelRight = mode === "money" ? "Objetivo" : "Máximo";

  const valueLeft =
    mode === "money" ? fmtMoney(safeCurrent) : Number(safeCurrent).toLocaleString();
  const valueRight =
    mode === "money" ? fmtMoney(safeTarget) : Number(safeTarget).toLocaleString();

  const getBadgeText = () => {
    if (raffleStatus === "FINISHED") return "🏆 Sorteo Finalizado";
    if (raffleStatus === "CANCELLED") return "❌ Sorteo Cancelado";
    if (isComplete) return "🎉 ¡Meta Alcanzada!";
    if (displayPercent > 90) return "🔥 ¡Casi completo!";
    if (displayPercent > 50) return "📈 Más de la mitad";
    return "🎯 En progreso";
  };

  const getBadgeClasses = () => {
    if (raffleStatus === "FINISHED") return "bg-purple-500/20 text-purple-300";
    if (raffleStatus === "CANCELLED") return "bg-red-500/20 text-red-300";
    if (isComplete) return "bg-green-500/20 text-green-300";
    return "bg-blue-500/20 text-blue-300";
  };

  const barGradient = isComplete
    ? "from-green-400 via-emerald-500 to-green-600"
    : displayPercent > 75
    ? "from-amber-400 via-orange-500 to-red-500"
    : displayPercent > 50
    ? "from-blue-400 via-purple-500 to-pink-500"
    : "from-cyan-400 via-blue-500 to-indigo-600";

  // Redondeo del relleno
  const fillRadius = displayPercent >= 99.5 ? "rounded-full" : "rounded-r-full";

  // Globito centrado y limitado a bordes (no se sale)
  const bubbleLeft = `min(max(${displayPercent}%, 6%), 94%)`;

  return (
    <div className="w-full max-w-2xl mx-auto p-6 bg-white/10 backdrop-blur-lg rounded-3xl border border-white/20 shadow-2xl relative overflow-hidden">
      {/* Título + badge */}
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-2xl font-bold text-white truncate">{title}</h3>
        <div className={`px-3 py-1 rounded-full text-sm font-bold ${getBadgeClasses()} whitespace-nowrap`}>
          {getBadgeText()}
        </div>
      </div>

      {/* Estadísticas */}
      <div className="grid grid-cols-3 gap-4 mb-6 text-center">
        <div className="bg-white/5 rounded-2xl p-3 backdrop-blur-sm">
          <div className="text-2xl font-bold text-white">{valueLeft}</div>
          <div className="text-sm text-white/70">{labelLeft}</div>
        </div>
        <div className="bg-white/5 rounded-2xl p-3 backdrop-blur-sm">
          <div className="text-2xl font-bold text-white">{displayPercent.toFixed(1)}%</div>
          <div className="text-sm text-white/70">Progreso</div>
        </div>
        <div className="bg-white/5 rounded-2xl p-3 backdrop-blur-sm">
          <div className="text-2xl font-bold text-white">{valueRight}</div>
          <div className="text-sm text-white/70">{labelRight}</div>
        </div>
      </div>

      {/* Barra principal */}
      <div className="relative mb-4">
        <div className="h-8 bg-white/10 rounded-full overflow-hidden shadow-inner">
          {/* Relleno */}
          <div
            className={`h-full bg-gradient-to-r ${barGradient} ${fillRadius} relative transition-[width] duration-700 ease-out shadow-lg`}
            style={{ width: `${animated ? displayPercent : actualPercent}%` }}
          >
            {/* OLITA animada (sólo visual, dentro del relleno) */}
            {wave && (
              <div className="absolute inset-0 pointer-events-none" aria-hidden="true">
                <div className="wave-layer" />
              </div>
            )}
          </div>

          {/* Globito de % posicionado dentro SIN salirse */}
          {displayPercent > 5 && (
            <div
              className="absolute top-0 h-full flex items-center transition-[left] duration-700 ease-out pointer-events-none"
              style={{ left: bubbleLeft }}
            >
              <div className="bg-white text-gray-800 px-2 py-1 rounded-full text-xs font-bold shadow-lg transform -translate-x-1/2 -translate-y-10 whitespace-nowrap">
                {displayPercent.toFixed(1)}%
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Marcas */}
      <div className="flex justify-between text-sm text-white/70 mb-2">
        <span>🎯 Inicio</span>
        <span className={displayPercent >= 50 ? "text-yellow-400 font-semibold" : ""}>
          🔥 50% Medio camino
        </span>
        <span className={isComplete ? "text-green-400 font-semibold animate-pulse" : ""}>
          🏆 ¡Meta!
        </span>
      </div>

      {/* CTA opcional */}
      {showCta && raffleStatus === "ACTIVE" && !isComplete && (
        <div className="mt-6 text-center">
          <button
            type="button"
            onClick={onCtaClick ?? undefined}
            className="bg-gradient-to-r from-purple-500 to-pink-600 hover:from-purple-600 hover:to-pink-700 text-white font-bold py-3 px-8 rounded-full shadow-lg hover:shadow-xl transform hover:scale-105 transition-all duration-200"
          >
            🎟️ Participar ahora
          </button>
        </div>
      )}

      {/* Keyframes locales para la olita */}
      <style jsx>{`
        .wave-layer {
          position: absolute;
          inset: 0;
          /* patrón diagonal sutil */
          background-image: repeating-linear-gradient(
            -45deg,
            rgba(255, 255, 255, 0.12) 0px,
            rgba(255, 255, 255, 0.12) 14px,
            rgba(255, 255, 255, 0.02) 14px,
            rgba(255, 255, 255, 0.02) 28px
          );
          background-size: 200% 100%;
          /* mezcla sutil para integrarse con el gradiente base */
          mix-blend-mode: soft-light;
          will-change: background-position, opacity;
          animation:
            waveSlide ${waveSpeed} linear infinite,
            wavePulse ${waveSpeed} ease-in-out infinite;
        }

        @keyframes waveSlide {
          from { background-position: 0% 0; }
          to   { background-position: 100% 0; }
        }

        @keyframes wavePulse {
          0%, 100% { opacity: 0.35; }
          50%      { opacity: 0.6; }
        }
      `}</style>
    </div>
  );
};

export default ProgressBar;
