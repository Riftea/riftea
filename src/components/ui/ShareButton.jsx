// components/ui/ShareButton.jsx
"use client";
import { useState, useMemo } from "react";

function ShareIcon({ className = "" }) {
  // Ícono “share-nodes” (tres nodos con dos líneas)
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={className} role="img">
      <path d="M15 8a3 3 0 1 0-2.83-4H12a3 3 0 0 0 3 3z" fill="currentColor"/>
      <path d="M6 15a3 3 0 1 0-2.83 4H3a3 3 0 0 0 3-3z" fill="currentColor"/>
      <path d="M21 15a3 3 0 1 0-2.83 4H18a3 3 0 0 0 3-3z" fill="currentColor"/>
      <path d="M8.7 13.6l6.6-3.2M8.7 16.4l6.6 3.2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
    </svg>
  );
}

export default function ShareButton({
  raffle,
  className = "",
  size = "sm",
  variant = "ghost", // "ghost" | "solid"
  label = "Compartir",
}) {
  const [copied, setCopied] = useState(false);

  const href = typeof window !== "undefined" ? window.location.href : "";
  const applied = Number(
    raffle?.stats?.participationsCount ??
    raffle?._count?.participations ??
    0
  );
  const max = Number(
    raffle?.stats?.maxParticipants ??
    raffle?.maxParticipants ??
    0
  );

  const text = useMemo(() => {
    const base = `No te pierdas la oportunidad de participar por "${raffle?.title || "este premio"}"`;
    const progreso = max ? ` — mirá el progreso (${applied}/${max})` : "";
    return `${base}${progreso} y ¡sumate ahora en Rifteá!`;
  }, [raffle?.title, applied, max]);

  async function handleShare() {
    try {
      const payload = { title: raffle?.title || "Sorteo", text, url: href };
      if (navigator?.share && navigator?.canShare?.(payload)) {
        await navigator.share(payload);
      } else {
        await navigator.clipboard.writeText(href);
        setCopied(true);
        setTimeout(() => setCopied(false), 1800);
      }
    } catch {
      try {
        await navigator.clipboard.writeText(href);
        setCopied(true);
        setTimeout(() => setCopied(false), 1800);
      } catch {}
    }
  }

  const baseClasses =
    variant === "solid"
      ? "bg-white/10 hover:bg-white/20 text-white"
      : "bg-transparent hover:bg-white/10 text-white/90";

  const pad = size === "sm" ? "px-3 py-2 text-xs" : "px-4 py-2 text-sm";

  return (
    <button
      onClick={handleShare}
      className={`inline-flex items-center gap-2 rounded-lg ${pad} ${baseClasses} ${className}`}
      title="Compartir sorteo"
    >
      <ShareIcon className={size === "sm" ? "w-4 h-4" : "w-5 h-5"} />
      {copied ? "¡Enlace copiado!" : label}
    </button>
  );
}
