// src/app/sorteos/page.js
"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import ProgressBar from "@/components/raffle/ProgressBar";

const PER_PAGE = 12;

/* ===================== Helpers ===================== */

function isHttpUrl(u) {
  try {
    const s = String(u || "").trim();
    if (!s) return false;
    if (s.startsWith("/")) return true; // rutas locales (/uploads/..)
    const url = new URL(s);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function isDataUrl(u) {
  return typeof u === "string" && u.trim().startsWith("data:");
}

/** Imagen segura usando next/image (sin necesidad de configurar domains).
 *  - Si la URL no es válida, usa fallback.
 *  - Para contenedores con aspect-ratio usa fill.
 *  - Para avatares u otros tamaños fijos, pasá width/height.
 */
function SafeImage({
  src,
  alt,
  className,
  fallback = "/file.svg",
  fill = false,
  width,
  height,
  sizes = "100vw",
}) {
  const ok = isHttpUrl(src) || isDataUrl(src) || String(src || "").startsWith("/");
  const finalSrc = ok ? src : fallback;

  // Loader passthrough para evitar domains y usar la URL tal cual
  const passthroughLoader = ({ src }) => src;

  if (fill) {
    return (
      <Image
        alt={alt || "Imagen"}
        className={className}
        src={finalSrc}
        loader={passthroughLoader}
        unoptimized
        fill
        sizes={sizes}
      />
    );
  }

  return (
    <Image
      alt={alt || "Imagen"}
      className={className}
      src={finalSrc}
      loader={passthroughLoader}
      unoptimized
      width={width ?? 400}
      height={height ?? 300}
    />
  );
}

/* ===================== Página ===================== */

export default function SorteosPublicosPage() {
  const [q, setQ] = useState("");
  // showMode: "all" | "available" | "finalized" | "favorites"
  const [showMode, setShowMode] = useState("available"); // por defecto disponibles

  // sortKey: createdAt_desc / createdAt_asc / participants_desc / participants_asc / timeLeft_asc / timeLeft_desc
  const [sortKey, setSortKey] = useState("createdAt_desc");

  const [page, setPage] = useState(1);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0); // viene del server (solo referencia)
  const [ticketPrice, setTicketPrice] = useState(null);

  const [favorites, setFavorites] = useState([]);
  const [selectedTicketId, setSelectedTicketId] = useState(null);

  // Lee ?selectTicket de la URL (si venimos desde Mis tickets)
  useEffect(() => {
    if (typeof window !== "undefined") {
      const sp = new URLSearchParams(window.location.search);
      const tid = sp.get("selectTicket");
      if (tid) setSelectedTicketId(tid);
    }
  }, []);

  // Lee ?filter=favorites (u otros) para presetear el filtro desde el menú
  useEffect(() => {
    if (typeof window !== "undefined") {
      const sp = new URLSearchParams(window.location.search);
      const filter = (sp.get("filter") || sp.get("show") || "").trim().toLowerCase();
      if (["all", "available", "finalized", "favorites"].includes(filter)) {
        setShowMode(filter);
        setPage(1);
      }
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
      const next = prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id];
      try {
        localStorage.setItem("favRaffles", JSON.stringify(next));
      } catch {
        /* ignore */
      }
      return next;
    });
  };

  // Carga desde el backend (paginado por servidor)
  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);

      // Para el backend: el campo (sin dirección) – si pedimos timeLeft, lo mapeamos a createdAt y ordenamos en cliente.
      const [field, dir] = sortKey.split("_"); // p.ej. "createdAt", "desc"
      const serverSortBy = field === "timeLeft" ? "createdAt" : field;
      const order = dir; // "asc" | "desc"

      const params = new URLSearchParams({
        q,
        sortBy: serverSortBy,
        order,
        page: String(page),
        perPage: String(PER_PAGE),
      });

      const res = await fetch(`/api/raffles/public?${params}`, {
        cache: "no-store",
        credentials: "include",
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(data?.error || `Error ${res.status}`);
      }

      let list = Array.isArray(data.items) ? data.items : [];

      // Orden especial por tiempo restante en el cliente
      if (field === "timeLeft") {
        list = [...list].sort((a, b) => {
          const now = Date.now();
          const aLeft = a?.endsAt ? new Date(a.endsAt).getTime() - now : Number.POSITIVE_INFINITY;
          const bLeft = b?.endsAt ? new Date(b.endsAt).getTime() - now : Number.POSITIVE_INFINITY;
          return dir === "asc" ? aLeft - bLeft : bLeft - aLeft;
        });
      }

      setItems(list);
      setTotal(Number.isFinite(data.total) ? data.total : list.length);

      // Precio (informativo) desde meta o primer item (unitPrice)
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
  }, [q, sortKey, page, showMode]); // 👈 FIX: agrega showMode

  // Filtro por estado + favoritos (cliente)
  const filteredItems = useMemo(() => {
    let list = items;

    // texto
    const query = q.trim().toLowerCase();
    if (query) {
      list = list.filter((it) => {
        const t = (it?.title || "").toLowerCase();
        const d = (it?.description || "").toLowerCase();
        return t.includes(query) || d.includes(query);
      });
    }

    // estado
    if (showMode === "available") {
      list = list.filter((it) => ["ACTIVE", "PUBLISHED"].includes(it?.status));
    } else if (showMode === "finalized") {
      list = list.filter((it) => ["FINISHED", "COMPLETED"].includes(it?.status));
    }

    // favoritos
    if (showMode === "favorites") {
      list = list.filter((it) => favorites.includes(it.id));
    }

    return list;
  }, [items, q, showMode, favorites]);

  // Paginación local sobre lo filtrado (coherente visualmente)
  const totalPages = useMemo(() => {
    return Math.max(1, Math.ceil(filteredItems.length / PER_PAGE));
  }, [filteredItems.length]);

  const pagedItems = useMemo(() => {
    const start = (page - 1) * PER_PAGE;
    return filteredItems.slice(start, start + PER_PAGE);
  }, [filteredItems, page]);

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

  const statusClasses = (status) => {
    switch (status) {
      case "ACTIVE":
        return "bg-emerald-900/30 text-emerald-300";
      case "READY_TO_DRAW":
        return "bg-amber-900/30 text-amber-300";
      case "PUBLISHED":
        return "bg-indigo-900/30 text-indigo-300";
      case "FINISHED":
        return "bg-slate-800/60 text-slate-300";
      case "CANCELLED":
        return "bg-rose-900/30 text-rose-300";
      case "COMPLETED":
        return "bg-sky-900/30 text-sky-300";
      default:
        return "bg-slate-800/60 text-slate-300";
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-800 text-slate-50">
      {/* Header */}
      <div className="sticky top-0 z-10 backdrop-blur-md bg-slate-950/70 border-b border-slate-800">
        <div className="max-w-6xl mx-auto px-4 py-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="min-w-0">
            <h1 className="text-2xl md:text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-indigo-400 to-purple-400 truncate">
              Sorteos públicos
            </h1>
            <p className="text-slate-400 text-sm">Descubrí sorteos activos de toda la comunidad</p>
          </div>

          <div className="flex gap-2 shrink-0">
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
            Elegí un sorteo para usar tu ticket{" "}
            <strong>#{String(selectedTicketId).slice(-6)}</strong>. Al entrar al sorteo, presioná “Participar con ticket”.
          </div>
        </div>
      )}

      {/* Filtros */}
      <div className="max-w-6xl mx-auto px-4 py-4">
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_auto_auto] gap-3 items-stretch">
          {/* Buscador */}
          <input
            value={q}
            onChange={(e) => {
              setPage(1);
              setQ(e.target.value);
            }}
            placeholder="Buscar por título o descripción..."
            className="w-full px-4 py-3 rounded-xl bg-slate-900/60 border border-slate-700/50 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 text-slate-200"
          />

          {/* Mostrar (estado + favoritos en el mismo select) */}
          <select
            value={showMode}
            onChange={(e) => {
              setPage(1);
              setShowMode(e.target.value);
            }}
            className="px-3 py-3 rounded-xl bg-slate-900/60 border border-slate-700/50 text-slate-200 min-w-[220px]"
            title="Mostrar"
          >
            <option value="all">Mostrar: Todos</option>
            <option value="available">Mostrar: Disponibles</option>
            <option value="finalized">Mostrar: Finalizados</option>
            <option value="favorites">Mostrar: Solo favoritos</option>
          </select>

          {/* Orden (campo + dirección combinado) */}
          <select
            value={sortKey}
            onChange={(e) => {
              setPage(1);
              setSortKey(e.target.value);
            }}
            className="px-3 py-3 rounded-xl bg-slate-900/60 border border-slate-700/50 text-slate-200 min-w-[260px]"
            title="Ordenar por"
          >
            <optgroup label="Fecha de creación">
              <option value="createdAt_desc">Fecha de creación (más nuevo)</option>
              <option value="createdAt_asc">Fecha de creación (más viejo)</option>
            </optgroup>
            <optgroup label="Participantes">
              <option value="participants_desc">Participantes (mayor a menor)</option>
              <option value="participants_asc">Participantes (menor a mayor)</option>
            </optgroup>
            <optgroup label="Tiempo restante">
              <option value="timeLeft_asc">Tiempo restante (menos a más)</option>
              <option value="timeLeft_desc">Tiempo restante (más a menos)</option>
            </optgroup>
          </select>
        </div>
      </div>

      {/* Contenido */}
      <div className="max-w-6xl mx-auto px-4 pb-12">
        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-64 rounded-2xl border border-slate-800 bg-slate-900/40 animate-pulse" />
            ))}
          </div>
        ) : error ? (
          <div className="p-6 rounded-2xl border border-rose-900/30 bg-rose-900/10">
            <div className="text-rose-300 font-semibold mb-1">Error</div>
            <div className="text-rose-200/80">{error}</div>
          </div>
        ) : filteredItems.length === 0 ? (
          <div className="p-6 rounded-2xl border border-slate-800 bg-slate-900/40 text-slate-300 text-center">
            Aún no hay sorteos para mostrar.
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {pagedItems.map((r) => {
                const participants =
                  r?._count?.participations ?? r?.stats?.totalParticipations ?? 0;
                const max = r?.maxParticipants ?? r?.stats?.maxParticipants ?? null;
                const timeLeft = timeLeftText(r?.endsAt);

                return (
                  <div
                    key={r.id}
                    className="group rounded-2xl border border-slate-800 bg-slate-900/50 overflow-hidden hover:border-slate-700/60 transition"
                  >
                    <div className="relative aspect-[16/9] bg-slate-800">
                      {r?.imageUrl ? (
                        <SafeImage
                          src={r.imageUrl}
                          alt={r.title || "Sorteo"}
                          className="object-cover"
                          fill
                          sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                          fallback="/file.svg"
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
                          className={`px-2 py-0.5 rounded text-xs whitespace-nowrap ${statusClasses(r?.status)}`}
                          title={r?.status}
                        >
                          {r?.status || "—"}
                        </span>
                      </div>

                      <p className="text-slate-400 text-sm line-clamp-2">
                        {r?.description || "Sin descripción"}
                      </p>

                      <div className="space-y-2">
                        <div className="flex justify-between text-xs text-slate-400">
                          <span className="truncate">Participantes</span>
                          <span className="shrink-0">
                            {participants}
                            {max ? ` / ${max}` : " / ∞"}
                          </span>
                        </div>
                        <ProgressBar current={participants} target={max || Math.max(1, participants)} animated />
                      </div>

                      <div className="flex items-center justify-between text-xs text-slate-400 pt-1">
                        <div className="flex items-center gap-2 min-w-0">
                          {r?.owner?.image ? (
                            <SafeImage
                              src={r.owner.image}
                              alt={r.owner.name || "Organizador"}
                              className="rounded-full object-cover"
                              width={20}
                              height={20}
                              fallback="/avatar-default.png"
                            />
                          ) : (
                            <div className="w-5 h-5 rounded-full bg-slate-700 shrink-0" />
                          )}
                          <span className="truncate max-w-[140px]">
                            {r?.owner?.name || "Organizador"}
                          </span>
                        </div>
                        <span className="shrink-0">{timeLeft}</span>
                      </div>

                      <Link
                        href={`/sorteo/${r.id}${selectedTicketId ? `?use=${encodeURIComponent(selectedTicketId)}` : ""}`}
                        className="mt-2 block w-full text-center px-3 py-2 rounded-lg bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white text-sm font-semibold"
                      >
                        Ver sorteo
                      </Link>
                    </div>
                  </div>
                );
              })}
            </div>

            {totalPages > 1 && (
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
                Precio por ticket (config servidor): ${Number(ticketPrice).toLocaleString()}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
