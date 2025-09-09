// src/app/sorteos/page.js
"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import ProgressBar from "@/components/raffle/ProgressBar";

const PER_PAGE = 12;

export default function SorteosPublicosPage() {
  const [q, setQ] = useState("");
  const [sortBy, setSortBy] = useState("createdAt"); // 'createdAt' | 'participants' | 'timeLeft'
  const [order, setOrder] = useState("desc"); // 'asc' | 'desc'
  const [page, setPage] = useState(1);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [ticketPrice, setTicketPrice] = useState(null);

  const [favorites, setFavorites] = useState([]);
  const [showOnlyFavs, setShowOnlyFavs] = useState(false);
  const [selectedTicketId, setSelectedTicketId] = useState(null);

  // Lee ?selectTicket de la URL (si venimos desde Mis tickets)
  useEffect(() => {
    if (typeof window !== "undefined") {
      const sp = new URLSearchParams(window.location.search);
      const tid = sp.get("selectTicket");
      if (tid) setSelectedTicketId(tid);
    }
  }, []);

  // Lee favoritos de localStorage
  useEffect(() => {
    try {
      const stored = JSON.parse(localStorage.getItem("favRaffles") || "[]");
      setFavorites(Array.isArray(stored) ? stored : []);
    } catch {
      setFavorites([]);
    }
  }, []);

  const toggleFav = (id) => {
    setFavorites((prev) => {
      let next;
      if (prev.includes(id)) {
        next = prev.filter((x) => x !== id);
      } else {
        next = [...prev, id];
      }
      try {
        localStorage.setItem("favRaffles", JSON.stringify(next));
      } catch {
        // ignore quota errors
      }
      return next;
    });
  };

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);

      // El backend no conoce "timeLeft": lo mapeamos a createdAt y lo ordenamos en cliente
      const serverSortBy = sortBy === "timeLeft" ? "createdAt" : sortBy;

      const params = new URLSearchParams({
        q,
        sortBy: serverSortBy,
        order,
        page: String(page),
        perPage: String(PER_PAGE),
      });

      const res = await fetch(`/api/raffles/public?${params}`, { cache: "no-store" });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(data?.error || `Error ${res.status}`);
      }

      let list = Array.isArray(data.items) ? data.items : [];

      // Orden especial por tiempo restante en el cliente
      if (sortBy === "timeLeft") {
        list = [...list].sort((a, b) => {
          const now = Date.now();
          const aLeft = a?.endsAt ? new Date(a.endsAt).getTime() - now : Number.POSITIVE_INFINITY;
          const bLeft = b?.endsAt ? new Date(b.endsAt).getTime() - now : Number.POSITIVE_INFINITY;
          return order === "asc" ? aLeft - bLeft : bLeft - aLeft;
        });
      }

      setItems(list);
      setTotal(Number.isFinite(data.total) ? data.total : list.length);

      // Precio (solo informativo) desde meta o primer item (unitPrice)
      const price =
        data?.meta?.ticketPrice ??
        (list.length > 0 ? list[0]?.unitPrice ?? list[0]?.derivedTicketPrice ?? null : null);
      setTicketPrice(price);
    } catch (err) {
      console.error("Error cargando sorteos públicos:", err);
      setError(err.message || "No se pudieron cargar los sorteos públicos");
      setItems([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, sortBy, order, page]);

  const visibleItems = useMemo(() => {
    if (!showOnlyFavs) return items;
    return items.filter((it) => favorites.includes(it.id));
  }, [items, showOnlyFavs, favorites]);

  const totalPages = useMemo(() => {
    const base = showOnlyFavs ? visibleItems.length : total;
    return Math.max(1, Math.ceil(base / PER_PAGE));
  }, [showOnlyFavs, visibleItems.length, total]);

  const timeLeftText = (endsAt) => {
    if (!endsAt) return "Sin fecha límite";
    const diffMs = new Date(endsAt).getTime() - Date.now();
    if (diffMs <= 0) return "Finalizado";
    const mins = Math.floor(diffMs / 60000);
    if (mins < 60) return `Faltan ${mins} min`;
    const hrs = Math.floor(mins / 60);
    const rem = mins % 60;
    if (hrs < 24) return `Faltan ${hrs}h ${rem}m`;
    const days = Math.floor(hrs / 24);
    return `Faltan ${days} día(s)`;
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-800 text-slate-50">
      {/* Header */}
      <div className="sticky top-0 z-10 backdrop-blur-md bg-slate-950/70 border-b border-slate-800">
        <div className="max-w-6xl mx-auto px-4 py-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-indigo-400 to-purple-400">
              Sorteos públicos
            </h1>
            <p className="text-slate-400 text-sm">Descubrí sorteos activos de toda la comunidad</p>
          </div>

          <div className="flex gap-2">
            <Link
              href="/mis-tickets"
              className="px-4 py-2 rounded-lg border border-slate-700/50 text-slate-300 hover:bg-slate-800/40 transition"
            >
              Mis tickets
            </Link>
          </div>
        </div>
      </div>

      {/* Banner si venimos con un ticket a usar */}
      {selectedTicketId && (
        <div className="max-w-6xl mx-auto px-4 pt-4">
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-amber-200 text-sm">
            <span className="mr-2">🎫</span>
            Elegí un sorteo para usar tu ticket <strong>#{String(selectedTicketId).slice(-6)}</strong>. Al entrar al sorteo, presioná “Participar con ticket”.
          </div>
        </div>
      )}

      {/* Filtros */}
      <div className="max-w-6xl mx-auto px-4 py-4">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <div className="md:col-span-2">
            <input
              value={q}
              onChange={(e) => {
                setPage(1);
                setQ(e.target.value);
              }}
              placeholder="Buscar por título o descripción..."
              className="w-full px-4 py-3 rounded-xl bg-slate-900/60 border border-slate-700/50 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 text-slate-200"
            />
          </div>

          <div className="flex gap-2">
            <select
              value={sortBy}
              onChange={(e) => {
                setPage(1);
                setSortBy(e.target.value);
              }}
              className="flex-1 px-3 py-3 rounded-xl bg-slate-900/60 border border-slate-700/50 text-slate-200"
            >
              <option value="createdAt">Ordenar por: creación</option>
              <option value="participants">Ordenar por: participantes</option>
              <option value="timeLeft">Ordenar por: tiempo restante</option>
            </select>

            <select
              value={order}
              onChange={(e) => {
                setPage(1);
                setOrder(e.target.value);
              }}
              className="px-3 py-3 rounded-xl bg-slate-900/60 border border-slate-700/50 text-slate-200"
            >
              <option value="desc">Desc</option>
              <option value="asc">Asc</option>
            </select>
          </div>

          <label className="inline-flex items-center gap-2 px-3 py-3 rounded-xl bg-slate-900/60 border border-slate-700/50 text-slate-200 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={showOnlyFavs}
              onChange={(e) => setShowOnlyFavs(e.target.checked)}
              className="h-4 w-4"
            />
            Solo favoritos
          </label>
        </div>
      </div>

      {/* Contenido */}
      <div className="max-w-6xl mx-auto px-4 pb-12">
        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className="h-64 rounded-2xl border border-slate-800 bg-slate-900/40 animate-pulse"
              />
            ))}
          </div>
        ) : error ? (
          <div className="p-6 rounded-2xl border border-rose-900/30 bg-rose-900/10">
            <div className="text-rose-300 font-semibold mb-1">Error</div>
            <div className="text-rose-200/80">{error}</div>
          </div>
        ) : visibleItems.length === 0 ? (
          <div className="p-6 rounded-2xl border border-slate-800 bg-slate-900/40 text-slate-300 text-center">
            Aún no hay sorteos disponibles.
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {visibleItems.map((r) => {
                const participants = r?._count?.participations || 0;
                const max = r?.maxParticipants || null;
                const timeLeft = timeLeftText(r?.endsAt);

                return (
                  <div
                    key={r.id}
                    className="group rounded-2xl border border-slate-800 bg-slate-900/50 overflow-hidden hover:border-slate-700/60 transition"
                  >
                    <div className="relative aspect-[16/9] bg-slate-800">
                      {r?.imageUrl ? (
                        <Image
                          src={r.imageUrl}
                          alt={r.title || "Sorteo"}
                          fill
                          sizes="(max-width: 768px) 100vw, 33vw"
                          className="object-cover"
                        />
                      ) : (
                        <div className="absolute inset-0 grid place-items-center text-slate-500">
                          Sin imagen
                        </div>
                      )}
                      <button
                        onClick={() => toggleFav(r.id)}
                        className="absolute top-2 right-2 p-2 rounded-full bg-black/50 hover:bg-black/70 text-yellow-300"
                        aria-label="Favorito"
                        title="Marcar como favorito"
                        type="button"
                      >
                        {favorites.includes(r.id) ? "★" : "☆"}
                      </button>
                    </div>

                    <div className="p-4 space-y-3">
                      <div className="flex items-start justify-between gap-3">
                        <h3 className="text-slate-100 font-semibold line-clamp-2">
                          {r?.title || "Sorteo"}
                        </h3>
                        <span
                          className={`px-2 py-0.5 rounded text-xs ${
                            r?.status === "ACTIVE"
                              ? "bg-emerald-900/30 text-emerald-300"
                              : "bg-indigo-900/30 text-indigo-300"
                          }`}
                        >
                          {r?.status || "—"}
                        </span>
                      </div>

                      <p className="text-slate-400 text-sm line-clamp-2">
                        {r?.description || "Sin descripción"}
                      </p>

                      <div className="space-y-2">
                        <div className="flex justify-between text-xs text-slate-400">
                          <span>Participantes</span>
                          <span>
                            {participants}
                            {max ? ` / ${max}` : " / ∞"}
                          </span>
                        </div>
                        <ProgressBar
                          current={participants}
                          target={max || Math.max(1, participants)}
                          animated
                        />
                      </div>

                      <div className="flex items-center justify-between text-xs text-slate-400 pt-1">
                        <div className="flex items-center gap-2">
                          {r?.owner?.image ? (
                            <Image
                              src={r.owner.image}
                              alt={r.owner.name || "Organizador"}
                              width={20}
                              height={20}
                              className="rounded-full"
                            />
                          ) : (
                            <div className="w-5 h-5 rounded-full bg-slate-700" />
                          )}
                          <span className="truncate max-w-[140px]">
                            {r?.owner?.name || "Organizador"}
                          </span>
                        </div>
                        <span>{timeLeft}</span>
                      </div>

                      <Link
                        href={`/sorteo/${r.id}${
                          selectedTicketId ? `?use=${encodeURIComponent(selectedTicketId)}` : ""
                        }`}
                        className="mt-2 block w-full text-center px-3 py-2 rounded-lg bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white text-sm font-semibold"
                      >
                        Ver sorteo
                      </Link>
                    </div>
                  </div>
                );
              })}
            </div>

            {totalPages > 1 && !showOnlyFavs && (
              <div className="mt-6 flex items-center justify-center gap-2">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1}
                  className="px-3 py-2 rounded-lg border border-slate-700/50 text-slate-300 disabled:opacity-50"
                  type="button"
                >
                  ← Anterior
                </button>
                <div className="px-3 py-2 text-slate-400">
                  Página {page} de {totalPages}
                </div>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages}
                  className="px-3 py-2 rounded-lg border border-slate-700/50 text-slate-300 disabled:opacity-50"
                  type="button"
                >
                  Siguiente →
                </button>
              </div>
            )}

            {ticketPrice != null && (
              <div className="mt-8 text-center text-xs text-slate-400">
                Precio por ticket (config servidor): $
                {Number(ticketPrice).toLocaleString()}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
