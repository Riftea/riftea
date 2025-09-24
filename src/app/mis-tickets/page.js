// src/app/mis-tickets/page.js
"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";

/* ===================== helpers de estado ===================== */
function isRaffleActive(raffle) {
  const s = raffle?.status;
  return s === "ACTIVE" || s === "PUBLISHED" || s === "READY_TO_DRAW";
}
function isRaffleFinished(raffle) {
  const s = raffle?.status;
  return s === "FINISHED" || s === "COMPLETED";
}

/** Estado derivado que usamos para UI */
function computeDisplayStatus(t) {
  const st = t?.status;
  const raffle = t?.raffle;
  const inRaffle = !!t?.raffleId;

  // ganador / perdido tienen prioridad
  if (st === "WINNER") return "WINNER";
  if (st === "LOST") return "LOST";

  // si el sorteo terminó, lo tratamos como resultado (usado)
  if (inRaffle && isRaffleFinished(raffle)) {
    return t?.isWinner ? "WINNER" : "LOST";
  }

  // participando si está pegado a sorteo ACTIVO/PUBLISHED/READY_TO_DRAW o status IN_RAFFLE
  if (st === "IN_RAFFLE" || (inRaffle && isRaffleActive(raffle))) return "IN_RAFFLE";

  // usados (marcados como usados aunque el sorteo siga)
  if (t?.isUsed) return "USED";

  // disponibles
  if ((st === "AVAILABLE" || st === "PENDING" || st === "ACTIVE") && !inRaffle) return "AVAILABLE";

  // fallback
  return st || "UNKNOWN";
}

const LABEL_BY_DISPLAY = {
  AVAILABLE: "Listo para participar",
  IN_RAFFLE: "Participando",
  WINNER: "Ganador",
  LOST: "No ganador",
  USED: "Usado",
  PENDING: "Pendiente",
  ACTIVE: "Activo",
  UNKNOWN: "—",
};

// tono del ticket según estado
function ticketToneByDisplay(display) {
  switch (display) {
    case "AVAILABLE":
      return {
        grad: "from-amber-400 to-orange-500",
        glass: "bg-amber-500/5",
        pill: "bg-gradient-to-r from-amber-400 to-orange-500 text-amber-900",
        edge: "from-white/10 via-amber-400/40 to-white/10",
      };
    case "IN_RAFFLE":
      return {
        grad: "from-indigo-400 to-violet-500",
        glass: "bg-indigo-500/5",
        pill: "bg-gradient-to-r from-indigo-400 to-violet-500 text-indigo-900",
        edge: "from-white/10 via-indigo-400/40 to-white/10",
      };
    case "WINNER":
      return {
        grad: "from-yellow-400 to-amber-500",
        glass: "bg-yellow-500/5",
        pill: "bg-gradient-to-r from-yellow-400 to-amber-500 text-yellow-900",
        edge: "from-white/10 via-yellow-400/40 to-white/10",
      };
    case "LOST":
      return {
        grad: "from-gray-400 to-gray-500",
        glass: "bg-gray-500/5",
        pill: "bg-gradient-to-r from-gray-400 to-gray-500 text-gray-900",
        edge: "from-white/10 via-gray-400/40 to-white/10",
      };
    case "USED":
      return {
        grad: "from-slate-300 to-slate-500",
        glass: "bg-slate-500/5",
        pill: "bg-gradient-to-r from-slate-300 to-slate-500 text-slate-900",
        edge: "from-white/10 via-slate-300/40 to-white/10",
      };
    case "PENDING":
      return {
        grad: "from-blue-400 to-cyan-500",
        glass: "bg-cyan-500/5",
        pill: "bg-gradient-to-r from-blue-400 to-cyan-500 text-blue-900",
        edge: "from-white/10 via-cyan-400/40 to-white/10",
      };
    case "ACTIVE":
      return {
        grad: "from-emerald-400 to-green-500",
        glass: "bg-emerald-500/5",
        pill: "bg-gradient-to-r from-emerald-400 to-green-500 text-emerald-900",
        edge: "from-white/10 via-emerald-400/40 to-white/10",
      };
    default:
      return {
        grad: "from-slate-400 to-slate-500",
        glass: "bg-white/5",
        pill: "bg-white/10 text-white/70",
        edge: "from-white/10 via-white/20 to-white/10",
      };
  }
}

