"use client";

import { useEffect, useState, Suspense } from "react";
import { useSession } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";

function classNames(...xs) { return xs.filter(Boolean).join(" "); }
const STATUSES = ["PENDING", "APPROVED", "REJECTED"];

function fmtDate(d) {
  if (!d) return "-";
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return "-";
  return dt.toLocaleString("es-AR", { dateStyle: "medium", timeStyle: "short" });
}

function AdminPublicacionesPendientesContent() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const sp = useSearchParams();

  // Tab por query (?tab=PENDING|APPROVED|REJECTED)
  const tabParam = (sp.get("tab") || "PENDING").toUpperCase();
  const [tab, setTab] = useState(STATUSES.includes(tabParam) ? tabParam : "PENDING");

  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [refreshKey, setRefreshKey] = useState(0); // fuerza refetch al aprobar/rechazar/eliminar
  const [deletingId, setDeletingId] = useState(null);

  const isAuthLoading = status === "loading";
  const role = String(session?.user?.role || "").toUpperCase();
  const isAdmin = role === "ADMIN" || role === "SUPERADMIN";
  const isSuperAdmin = role === "SUPERADMIN";

  useEffect(() => {
    if (!isAuthLoading && !isAdmin) {
      // Si no es admin/superadmin, lo dejamos con 403 "suave"
    }
  }, [isAuthLoading, isAdmin]);

  const fetchList = async () => {
    try {
      setLoading(true);
      setErr("");

      const url = new URL(`/api/raffles`, window.location.origin);
      url.searchParams.set("listingStatus", tab);   // clave del panel
      url.searchParams.set("limit", "20");
      url.searchParams.set("page", String(page));

      // Tip: para ver SOLO listadas (no unlisted) podés forzar isPrivate=false
      // url.searchParams.set("isPrivate", "0");

      const res = await fetch(url.toString(), { credentials: "include" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || data?.message || "Error al cargar");

      setRows(Array.isArray(data?.raffles) ? data.raffles : []);
      const tp = data?.pagination?.totalPages || 1;
      setTotalPages(tp);
    } catch (e) {
      setErr(e.message || "Error al cargar la lista");
    } finally {
      setLoading(false);
    }
  };

  // refetch en cambios de tab/page/refreshKey
  useEffect(() => {
    if (!isAdmin) return;
    fetchList();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, page, refreshKey, isAdmin]);

  const setTabAndPush = (t) => {
    setPage(1);
    setTab(t);
    const u = new URL(window.location.href);
    u.searchParams.set("tab", t);
    router.replace(u.toString());
  };

  // acciones
  const approve = async (id) => {
    try {
      const res = await fetch("/api/raffles", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ id, action: "approve_listing" }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || data?.message || "No se pudo aprobar");
      setRefreshKey((k) => k + 1);
    } catch (e) {
      alert(e.message || "Error aprobando publicación");
    }
  };

  const reject = async (id) => {
    const reason = prompt("Motivo del rechazo (opcional, máx. 500 caracteres):") || "";
    try {
      const res = await fetch("/api/raffles", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ id, action: "reject_listing", reason }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || data?.message || "No se pudo rechazar");
      setRefreshKey((k) => k + 1);
    } catch (e) {
      alert(e.message || "Error rechazando publicación");
    }
  };

  // NUEVO: eliminar (solo SUPERADMIN) — borra completamente la rifa
  const removeRaffle = async (id, title) => {
    if (!isSuperAdmin) return;
    const ok = confirm(
      `Vas a eliminar definitivamente el sorteo:\n\n• ${title}\n\nEsta acción no se puede deshacer. ¿Confirmás?`
    );
    if (!ok) return;
    try {
      setDeletingId(id);
      const res = await fetch(`/api/raffles?id=${encodeURIComponent(id)}`, {
        method: "DELETE",
        credentials: "include",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || data?.message || "No se pudo eliminar");
      setRefreshKey((k) => k + 1);
    } catch (e) {
      alert(e.message || "Error eliminando publicación");
    } finally {
      setDeletingId(null);
    }
  };

  // UI
  if (isAuthLoading) {
    return (
      <div className="min-h-screen grid place-items-center bg-gray-950 text-gray-200">
        <div className="text-center">
          <div className="w-14 h-14 border-4 border-orange-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <div>Verificando permisos…</div>
        </div>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="min-h-screen grid place-items-center bg-gray-950 text-gray-100">
        <div className="bg-gray-900 border border-gray-800 p-6 rounded-xl max-w-md text-center">
          <h1 className="text-xl font-semibold mb-2">403 • Acceso restringido</h1>
          <p>Necesitás permisos de <b>admin</b> para ver publicaciones.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-950 to-gray-900 text-gray-100">
      <div className="max-w-5xl mx-auto p-6">
        <div className="mb-6">
          <h1 className="text-2xl font-bold">Publicaciones</h1>
          <p className="text-gray-400">Revisión de sorteos listados para el feed público.</p>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 mb-6">
          {STATUSES.map((s) => (
            <button
              key={s}
              onClick={() => setTabAndPush(s)}
              className={classNames(
                "px-4 py-2 rounded-lg border",
                tab === s ? "bg-orange-600 border-orange-500" : "bg-gray-800 border-gray-700 hover:bg-gray-750"
              )}
            >
              {s === "PENDING" ? "Pendientes" : s === "APPROVED" ? "Aprobadas" : "Rechazadas"}
            </button>
          ))}
        </div>

        {/* Estado de carga / error */}
        {err && (
          <div className="mb-4 p-3 rounded-lg border border-red-800 bg-red-900/30 text-red-200">
            {err}
          </div>
        )}
        {loading ? (
          <div className="p-10 text-center text-gray-300">Cargando…</div>
        ) : rows.length === 0 ? (
          <div className="p-10 text-center text-gray-400">No hay resultados.</div>
        ) : (
          <div className="space-y-3">
            {rows.map((r) => (
              <div
                key={r.id}
                className="border border-gray-800 bg-gray-900 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center gap-4"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold truncate">{r.title}</h3>
                    {r.isPrivate ? (
                      <span className="text-xs px-2 py-0.5 rounded bg-gray-700 border border-gray-600">No listado</span>
                    ) : (
                      <span className="text-xs px-2 py-0.5 rounded bg-gray-700 border border-gray-600">Listado</span>
                    )}
                    <span className="text-xs px-2 py-0.5 rounded bg-gray-700 border border-gray-600">
                      {r.listingStatus === "PENDING"
                        ? "Pendiente"
                        : r.listingStatus === "APPROVED"
                        ? "Aprobada"
                        : "Rechazada"}
                    </span>
                  </div>
                  <div className="text-sm text-gray-400 line-clamp-2">{r.description}</div>
                  <div className="mt-1 text-xs text-gray-500">
                    <span>Creado: {fmtDate(r.createdAt)}</span>
                    {" • "}
                    <span>Premio: ${r.prizeValue?.toLocaleString("es-AR")}</span>
                    {" • "}
                    <span>Máx. participaciones: {r.maxParticipants}</span>
                    {" • "}
                    <span>Mín. x participación: {r.minTicketsPerParticipant ?? 1}{r.minTicketsIsMandatory ? " (obligatorio)" : ""}</span>
                  </div>
                  {r.listingReason && r.listingStatus === "REJECTED" && (
                    <div className="mt-1 text-xs text-red-300">
                      Motivo rechazo: {r.listingReason}
                    </div>
                  )}
                </div>

                <div className="flex flex-wrap gap-2">
                  {r.listingStatus === "PENDING" && !r.isPrivate && (
                    <>
                      <button
                        onClick={() => approve(r.id)}
                        className="px-3 py-2 rounded-lg bg-green-600 hover:bg-green-700"
                        title="Aprobar publicación"
                        disabled={deletingId === r.id}
                      >
                        Aprobar
                      </button>
                      <button
                        onClick={() => reject(r.id)}
                        className="px-3 py-2 rounded-lg bg-red-600 hover:bg-red-700"
                        title="Rechazar publicación"
                        disabled={deletingId === r.id}
                      >
                        Rechazar
                      </button>
                    </>
                  )}

                  {/* NUEVO: botón eliminar definitivo (solo SUPERADMIN) en PENDING/REJECTED */}
                  {isSuperAdmin && (r.listingStatus === "PENDING" || r.listingStatus === "REJECTED") && (
                    <button
                      onClick={() => removeRaffle(r.id, r.title)}
                      className={classNames(
                        "px-3 py-2 rounded-lg border",
                        deletingId === r.id
                          ? "bg-gray-700 border-gray-600 cursor-wait opacity-70"
                          : "bg-transparent border-red-600 text-red-400 hover:bg-red-600/10"
                      )}
                      title="Eliminar definitivamente"
                      disabled={deletingId === r.id}
                    >
                      {deletingId === r.id ? "Eliminando…" : "Eliminar"}
                    </button>
                  )}

                  {r.isPrivate && (
                    <span className="self-center text-xs text-gray-400">
                      (No listado: no requiere aprobación)
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Paginación simple */}
        <div className="mt-6 flex items-center justify-center gap-2">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1 || loading}
            className="px-3 py-2 rounded-lg border border-gray-700 bg-gray-800 disabled:opacity-50"
          >
            Anterior
          </button>
          <span className="text-sm text-gray-300">
            Página {page} / {totalPages}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages || loading}
            className="px-3 py-2 rounded-lg border border-gray-700 bg-gray-800 disabled:opacity-50"
          >
            Siguiente
          </button>
        </div>
      </div>
    </div>
  );
}

export default function AdminPublicacionesPendientesPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen grid place-items-center bg-gray-950 text-gray-200">
        <div className="text-center">
          <div className="w-14 h-14 border-4 border-orange-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <div>Cargando página...</div>
        </div>
      </div>
    }>
      <AdminPublicacionesPendientesContent />
    </Suspense>
  );
}
