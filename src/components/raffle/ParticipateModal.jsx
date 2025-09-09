// src/components/raffle/ParticipateModal.jsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useSession } from "next-auth/react";

/** Parseo seguro de JSON para evitar "Unexpected end of JSON" */
async function safeParseJSON(res) {
  try {
    const ct = res.headers.get("content-type") || "";
    if (ct.includes("application/json")) return await res.json();
    const txt = await res.text();
    return { raw: txt };
  } catch {
    return {};
  }
}

export default function ParticipateModal({
  isOpen,
  onClose,
  raffle,     // { id, title, status, ... }
  onSuccess,  // (payload) => void
}) {
  const { data: session } = useSession();

  const [userTickets, setUserTickets] = useState([]);
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [loading, setLoading] = useState(true);

  // Envío secuencial / progreso
  const [participating, setParticipating] = useState(false);
  const [progress, setProgress] = useState({ total: 0, done: 0 });

  // Errores / resultados
  const [error, setError] = useState(null);
  const [results, setResults] = useState(null); // { successes: [...], failures: [{ticketId, message}] }
  const [showSummary, setShowSummary] = useState(true);

  // Cancelación de fetch al cerrar
  const abortRef = useRef(null);

  const isDrawLocked =
    raffle?.status === "READY_TO_DRAW" || raffle?.status === "FINISHED";

  useEffect(() => {
    if (!isOpen) return;
    if (!session) return;
    // Evitar abrir si está bloqueado por estado del sorteo
    if (isDrawLocked) return;

    const ac = new AbortController();
    abortRef.current = ac;
    (async () => {
      await loadUserTickets(ac.signal);
    })();

    return () => {
      ac.abort();
      abortRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, session?.user?.email, raffle?.status]);

  async function loadUserTickets(signal) {
    try {
      setLoading(true);
      setError(null);
      setResults(null);
      setSelectedIds(new Set());

      const res = await fetch("/api/tickets/my", { cache: "no-store", signal });
      const data = await safeParseJSON(res);

      if (!res.ok) {
        const msg = data?.error || res.statusText || "No se pudieron cargar tus tickets";
        throw new Error(msg);
      }

      // Normalización
      let tickets = [];
      if (Array.isArray(data)) tickets = data;
      else if (Array.isArray(data?.tickets)) tickets = data.tickets;
      else if (Array.isArray(data?.data)) tickets = data.data;

      // Filtrar disponibles
      const available = (tickets || []).filter((t) => {
        const isAvailable = t.status === "AVAILABLE";
        const isPendingGeneric = t.status === "PENDING" && !t.raffleId;
        const isNotUsed = !t.isUsed;
        return (isAvailable || isPendingGeneric) && isNotUsed;
      });

      setUserTickets(available);
    } catch (err) {
      if (err?.name === "AbortError") return;
      setError("Error al cargar tus tickets disponibles: " + (err?.message || ""));
      setUserTickets([]);
    } finally {
      setLoading(false);
    }
  }

  // Selección múltiple
  const toggleSelect = (ticketId) => {
    setResults(null);
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(ticketId)) next.delete(ticketId);
      else next.add(ticketId);
      return next;
    });
  };

  const allSelected = useMemo(
    () => userTickets.length > 0 && selectedIds.size === userTickets.length,
    [userTickets, selectedIds]
  );

  const toggleSelectAll = () => {
    setResults(null);
    if (allSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(userTickets.map((t) => t.id)));
    }
  };

  const selectedCount = selectedIds.size;

  // Helpers UI
  const getTicketDisplayCode = (ticket) => {
    if (ticket.displayCode) return ticket.displayCode;
    if (ticket.code) return ticket.code;
    if (ticket.uuid) return ticket.uuid.slice(-8).toUpperCase();
    return (ticket.id || "").slice(-6).toUpperCase();
  };

  const getTicketType = (ticket) => {
    if (ticket.raffleId) return "Ticket específico";
    if (ticket.status === "AVAILABLE") return "Ticket genérico";
    return "Ticket pendiente";
  };

  // Envío secuencial uno a uno
  async function handleParticipate() {
    if (isDrawLocked) {
      setError("El sorteo está programado o finalizado. La participación está deshabilitada.");
      return;
    }
    if (!selectedCount) {
      setError("Debes seleccionar al menos un ticket para participar");
      return;
    }
    if (!raffle?.id) {
      setError("Error: ID del sorteo no válido");
      return;
    }

    setParticipating(true);
    setError(null);
    setResults(null);
    setShowSummary(true);

    const ids = Array.from(selectedIds);
    const successes = [];
    const failures = [];
    setProgress({ total: ids.length, done: 0 });

    try {
      for (let i = 0; i < ids.length; i++) {
        const ticketId = ids[i];

        const res = await fetch(`/api/raffles/${raffle.id}/participate`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ticketId }),
        });

        const data = await safeParseJSON(res);

        if (!res.ok) {
          let msg = data?.error || res.statusText || "Error al participar con este ticket";
          if (res.status === 405) {
            msg =
              "Method Not Allowed. Verifica que el endpoint acepte POST y que la ruta sea correcta.";
          } else if (res.status === 429) {
            msg = "Demasiadas solicitudes. Intenta nuevamente en unos segundos.";
          } else if (/hash|firma|hmac|inválid/i.test(msg)) {
            msg =
              "No pudimos validar la firma del ticket. Si fue emitido con otra clave, pedí re-emisión.";
          } else if (res.status >= 500) {
            msg = "Error de servidor. Intenta de nuevo.";
          }
          failures.push({ ticketId, message: msg });
        } else {
          successes.push({ ticketId, data });
        }

        setProgress((p) => ({ ...p, done: i + 1 }));
      }

      setResults({ successes, failures });

      // Avisar al padre para refrescar participantes (aunque haya fallos parciales)
      if (typeof onSuccess === "function") {
        onSuccess({ successes, failures });
      }

      // Refrescar tickets disponibles
      await loadUserTickets(abortRef.current?.signal);

      // Si todos OK, limpiar selección y cerrar
      if (failures.length === 0) {
        setSelectedIds(new Set());
        onClose();
      }
    } catch (err) {
      setError(err?.message || "Error inesperado al participar");
    } finally {
      setParticipating(false);
    }
  }

  async function retryFailures() {
    if (!results?.failures?.length) return;
    const onlyFailed = new Set(results.failures.map((f) => f.ticketId));
    setSelectedIds(onlyFailed);
    await handleParticipate();
  }

  function handleClose() {
    if (participating) return;
    setError(null);
    setResults(null);
    setSelectedIds(new Set());
    onClose();
  }

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="pm-title"
        className="bg-gradient-to-br from-purple-900/95 via-blue-900/95 to-indigo-900/95 backdrop-blur-lg rounded-3xl border border-white/20 shadow-2xl max-w-lg w-full max-h-[90vh] overflow-hidden"
      >
        {/* Header */}
        <div className="p-6 border-b border-white/10">
          <div className="flex justify-between items-center">
            <div>
              <h2 id="pm-title" className="text-2xl font-bold text-white mb-1">
                Participar en Sorteo
              </h2>
              <p className="text-white/70 text-sm">{raffle?.title || "Cargando..."}</p>
            </div>
            <button
              onClick={handleClose}
              disabled={participating}
              className="text-white/60 hover:text-white transition-colors disabled:opacity-50"
              aria-label="Cerrar"
            >
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* Aviso si el sorteo ya está bloqueado */}
          {isDrawLocked && (
            <div className="bg-yellow-500/20 border border-yellow-500/30 rounded-2xl p-4">
              <div className="flex items-start gap-3">
                <span className="text-2xl">⏳</span>
                <div>
                  <h4 className="text-yellow-300 font-bold mb-1">Participación deshabilitada</h4>
                  <p className="text-yellow-200/80 text-sm">
                    Este sorteo ya fue programado o finalizado. No se pueden agregar más participaciones.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Loading inicial */}
          {!isDrawLocked && loading && (
            <div className="text-center py-6">
              <div className="animate-spin w-8 h-8 border-4 border-white/30 border-t-white rounded-full mx-auto mb-4"></div>
              <p className="text-white/70">Cargando tus tickets...</p>
            </div>
          )}

          {/* Error crítico sin tickets */}
          {!isDrawLocked && !loading && error && userTickets.length === 0 && (
            <div className="text-center py-6">
              <div className="text-6xl mb-4">⚠️</div>
              <h3 className="text-xl font-bold text-white mb-2">Error al cargar tickets</h3>
              <p className="text-white/70 mb-6 text-sm">{error}</p>
              <div className="flex gap-3 justify-center">
                <button
                  onClick={() => loadUserTickets(abortRef.current?.signal)}
                  className="px-6 py-2 bg-purple-500 hover:bg-purple-600 text-white rounded-xl transition-colors"
                >
                  Reintentar
                </button>
                <button
                  onClick={handleClose}
                  className="px-6 py-2 bg-white/20 hover:bg-white/30 text-white rounded-xl transition-colors"
                >
                  Cerrar
                </button>
              </div>
            </div>
          )}

          {/* Sin tickets disponibles */}
          {!isDrawLocked && !loading && !error && userTickets.length === 0 && (
            <div className="text-center py-6">
              <div className="text-6xl mb-4">🎫</div>
              <h3 className="text-xl font-bold text-white mb-2">No tienes tickets disponibles</h3>
              <p className="text-white/70 mb-6">Necesitas comprar o generar tickets para participar.</p>
              <button
                onClick={handleClose}
                className="px-6 py-2 bg-white/20 hover:bg-white/30 text-white rounded-xl transition-colors"
              >
                Cerrar
              </button>
            </div>
          )}

          {/* Selección de tickets */}
          {!isDrawLocked && !loading && userTickets.length > 0 && (
            <>
              {/* Info */}
              <div className="bg-yellow-500/20 border border-yellow-500/30 rounded-2xl p-4">
                <div className="flex items-start gap-3">
                  <span className="text-2xl">ℹ️</span>
                  <div>
                    <h4 className="text-yellow-300 font-bold mb-1">Importante</h4>
                    <p className="text-yellow-200/80 text-sm">
                      Al usar tickets en este sorteo, quedarán vinculados hasta que termine.
                    </p>
                  </div>
                </div>
              </div>

              {/* Controles de selección */}
              <div className="flex items-center justify-between">
                <h4 className="text-white font-bold">Selecciona tus tickets:</h4>
                <button
                  type="button"
                  onClick={toggleSelectAll}
                  className="text-sm px-3 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-white transition-colors"
                >
                  {allSelected ? "Deseleccionar todo" : "Seleccionar todo"}
                </button>
              </div>

              {/* Lista */}
              <div className="space-y-3 max-h-60 overflow-y-auto pr-1">
                {userTickets.map((ticket) => {
                  const checked = selectedIds.has(ticket.id);
                  return (
                    <label
                      key={ticket.id}
                      className={`flex items-center justify-between p-4 rounded-2xl border-2 cursor-pointer transition-all ${
                        checked
                          ? "border-purple-400 bg-purple-500/20"
                          : "border-white/20 bg-white/10 hover:border-white/40 hover:bg-white/20"
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <span className="text-2xl">🎫</span>
                        <div>
                          <div className="font-mono text-white font-bold">
                            {getTicketDisplayCode(ticket)}
                          </div>
                          <div className="text-white/60 text-sm">{getTicketType(ticket)}</div>
                          {ticket.status && (
                            <div className="text-white/40 text-xs">Estado: {ticket.status}</div>
                          )}
                        </div>
                      </div>

                      <input
                        type="checkbox"
                        className="w-5 h-5 accent-purple-500"
                        checked={checked}
                        onChange={() => toggleSelect(ticket.id)}
                        aria-label={`Seleccionar ticket ${getTicketDisplayCode(ticket)}`}
                      />
                    </label>
                  );
                })}
              </div>

              {/* Error general (no crítico) */}
              {error && userTickets.length > 0 && (
                <div className="bg-red-500/20 border border-red-500/30 rounded-2xl p-4">
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">❌</span>
                    <div>
                      <h4 className="text-red-300 font-bold">Error</h4>
                      <p className="text-red-200/80 text-sm">{error}</p>
                    </div>
                  </div>
                </div>
              )}

              {/* Progreso */}
              {participating && (
                <div className="bg-white/10 border border-white/20 rounded-2xl p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-white/80 text-sm">Enviando participaciones…</span>
                    <span className="text-white/80 text-sm">
                      {progress.done}/{progress.total}
                    </span>
                  </div>
                  <div className="w-full h-2 bg-white/10 rounded">
                    <div
                      className="h-2 bg-green-400 rounded"
                      style={{
                        width:
                          progress.total > 0
                            ? `${Math.round((progress.done / progress.total) * 100)}%`
                            : "0%",
                      }}
                    />
                  </div>
                </div>
              )}
            </>
          )}

          {/* Resumen de resultados */}
          {results && (results.successes.length > 0 || results.failures.length > 0) && (
            <div className="space-y-3">
              <button
                onClick={() => setShowSummary((v) => !v)}
                className="text-sm px-3 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-white transition-colors"
              >
                {showSummary ? "Ocultar resumen" : "Mostrar resumen"}
              </button>

              {showSummary && (
                <>
                  {results.successes.length > 0 && (
                    <div className="bg-green-500/20 border border-green-500/30 rounded-2xl p-4">
                      <h4 className="text-green-300 font-bold mb-1">
                        ✅ Participaciones exitosas ({results.successes.length})
                      </h4>
                      <div className="flex flex-wrap gap-2 text-sm">
                        {results.successes.map((s) => (
                          <span
                            key={`s-${s.ticketId}`}
                            className="px-2 py-0.5 rounded bg-green-500/20 border border-green-500/30 font-mono"
                          >
                            {s.ticketId.slice(-6)}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {results.failures.length > 0 && (
                    <div className="bg-red-500/20 border border-red-500/30 rounded-2xl p-4">
                      <h4 className="text-red-300 font-bold mb-2">
                        ❌ No se pudo participar con {results.failures.length} ticket
                        {results.failures.length > 1 ? "s" : ""}
                      </h4>
                      <div className="space-y-1 text-sm">
                        {results.failures.map((f) => (
                          <div key={`f-${f.ticketId}`} className="flex items-start gap-2">
                            <span className="font-mono bg-white/10 px-2 py-0.5 rounded">
                              {f.ticketId.slice(-6)}
                            </span>
                            <span className="text-red-200/80">{f.message}</span>
                          </div>
                        ))}
                      </div>
                      <div className="mt-3 flex gap-2">
                        <button
                          onClick={retryFailures}
                          className="px-4 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white text-sm"
                        >
                          Reintentar fallidos
                        </button>
                        <button
                          onClick={() => setResults(null)}
                          className="px-4 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white text-sm"
                        >
                          Limpiar resumen
                        </button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* Footer acciones */}
          <div className="flex flex-col sm:flex-row gap-3">
            <button
              onClick={handleClose}
              disabled={participating}
              className="flex-1 py-3 bg-white/10 hover:bg-white/20 disabled:opacity-50 text-white font-bold rounded-xl transition-colors"
            >
              Cerrar
            </button>
            <button
              onClick={handleParticipate}
              disabled={participating || selectedCount === 0 || isDrawLocked}
              className="flex-1 py-3 bg-gradient-to-r from-green-500 to-teal-500 hover:from-green-600 hover:to-teal-600 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold rounded-xl shadow-lg hover:shadow-xl transform hover:scale-105 transition-all duration-200"
            >
              {participating ? (
                <div className="flex items-center justify-center gap-2">
                  <div className="animate-spin w-4 h-4 border-2 border-white/30 border-t-white rounded-full"></div>
                  Enviando...
                </div>
              ) : (
                `🎯 Participar con ${selectedCount} ticket${selectedCount > 1 ? "s" : ""}`
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
