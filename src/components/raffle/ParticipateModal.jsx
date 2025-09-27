// src/components/raffle/ParticipateModal.jsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import Link from "next/link";

/* =========================================================
   Helpers
   ========================================================= */

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

/** Normaliza posibles estructuras de respuesta del backend */
function normalizeParticipateResponse(data, fallbackIds = []) {
  if (Array.isArray(data?.results)) {
    return data.results.map((r) => ({
      ok: !!r?.ok,
      ticketId: r?.ticketId ?? "",
      participation: r?.participation ?? null,
      error: r?.error ?? null,
    }));
  }

  if (Array.isArray(data?.successes) || Array.isArray(data?.failures)) {
    const okSet = new Set((data?.successes ?? []).map((x) => (typeof x === "string" ? x : x?.ticketId)));
    const failList = (data?.failures ?? []).map((f) => ({
      ticketId: f?.ticketId ?? "",
      error: f?.message ?? "No se pudo participar con este ticket",
    }));
    const merged = [];
    for (const id of fallbackIds) {
      if (okSet.has(id)) merged.push({ ok: true, ticketId: id, participation: null, error: null });
    }
    for (const f of failList) merged.push({ ok: false, ticketId: f.ticketId, participation: null, error: f.error });
    return merged;
  }

  if (Array.isArray(data?.data)) {
    return data.data.map((r) => ({
      ok: !!r?.ok,
      ticketId: r?.ticketId ?? "",
      participation: r?.participation ?? null,
      error: r?.error ?? null,
    }));
  }

  return [];
}

/** Convierte un texto a "Oración": primera letra mayúscula, resto minúsculas */
function toSentenceCase(s) {
  const str = String(s || "").trim();
  if (!str) return "";
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
}

/** Pluralización simple para "ticket" y "chance(s)" */
function pluralize(word, n) {
  if (word === "ticket") return n === 1 ? "ticket" : "tickets";
  if (word === "chance") return n === 1 ? "chance" : "chances";
  return word;
}

/* =========================================================
   Componente
   ========================================================= */