/* ===================== página ===================== */
function MisTicketsContent() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();

  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState("");

  // tabs: activos | disponibles | participando | usados | resultados | todos
  const [tab, setTab] = useState("activos");

  // manejo de borrado
  const [deletingId, setDeletingId] = useState(null);

  // toast por query (?new=N)
  const newCount = searchParams.get("new");

  /* === (A) lectura de rol y asUser solo si SUPERADMIN === */
  const role = String(session?.user?.role || "").toLowerCase();
  const isSuperAdmin = role === "superadmin";

  const asUser = useMemo(() => {
    if (!isSuperAdmin) return "";
    return (searchParams.get("asUser") || "").trim();
  }, [searchParams, isSuperAdmin]);

  useEffect(() => {
    if (status === "loading") return;
    if (status === "unauthenticated") {
      router.push("/");
      return;
    }
    fetchTickets();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  /* === (B) al pedir los tickets, pasar asUser si corresponde === */
  async function fetchTickets() {
    try {
      setLoading(true);
      setMsg("");
      const q = new URLSearchParams();
      if (isSuperAdmin && asUser) q.set("asUser", asUser);
      const res = await fetch(`/api/tickets/my?${q.toString()}`, { cache: "no-store" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || "No se pudieron cargar tus tickets");
      const list = Array.isArray(json?.tickets) ? json.tickets : Array.isArray(json) ? json : [];
      setTickets(list);
    } catch (e) {
      setMsg(`❌ ${e.message || e}`);
    } finally {
      setLoading(false);
    }
  }

  /* === (C) borrar ticket (solo superadmin). Respeta impersonación via ?asUser= === */
  async function handleDeleteTicket(t) {
    if (!isSuperAdmin) return;
    const id = t?.id || t?.uuid;
    if (!id) {
      setMsg("❌ No se pudo identificar el ticket a eliminar.");
      return;
    }
    const code = t?.displayCode || t?.code || (t?.uuid ? t.uuid.slice(-8) : id);
    const confirmMsg = asUser
      ? `¿Eliminar el ticket ${code} como ${asUser}?\nEsta acción no se puede deshacer.`
      : `¿Eliminar el ticket ${code}?\nEsta acción no se puede deshacer.`;

    if (!window.confirm(confirmMsg)) return;

    try {
      setDeletingId(id);
      setMsg("");

      const q = new URLSearchParams();
      if (isSuperAdmin && asUser) q.set("asUser", asUser);

      const res = await fetch(`/api/tickets/${encodeURIComponent(id)}?${q.toString()}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || "No se pudo eliminar el ticket");

      // éxito: sacar de la lista local
      setTickets((prev) => prev.filter((x) => (x.id || x.uuid) !== id));
      setMsg("✅ Ticket eliminado correctamente.");
    } catch (e) {
      setMsg(`❌ ${e.message || e}`);
    } finally {
      setDeletingId(null);
    }
  }

  // categorización
  const buckets = useMemo(() => {
    const disponibles = [];
    const participando = [];
    const usados = [];
    const resultados = [];
    const otros = [];

    for (const t of tickets) {
      const d = computeDisplayStatus(t);

      if (d === "AVAILABLE") {
        disponibles.push(t);
        continue;
      }
      if (d === "IN_RAFFLE") {
        participando.push(t);
        continue;
      }
      if (d === "USED") {
        usados.push(t);
        continue;
      }
      if (d === "WINNER" || d === "LOST" || isRaffleFinished(t?.raffle)) {
        resultados.push(t);
        continue;
      }
      otros.push(t);
    }

    // activos = disponibles + participando
    const activos = [...disponibles, ...participando];

    return { activos, disponibles, participando, usados, resultados, otros };
  }, [tickets]);

  const shown = useMemo(() => {
    switch (tab) {
      case "activos":
        return buckets.activos;
      case "disponibles":
        return buckets.disponibles;
      case "participando":
        return buckets.participando;
      case "usados":
        return buckets.usados;
      case "resultados":
        return buckets.resultados;
      case "todos":
      default:
        return tickets;
    }
  }, [tab, buckets, tickets]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-800 pt-20">
        <div className="max-w-6xl mx-auto px-4 py-10">
          <div className="animate-pulse space-y-6">
            <div className="h-8 bg-white/10 rounded w-1/3"></div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {[...Array(6)].map((_, i) => (
                <div key={i} className="h-16 rounded-lg border border-white/10 bg-white/5" />
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-800 pt-20">
      <style jsx global>{`
        @keyframes shimmer {
          0% { background-position: -200% 0; }
          100% { background-position: 200% 0; }
        }
        .ticket-container:hover { transform: translateY(-3px) scale(1.01); transition: transform 0.3s ease; }
        .ticket-pattern {
          background-image:
            radial-gradient(circle at 10% 20%, rgba(255,255,255,.03) 0%, transparent 20%),
            radial-gradient(circle at 90% 80%, rgba(255,255,255,.03) 0%, transparent 20%);
        }
        .ticket-edge {
          border: 1px solid transparent;
          background-clip: padding-box, border-box;
          background-origin: border-box;
        }
        .ticket-hole { width: 6px; height: 6px; border-radius: 50%; background: rgba(255,255,255,.06); }
      `}</style>

      <div className="max-w-6xl mx-auto px-4 py-10">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6">
          <div>
            <h1 className="text-3xl md:text-4xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-amber-400 to-orange-500">
              Mis Tickets
            </h1>
            <p className="text-white/60 mt-1">
              {tickets.length} ticket{tickets.length === 1 ? "" : "s"} •{" "}
              {buckets.participando.length} participando • {buckets.disponibles.length} disponibles •{" "}
              {buckets.resultados.length} resultados • {buckets.usados.length} usados
            </p>
          </div>

          <div className="flex gap-2">
            <Link
              href="/sorteos"
              className="px-4 py-2 rounded-xl bg-gradient-to-r from-indigo-500 to-fuchsia-500 text-white font-bold hover:shadow-lg hover:shadow-indigo-500/25 transition-all"
            >
              Explorar sorteos públicos →
            </Link>
          </div>

          {newCount && (
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-5 py-3 text-amber-200 flex items-center gap-2">
              <span className="text-2xl animate-pulse">✨</span>
              Se agregaron {newCount} ticket(s) a tu cuenta
            </div>
          )}
        </div>

        {/* (C) Banner de impersonación */}
        {isSuperAdmin && asUser && (
          <div className="rounded-xl border border-blue-500/30 bg-blue-500/10 px-5 py-3 text-blue-200 mb-6">
            <strong>Viendo como:</strong>{" "}
            <code className="px-1.5 py-0.5 bg-white/10 rounded">{asUser}</code>
          </div>
        )}

        {/* Tabs */}
        <div className="flex flex-wrap gap-3 mb-8">
          {[
            { id: "activos", label: "Activos" },
            { id: "disponibles", label: "Disponibles" },
            { id: "participando", label: "Participando" },
            { id: "usados", label: "Usados" },
            { id: "resultados", label: "Resultados" },
            { id: "todos", label: "Todos" },
          ].map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`px-4 py-2 rounded-xl text-sm font-bold transition-all duration-300 relative overflow-hidden ${
                tab === t.id
                  ? "bg-gradient-to-r from-amber-500 to-orange-500 text-amber-900 shadow-lg shadow-amber-500/20"
                  : "bg-white/5 text-white/70 hover:bg-white/10"
              }`}
              type="button"
            >
              {tab === t.id && (
                <span
                  className="absolute inset-0 bg-gradient-to-r from-amber-400/10 to-orange-500/10 animate-shimmer"
                  style={{ backgroundSize: "200% auto" }}
                />
              )}
              {t.label}
            </button>
          ))}
        </div>

        {/* Avisos */}
        {msg && (
          <div className="mb-6 rounded-xl border border-rose-500/30 bg-rose-500/10 px-5 py-4 text-rose-200">
            {msg}
          </div>
        )}

        {/* Vacío */}
        {shown.length === 0 ? (
          <div className="rounded-xl border border-white/10 bg-white/5 p-6 text-center backdrop-blur-sm">
            <div className="text-5xl mb-3">🎫</div>
            <h3 className="text-white text-xl md:text-2xl font-bold mb-2 bg-clip-text text-transparent bg-gradient-to-r from-amber-400 to-orange-500">
              Sin tickets en esta vista
            </h3>
            <p className="text-white/60 mb-6 max-w-md mx-auto text-sm md:text-base">
              {tab === "disponibles" &&
                "Cuando recibas tickets aparecerán aquí para que los uses en el sorteo que prefieras."}
              {tab === "participando" && "Apenas pegues un ticket a un sorteo, lo verás en esta lista."}
              {tab === "resultados" && "Cuando finalicen tus sorteos, verás tus resultados acá."}
              {tab === "usados" && "Aquí verás tickets ya utilizados o asociados a sorteos finalizados."}
              {tab === "activos" && "Mira tus tickets listos o ya participando en sorteos en curso."}
              {tab === "todos" && "Aún no tienes tickets."}
            </p>

            <Link
              href="/sorteos"
              className="inline-flex items-center gap-2 rounded-xl px-5 py-2.5 bg-gradient-to-r from-indigo-500 to-fuchsia-500 text-white font-bold hover:shadow-lg hover:shadow-indigo-500/25 transition-all duration-300 text-sm md:text-base"
            >
              Explorar sorteos públicos
              <span aria-hidden className="ml-1">→</span>
            </Link>
          </div>
        ) : (
          <TicketsGrid
            tickets={shown}
            isSuperAdmin={isSuperAdmin}
            asUser={asUser}
            onDelete={handleDeleteTicket}
            deletingId={deletingId}
          />
        )}
      </div>
    </div>
  );
}

/* ===================== grid ===================== */
function TicketsGrid({ tickets, isSuperAdmin, asUser, onDelete, deletingId }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {tickets.map((t) => {
        const display = computeDisplayStatus(t);
        const statusLabel = LABEL_BY_DISPLAY[display] || display;
        const tone = ticketToneByDisplay(display);
        const code = t.displayCode || t.code || (t.uuid ? t.uuid.slice(-8) : "—");
        const date = t.generatedAt || t.createdAt;

        const raffle = t.raffle;
        const inRaffle = !!t.raffleId;
        const raffleActive = inRaffle && raffle && isRaffleActive(raffle);
        const raffleFinished = inRaffle && raffle && isRaffleFinished(raffle);

        const idKey = t.id || t.uuid;
        const isDeletingThis = deletingId === idKey;

        return (
          <div key={idKey} className="ticket-container relative group">
            {/* Botón eliminar (solo superadmin) */}
            {isSuperAdmin && (
              <div className="absolute top-1 right-1 z-20">
                <button
                  type="button"
                  onClick={() => onDelete(t)}
                  disabled={isDeletingThis}
                  className={`text-xs font-bold px-2 py-1 rounded-lg border transition-all ${
                    isDeletingThis
                      ? "border-white/20 text-white/60 bg-white/5 cursor-not-allowed"
                      : "border-rose-500/40 text-rose-200 hover:bg-rose-500/10"
                  }`}
                  title={asUser ? `Eliminar ticket como ${asUser}` : "Eliminar ticket"}
                >
                  {isDeletingThis ? "Eliminando…" : "🗑️ Eliminar"}
                </button>
              </div>
            )}

            {/* Ticket horizontal compacto (proporción 3:1) */}
            <div className="relative" style={{ paddingTop: "33.33%" }}>
              <div
                className={`rounded-md p-2 absolute inset-0 flex items-center transition-all duration-300 ticket-pattern ticket-edge`}
                style={{
                  backgroundImage: `
                    linear-gradient(135deg, #1e293b, #0f172a),
                    linear-gradient(to right, rgba(255,255,255,.1), ${tone.edge}, rgba(255,255,255,.1))
                  `,
                }}
              >
                {/* perforaciones visuales */}
                <div className="absolute top-1/2 left-2 -translate-y-1/2 flex flex-col gap-1.5">
                  {[...Array(5)].map((_, i) => (
                    <div key={i} className="ticket-hole opacity-60" />
                  ))}
                </div>
                <div className="absolute top-1/2 right-2 -translate-y-1/2 flex flex-col gap-1.5">
                  {[...Array(5)].map((_, i) => (
                    <div key={i} className="ticket-hole opacity-60" />
                  ))}
                </div>

                <div className={`flex w-full h-full ${tone.glass} rounded-md`}>
                  {/* código + estado */}
                  <div className="flex-1 min-w-0 pr-2 p-1">
                    <div className="flex items-center justify-between mb-1">
                      <span
                        className={`px-1.5 py-0.5 rounded-full text-xs font-bold ${tone.pill} backdrop-blur-sm border border-white/10`}
                      >
                        {statusLabel}
                      </span>
                      <span className="text-white/50 text-xs whitespace-nowrap">
                        {date
                          ? new Date(date).toLocaleDateString("es-ES", {
                              day: "2-digit",
                              month: "2-digit",
                            })
                          : "—"}
                      </span>
                    </div>

                    <div className="font-mono text-base font-bold text-white tracking-widest relative h-6">
                      <div className="relative z-10 flex items-center h-full">
                        {String(code)
                          .split("")
                          .map((char, i) => (
                            <span
                              key={i}
                              className="inline-block transition-transform duration-300 group-hover:-translate-y-px"
                              style={{ transitionDelay: `${i * 10}ms` }}
                            >
                              {char}
                            </span>
                          ))}
                      </div>
                      <div
                        className={`absolute inset-x-0 bottom-0 h-px bg-gradient-to-r ${`from-transparent via-${tone.grad} to-transparent`.replace(
                          "via-",
                          "via-"
                        )} opacity-40`}
                      />
                    </div>
                  </div>

                  {/* bloque de sorteo / CTA */}
                  <div className="w-44 flex-shrink-0 pl-2 border-l border-white/10 flex items-stretch">
                    {inRaffle ? (
                      <div className="pl-2 py-1 flex flex-col justify-center w-full">
                        <div className="text-white font-medium text-xs truncate">
                          <Link
                            href={`/sorteo/${t.raffleId}`}
                            className="hover:text-amber-300 transition-colors flex items-center gap-0.5"
                          >
                            {raffle?.title || "Sorteo"}
                            <span className="opacity-0 group-hover:opacity-100 transition-opacity">→</span>
                          </Link>
                        </div>
                        <div className="text-white/50 text-xs mt-0.5 flex items-center justify-between">
                          <span>
                            {raffleActive ? "En curso" : raffleFinished ? "Finalizado" : "—"}
                          </span>
                          {raffle?.endsAt && (
                            <span className="bg-amber-500/10 px-0.5 py-0.25 rounded text-amber-200 text-[10px] whitespace-nowrap">
                              {new Date(raffle.endsAt).toLocaleDateString("es-ES", {
                                day: "2-digit",
                                month: "2-digit",
                              })}
                            </span>
                          )}
                        </div>
                        {raffleFinished && (
                          <div className="mt-1 text-[11px]">
                            {t.status === "WINNER" ? (
                              <span className="text-amber-300 font-semibold">🏆 Ganador</span>
                            ) : (
                              <span className="text-white/60">Resultado disponible</span>
                            )}
                          </div>
                        )}
                      </div>
                    ) : (
                      <Link
                        href={`/sorteos?selectTicket=${encodeURIComponent(idKey)}`}
                        className={`pl-2 rounded-l border-l border-white/10 h-full w-full flex items-center cursor-pointer hover:bg-white/5 transition-colors bg-gradient-to-br ${`from-${tone.grad}`.replace(
                          "from-",
                          "from-"
                        )} bg-clip-padding`}
                        title="Elegir un sorteo y usar este ticket"
                      >
                        <div className="text-center w-full">
                          <div className="text-amber-300 text-xs font-bold flex items-center justify-center gap-0.5">
                            <span className="animate-pulse">✨</span>
                            Usar en sorteo
                          </div>
                          <div className="text-white/60 text-[10px]">Buscar sorteos públicos</div>
                        </div>
                      </Link>
                    )}
                  </div>
                </div>

                {/* cinta superior decorativa */}
                <div
                  className={`absolute -top-px left-0 right-0 h-1 bg-gradient-to-r ${`from-transparent via-${tone.grad} to-transparent`.replace(
                    "via-",
                    "via-"
                  )} opacity-60`}
                />
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ===================== Suspense fallback ===================== */
function MisTicketsLoading() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-800 pt-20">
      <div className="max-w-6xl mx-auto px-4 py-10">
        <div className="animate-pulse space-y-6">
          <div className="h-8 bg-white/10 rounded w-1/3"></div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="h-16 rounded-lg border border-white/10 bg-white/5" />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function MisTicketsPage() {
  return (
    <Suspense fallback={<MisTicketsLoading />}>
      <MisTicketsContent />
    </Suspense>
  );
}
