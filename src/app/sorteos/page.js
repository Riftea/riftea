// src/app/sorteos/page.js
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

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

/** Imagen segura usando next/image (sin need de domains). */
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

/** Barra de progreso finita y sutil (solo para en curso) */
function SlimBar({ current = 0, target = 1 }) {
  const pct = Math.max(0, Math.min(100, Math.round((current / target) * 100) || 0));
  return (
    <div className="mt-2 h-1.5 rounded-full bg-slate-800/70 overflow-hidden">
      <div
        className="h-full bg-gradient-to-r from-indigo-400 to-purple-400"
        style={{ width: `${pct}%` }}
        aria-label={`Progreso ${pct}%`}
      />
    </div>
  );
}

/* ===================== Página ===================== */

export default function SorteosPublicosPage() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [q, setQ] = useState("");
  // showMode: "all" | "available" | "finalized" | "favorites"
  const [showMode, setShowMode] = useState("available"); // por defecto disponibles
  // sortKey: createdAt_desc / createdAt_asc / participants_desc / participants_asc / timeLeft_asc / timeLeft_desc
  const [sortKey, setSortKey] = useState("createdAt_desc");
  const [page, setPage] = useState(1);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);

  const [favorites, setFavorites] = useState([]);
  const [selectedTicketId, setSelectedTicketId] = useState(null);

  // UI sutil: buscador y filtros en popovers
  const [showSearch, setShowSearch] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const filtersRef = useRef(null);

  // Cerrar panel de filtros al clickear afuera
  useEffect(() => {
    function onDocClick(e) {
      if (!filtersRef.current) return;
      if (!filtersRef.current.contains(e.target)) setShowFilters(false);
    }
    if (showFilters) document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [showFilters]);

  // Lee ?selectTicket de la URL (si venimos desde Mis tickets) — solo una vez
  useEffect(() => {
    const tid = searchParams.get("selectTicket");
    if (tid) setSelectedTicketId(tid);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ✅ sincroniza ?filter= (o ?show=) con estado
  useEffect(() => {
    const raw =
      (searchParams.get("filter") || searchParams.get("show") || "").trim().toLowerCase();
    const valid = ["all", "available", "finalized", "favorites"];
    if (valid.includes(raw)) {
      setShowMode(raw);
    } else {
      setShowMode("available");
    }
    setPage(1);
  }, [searchParams]);

  // Favoritos
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
      } catch {}
      return next;
    });
  };

  // Carga desde el backend (paginado por servidor)
  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);

      const [field, dir] = sortKey.split("_");
      const serverSortBy = field === "timeLeft" ? "createdAt" : field;
      const order = dir;

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
      if (!res.ok) throw new Error(data?.error || `Error ${res.status}`);

      let list = Array.isArray(data.items) ? data.items : [];

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
  }, [q, sortKey, page, showMode]);

  // Helpers de estado solicitados
  const isReadyToDraw = (st) => String(st) === "READY_TO_DRAW";
  const isFinalized = (st) => ["FINISHED", "COMPLETED"].includes(String(st));

  // Filtro por estado + favoritos (cliente)
  const filteredItems = useMemo(() => {
    let list = items;

    const query = q.trim().toLowerCase();
    if (query) {
      list = list.filter((it) => {
        const t = (it?.title || "").toLowerCase();
        const d = (it?.description || "").toLowerCase();
        return t.includes(query) || d.includes(query);
      });
    }

    if (showMode === "available") {
      // 🔧 Cambiado: incluir READY_TO_DRAW dentro de "Disponibles"
      list = list.filter((it) =>
        ["ACTIVE", "PUBLISHED", "READY_TO_DRAW"].includes(it?.status),
      );
    } else if (showMode === "finalized") {
      list = list.filter((it) => isFinalized(it?.status));
    }
    if (showMode === "favorites") {
      list = list.filter((it) => favorites.includes(it.id));
    }

    return list;
  }, [items, q, showMode, favorites]);

  // Paginación local
  const totalPages = useMemo(
    () => Math.max(1, Math.ceil(filteredItems.length / PER_PAGE)),
    [filteredItems.length],
  );
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

  // URL sync del filtro "Mostrar"
  const handleChangeShowMode = (value) => {
    setPage(1);
    setShowMode(value);

    const params = new URLSearchParams(searchParams.toString());
    params.set("filter", value);
    router.push(`${pathname}?${params.toString()}`);
  };

  // HREF detalle
  const makeDetailHref = (id) =>
    `/sorteo/${id}${selectedTicketId ? `?use=${encodeURIComponent(selectedTicketId)}` : ""}`;

  // Texto y clases del botón principal según estado (pedido "Ver resultados" en gris)
  const getCtaForStatus = (status) => {
    if (isFinalized(status) || isReadyToDraw(status)) {
      return {
        text: "Ver resultados",
        className:
          "mt-auto block w-full text-center px-3 py-2 rounded-lg bg-slate-700/80 hover:bg-slate-700 text-slate-200 text-sm font-semibold border border-slate-600/60",
      };
    }
    return {
      text: "Ver sorteo",
      className:
        "mt-auto block w-full text-center px-3 py-2 rounded-lg bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white text-sm font-semibold",
    };
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-800 text-slate-50">
      {/* Header */}
      <div className="sticky top-0 z-20 backdrop-blur-md bg-slate-950/70 border-b border-slate-800">
        <div className="max-w-6xl mx-auto px-4 py-3">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <h1 className="text-2xl md:text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-indigo-400 to-purple-400 truncate">
                Elegí Premios
              </h1>
              <p className="text-slate-400 text-xs md:text-sm">
                Descubrí sorteos activos de toda la comunidad
              </p>
            </div>

            {/* Barra compacta: Mis tickets + acciones sutiles */}
            <div className="flex items-center gap-1 sm:gap-2 shrink-0">
              <Link
                href="/mis-tickets"
                className="px-3 py-2 rounded-lg border border-slate-700/40 text-slate-300 hover:bg-slate-800/40 transition text-sm"
                title="Ver mis tickets"
              >
                Mis tickets
              </Link>

              {/* Buscar (icono) */}
              <button
                onClick={() => {
                  setShowSearch((v) => !v);
                  setShowFilters(false);
                }}
                className="px-3 py-2 rounded-lg border border-slate-700/40 text-slate-300 hover:bg-slate-800/40 transition text-sm"
                title="Buscar"
                type="button"
                aria-expanded={showSearch}
                aria-controls="search-pop"
              >
                🔎
              </button>

              {/* Filtros (icono) */}
              <div className="relative" ref={filtersRef}>
                <button
                  onClick={() => {
                    setShowFilters((v) => !v);
                    setShowSearch(false);
                  }}
                  className="px-3 py-2 rounded-lg border border-slate-700/40 text-slate-300 hover:bg-slate-800/40 transition text-sm"
                  title="Filtros"
                  type="button"
                  aria-expanded={showFilters}
                  aria-controls="filters-pop"
                >
                  ⚙️
                </button>

                {/* Panel flotante de filtros */}
                {showFilters && (
                  <div
                    id="filters-pop"
                    className="absolute right-0 mt-2 w=[min(88vw,360px)] rounded-xl border border-slate-700/60 bg-slate-900/95 shadow-2xl p-3 backdrop-blur-md"
                  >
                    <div className="text-slate-300 text-sm mb-2">Filtros</div>

                    <div className="grid grid-cols-1 gap-2">
                      {/* Mostrar */}
                      <label className="text-xs text-slate-400">Mostrar</label>
                      <select
                        value={showMode}
                        onChange={(e) => {
                          handleChangeShowMode(e.target.value);
                          setShowFilters(false);
                        }}
                        className="px-3 py-2 rounded-lg bg-slate-950/60 border border-slate-700/60 text-slate-200"
                        title="Mostrar"
                      >
                        <option value="all">Todos</option>
                        <option value="available">Disponibles</option>
                        <option value="finalized">Finalizados</option>
                        <option value="favorites">Solo favoritos</option>
                      </select>

                      {/* Ordenar */}
                      <label className="text-xs text-slate-400 mt-2">Ordenar por</label>
                      <select
                        value={sortKey}
                        onChange={(e) => {
                          setPage(1);
                          setSortKey(e.target.value);
                          setShowFilters(false);
                        }}
                        className="px-3 py-2 rounded-lg bg-slate-950/60 border border-slate-700/60 text-slate-200"
                        title="Ordenar por"
                      >
                        <optgroup label="Fecha de creación">
                          <option value="createdAt_desc">Más nuevo</option>
                          <option value="createdAt_asc">Más viejo</option>
                        </optgroup>
                        <optgroup label="Participantes">
                          <option value="participants_desc">Mayor a menor</option>
                          <option value="participants_asc">Menor a mayor</option>
                        </optgroup>
                        <optgroup label="Tiempo restante">
                          <option value="timeLeft_asc">Menos a más</option>
                          <option value="timeLeft_desc">Más a menos</option>
                        </optgroup>
                      </select>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Buscador flotante (pill) */}
          {showSearch && (
            <div id="search-pop" className="mt-3 relative">
              <input
                autoFocus
                value={q}
                onChange={(e) => {
                  setPage(1);
                  setQ(e.target.value);
                }}
                placeholder="Buscar por título o descripción…"
                className="w-full px-4 py-3 rounded-full bg-slate-900/70 border border-slate-700/60 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 text-slate-200 shadow-lg"
                onBlur={() => setShowSearch(false)}
              />
            </div>
          )}
        </div>
      </div>

      {/* Banner ticket pre-seleccionado */}
      {selectedTicketId && (
        <div className="max-w-6xl mx-auto px-4 pt-4">
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-amber-200 text-sm">
            🎫 Elegí un sorteo para usar tu ticket{" "}
            <strong>#{String(selectedTicketId).slice(-6)}</strong>. Al entrar, usá “Participar con ticket”.
          </div>
        </div>
      )}

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
                const detailHref = makeDetailHref(r.id);

                const remaining = max != null ? Math.max(0, max - participants) : null;
                const isFull =
                  (max && participants >= max) ||
                  ["FINISHED", "COMPLETED", "READY_TO_DRAW"].includes(r?.status);
                const isLastSpots = !isFull && remaining != null && remaining <= 3;

                const cta = getCtaForStatus(r?.status);

                return (
                  <div
                    key={r.id}
                    className="group h-full flex flex-col rounded-2xl border border-slate-800 bg-slate-900/50 overflow-hidden transition-transform duration-200 ease-out hover:-translate-y-0.5 hover:shadow-xl hover:border-slate-700/60"
                  >
                    {/* Imagen clickeable */}
                    <Link
                      href={detailHref}
                      aria-label={`Ver sorteo: ${r?.title || "Sorteo"}`}
                      title={r?.title || "Ver sorteo"}
                      className="relative aspect-[16/9] bg-slate-800 overflow-hidden focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
                    >
                      {r?.imageUrl ? (
                        <SafeImage
                          src={r.imageUrl}
                          alt={r.title || "Sorteo"}
                          className="object-cover transition-transform duration-300 group-hover:scale-[1.02] cursor-pointer"
                          fill
                          sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                          fallback="/file.svg"
                        />
                      ) : (
                        <div className="absolute inset-0 grid place-items-center text-slate-500">
                          Sin imagen
                        </div>
                      )}

                      {/* Ribbons estado */}
                      {isFull ? (
                        <span className="absolute left-0 top-2 z-10 px-3 py-1 rounded-r-full text-[11px] font-semibold bg-gradient-to-r from-emerald-500/90 via-emerald-400/90 to-emerald-300/90 text-emerald-950 shadow-md">
                          ✅ Meta alcanzada
                        </span>
                      ) : isLastSpots ? (
                        <span className="absolute left-0 top-2 z-10 px-3 py-1 rounded-r-full text-[11px] font-semibold bg-gradient-to-r from-amber-400/90 via-orange-400/90 to-rose-400/90 text-slate-950 shadow-md">
                          🔥 ¡Últimos {remaining}!
                        </span>
                      ) : (
                        <span className="absolute left-0 top-2 z-10 px-3 py-1 rounded-r-full text-[11px] font-semibold bg-gradient-to-r from-indigo-400/90 via-indigo-300/90 to-sky-300/90 text-slate-950 shadow-md">
                          ⏳ En curso
                        </span>
                      )}

                      {/* Favorito (no navega) */}
                      <button
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          toggleFav(r.id);
                        }}
                        className="absolute top-2 right-2 p-2 rounded-full bg-black/50 hover:bg-black/70 text-yellow-300 z-10"
                        aria-label="Favorito"
                        title="Marcar como favorito"
                        type="button"
                      >
                        {favorites.includes(r.id) ? "★" : "☆"}
                      </button>
                    </Link>

                    <div className="p-4 flex flex-col gap-3 grow">
                      <div className="flex items-start justify-between gap-3 min-w-0">
                        <h3 className="text-slate-100 font-semibold line-clamp-2 break-words min-h-[2.6rem]">
                          {r?.title || "Sorteo"}
                        </h3>
                        <span
                          className={`px-2 py-0.5 rounded text-xs whitespace-nowrap shrink-0 ${statusClasses(r?.status)}`}
                          title={r?.status}
                        >
                          {r?.status || "—"}
                        </span>
                      </div>

                      <p className="text-slate-400 text-sm line-clamp-2 break-words min-h-[2.5rem]">
                        {r?.description || "Sin descripción"}
                      </p>

                      <div className="space-y-2">
                        <div className="flex items-center justify-between text-xs text-slate-400">
                          <span className="truncate">Participantes</span>
                          <div className="flex items-center gap-2 shrink-0">
                            {!isFull && remaining != null && (
                              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-amber-400/15 text-amber-300 border border-amber-400/30">
                                Quedan {remaining}
                              </span>
                            )}
                            {isFull && (
                              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-400/20 text-emerald-300 border border-emerald-500/30">
                                100% completado
                              </span>
                            )}
                            <span>
                              {participants}
                              {max ? ` / ${max}` : " / ∞"}
                            </span>
                          </div>
                        </div>

                        {/* Barra slim solo si NO está completo */}
                        {!isFull && (
                          <SlimBar
                            current={participants}
                            target={max || Math.max(1, participants)}
                          />
                        )}
                      </div>

                      <div className="flex items-center justify-between text-xs text-slate-400 pt-1 min-w-0">
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
                          <span className="truncate max-w-[160px]">
                            {r?.owner?.name || "Organizador"}
                          </span>
                        </div>
                        <span className="shrink-0">{timeLeft}</span>
                      </div>

                      <Link href={detailHref} className={cta.className}>
                        {cta.text}
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
          </>
        )}
      </div>
    </div>
  );
}
