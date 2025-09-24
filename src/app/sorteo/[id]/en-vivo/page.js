// src/app/sorteo/[id]/en-vivo/page.js
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import CountdownTimer from "@/components/ui/CountdownTimer";

export default function LiveDrawPage() {
  const { id } = useParams();
  const router = useRouter();

  const [loading, setLoading] = useState(true);        // primera carga
  const [refreshing, setRefreshing] = useState(false); // polling suave
  const [error, setError] = useState(null);

  const [raffle, setRaffle] = useState(null);
  const [participants, setParticipants] = useState([]); // [{ id, ticketCode, user, isWinner? }]
  const [eliminated, setEliminated] = useState([]);     // ids en orden de eliminación

  const [running, setRunning] = useState(false);
  const [finished, setFinished] = useState(false);

  const [winnerId, setWinnerId] = useState(null);
  const [coinState, setCoinState] = useState("idle");   // idle | spinning | result

  // verificabilidad
  const [commitment, setCommitment] = useState(null);   // ej: "sha256:<hash>"
  const [reveal, setReveal] = useState(null);           // string del secreto

  // refs / timers
  const didFirstLoad = useRef(false);
  const intervalRef = useRef(null);
  const timeoutRef  = useRef(null);
  const pollRef     = useRef(null);

  // mapa id → participant
  const byId = useMemo(() => {
    const m = new Map();
    for (const p of participants) m.set(p.id, p);
    return m;
  }, [participants]);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      setError(null);
      if (!didFirstLoad.current) {
        setLoading(true);
      } else {
        setRefreshing(true);
      }

      const res = await fetch(`/api/raffles/${id}/draw`, {
        cache: "no-store",
        credentials: "include",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || `Status ${res.status}`);

      const r = data?.raffle || data;
      const list = Array.isArray(data?.participants) ? data.participants : [];
      setRaffle(r || null);
      setParticipants(list);
      setCommitment(r?.drawSeedHash || data?.commitment || null);
      setReveal(r?.drawSeedReveal || data?.reveal || null);

      const isFinished = Boolean(r?.drawnAt || r?.status === "FINISHED" || list.some(p=>p.isWinner));
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
      if (!didFirstLoad.current) {
        setLoading(false);
      } else {
        setRefreshing(false);
      }
    }
  }, [id]);

  // carga inicial + cleanup
  useEffect(() => {
    void load();
    return () => {
      clearInterval(intervalRef.current);
      clearTimeout(timeoutRef.current);
      clearInterval(pollRef.current);
    };
  }, [load]);

  // polling suave mientras no esté finalizado ni corriendo
  useEffect(() => {
    clearInterval(pollRef.current);
    if (!finished && !running) {
      pollRef.current = setInterval(() => {
        void load();
      }, 10000);
    }
    return () => clearInterval(pollRef.current);
  }, [finished, running, load]);

  // Habilitar botón: sin gating por hora; con 2+ participantes y no finalizado.
  const canRun = useMemo(() => {
    return Boolean(!finished && participants.length >= 2);
  }, [finished, participants.length]);

  /* ===================== Helpers de red ===================== */

  async function postJson(url, body) {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok, status: res.status, data };
  }

  async function ensureCommit(raffleId) {
    // 1) Si ya existe, no hacemos nada
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

    // 2) Intentar crearlo (admin → público)
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
  }

  async function runDraw(raffleId) {
    // admin → público → manual-draw (fallback)
    const attempts = [
      { url: `/api/admin/raffles/${raffleId}/draw`, body: { action: "run", notify: true } },
      { url: `/api/raffles/${raffleId}/draw`,       body: { action: "run", notify: true } },
      { url: `/api/raffles/${raffleId}/manual-draw`,body: { notify: true } },
    ];

    for (const { url, body } of attempts) {
      const { ok, data, status } = await postJson(url, body);
      if (ok) return { ok: true, data };

      const msg = String(data?.error || data?.message || "").toLowerCase();
      // si el server soporta autocommit y te lo pide, probamos una vez más
      if ((msg.includes("compromiso") || msg.includes("commit")) && !body.autocommit && url.endsWith("/draw")) {
        const retry = await postJson(url, { ...body, autocommit: true });
        if (retry.ok) return { ok: true, data: retry.data };
      }

      if (![401, 403].includes(status) && !msg.includes("acceso denegado")) {
        return { ok: false, error: data?.error || data?.message || "No se pudo ejecutar el sorteo" };
      }
    }
    return { ok: false, error: "Acceso denegado o endpoint no disponible." };
  }

  /* ===================== Ejecutar sorteo ===================== */

  async function startDraw() {
    try {
      setRunning(true);
      setError(null);
      clearInterval(pollRef.current); // pausamos polling durante la animación

      // 1) Asegurar compromiso (si falta)
      const c = await ensureCommit(id);
      if (!c.ok) {
        setRunning(false);
        setError(c.error || "No se pudo crear el compromiso");
        pollRef.current = setInterval(() => void load(), 10000);
        return;
      }
      if (c.commitment) setCommitment(c.commitment);
      if (c.reveal) setReveal(c.reveal);

      // 2) Ejecutar sorteo
      const r = await runDraw(id);
      if (!r.ok) {
        setRunning(false);
        setError(r.error || "No se pudo ejecutar el sorteo");
        pollRef.current = setInterval(() => void load(), 10000);
        return;
      }

      // 3) Animación con datos del server
      const data = r.data || {};
      const eliminatedDesc = Array.isArray(data?.eliminatedDesc) ? data.eliminatedDesc.slice() : [];
      const serverWinnerId = Array.isArray(data?.order) ? data.order[0] : null;

      animateElimination(eliminatedDesc, serverWinnerId);
    } catch (e) {
      setRunning(false);
      setError(e.message || "No se pudo ejecutar el sorteo");
      pollRef.current = setInterval(() => void load(), 10000);
    }
  }

  function animateElimination(orderDesc, serverWinnerId) {
    clearInterval(intervalRef.current);
    clearTimeout(timeoutRef.current);

    const queue = orderDesc.slice(); // [último eliminado … ganador]
    setEliminated([]);               // limpiamos UI

    if (queue.length < 2) {
      if (queue.length === 1) setWinnerId(serverWinnerId || queue[0]);
      setRunning(false);
      setFinished(true);
      // recarga final para consolidar FINISHED
      setTimeout(() => void load(), 1500);
      return;
    }

    // eliminamos uno cada 5s hasta quedar 2
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
  }

  function flipCoin(lastTwoDesc, serverWinnerId) {
    const winner = serverWinnerId || lastTwoDesc[1];
    const loser  = lastTwoDesc.find((x) => x !== winner) || lastTwoDesc[0];

    setCoinState("spinning");
    timeoutRef.current = setTimeout(() => {
      setCoinState("result");
      setEliminated((prev) => [...prev, loser]);
      setWinnerId(winner);
      setRunning(false);
      setFinished(true);
      // refresco final para que el estado FINISHED quede reflejado
      setTimeout(() => void load(), 1200);
    }, 1800);
  }

  // helpers UI
  const eliminatedSet = useMemo(() => new Set(eliminated), [eliminated]);
  const stillIn = useMemo(
    () => participants.filter((p) => !eliminatedSet.has(p.id)),
    [participants, eliminatedSet]
  );

  // Ranking final estilo “columna” (ganador → resto)
  const finalRanking = useMemo(() => {
    if (!finished || !participants.length) return [];
    const allIds = participants.map(p => p.id);
    const ids = new Set(allIds);
    const ordered = [];

    if (winnerId && ids.has(winnerId)) {
      ordered.push(winnerId);
      ids.delete(winnerId);
    }
    // agregamos el resto en orden inverso de eliminación
    for (const pid of [...eliminated].reverse()) {
      if (ids.has(pid)) {
        ordered.push(pid);
        ids.delete(pid);
      }
    }
    // si quedó alguno (edge cases), los agregamos al final
    for (const pid of ids) ordered.push(pid);

    return ordered.map((pid, idx) => {
      const p = byId.get(pid);
      return {
        id: pid,
        pos: idx + 1,
        name: p?.user?.name || "Usuario",
        code: p?.ticketCode || pid.slice(0, 6),
        isWinner: pid === winnerId || p?.isWinner,
      };
    });
  }, [finished, participants, eliminated, winnerId, byId]);

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
        {!loading && refreshing && <p className="text-white/50 text-sm">Actualizando…</p>}

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
              {raffle.drawAt && !finished && (
                <CountdownTimer
                  className="ml-auto"
                  mode="draw"
                  endsAt={new Date(raffle.drawAt)}
                  startAt={
                    raffle.publishedAt
                      ? new Date(raffle.publishedAt)
                      : raffle.startsAt
                      ? new Date(raffle.startsAt)
                      : undefined
                  }
                  onExpire={() => { void load(); }}
                  compact
                />
              )}
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

        {/* CTA: sin gating por tiempo, con ≥ 2 participantes */}
        {canRun && !running && !finished && (
          <button
            onClick={startDraw}
            className="px-6 py-3 bg-emerald-500 hover:bg-emerald-600 rounded-xl font-bold"
          >
            🎥 Iniciar sorteo en vivo
          </button>
        )}

        {!canRun && !finished && (
          <div className="mt-2 text-white/70 text-sm">
            Necesitás al menos 2 participantes para iniciar.
          </div>
        )}

        {running && (
          <div className="mt-4 text-white/90 flex items-center gap-2">
            <span className="inline-block h-4 w-4 rounded-full border-2 border-white border-t-transparent animate-spin"></span>
            Ejecutando… (eliminación cada 5s)
          </div>
        )}

        {/* Moneda (sin “bounce”) */}
        {coinState !== "idle" && !finished && (
          <div className="mt-6 flex flex-col items-center gap-2">
            <div
              className={`w-16 h-16 rounded-full bg-yellow-400 text-black font-bold flex items-center justify-center ${
                coinState === "spinning" ? "animate-spin" : ""
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

        {/* Eliminados (tiempo real) */}
        {!!eliminated.length && !finished && (
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

        {/* Resultado final + ranking columna estilo MK */}
        {finished && winnerId && (
          <>
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
              {(commitment || reveal) && (
                <p className="text-white/70 text-sm mt-3">
                  Podés auditar el resultado con el <b>compromiso</b> y el <b>reveal</b>.
                </p>
              )}
              <div className="mt-4">
                <button
                  onClick={() => router.push(`/sorteo/${id}`)}
                  className="px-5 py-2 bg-white/20 hover:bg-white/30 rounded-xl"
                >
                  Ver publicación del sorteo →
                </button>
              </div>
            </div>

            {/* Ranking completo en columna */}
            {!!finalRanking.length && (
              <div className="mt-8 bg-white/10 border border-white/20 rounded-2xl p-6">
                <h3 className="text-xl font-bold mb-4">Tabla final</h3>
                <div className="space-y-2">
                  {finalRanking.map((row) => (
                    <div
                      key={row.id}
                      className={`flex items-center justify-between rounded-lg px-3 py-2 border ${
                        row.isWinner
                          ? "bg-amber-500/20 border-amber-400/50"
                          : "bg-white/5 border-white/10"
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <span
                          className={`w-8 h-8 rounded-full flex items-center justify-center font-bold ${
                            row.isWinner ? "bg-amber-500 text-black" : "bg-white/10 text-white"
                          }`}
                        >
                          {row.pos}
                        </span>
                        <span className="font-medium">{row.name}</span>
                      </div>
                      <span className="font-mono text-sm opacity-80">#{row.code}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
