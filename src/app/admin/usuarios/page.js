// src/app/admin/usuarios/page.js
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";

const ROLE_OPTIONS = ["USER", "ADMIN"]; // SUPERADMIN no editable desde UI
const PAGE_SIZE_OPTIONS = [10, 25, 50];
const DEFAULT_SORT_BY = "name";
const DEFAULT_SORT_DIR = "asc";

export default function UsuariosAdminPage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  // --- UI State
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [message, setMessage] = useState("");
  const clearMsgRef = useRef(null);

  // --- Table controls (server-driven)
  const [filter, setFilter] = useState("");
  const [debouncedFilter, setDebouncedFilter] = useState("");
  const [sortBy, setSortBy] = useState(DEFAULT_SORT_BY);   // name | email | role | isActive
  const [sortDir, setSortDir] = useState(DEFAULT_SORT_DIR); // asc | desc
  const [page, setPage] = useState(1);                      // 1-based
  const [pageSize, setPageSize] = useState(PAGE_SIZE_OPTIONS[0]);

  const [savingId, setSavingId] = useState(null);

  const isSuperAdmin = (session?.user?.role || "").toUpperCase() === "SUPERADMIN";

  // --- Limpieza de mensajes al desmontar
  useEffect(() => {
    return () => {
      if (clearMsgRef.current) clearTimeout(clearMsgRef.current);
    };
  }, []);

  const setAutoClearMessage = (text, ms = 4000) => {
    setMessage(text);
    if (clearMsgRef.current) clearTimeout(clearMsgRef.current);
    clearMsgRef.current = setTimeout(() => setMessage(""), ms);
  };

  // --- Debounce del filtro (300ms)
  useEffect(() => {
    const t = setTimeout(() => setDebouncedFilter(filter.trim()), 300);
    return () => clearTimeout(t);
  }, [filter]);

  // --- Guardas: solo SUPERADMIN entra
  useEffect(() => {
    if (status === "loading") return;
    if (status === "unauthenticated") {
      router.push("/");
      return;
    }
    if (!isSuperAdmin) {
      router.push("/");
      return;
    }
  }, [status, isSuperAdmin, router]);

  // --- Carga de datos (server-side pagination/sort/search)
  const reload = useCallback(async () => {
    const params = new URLSearchParams();
    if (debouncedFilter) params.set("search", debouncedFilter);
    if (sortBy) params.set("sortBy", sortBy);
    if (sortDir) params.set("sortDir", sortDir);
    params.set("page", String(page));
    params.set("pageSize", String(pageSize));

    const url = `/api/admin/usuarios?${params.toString()}`;
    const res = await fetch(url, { cache: "no-store" });

    if (res.status === 401 || res.status === 403) {
      router.replace("/");
      return;
    }

    const data = await res.json();
    if (!res.ok || !data?.success) {
      throw new Error(data?.error || "No se pudo cargar usuarios");
    }

    setRows(Array.isArray(data.users) ? data.users : []);
    setTotal(Number.isFinite(data.total) ? data.total : (Array.isArray(data.users) ? data.users.length : 0));
  }, [router, debouncedFilter, sortBy, sortDir, page, pageSize]);

  // --- Ejecutar carga cuando cambian los controles o se habilita el acceso
  useEffect(() => {
    if (!isSuperAdmin) return;
    (async () => {
      try {
        setLoading(true);
        await reload();
      } catch (e) {
        setAutoClearMessage(`❌ ${e.message}`);
      } finally {
        setLoading(false);
      }
    })();
  }, [isSuperAdmin, reload]);

  // --- Reset de página cuando cambian criterios base
  useEffect(() => {
    setPage(1);
  }, [debouncedFilter, sortBy, sortDir, pageSize]);

  // --- Helpers UI
  const currentPage = Math.max(1, page);
  const totalPages = Math.max(1, Math.ceil((total || 0) / pageSize));

  const handleSort = (key) => {
    if (sortBy === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortBy(key);
      setSortDir("asc");
    }
    // page reset -> handled by effect
  };

  const SortIcon = ({ col }) => {
    const active = sortBy === col;
    const dir = active ? sortDir : "asc";
    return (
      <span className={`inline-flex items-center ml-1 ${active ? "text-orange-400" : "text-gray-500"}`}>
        {dir === "asc" ? (
          <svg className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor"><path d="M3 12l7-8 7 8H3z" /></svg>
        ) : (
          <svg className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor"><path d="M17 8l-7 8-7-8h14z" /></svg>
        )}
      </span>
    );
  };

  const handleChangeRole = async (user, nextRole) => {
    const currentRole = (user.role || "").toUpperCase();
    const myId = session?.user?.id;

    if (currentRole === "SUPERADMIN") {
      setAutoClearMessage("⚠️ No puedes cambiar el rol de otro SUPERADMIN.");
      return;
    }
    if (user.id === myId) {
      setAutoClearMessage("⚠️ No puedes cambiar tu propio rol desde aquí.");
      return;
    }

    // Optimistic UI
    const prevRows = [...rows];
    setRows((arr) => arr.map((u) => (u.id === user.id ? { ...u, role: nextRole } : u)));
    setSavingId(user.id);
    setMessage("");

    try {
      const res = await fetch("/api/admin/usuarios", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: user.id, role: nextRole }),
      });

      if (res.status === 401 || res.status === 403) {
        router.replace("/");
        return;
      }

      const data = await res.json();
      if (!res.ok || !data?.success) {
        throw new Error(data?.error || "Error al actualizar rol");
      }

      // Vuelve a pedir al server para ver el estado real (respetando paginación/orden)
      await reload();
      setAutoClearMessage(`✅ Rol actualizado a ${nextRole} para ${user.email}`);
    } catch (e) {
      setRows(prevRows); // revert
      setAutoClearMessage(`❌ ${e.message}`);
    } finally {
      setSavingId(null);
    }
  };

  // --- Loading
  if (status === "loading" || loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-950 to-gray-900 flex items-center justify-center p-6">
        <div className="text-center">
          <div className="relative mb-6">
            <div className="w-16 h-16 border-4 border-orange-500 border-t-transparent rounded-full animate-spin mx-auto"></div>
          </div>
          <h2 className="text-xl font-semibold text-white mb-2">Cargando usuarios…</h2>
          <p className="text-gray-400">Obteniendo datos</p>
        </div>
      </div>
    );
  }

  if (!isSuperAdmin) return null;

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-950 to-gray-900 text-gray-100">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="bg-gray-800/50 backdrop-blur-sm border border-gray-700 rounded-2xl overflow-hidden shadow-2xl">
          {/* Header */}
          <div className="relative p-6 bg-gradient-to-r from-gray-800 to-gray-800/90 border-b border-gray-700">
            <div className="absolute inset-0 bg-gradient-to-r from-orange-500/5 to-transparent pointer-events-none" />
            <div className="relative flex items-center justify-between">
              <div>
                <h1 className="text-2xl md:text-3xl font-bold text-white">Gestión de Usuarios</h1>
                <p className="text-gray-300 mt-2">
                  Paginación, orden y búsqueda en servidor (solo SUPERADMIN).
                </p>
              </div>
              <button
                onClick={() => router.push("/admin")}
                className="px-4 py-2 bg-white/10 hover:bg-white/20 border border-gray-600 rounded-lg text-sm transition-colors"
              >
                ← Volver al panel
              </button>
            </div>
          </div>

          {/* Mensajes */}
          {message && (
            <div
              className={`m-6 p-4 rounded-xl border-l-4 ${
                message.startsWith("✅")
                  ? "bg-emerald-900/30 border-emerald-700 text-emerald-200"
                  : "bg-rose-900/30 border-rose-700 text-rose-200"
              }`}
            >
              {message}
            </div>
          )}

          {/* Controles */}
          <div className="p-6 pt-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="text-sm text-gray-400">
                Página <span className="text-gray-200 font-medium">{currentPage}</span> de{" "}
                <span className="text-gray-200 font-medium">{totalPages}</span> ·{" "}
                Total: <span className="text-gray-200 font-medium">{total}</span>
              </div>

              <div className="flex items-center gap-3">
                <label className="text-sm text-gray-400">
                  Filas por página:{" "}
                  <select
                    value={pageSize}
                    onChange={(e) => setPageSize(Number(e.target.value))}
                    className="ml-1 bg-gray-800 border border-gray-700 rounded-md px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/40"
                  >
                    {PAGE_SIZE_OPTIONS.map((n) => (
                      <option key={n} value={n}>{n}</option>
                    ))}
                  </select>
                </label>

                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setPage(1)}
                    disabled={currentPage === 1}
                    className="px-2 py-1 bg-white/5 border border-gray-700 rounded-md text-sm disabled:opacity-40"
                    title="Primera página"
                  >
                    «
                  </button>
                  <button
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                    className="px-2 py-1 bg-white/5 border border-gray-700 rounded-md text-sm disabled:opacity-40"
                    title="Anterior"
                  >
                    ‹
                  </button>
                  <span className="px-2 text-sm text-gray-300">
                    {currentPage} / {totalPages}
                  </span>
                  <button
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    disabled={currentPage === totalPages}
                    className="px-2 py-1 bg-white/5 border border-gray-700 rounded-md text-sm disabled:opacity-40"
                    title="Siguiente"
                  >
                    ›
                  </button>
                  <button
                    onClick={() => setPage(totalPages)}
                    disabled={currentPage === totalPages}
                    className="px-2 py-1 bg-white/5 border border-gray-700 rounded-md text-sm disabled:opacity-40"
                    title="Última página"
                  >
                    »
                  </button>
                </div>
              </div>
            </div>

            {/* Buscador */}
            <div className="mt-4 flex items-center gap-3">
              <input
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder="Buscar por nombre, email o rol…"
                className="w-full sm:w-96 px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 placeholder-gray-500 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/40 transition-colors"
              />
              {filter && (
                <button
                  onClick={() => setFilter("")}
                  className="px-2 py-2 text-gray-400 hover:text-gray-200 transition-colors"
                  title="Limpiar filtro"
                >
                  ✕
                </button>
              )}
            </div>
          </div>

          {/* Tabla */}
          <div className="px-6 pb-6">
            <div className="overflow-x-auto rounded-xl border border-gray-700/60">
              <table className="min-w-full text-sm">
                <thead className="bg-gray-800/70 border-b border-gray-700/60">
                  <tr>
                    <th className="text-left px-4 py-3 font-semibold text-gray-300">
                      <button onClick={() => handleSort("name")} className="inline-flex items-center hover:text-white" title="Ordenar por nombre">
                        Nombre <SortIcon col="name" />
                      </button>
                    </th>
                    <th className="text-left px-4 py-3 font-semibold text-gray-300">
                      <button onClick={() => handleSort("email")} className="inline-flex items-center hover:text-white" title="Ordenar por email">
                        Email <SortIcon col="email" />
                      </button>
                    </th>
                    <th className="text-left px-4 py-3 font-semibold text-gray-300">
                      <button onClick={() => handleSort("role")} className="inline-flex items-center hover:text-white" title="Ordenar por rol">
                        Rol <SortIcon col="role" />
                      </button>
                    </th>
                    <th className="text-left px-4 py-3 font-semibold text-gray-300">
                      <button onClick={() => handleSort("isActive")} className="inline-flex items-center hover:text-white" title="Ordenar por estado">
                        Estado <SortIcon col="isActive" />
                      </button>
                    </th>
                    <th className="text-right px-4 py-3 font-semibold text-gray-300">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-700/60">
                  {rows.map((u) => {
                    const isSelf = u.id === session?.user?.id;
                    const role = (u.role || "").toUpperCase();
                    const editable = role !== "SUPERADMIN" && !isSelf; // UI guard
                    const isBeingUpdated = savingId === u.id;

                    return (
                      <tr key={u.id} className="bg-gray-900/40 hover:bg-gray-900/60 transition-colors">
                        <td className="px-4 py-3">
                          <div className="text-gray-100">{u.name || "Sin nombre"}</div>
                          <div className="text-xs text-gray-500 mt-0.5">ID: {u.id}</div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="text-gray-200">{u.email}</div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <span
                              className={`px-2 py-1 rounded-md text-xs border ${
                                role === "SUPERADMIN"
                                  ? "bg-orange-500/10 border-orange-500/30 text-orange-300"
                                  : role === "ADMIN"
                                  ? "bg-indigo-500/10 border-indigo-500/30 text-indigo-300"
                                  : "bg-emerald-500/10 border-emerald-500/30 text-emerald-300"
                              }`}
                            >
                              {role}
                            </span>
                            {editable ? (
                              <div className="flex items-center gap-1">
                                <select
                                  value={role}
                                  onChange={(e) => handleChangeRole(u, e.target.value)}
                                  disabled={isBeingUpdated}
                                  className="bg-gray-800 border border-gray-700 rounded-md px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-orange-500/40 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                                >
                                  {ROLE_OPTIONS.map((r) => (
                                    <option key={r} value={r}>{r}</option>
                                  ))}
                                </select>
                                {isBeingUpdated && (
                                  <div className="w-4 h-4 border-2 border-orange-500 border-t-transparent rounded-full animate-spin"></div>
                                )}
                              </div>
                            ) : (
                              <span className="text-xs text-gray-500">
                                {isSelf ? "No editable (tu cuenta)" : "No editable"}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`px-2 py-1 rounded-md text-xs border ${
                              u.isActive
                                ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-300"
                                : "bg-gray-700/40 border-gray-700 text-gray-300"
                            }`}
                          >
                            {u.isActive ? "Activo" : "Inactivo"}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <button
                            disabled
                            className="px-3 py-1.5 text-xs bg-white/5 border border-gray-700 rounded-md text-gray-400 cursor-not-allowed"
                            title="Acciones futuras"
                          >
                            Próximamente
                          </button>
                        </td>
                      </tr>
                    );
                  })}

                  {rows.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-4 py-10 text-center text-gray-400">
                        {debouncedFilter ? `Sin resultados para "${debouncedFilter}".` : "No hay usuarios disponibles."}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Footer de paginación */}
            <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="text-sm text-gray-400">
                Página <span className="text-gray-200 font-medium">{currentPage}</span> de{" "}
                <span className="text-gray-200 font-medium">{totalPages}</span> ·{" "}
                Total: <span className="text-gray-200 font-medium">{total}</span>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setPage(1)}
                  disabled={currentPage === 1}
                  className="px-2 py-1 bg-white/5 border border-gray-700 rounded-md text-sm disabled:opacity-40"
                  title="Primera página"
                >
                  «
                </button>
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="px-2 py-1 bg-white/5 border border-gray-700 rounded-md text-sm disabled:opacity-40"
                  title="Anterior"
                >
                  ‹
                </button>
                <span className="px-2 text-sm text-gray-300">
                  {currentPage} / {totalPages}
                </span>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                  className="px-2 py-1 bg-white/5 border border-gray-700 rounded-md text-sm disabled:opacity-40"
                  title="Siguiente"
                >
                  ›
                </button>
                <button
                  onClick={() => setPage(totalPages)}
                  disabled={currentPage === totalPages}
                  className="px-2 py-1 bg-white/5 border border-gray-700 rounded-md text-sm disabled:opacity-40"
                  title="Última página"
                >
                  »
                </button>
              </div>
            </div>

            <p className="text-xs text-gray-500 mt-3">
              * Los SUPERADMIN no son editables desde esta interfaz. El backend también lo valida.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
