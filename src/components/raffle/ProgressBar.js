// src/components/raffle/ProgressBar.js
import React, { useEffect, useState } from "react";

/**
 * Barra de progreso reutilizable.
 * Soporta dos modos:
 *  - mode="count": muestra cantidades (p.ej. participantes) → sin $.
 *  - mode="money": muestra dinero con formato moneda.
 *
 * También puede renderizar un botón de CTA opcional (showCta + onCtaClick).
 */
const ProgressBar = ({
  current = 0,
  target = 100,
  title = "Progreso",
  mode = "count",              // "count" | "money"
  currency = "ARS",
  animated = true,
  raffleStatus = "ACTIVE",     // para el badge
  showCta = false,             // mostrar/ocultar CTA
  onCtaClick = null,           // handler del CTA (ej: abrir modal)
}) => {
  const [displayPercent, setDisplayPercent] = useState(0);
  const [isComplete, setIsComplete] = useState(false);
  const [justCompleted, setJustCompleted] = useState(false);

  const safeTarget = Math.max(1, Number(target) || 1);
  const safeCurrent = Math.max(0, Number(current) || 0);
  const actualPercent = Math.min((safeCurrent / safeTarget) * 100, 100);

  useEffect(() => {
    const t = setTimeout(() => {
      setDisplayPercent(actualPercent);
      if (actualPercent >= 100 && !isComplete) {
        setIsComplete(true);
        setJustCompleted(true);
        setTimeout(() => setJustCompleted(false), 3000);
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

  // Etiquetas según modo
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

  return (
    <div className="w-full max-w-2xl mx-auto p-6 bg-white/10 backdrop-blur-lg rounded-3xl border border-white/20 shadow-2xl relative overflow-hidden">
      {/* Título + badge */}
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-2xl font-bold text-white">{title}</h3>
        <div className={`px-3 py-1 rounded-full text-sm font-bold ${getBadgeClasses()}`}>
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
          <div
            className={`h-full bg-gradient-to-r ${barGradient} relative transition-all duration-900 ease-out shadow-lg`}
            style={{ width: `${animated ? displayPercent : actualPercent}%` }}
          >
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent animate-pulse" />
          </div>

          {displayPercent > 5 && (
            <div
              className="absolute top-0 h-full flex items-center transition-all duration-900 ease-out"
              style={{ left: `${Math.max(displayPercent - 5, 0)}%` }}
            >
              <div className="bg-white text-gray-800 px-2 py-1 rounded-full text-xs font-bold shadow-lg transform -translate-y-10">
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
    </div>
  );
};

export default ProgressBar;