export default function ParticipateModal({
  isOpen,
  onClose,
  raffle,     // { id, title, status, ... }
  onSuccess,  // (payload) => void   -> AHORA se llama solo si no hubo fallas
  // Reglas de mínimo
  minTicketsRequired = 1,
  minTicketsIsMandatory = false,
  // Ruta/endpoint hacia la tienda/marketplace
  shopHref = "/marketplace",
}) {
  const { data: session } = useSession();

  const [userTickets, setUserTickets] = useState([]);
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [loading, setLoading] = useState(true);

  // Envío / progreso
  const [participating, setParticipating] = useState(false);
  const [progress, setProgress] = useState({ total: 0, done: 0 });

  // Errores / resultados
  const [error, setError] = useState(null);
  const [results, setResults] = useState(null); // { successes: [...], failures: [{ticketId, message}] }
  const [showSummary, setShowSummary] = useState(true);

  // ⚠️ Aviso especial: alcanzaste el 50% del cupo permitido
  const [capAlert, setCapAlert] = useState(null);

  // Cancelación de fetch al cerrar
  const abortRef = useRef(null);

  const isDrawLocked =
    raffle?.status === "READY_TO_DRAW" || raffle?.status === "FINISHED";

  const prettyTitle = useMemo(
    () => toSentenceCase(raffle?.title || "sorteo"),
    [raffle?.title]
  );

  /* =========================================================
     Carga de tickets del usuario
     ========================================================= */

  useEffect(() => {
    if (!isOpen) return;
    if (!session) return;
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
      // no borramos capAlert para mantener el aviso si volvió USER_CAP
      setResults(null);
      setSelectedIds(new Set());

      const res = await fetch("/api/tickets/my", {
        cache: "no-store",
        signal,
        credentials: "include",
      });
      const data = await safeParseJSON(res);

      if (!res.ok) {
        const msg = data?.error || res.statusText || "No se pudieron cargar tus tickets";
        throw new Error(msg);
      }

      let tickets = [];
      if (Array.isArray(data)) tickets = data;
      else if (Array.isArray(data?.tickets)) tickets = data.tickets;
      else if (Array.isArray(data?.data)) tickets = data.data;

      // ✅ sólo tickets realmente disponibles (GENÉRICOS libres)
      const available = (tickets || []).filter((t) => {
        return t.status === "AVAILABLE" && !t.isUsed && !t.raffleId;
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

  /* =========================================================
     Selección
     ========================================================= */

  const toggleSelect = (ticketId) => {
    setResults(null);
    setError(null);
    setCapAlert(null);
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
    setError(null);
    setCapAlert(null);
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
    return "Ticket";
  };

  const getDisplayCodeById = (id) => {
    const t = userTickets.find((x) => x.id === id);
    return t ? getTicketDisplayCode(t) : (id || "").slice(-6);
  };

  /* =========================================================
     Reglas de mínimo
     ========================================================= */

  // Se considera "mínimo obligatorio" para autoseleccionar incluso si el mínimo es 1
  const hasMandatoryMinimum = minTicketsIsMandatory && minTicketsRequired >= 1;

  // Este flag lo mantenemos para el *enforcement* de "más de 1"
  const needsMinimumOverOne = minTicketsIsMandatory && minTicketsRequired > 1;

  const lacksTicketsToMeetMinimum =
    hasMandatoryMinimum && userTickets.length < minTicketsRequired;

  // 🔹 AUTOPRESELECCIÓN:
  // Si el sorteo exige un mínimo obligatorio (>=1) y hay suficientes, autoselecciona exactamente N.
  useEffect(() => {
    if (!isOpen) return;
    if (!hasMandatoryMinimum) return;
    if (selectedIds.size > 0) return; // no pisar selección manual
    if (userTickets.length === 0) return;

    const preCount = Math.min(minTicketsRequired, userTickets.length);
    if (preCount > 0) {
      const firstN = new Set(userTickets.slice(0, preCount).map((t) => t.id));
      setSelectedIds(firstN);
    }
  }, [isOpen, hasMandatoryMinimum, minTicketsRequired, userTickets, selectedIds.size]);

  /* =========================================================
     Envío
     ========================================================= */

  async function handleParticipate() {
    try {
      if (isDrawLocked) {
        const msg = "El sorteo está programado o finalizado. La participación está deshabilitada.";
        setError(msg);
        return;
      }
      if (!selectedCount) {
        setError("Debes seleccionar al menos un ticket para participar");
        return;
      }

      // ✅ ENFORCE mínimo obligatorio (cuando es >1)
      if (needsMinimumOverOne && selectedCount < minTicketsRequired) {
        setError(
          `Este sorteo requiere un mínimo de ${minTicketsRequired} ${pluralize("ticket", minTicketsRequired)} por participante. Seleccionaste ${selectedCount}.`
        );
        return;
      }

      if (!raffle?.id) {
        setError("Error: ID del sorteo no válido");
        return;
      }

      setParticipating(true);
      setError(null);
      setCapAlert(null);
      setResults(null);
      setShowSummary(true);

      const ids = Array.from(selectedIds);
      setProgress({ total: ids.length, done: 0 });

      const url = `/api/raffles/${encodeURIComponent(String(raffle.id))}/participate`;

      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ ticketIds: ids }),
      });

      const data = await safeParseJSON(res);

      // Estructura de salida unificada
      let successes = [];
      let failures = [];

      if (!res.ok) {
        const msg = data?.error || data?.raw || res.statusText || "No se pudo procesar la participación";
        setError(msg);

        // ⚠️ Aviso explícito si se alcanzó el 50% del cupo
        if (data?.error === "USER_CAP") {
          setCapAlert(
            data?.message ||
              "Alcanzaste el máximo permitido para este sorteo (50% del cupo total)."
          );
        }

        failures = ids.map((ticketId) => ({ ticketId, message: msg }));
      } else {
        const normalized = normalizeParticipateResponse(data, ids);

        if (normalized.length === 0) {
          const msg = data?.message || "Respuesta inesperada del servidor";
          setError(msg);
          failures = ids.map((ticketId) => ({ ticketId, message: msg }));
        } else {
          for (const r of normalized) {
            if (r.ok) {
              successes.push({
                ticketId: r.ticketId,
                data: r.participation || null,
              });
            } else {
              // Detectar mensajes del cap del 50% en el resultado normalizado
              if (
                typeof r.error === "string" &&
                (r.error.includes("50%") ||
                  r.error.toUpperCase().includes("USER_CAP"))
              ) {
                setCapAlert(
                  r.error.includes("50%")
                    ? r.error
                    : "Alcanzaste el máximo permitido para este sorteo (50% del cupo total)."
                );
              }
              failures.push({
                ticketId: r.ticketId || "desconocido",
                message: r.error || "No se pudo participar con este ticket",
              });
            }
          }
        }
      }

      // Mostrar códigos amigables
      successes = successes.map((s) => ({
        ...s,
        displayCode: getDisplayCodeById(s.ticketId),
      }));
      failures = failures.map((f) => ({
        ...f,
        displayCode: getDisplayCodeById(f.ticketId),
      }));

      setResults({ successes, failures });
      setProgress({ total: ids.length, done: ids.length });

      // 👉 SOLO cerramos y llamamos onSuccess si NO hubo fallas
      if (failures.length === 0) {
        if (typeof onSuccess === "function") {
          try {
            onSuccess({ successes, failures });
          } catch {
            /* ignore */
          }
        }
        // Refrescar tickets (opcional) y cerrar
        await loadUserTickets(abortRef.current?.signal);
        setSelectedIds(new Set());
        onClose();
      } else {
        // Hubo fallas → mantenemos el modal abierto, refrescamos tickets pero no cerramos ni llamamos onSuccess
        await loadUserTickets(abortRef.current?.signal);
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
    setCapAlert(null);
    setSelectedIds(new Set());
    onClose();
  }

  if (!isOpen) return null;

  /* =========================================================
     Render
     ========================================================= */

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="pm-title"
        className="bg-gradient-to-br from-purple-900/95 via-blue-900/95 to-indigo-900/95 backdrop-blur-lg rounded-3xl border border-white/20 shadow-2xl max-w-lg w-full max-h-[90vh] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-6 border-b border-white/10">
          <div className="flex justify-between items-center">
            <div>
              <h2 id="pm-title" className="text-2xl font-bold text-white mb-1">
                {`Participar por ${prettyTitle}`}
              </h2>
            </div>
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                handleClose();
              }}
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
        <form
          className="p-6 space-y-6"
          onSubmit={(e) => e.preventDefault()}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.preventDefault();
          }}
        >
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

          {/* ⚠️ Aviso: alcanzaste el 50% del cupo */}
          {!isDrawLocked && capAlert && (
            <div className="bg-amber-500/20 border border-amber-400/40 rounded-2xl p-4">
              <div className="flex items-start gap-3">
                <span className="text-2xl">⚠️</span>
                <div>
                  <h4 className="text-amber-200 font-bold mb-1">Límite alcanzado</h4>
                  <p className="text-amber-100/90 text-sm">
                    {capAlert}
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
              <div className="flex flex-wrap gap-3 justify-center">
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    loadUserTickets(abortRef.current?.signal);
                  }}
                  className="px-6 py-2 bg-purple-500 hover:bg-purple-600 text-white rounded-xl transition-colors"
                >
                  Reintentar
                </button>
                <Link
                  href={shopHref}
                  className="px-6 py-2 bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-100 rounded-xl transition-colors"
                >
                  Comprar tickets
                </Link>
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    handleClose();
                  }}
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
              <div className="flex flex-wrap gap-3 justify-center">
                <Link
                  href={shopHref}
                  className="px-6 py-2 bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-100 rounded-xl transition-colors"
                >
                  Comprar tickets
                </Link>
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    handleClose();
                  }}
                  className="px-6 py-2 bg-white/20 hover:bg-white/30 text-white rounded-xl transition-colors"
                >
                  Cerrar
                </button>
              </div>
            </div>
          )}

          {/* Selección de tickets */}
          {!isDrawLocked && !loading && userTickets.length > 0 && (
            <>
              {/* Info mínima requerida/sugerida */}
              {(minTicketsIsMandatory || minTicketsRequired > 1) && (
                <div
                  className={`rounded-2xl p-4 border ${
                    minTicketsIsMandatory
                      ? "bg-blue-500/15 border-blue-400/30"
                      : "bg-yellow-500/20 border-yellow-500/30"
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <span className="text-2xl">{minTicketsIsMandatory ? "ℹ️" : "ℹ️"}</span>
                    <div className="text-sm">
                      <h4 className={`font-bold mb-1 ${minTicketsIsMandatory ? "text-blue-200" : "text-yellow-300"}`}>
                        {minTicketsIsMandatory ? "Requisito de participación" : "Mínimo sugerido"}
                      </h4>

                      {minTicketsIsMandatory ? (
                        <p className="text-blue-100/90">
                          Se requieren{" "}
                          <b>{minTicketsRequired}</b> {pluralize("ticket", minTicketsRequired)} y{" "}
                          <b>tenés {minTicketsRequired} {pluralize("chance", minTicketsRequired)}</b> de ganar.
                        </p>
                      ) : (
                        <p className="text-yellow-200/90">
                          Se recomienda participar con{" "}
                          <b>{minTicketsRequired}</b> {pluralize("ticket", minTicketsRequired)}.
                        </p>
                      )}

                      {/* Si faltan tickets para llegar al mínimo, mostramos CTA a tienda */}
                      {lacksTicketsToMeetMinimum && (
                        <div className="mt-2">
                          <p className="text-blue-100/80 mb-2">
                            Te faltan{" "}
                            <b>{Math.max(0, minTicketsRequired - userTickets.length)}</b>{" "}
                            {pluralize("ticket", Math.max(0, minTicketsRequired - userTickets.length))} para llegar al mínimo.
                          </p>
                          <Link
                            href={shopHref}
                            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-100 text-xs transition"
                          >
                            🛒 Comprar tickets
                          </Link>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Controles de selección */}
              <div className="flex items-center justify-between">
                <h4 className="text-white font-bold">Selecciona tus tickets:</h4>
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    toggleSelectAll();
                  }}
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

              {/* Indicador de selección actual (chances visibles) */}
              <div className="flex items-center justify-between mt-1">
                <div className="text-white/80 text-xs">
                  Seleccionaste{" "}
                  <b className="text-white">{selectedCount}</b>{" "}
                  {pluralize("ticket", selectedCount)}:{" "}
                  <b className="text-white">{selectedCount}</b>{" "}
                  {pluralize("chance", selectedCount)} de ganar.
                </div>
                {!minTicketsIsMandatory && minTicketsRequired > 1 && (
                  <div className="text-white/60 text-[11px]">
                    Sugerido: {minTicketsRequired} {pluralize("ticket", minTicketsRequired)}
                  </div>
                )}
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

              {/* Progreso (simple) */}
              {participating && (
                <div className="bg-white/10 border border-white/20 rounded-2xl p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-white/80 text-sm">Procesando…</span>
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
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  setShowSummary((v) => !v);
                }}
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
                            title={s.ticketId}
                          >
                            {s.displayCode}
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
                            <span className="font-mono bg-white/10 px-2 py-0.5 rounded" title={f.ticketId}>
                              {f.displayCode}
                            </span>
                            <span className="text-red-200/80">{f.message}</span>
                          </div>
                        ))}
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.preventDefault();
                            retryFailures();
                          }}
                          className="px-4 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white text-sm"
                        >
                          Reintentar fallidos
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.preventDefault();
                            setResults(null);
                          }}
                          className="px-4 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white text-sm"
                        >
                          Limpiar resumen
                        </button>

                        {/* Si hubo fallas por falta de tickets, da acceso rápido a la tienda */}
                        <Link
                          href={shopHref}
                          className="px-4 py-2 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-100 text-sm"
                        >
                          🛒 Comprar más tickets
                        </Link>
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
              type="button"
              onClick={(e) => {
                e.preventDefault();
                handleClose();
              }}
              disabled={participating}
              className="flex-1 py-3 bg-white/10 hover:bg-white/20 disabled:opacity-50 text-white font-bold rounded-xl transition-colors"
            >
              Cerrar
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                handleParticipate();
              }}
              disabled={
                participating ||
                selectedCount === 0 ||
                isDrawLocked ||
                (needsMinimumOverOne && (selectedCount < minTicketsRequired || lacksTicketsToMeetMinimum))
              }
              className="flex-1 py-3 bg-gradient-to-r from-green-500 to-teal-500 hover:from-green-600 hover:to-teal-600 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold rounded-xl shadow-lg hover:shadow-xl transform hover:scale-105 transition-all duration-200"
            >
              {participating ? (
                <div className="flex items-center justify-center gap-2">
                  <div className="animate-spin w-4 h-4 border-2 border-white/30 border-t-white rounded-full"></div>
                  Enviando...
                </div>
              ) : (
                `🎯 Participar con ${selectedCount} ${pluralize("ticket", selectedCount)}`
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
