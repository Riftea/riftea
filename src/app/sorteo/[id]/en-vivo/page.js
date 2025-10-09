// File: src/app/sorteo/[id]/en-vivo/page.js
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Image from "next/image";
import CountdownTimer from "@/components/ui/CountdownTimer";

/* ===================== Helpers UI ===================== */

function isGenericTitle(t) {
  const s = String(t || "").trim().toLowerCase();
  return !s || ["sorteo", "premio", "giveaway", "rifa"].includes(s);
}

/** Title Case simple para español */
function toTitleCaseES(input) {
  if (!input) return input;
  const small = new Set([
    "de","del","y","o","u","la","el","los","las","un","una","unos","unas",
    "con","para","por","en","a","al","vs"
  ]);
  return String(input)
    .toLowerCase()
    .split(/\s+/g)
    .map((w, i) => (i > 0 && small.has(w) ? w : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(" ");
}

function getPrizeName(r) {
  if (!r || typeof r !== "object") return "Premio";
  const direct =
    r.prizeTitle ||
    r.productTitle ||
    r.rewardTitle ||
    r.prize_name ||
    r.productName ||
    r.reward?.name ||
    r.prize?.title ||
    r.prize?.name;
  if (direct && String(direct).trim().length >= 3) return String(direct).trim();

  const t = String(r.title || "").trim();
  if (t && !isGenericTitle(t)) return t;

  const desc = String(r.description || "").trim();
  if (desc) {
    const first = desc.split(/[\.\n]/)[0].replace(/[:\-–—]$/, "").trim();
    if (first && first.length >= 3 && first.length <= 80) return first;
  }
  return "Premio";
}

function getPrizeImageUrl(r) {
  if (!r || typeof r !== "object") return null;
  return (
    r.prizeImageUrl ||
    r.imageUrl ||
    r.coverUrl ||
    r.bannerUrl ||
    r.prize?.imageUrl ||
    null
  );
}

function needsPrizeEnrichment(r) {
  const name = getPrizeName(r);
  return !r || !name || name.toLowerCase() === "premio" || isGenericTitle(r?.title);
}

function toLocal(dt) {
  try { return new Date(dt).toLocaleString(); } catch { return null; }
}

/* ===================== Página ===================== */

export default function LiveDrawPage() {
  const { id } = useParams();
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);

  const [raffle, setRaffle] = useState(null);
  const [participants, setParticipants] = useState([]); // [{ id, ticketCode, user, isWinner? }]
  const [eliminated, setEliminated] = useState([]);     // ids en orden de eliminación

  const [running, setRunning] = useState(false);
  const [finished, setFinished] = useState(false);

  const [winnerId, setWinnerId] = useState(null);
  const [coinState, setCoinState] = useState("idle");   // idle | spinning | result

  // verificabilidad
  const [commitment, setCommitment] = useState(null);
  const [reveal, setReveal] = useState(null);

  // refs / timers
  const didFirstLoad = useRef(false);
  const intervalRef = useRef(null);
  const timeoutRef  = useRef(null);
  const pollRef     = useRef(null);
  const autoStartTriedRef = useRef(false);

  // poster ref (oculto, para html2canvas)
  const posterRef = useRef(null);

  // mapa id → participant
  const byId = useMemo(() => {
    const m = new Map();
    for (const p of participants) m.set(p.id, p);
    return m;
  }, [participants]);

  /* ===================== Carga ===================== */

  const load = useCallback(async () => {
    if (!id) return;
    try {
      setError(null);
      if (!didFirstLoad.current) setLoading(true);
      else setRefreshing(true);

      const res = await fetch(`/api/raffles/${id}/draw`, {
        cache: "no-store",
        credentials: "include",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || `Status ${res.status}`);

      let r = data?.raffle || data;
      const list = Array.isArray(data?.participants) ? data.participants : [];

      if (needsPrizeEnrichment(r)) {
        try {
          const res2 = await fetch(`/api/raffles/${id}`, {
            cache: "no-store",
            credentials: "include",
          });
          const d2json = await res2.json().catch(() => ({}));
          if (res2.ok && d2json) {
            const detail = d2json?.raffle || d2json;
            const merged = { ...detail, ...r };
            merged.prizeTitle =
              r?.prizeTitle ??
              detail?.prizeTitle ??
              detail?.productTitle ??
              detail?.title ??
              r?.title;
            merged.prizeImageUrl =
              r?.prizeImageUrl ??
              detail?.prizeImageUrl ??
              detail?.imageUrl ??
              detail?.coverUrl ??
              detail?.bannerUrl ??
              r?.imageUrl;
            r = merged;
          }
        } catch {}
      }

      setRaffle(r || null);
      setParticipants(list);
      setCommitment(r?.drawSeedHash || data?.commitment || null);
      setReveal(r?.drawSeedReveal || data?.reveal || null);

      const isFinished =
        Boolean(r?.drawnAt) ||
        String(r?.status || "").toUpperCase() === "FINISHED" ||
        list.some((p) => p.isWinner);
      setFinished(isFinished);

      if (isFinished) {
        const w =
          list.find((p) => p.isWinner) ||
          (r?.winnerParticipationId && list.find((p) => p.id === r.winnerParticipationId)) ||
          null;
        if (w) setWinnerId(w.id);
      }

      didFirstLoad.current = true;
    } catch (e) {
      setError(e.message || "Error al cargar");
    } finally {
      if (!didFirstLoad.current) setLoading(false);
      else setRefreshing(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
    return () => {
      clearInterval(intervalRef.current);
      clearTimeout(timeoutRef.current);
      clearInterval(pollRef.current);
    };
  }, [load]);

  useEffect(() => {
    clearInterval(pollRef.current);
    if (!finished && !running) {
      pollRef.current = setInterval(() => void load(), 10000);
    }
    return () => clearInterval(pollRef.current);
  }, [finished, running, load]);

  const canRun = useMemo(
    () => Boolean(!finished && participants.length >= 2),
    [finished, participants.length]
  );

  /* ===================== Red (memo) ===================== */

  const postJson = useCallback(async (url, body) => {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok, status: res.status, data };
  }, []);

  const ensureCommit = useCallback(async (raffleId) => {
    try {
      const st = await fetch(`/api/raffles/${raffleId}/draw`, {
        cache: "no-store",
        credentials: "include",
      });
      const sd = await st.json().catch(() => ({}));
      const existing =
        sd?.raffle?.drawSeedHash || sd?.raffle?.commitment || sd?.commitment || null;
      if (existing) {
        return {
          ok: true,
          commitment: existing,
          reveal: sd?.raffle?.drawSeedReveal || sd?.reveal || null,
        };
      }
    } catch {}

    const attempts = [
      { url: `/api/admin/raffles/${raffleId}/draw`, body: { action: "commit" } },
      { url: `/api/raffles/${raffleId}/draw`,       body: { action: "commit" } },
    ];

    for (const { url, body } of attempts) {
      const { ok, status, data } = await postJson(url, body);
      if (ok) {
        return {
          ok: true,
          commitment: data?.commitment || data?.drawSeedHash || data?.raffle?.drawSeedHash,
          reveal: data?.reveal || data?.raffle?.drawSeedReveal || null,
        };
      }
      if (![401, 403].includes(status)) {
        return { ok: false, error: data?.error || data?.message || "No se pudo crear el compromiso" };
      }
    }

    return { ok: false, error: "No se pudo crear el compromiso (permisos o endpoint ausente)." };
  }, [postJson]);

  const runDraw = useCallback(async (raffleId) => {
    const attempts = [
      { url: `/api/admin/raffles/${raffleId}/draw`, body: { action: "run", notify: true } },
      { url: `/api/raffles/${raffleId}/draw`,       body: { action: "run", notify: true } },
      { url: `/api/raffles/${raffleId}/manual-draw`,body: { notify: true } },
    ];
    for (const { url, body } of attempts) {
      const { ok, data, status } = await postJson(url, body);
      if (ok) return { ok: true, data };

      const msg = String(data?.error || data?.message || "").toLowerCase();
      if ((msg.includes("compromiso") || msg.includes("commit")) && !body.autocommit && url.endsWith("/draw")) {
        const retry = await postJson(url, { ...body, autocommit: true });
        if (retry.ok) return { ok: true, data: retry.data };
      }
      if (![401, 403].includes(status) && !msg.includes("acceso denegado")) {
        return { ok: false, error: data?.error || data?.message || "No se pudo ejecutar el sorteo" };
      }
    }
    return { ok: false, error: "Acceso denegado o endpoint no disponible." };
  }, [postJson]);

  /* ===================== Animación (memo) ===================== */

  const flipCoin = useCallback((lastTwoDesc, serverWinnerId) => {
    const winner = serverWinnerId || lastTwoDesc[1];
    const loser  = lastTwoDesc.find((x) => x !== winner) || lastTwoDesc[0];

    setCoinState("spinning");
    timeoutRef.current = setTimeout(() => {
      setCoinState("result");
      setEliminated((prev) => [...prev, loser]);
      setWinnerId(winner);
      setRunning(false);
      setFinished(true);
      setTimeout(() => void load(), 1200);
    }, 1800);
  }, [load]);

  const animateElimination = useCallback((orderDesc, serverWinnerId) => {
    clearInterval(intervalRef.current);
    clearTimeout(timeoutRef.current);

    const queue = orderDesc.slice();
    setEliminated([]);

    if (queue.length < 2) {
      if (queue.length === 1) setWinnerId(serverWinnerId || queue[0]);
      setRunning(false);
      setFinished(true);
      setTimeout(() => void load(), 1500);
      return;
    }

    intervalRef.current = setInterval(() => {
      setEliminated((prev) => {
        if (queue.length <= 2) {
          clearInterval(intervalRef.current);
          intervalRef.current = null;
          timeoutRef.current = setTimeout(() => {
            flipCoin(queue, serverWinnerId);
          }, 800);
          return prev;
        }
        const out = queue.shift();
        return [...prev, out];
      });
    }, 5000);
  }, [flipCoin, load]);

  /* ===================== Ejecutar sorteo (memo) ===================== */

  const startDraw = useCallback(async () => {
    try {
      setRunning(true);
      setError(null);
      clearInterval(pollRef.current);

      const c = await ensureCommit(id);
      if (!c.ok) {
        setRunning(false);
        setError(c.error || "No se pudo crear el compromiso");
        pollRef.current = setInterval(() => void load(), 10000);
        return;
      }
      if (c.commitment) setCommitment(c.commitment);
      if (c.reveal) setReveal(c.reveal);

      const r = await runDraw(id);
      if (!r.ok) {
        setRunning(false);
        setError(r.error || "No se pudo ejecutar el sorteo");
        pollRef.current = setInterval(() => void load(), 10000);
        return;
      }

      const data = r.data || {};
      const eliminatedDesc = Array.isArray(data?.eliminatedDesc) ? data.eliminatedDesc.slice() : [];
      const serverWinnerId = Array.isArray(data?.order) ? data.order[0] : null;

      animateElimination(eliminatedDesc, serverWinnerId);
    } catch (e) {
      setRunning(false);
      setError(e.message || "No se pudo ejecutar el sorteo");
      pollRef.current = setInterval(() => void load(), 10000);
    }
  }, [id, ensureCommit, runDraw, animateElimination, load]);

  // Auto-start cuando corresponde, incluyendo startDraw en deps
  useEffect(() => {
    if (!raffle) return;
    if (autoStartTriedRef.current) return;
    if (finished || running) return;

    const status = String(raffle.status || "").toUpperCase();
    const okStatus = status === "READY_TO_DRAW" || status === "READY_TO_FINISH";
    if (okStatus && participants.length >= 2) {
      autoStartTriedRef.current = true;
      setTimeout(() => void startDraw(), 400);
    }
  }, [raffle, participants.length, finished, running, startDraw]);

  /* ===================== Datos UI ===================== */

  const eliminatedSet = useMemo(() => new Set(eliminated), [eliminated]);
  const stillIn = useMemo(
    () => participants.filter((p) => !eliminatedSet.has(p.id)),
    [participants, eliminatedSet]
  );

  const finalRanking = useMemo(() => {
    if (!finished || !participants.length) return [];
    const allIds = participants.map(p => p.id);
    const ids = new Set(allIds);
    const ordered = [];

    if (winnerId && ids.has(winnerId)) {
      ordered.push(winnerId);
      ids.delete(winnerId);
    }
    for (const pid of [...eliminated].reverse()) {
      if (ids.has(pid)) {
        ordered.push(pid);
        ids.delete(pid);
      }
    }
    for (const pid of ids) ordered.push(pid);

    return ordered.map((pid, idx) => {
      const p = byId.get(pid);
      return {
        id: pid,
        pos: idx + 1,
        name: (p?.user?.name || "Usuario").trim(),
        code: p?.ticketCode || pid.slice(0, 6),
        isWinner: pid === winnerId || p?.isWinner,
      };
    });
  }, [finished, participants, eliminated, winnerId, byId]);

  const drawAtLocal   = raffle?.drawAt ? toLocal(raffle.drawAt) : null;
  const executedAtRaw = raffle?.drawnAt || raffle?.finishedAt || raffle?.completedAt || raffle?.closedAt || null;
  const executedAtLoc = executedAtRaw ? toLocal(executedAtRaw) : null;

  /* ===================== Confeti ===================== */

  useEffect(() => {
    if (!finished || !winnerId) return;
    if (typeof window === "undefined") return;
    const mq = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    if (mq?.matches) return;

    let mounted = true;
    let intervalId;

    import("canvas-confetti").then(({ default: confetti }) => {
      if (!mounted) return;

      const duration = 2000;
      const end = Date.now() + duration;
      const gravity = 0.8;
      const spread = 70;
      const count = 20;

      intervalId = setInterval(() => {
        if (Date.now() > end) {
          clearInterval(intervalId);
          return;
        }
        confetti({ particleCount: count, angle: 60, spread, origin: { x: 0, y: 0.2 }, startVelocity: 45, gravity });
        confetti({ particleCount: count, angle: 120, spread, origin: { x: 1, y: 0.2 }, startVelocity: 45, gravity });
      }, 180);
    });

    return () => {
      mounted = false;
      clearInterval(intervalId);
    };
  }, [finished, winnerId]);

  /* ===================== Compartir / Póster ===================== */

  async function buildPosterBlob() {
    try {
      const html2canvas = (await import("html2canvas")).default;
      const node = posterRef.current;
      if (!node) return null;

      // Asegura que el nodo esté visible “offscreen”
      node.style.visibility = "visible";
      const canvas = await html2canvas(node, {
        backgroundColor: null,
        useCORS: true,
        scale: 2, // alta resolución
      });
      node.style.visibility = "hidden";

      return await new Promise((resolve) =>
        canvas.toBlob((b) => resolve(b), "image/png", 0.95),
      );
    } catch (e) {
      alert(
        "Para generar el póster instalá el paquete html2canvas.\n" +
        "Ej.: pnpm add html2canvas  (o npm i html2canvas / yarn add html2canvas)"
      );
      return null;
    }
  }

  async function handleShareClick() {
    // Genera póster
    const blob = await buildPosterBlob();
    const url = `${location.origin}/sorteo/${id}`;
    if (!blob) {
      // Fallback: compartir texto/enlace
      try {
        const winnerName = byId.get(winnerId)?.user?.name || "Ganador/a";
        const text = `🎉 ${prizeName}: ganó ${winnerName}! ${url}`;
        if (navigator.share) await navigator.share({ text, url });
        else {
          await navigator.clipboard.writeText(text);
          alert("Enlace copiado ✅");
        }
      } catch {}
      return;
    }

    const file = new File([blob], `resultado-${id}.png`, { type: "image/png" });

    // Share nativo si se puede
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({
          files: [file],
          text: "Resultado del sorteo",
          title: "Resultado del sorteo",
        });
        return;
      } catch {
        // si cancelan, igual dejamos opción de descarga
      }
    }

    // Descarga como fallback
    const dl = document.createElement("a");
    dl.href = URL.createObjectURL(blob);
    dl.download = `resultado-${id}.png`;
    document.body.appendChild(dl);
    dl.click();
    dl.remove();

    // Copia link como plus
    try {
      await navigator.clipboard.writeText(url);
    } catch {}
  }

  /* ===================== Render ===================== */

  const raffleTitle  = raffle?.title || "";
  const showRaffleTitleChip = raffle && !isGenericTitle(raffleTitle);

  const rawPrizeName = getPrizeName(raffle);
  const prizeName    = toTitleCaseES(rawPrizeName);
  const hasRealPrize = prizeName && prizeName.toLowerCase() !== "premio";
  const prizeSubtitle = raffle?.prizeSubtitle || "";
  const prizeImg      = getPrizeImageUrl(raffle);

  // Datos ganador para UI y póster
  const winnerData = useMemo(() => {
    if (!winnerId) return { name: "Ganador/a", ticket: "—" };
    const w = byId.get(winnerId);
    return {
      name: (w?.user?.name || "Ganador/a").trim(),
      ticket: w?.ticketCode || String(winnerId).slice(0, 6),
    };
  }, [winnerId, byId]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#2b265a] via-[#222a6b] to-[#1a1f5d] text-white p-6">
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="mb-4 flex items-center justify-between">
          <button onClick={() => router.back()} className="opacity-80 hover:opacity-100">
            ← Volver
          </button>
          <div className="text-white/60 text-sm">
            ID: <span className="font-mono">{id}</span>
          </div>
        </div>

        <h1 className="text-3xl font-bold mb-2">
          {finished ? "Resultado del sorteo" : "Sorteo en vivo"}
        </h1>

        {showRaffleTitleChip && (
          <div className="mb-3 text-sm text-white/85">
            <span className="px-3 py-1 rounded-full bg-white/10 border border-white/15">
              Sorteo: <b>{raffleTitle}</b>
            </span>
          </div>
        )}

        {loading && !didFirstLoad.current && <p className="text-white/80">Cargando…</p>}
        {!loading && refreshing && !finished && (
          <p className="text-white/50 text-sm">Actualizando…</p>
        )}

        {error && (
          <div className="bg-red-500/20 border border-red-500/40 p-4 rounded-xl mb-4">
            {error}
          </div>
        )}

        {/* ======= En vivo ======= */}
        {!finished && (
          <>
            {raffle && (
              <div className="bg-white/5 border border-white/10 rounded-xl p-4 mb-4">
                <div className="flex flex-wrap items-center gap-3">
                  <div className="font-medium truncate">{raffle?.title || "Sorteo"}</div>
                  <div className="ml-auto">
                    {raffle?.drawAt && (
                      <CountdownTimer
                        mode="draw"
                        endsAt={new Date(raffle.drawAt)}
                        startAt={
                          raffle?.publishedAt
                            ? new Date(raffle.publishedAt)
                            : raffle?.startsAt
                            ? new Date(raffle.startsAt)
                            : undefined
                        }
                        onExpire={() => void load()}
                        compact
                      />
                    )}
                  </div>
                </div>
              </div>
            )}

            {canRun && !running && (
              <button
                onClick={startDraw}
                className="px-4 py-2 text-sm bg-emerald-500 hover:bg-emerald-600 rounded-lg font-bold"
              >
                🎥 Iniciar sorteo en vivo
              </button>
            )}

            {!canRun && (
              <div className="mt-2 text-white/70 text-sm">
                Necesitás al menos 2 participantes para iniciar.
              </div>
            )}

            {running && (
              <div className="mt-4 text-white/90 flex items-center gap-2" role="status" aria-live="polite">
                <span className="inline-block h-4 w-4 rounded-full border-2 border-white border-t-transparent animate-spin"></span>
                Ejecutando… (eliminación cada 5s)
              </div>
            )}
          </>
        )}

        {/* ======= Resultado final ======= */}
        {finished && winnerId && (
          <>
            {/* HERO */}
            <div className="mt-6 relative overflow-hidden rounded-2xl border border-amber-300/40 bg-gradient-to-br from-yellow-300/70 via-amber-300/55 to-rose-300/45 p-6 md:p-8">
              <div className="pointer-events-none absolute inset-0 [background:radial-gradient(60%_80%_at_50%_0%,rgba(255,255,255,0.25),transparent_60%)]" />
              {prizeImg && (
                <div
                  className="pointer-events-none select-none absolute right-6 top-1/2 -translate-y-1/2 
                             w-36 h-36 md:w-52 md:h-52 opacity-25 -rotate-6"
                >
                  <Image
                    src={prizeImg}
                    alt={hasRealPrize ? prizeName : "Premio"}
                    fill
                    className="object-contain drop-shadow-[0_6px_20px_rgba(0,0,0,0.35)]"
                    sizes="(max-width: 768px) 9rem, 13rem"
                  />
                </div>
              )}

              <div className="flex flex-col items-center text-center gap-2 relative">
                <div className="text-4xl">🏆</div>

                <div className="text-[11px] uppercase tracking-[0.2em] text-white/80">Premio</div>
                {hasRealPrize ? (
                  <h2 className="text-3xl md:text-4xl font-extrabold tracking-tight drop-shadow-sm">
                    {prizeName}
                  </h2>
                ) : (
                  <p className="text-sm text-white/70">Premio no informado</p>
                )}
                {prizeSubtitle && <p className="text-sm text-white/80">{prizeSubtitle}</p>}

                <div className="mt-4" aria-live="polite">
                  <div className="text-[11px] uppercase tracking-[0.2em] text-white/70">Ganador/a</div>
                  <div className={`font-black leading-tight drop-shadow ${hasRealPrize ? "text-4xl md:text-5xl" : "text-5xl md:text-6xl"}`}>
                    {winnerData.name}
                  </div>
                  <div className="mt-1 text-white/90 text-sm">
                    con el ticket <span className="font-mono font-semibold">#{winnerData.ticket}</span>
                  </div>
                </div>

                {/* CTAs (más chicos y sin flecha) */}
                <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
                  <button
                    onClick={() => router.push(`/sorteo/${id}`)}
                    className="px-4 py-2 text-sm rounded-lg bg-white/90 text-black font-bold hover:bg-white"
                  >
                    Ver publicación
                  </button>
                  {raffle?.claimUrl && (
                    <a
                      href={raffle.claimUrl}
                      className="px-4 py-2 text-sm rounded-lg bg-white/20 hover:bg-white/30 font-semibold"
                    >
                      Reclamar premio
                    </a>
                  )}
                  <button
                    onClick={handleShareClick}
                    className="px-4 py-2 text-sm rounded-lg bg-black/20 hover:bg-black/30 text-white font-semibold border border-white/25"
                  >
                    Compartir
                  </button>
                </div>
              </div>
            </div>

            {/* Tabla final (podio + resto) */}
            {!!finalRanking.length && (
              <div className="mt-6 bg-white/5 border border-white/10 rounded-2xl p-6">
                <h3 className="text-xl font-bold mb-4">Tabla final</h3>

                <div className="space-y-2 mb-4">
                  {finalRanking.slice(0, 3).map((row) => {
                    const podioCls =
                      row.pos === 1
                        ? "bg-amber-500/25 border-amber-400/50"
                        : row.pos === 2
                        ? "bg-slate-200/20 border-slate-200/40"
                        : "bg-orange-300/15 border-orange-300/40";
                    const medal = row.pos === 1 ? "🥇" : row.pos === 2 ? "🥈" : "🥉";
                    return (
                      <div
                        key={row.id}
                        className={`flex items-center justify-between rounded-xl px-3 py-2 border ${podioCls} transition-transform hover:-translate-y-0.5`}
                      >
                        <div className="flex items-center gap-3">
                          <span className="w-9 h-9 rounded-full flex items-center justify-center text-lg">
                            {medal}
                          </span>
                          <span className="font-semibold">{row.name}</span>
                        </div>
                        <span className="font-mono text-xs px-2 py-0.5 rounded bg-black/20 border border-white/20">
                          #{row.code}
                        </span>
                      </div>
                    );
                  })}
                </div>

                {finalRanking.length > 3 && (
                  <div className="space-y-2">
                    {finalRanking.slice(3).map((row, idx) => (
                      <div
                        key={row.id}
                        className={`flex items-center justify-between rounded-lg px-3 py-2 border transition-colors hover:bg-white/10 ${
                          idx % 2 === 0 ? "bg-white/5 border-white/10" : "bg-white/7 border-white/10"
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <span className="w-8 h-8 rounded-full flex items-center justify-center font-bold bg-white/10 text-white">
                            {row.pos}
                          </span>
                          <span className="font-medium">{row.name}</span>
                        </div>
                        <span className="font-mono text-xs px-2 py-0.5 rounded bg-black/20 border border-white/20">
                          #{row.code}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Transparencia al final */}
            <div className="mt-8">
              <details className="bg-white/5 border border-white/10 rounded-xl p-4">
                <summary className="cursor-pointer font-semibold">🔎 Transparencia y auditoría</summary>
                <div className="mt-3 space-y-2 text-sm text-white/80">
                  {raffle?.status && <div>Estado: <b>{raffle.status}</b></div>}
                  {finished ? (
                    <div>Realizado: <b>{executedAtLoc || drawAtLocal || "—"}</b></div>
                  ) : (
                    raffle?.drawAt && <div>Programado: <b>{drawAtLocal}</b></div>
                  )}
                  {commitment && (
                    <div>
                      Compromiso: <code className="bg-black/30 px-2 py-1 rounded">{commitment}</code>
                    </div>
                  )}
                  {reveal && (
                    <div>
                      Reveal: <code className="bg-black/30 px-2 py-1 rounded break-all">{reveal}</code>
                    </div>
                  )}
                  {commitment && reveal && (
                    <div className="opacity-80">
                      Verificá que <code>sha256(reveal) === hash</code>.
                    </div>
                  )}
                </div>
              </details>
            </div>

            {/* ===== Póster oculto (1080x1920) ===== */}
            <div
              ref={posterRef}
              style={{ width: "1080px", height: "1920px", visibility: "hidden" }}
              className="fixed -left-[9999px] -top-[9999px] pointer-events-none"
              aria-hidden
            >
              <div className="w-full h-full relative overflow-hidden text-white">
                {/* fondo */}
                <div className="absolute inset-0 bg-gradient-to-br from-[#2b265a] via-[#222a6b] to-[#1a1f5d]" />
                <div className="absolute inset-0 opacity-60 bg-gradient-to-t from-amber-400/30 via-fuchsia-400/20 to-transparent" />
                {/* header */}
                <div className="absolute top-60 w-full text-center">
                  <div className="text-7xl">🏆</div>
                  <div className="mt-10 text-3xl tracking-[0.4em] uppercase text-white/85">Premio</div>
                  <div className="mt-6 text-7xl font-extrabold">{prizeName}</div>
                </div>
                {/* ganador */}
                <div className="absolute top-[880px] w-full text-center">
                  <div className="text-2xl tracking-[0.3em] uppercase text-white/70">Ganador/a</div>
                  <div className="mt-4 text-8xl font-black">{winnerData.name}</div>
                  <div className="mt-4 text-3xl">
                    con el ticket <span className="font-mono font-bold">#{winnerData.ticket}</span>
                  </div>
                </div>
                {/* footer */}
                <div className="absolute bottom-80 w-full text-center px-16">
                  {showRaffleTitleChip && (
                    <div className="mx-auto inline-flex items-center px-8 py-4 rounded-full border border-white/20 bg-white/10 text-3xl">
                      Sorteo: <span className="ml-2 font-semibold">{raffleTitle}</span>
                    </div>
                  )}
                  <div className="mt-10 text-white/70 text-2xl">
                    id: <span className="font-mono">{id}</span> • {new Date().toLocaleDateString()}
                  </div>
                  <div className="mt-6 text-3xl font-semibold">riftea</div>
                </div>
                {/* imagen del premio */}
                {prizeImg && (
                  <Image
                    src={prizeImg}
                    alt=""
                    width={460}
                    height={460}
                    className="absolute right-20 bottom-24 object-contain opacity-25 drop-shadow-[0_10px_30px_rgba(0,0,0,0.45)] -rotate-6"
                  />
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
