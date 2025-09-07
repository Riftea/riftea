"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";

/** Mapas de estado a UI */
const LABEL_BY_STATUS = {
  AVAILABLE: "Disponible",
  IN_RAFFLE: "Participando",
  WINNER: "Ganador",
  LOST: "No ganador",
  ACTIVE: "Activo",
  PENDING: "Pendiente",
  DELETED: "Eliminado",
};

const PILL_BY_STATUS = {
  AVAILABLE: "bg-sky-500/20 text-sky-300",
  IN_RAFFLE: "bg-amber-500/20 text-amber-300",
  WINNER: "bg-yellow-500/20 text-yellow-300",
  LOST: "bg-gray-500/20 text-gray-300",
  ACTIVE: "bg-emerald-500/20 text-emerald-300",
  PENDING: "bg-blue-500/20 text-blue-300",
  DELETED: "bg-rose-500/20 text-rose-300",
};

function isRaffleActive(raffle) {
  const s = raffle?.status;
  return s === "ACTIVE" || s === "PUBLISHED";
}
function isRaffleFinished(raffle) {
  const s = raffle?.status;
  return s === "FINISHED" || s === "COMPLETED";
}

function MisTicketsContent() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();

  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState("");

  // tabs: disponibles | participando | resultados | todos
  const [tab, setTab] = useState("disponibles");

  // toast por query (?new=N)
  const newCount = searchParams.get("new");

  useEffect(() => {
    if (status === "loading") return;
    if (status === "unauthenticated") {
      router.push("/");
      return;
    }
    fetchTickets();
  }, [status, router]);

  async function fetchTickets() {
    try {
      setLoading(true);
      setMsg("");
      const res = await fetch("/api/tickets/my", { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "No se pudieron cargar tus tickets");
      setTickets(Array.isArray(json?.tickets) ? json.tickets : []);
    } catch (e) {
      setMsg(`❌ ${e.message || e}`);
    } finally {
      setLoading(false);
    }
  }

  // Categorización según tu lógica:
  const buckets = useMemo(() => {
    const disponibles = [];
    const participando = [];
    const resultados = [];
    const otros = [];

    for (const t of tickets) {
      const st = t.status;
      const raffle = t.raffle;

      if (st === "AVAILABLE" && !t.raffleId) {
        disponibles.push(t);
        continue;
      }

      if (st === "IN_RAFFLE" || (!!t.raffleId && isRaffleActive(raffle))) {
        participando.push(t);
        continue;
      }

      if (st === "WINNER" || st === "LOST" || isRaffleFinished(raffle)) {
        resultados.push(t);
        continue;
      }

      // fallback para ACTIVE/PENDING sin raffle
      if ((st === "ACTIVE" || st === "PENDING") && !t.raffleId) {
        disponibles.push(t);
      } else {
        otros.push(t);
      }
    }
    return { disponibles, participando, resultados, otros };
  }, [tickets]);

  const shown = useMemo(() => {
    switch (tab) {
      case "disponibles":
        return buckets.disponibles;
      case "participando":
        return buckets.participando;
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
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {[...Array(6)].map((_, i) => (
                <div key={i} className="h-28 rounded-2xl border border-white/10 bg-white/5" />
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-800 pt-20">
      <div className="max-w-6xl mx-auto px-4 py-10">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6">
          <div>
            <h1 className="text-3xl md:text-4xl font-bold text-white">Mis Tickets</h1>
            <p className="text-white/60 mt-1">
              {tickets.length} ticket{tickets.length === 1 ? "" : "s"} •{" "}
              {buckets.participando.length} participando • {buckets.disponibles.length} disponibles •{" "}
              {buckets.resultados.length} resultados
            </p>
          </div>

          {newCount && (
            <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-2 text-emerald-200">
              🎉 Se agregaron {newCount} ticket(s) a tu cuenta
            </div>
          )}
        </div>

        {/* Tabs */}
        <div className="flex flex-wrap gap-2 mb-8">
          {[
            { id: "disponibles", label: "Disponibles" },
            { id: "participando", label: "Participando" },
            { id: "resultados", label: "Resultados" },
            { id: "todos", label: "Todos" },
          ].map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`px-4 py-2 rounded-xl text-sm font-medium transition ${
                tab === t.id ? "bg-white text-slate-900" : "bg-white/10 text-white hover:bg-white/20"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Avisos */}
        {msg && (
          <div className="mb-6 rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-rose-200">
            {msg}
          </div>
        )}

        {/* Vacío */}
        {shown.length === 0 ? (
          <div className="rounded-3xl border border-white/10 bg-white/5 p-10 text-center">
            <div className="text-5xl mb-3">🎫</div>
            <h3 className="text-white text-2xl font-semibold mb-2">Sin tickets en esta vista</h3>
            <p className="text-white/60 mb-6">
              {tab === "disponibles" &&
                "Cuando recibas tickets aparecerán aquí para que los uses en el sorteo que prefieras."}
              {tab === "participando" && "Apenas pegues un ticket a un sorteo, lo verás en esta lista."}
              {tab === "resultados" && "Cuando finalicen tus sorteos, verás tus resultados acá."}
              {tab === "todos" && "Aún no tienes tickets."}
            </p>

            {/* CTA principal para tu modelo: explorar sorteos */}
            <Link
              href="/"
              className="inline-flex items-center gap-2 rounded-xl px-5 py-3 bg-gradient-to-r from-indigo-500 to-fuchsia-500 text-white font-medium hover:opacity-90"
            >
              Explorar sorteos
              <span aria-hidden>→</span>
            </Link>
          </div>
        ) : (
          <TicketsGrid tickets={shown} onRefresh={fetchTickets} />
        )}
      </div>
    </div>
  );
}

/** Grid de tarjetas simplificadas y orientadas a tu flujo */
function TicketsGrid({ tickets }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
      {tickets.map((t) => {
        const statusLabel = LABEL_BY_STATUS[t.status] || t.status;
        const statusPill = PILL_BY_STATUS[t.status] || "bg-white/10 text-white/70";
        const code = t.displayCode || t.code || (t.uuid ? t.uuid.slice(-8) : "—");
        const date = t.generatedAt || t.createdAt;

        const raffle = t.raffle;
        const inRaffle = !!t.raffleId;
        const raffleActive = inRaffle && raffle && (raffle.status === "ACTIVE" || raffle.status === "PUBLISHED");
        const raffleFinished = inRaffle && raffle && (raffle.status === "FINISHED" || raffle.status === "COMPLETED");

        return (
          <div
            key={t.id || t.uuid}
            className="rounded-2xl border border-white/10 bg-white/5 p-4 flex flex-col justify-between"
          >
            <div className="flex items-center justify-between mb-3">
              <span className={`px-2 py-1 rounded-full text-[11px] font-semibold ${statusPill}`}>
                {statusLabel}
              </span>
              <span className="text-white/60 text-xs">
                {date ? new Date(date).toLocaleDateString() : "—"}
              </span>
            </div>

            <div className="text-center mb-4">
              <div className="font-mono text-xl font-bold text-white tracking-wider">{code}</div>
            </div>

            {/* Bloque contexto de sorteo */}
            {inRaffle ? (
              <div className="rounded-xl border border-white/10 bg-white/5 p-3 mb-3">
                <div className="text-white font-medium text-sm truncate">
                  <Link href={`/sorteo/${t.raffleId}`} className="hover:underline">
                    {raffle?.title || "Sorteo"}
                  </Link>
                </div>
                <div className="text-white/60 text-xs mt-1 flex items-center justify-between">
                  <span>
                    Estado: {raffleActive ? "En curso" : raffleFinished ? "Finalizado" : raffle?.status || "—"}
                  </span>
                  {raffle?.endsAt && raffleActive && (
                    <span>Termina: {new Date(raffle.endsAt).toLocaleDateString()}</span>
                  )}
                </div>
              </div>
            ) : (
              <div className="rounded-xl border border-white/10 bg-white/5 p-3 mb-3">
                <div className="text-white/80 text-sm">Aún no pegado a un sorteo</div>
              </div>
            )}

            {/* Acciones */}
            <div className="flex items-center gap-2">
              {!inRaffle && (t.status === "AVAILABLE" || t.status === "ACTIVE" || t.status === "PENDING") && (
                <Link
                  href={`/mis-sorteos?selectTicket=${t.id || t.uuid}`}
                  className="flex-1 inline-flex items-center justify-center gap-2 rounded-lg px-3 py-2 bg-indigo-500/90 text-white text-sm font-medium hover:bg-indigo-500"
                  title="Elegir un sorteo y usar este ticket"
                >
                  Usar en un sorteo
                </Link>
              )}

              {inRaffle && (
                <Link
                  href={`/sorteo/${t.raffleId}`}
                  className="flex-1 inline-flex items-center justify-center gap-2 rounded-lg px-3 py-2 bg-amber-500/90 text-white text-sm font-medium hover:bg-amber-500"
                  title="Ver sorteo"
                >
                  Ver sorteo
                </Link>
              )}

              {raffle && (t.status === "WINNER" || t.status === "LOST" || raffleFinished) && (
                <Link
                  href={`/sorteo/${t.raffleId}`}
                  className="flex-1 inline-flex items-center justify-center gap-2 rounded-lg px-3 py-2 bg-slate-700 text-white text-sm font-medium hover:bg-slate-600"
                  title="Ver resultado"
                >
                  Ver resultado
                </Link>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** Fallback de carga para Suspense */
function MisTicketsLoading() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-800 pt-20">
      <div className="max-w-6xl mx-auto px-4 py-10">
        <div className="animate-pulse space-y-6">
          <div className="h-8 bg-white/10 rounded w-1/3"></div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="h-28 rounded-2xl border border-white/10 bg-white/5" />
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
