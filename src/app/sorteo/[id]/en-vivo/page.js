// src/app/sorteo/[id]/en-vivo/page.js
"use client";

import { use, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

export default function LiveDrawPage({ params }) {
  const { id } = use(params);
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [error, setError]   = useState(null);

  const [raffle, setRaffle] = useState(null);
  const [participants, setParticipants] = useState([]); // [{ id, ticketCode, user, ... }]
  const [eliminated, setEliminated] = useState([]);     // ids en orden de eliminación (primero eliminado, ...)

  const [running, setRunning] = useState(false);
  const [finished, setFinished] = useState(false);

  const [winnerId, setWinnerId] = useState(null);
  const [coinState, setCoinState] = useState("idle");   // idle | spinning | result

  // datos de verificación
  const [commitment, setCommitment] = useState(null);   // ej: "sha256:<hash>"
  const [reveal, setReveal] = useState(null);           // string del secreto

  // refs para limpiar timers
  const intervalRef = useRef(null);
  const timeoutRef  = useRef(null);

  // util: mapa id → participant
  const byId = useMemo(() => {
    const m = new Map();
    for (const p of participants) m.set(p.id, p);
    return m;
  }, [participants]);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const res = await fetch(`/api/raffles/${id}/draw`, { cache: "no-store" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || `Status ${res.status}`);

      const { raffle, participants } = data;
      setRaffle(raffle || null);
      setParticipants(Array.isArray(participants) ? participants : []);
      setCommitment(raffle?.drawSeedHash || null);
      setReveal(raffle?.drawSeedReveal || null);

      const isFinished = Boolean(raffle?.drawnAt);
      setFinished(isFinished);

      // si ya está finalizado, deducimos ganador
      if (isFinished) {
        const w =
          participants?.find?.((p) => p.isWinner) ||
          (raffle?.winnerParticipationId &&
            participants?.find?.((p) => p.id === raffle.winnerParticipationId)) ||
          null;
        if (w) setWinnerId(w.id);
      }
    } catch (e) {
      setError(e.message || "Error al cargar");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
    return () => {
      clearInterval(intervalRef.current);
      clearTimeout(timeoutRef.current);
    };
  }, [load]);

  const canRun = useMemo(() => {
    if (!raffle) return false;
    const now = Date.now();
    const drawAt = raffle.drawAt ? new Date(raffle.drawAt).getTime() : 0;
    return raffle.status === "READY_TO_DRAW" && now >= drawAt && !finished;
  }, [raffle, finished]);

  async function startDraw() {
    try {
      setRunning(true);
      setError(null);
      const res = await fetch(`/api/raffles/${id}/draw`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "run" }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || `Status ${res.status}`);

      // Actualizamos commitment/reveal por si se publican ahora
      if (data?.commitment) setCommitment(data.commitment);
      if (data?.reveal) setReveal(data.reveal);

      // order: [ganador, 2°, 3°, ...]  |  eliminatedDesc: [último eliminado → … → ganador]
      const eliminatedDesc = Array.isArray(data?.eliminatedDesc) ? data.eliminatedDesc.slice() : [];
      const serverWinnerId = Array.isArray(data?.order) ? data.order[0] : null;

      // comenzamos animación de eliminación cada 5s
      animateElimination(eliminatedDesc, serverWinnerId);
    } catch (e) {
      setRunning(false);
      setError(e.message || "No se pudo ejecutar el sorteo");
    }
  }

  function animateElimination(orderDesc, serverWinnerId) {
    // orderDesc: [eliminado último, ..., ganador]
    const queue = orderDesc.slice(); // clon
    if (queue.length < 2) {
      // Caso borde: menos de 2 participantes
      if (queue.length === 1) {
        // si hay uno, debería ser el ganador (server)
        setWinnerId(serverWinnerId || queue[0]);
      }
      setRunning(false);
      setFinished(true);
      return;
    }

    // El intervalo elimina uno cada 5s hasta quedar 2
    intervalRef.current = setInterval(() => {
      setEliminated((prev) => {
        // Si ya vamos a quedar con los 2 últimos, frenamos y pasamos a moneda
        if (queue.length <= 2) {
          clearInterval(intervalRef.current);
          intervalRef.current = null;
          // pequeña pausa antes de la moneda
          timeoutRef.current = setTimeout(() => {
            flipCoin(queue, serverWinnerId);
          }, 1000);
          return prev;
        }
        const out = queue.shift(); // saca el más “tardío” (descendente)
        return [...prev, out];
      });
    }, 5000);
  }

  function flipCoin(lastTwoDesc, serverWinnerId) {
    // lastTwoDesc: [penúltimo, ganador] (porque venimos en descendente)
    // el ganador REAL lo decide el servidor (serverWinnerId)
    const winner = serverWinnerId || lastTwoDesc[1];
    const loser  = lastTwoDesc.find((x) => x !== winner) || lastTwoDesc[0];

    setCoinState("spinning");
    // duramos 2s “girando”
    timeoutRef.current = setTimeout(() => {
      setCoinState("result");
      // agregamos al perdedor a eliminados y marcamos ganador
      setEliminated((prev) => [...prev, loser]);
      setWinnerId(winner);
      setRunning(false);
      setFinished(true);
    }, 2000);
  }

  // helpers UI
  const eliminatedSet = useMemo(() => new Set(eliminated), [eliminated]);
  const stillIn = useMemo(
    () => participants.filter((p) => !eliminatedSet.has(p.id)),
    [participants, eliminatedSet]
  );
  const drawAtLocal = raffle?.drawAt ? new Date(raffle.drawAt).toLocaleString() : "N/A";

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-900 via-blue-900 to-indigo-900 text-white p-6">
      <div className="max-w-5xl mx-auto">
        <div className="mb-4 flex items-center justify-between">
          <button onClick={() => router.back()} className="opacity-80 hover:opacity-100">
            ← Volver
          </button>
          <div className="text-white/70 text-sm">
            Sorteo: <span className="font-mono">{id}</span>
          </div>
        </div>

        <h1 className="text-3xl font-bold mb-2">Sorteo en vivo</h1>

        {loading && <p className="text-white/80">Cargando…</p>}

        {error && (
          <div className="bg-red-500/20 border border-red-500/40 p-4 rounded-xl mb-4">
            {error}
          </div>
        )}

        {raffle && (
          <div className="bg-white/10 border border-white/20 rounded-2xl p-4 mb-4">
            <div className="flex flex-wrap items-center gap-3">
              <div>Status: <b>{raffle.status}</b></div>
              <div>Programado: <b>{drawAtLocal}</b></div>
            </div>
            {(commitment || reveal) && (
              <div className="mt-3 text-sm text-white/80 space-y-1">
                {commitment && (
                  <div>
                    Compromiso:&nbsp;
                    <code className="bg-black/30 px-2 py-1 rounded">{commitment}</code>
                  </div>
                )}
                {reveal && (
                  <div>
                    Reveal:&nbsp;
                    <code className="bg-black/30 px-2 py-1 rounded break-all">{reveal}</code>
                  </div>
                )}
                {commitment && reveal && (
                  <div className="opacity-80">
                    Podés verificar que <code>sha256(reveal) === hash</code>.
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* CTA para ejecutar el sorteo */}
        {canRun && !running && !finished && (
          <button
            onClick={startDraw}
            className="px-6 py-3 bg-emerald-500 hover:bg-emerald-600 rounded-xl font-bold"
          >
            ▶ Ir al sorteo
          </button>
        )}

        {running && (
          <div className="mt-4 text-white/90">Ejecutando… (eliminación cada 5s)</div>
        )}

        {/* Moneda */}
        {coinState !== "idle" && !finished && (
          <div className="mt-6 flex flex-col items-center gap-2">
            <div
              className={`w-16 h-16 rounded-full bg-yellow-400 text-black font-bold flex items-center justify-center ${
                coinState === "spinning" ? "animate-ping" : ""
              }`}
              title="Moneda"
            >
              {coinState === "spinning" ? "🪙" : "✓"}
            </div>
            <div className="text-white/80 text-sm">
              {coinState === "spinning" ? "Cara o cruz..." : "Resultado decidido"}
            </div>
          </div>
        )}

        {/* Eliminados */}
        {!!eliminated.length && (
          <div className="mt-8">
            <h3 className="font-bold mb-2">Eliminados</h3>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
              {eliminated.map((pid, i) => {
                const p = byId.get(pid);
                return (
                  <div key={pid} className="bg-white/10 border border-white/20 rounded-lg p-3 text-sm">
                    <div className="flex items-center justify-between">
                      <span className="opacity-80">#{i + 1}</span>
                      <span className="text-xs bg-white/10 px-2 py-0.5 rounded">
                        {p?.ticketCode || pid.slice(0, 6)}
                      </span>
                    </div>
                    <div className="mt-1 font-medium truncate">
                      {p?.user?.name || "Usuario"}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Aún en juego */}
        {!finished && !!participants.length && (
          <div className="mt-8">
            <h3 className="font-bold mb-2">Aún en juego</h3>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
              {stillIn.map((p) => (
                <div key={p.id} className="bg-white/5 border border-white/10 rounded-lg p-3 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="font-medium truncate">{p.user?.name || "Usuario"}</span>
                    <span className="text-xs bg-white/10 px-2 py-0.5 rounded font-mono">
                      {p.ticketCode || p.id.slice(0, 6)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Ganador */}
        {finished && winnerId && (
          <div className="mt-10 bg-amber-500/20 border border-amber-500/40 rounded-2xl p-8 text-center">
            <div className="text-6xl mb-3">🏆</div>
            <h2 className="text-3xl font-bold">¡Ganador!</h2>
            <div className="mt-3 text-white/90">
              {(() => {
                const w = byId.get(winnerId);
                return (
                  <>
                    <div className="text-xl font-semibold">{w?.user?.name || "Usuario"}</div>
                    <div className="mt-1 font-mono text-white/80">{w?.ticketCode || winnerId}</div>
                  </>
                );
              })()}
            </div>
            <p className="text-white/70 text-sm mt-3">
              Podés auditar el resultado con el <b>compromiso</b> y el <b>reveal</b> publicados.
            </p>
            <div className="mt-4">
              <button
                onClick={() => router.push(`/sorteo/${id}`)}
                className="px-5 py-2 bg-white/20 hover:bg-white/30 rounded-xl"
              >
                Ver publicación del sorteo →
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
