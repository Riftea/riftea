"use client";

import { useState, useEffect, useMemo } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";

const ROLES = ["USER", "ADMIN", "SUPERADMIN"];

export default function GenerarTicketsPage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [generando, setGenerando] = useState(false);
  const [usuarios, setUsuarios] = useState([]);
  const [usuariosFiltrados, setUsuariosFiltrados] = useState([]);
  const [mensaje, setMensaje] = useState("");

  // selección múltiple
  const [selectedUsers, setSelectedUsers] = useState([]); // [{id,name,email,role}]
  const [selectedGroups, setSelectedGroups] = useState(new Set()); // Set<ROLE>
  const [selectAll, setSelectAll] = useState(false);

  const [formData, setFormData] = useState({
    cantidad: 1,
    busquedaUsuario: "",
  });

  const isSuperadmin = useMemo(
    () => String(session?.user?.role || "").toUpperCase() === "SUPERADMIN",
    [session?.user?.role]
  );

  // ===== Guards =====
  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/");
      return;
    }
    if (status === "authenticated" && !isSuperadmin) {
      router.push("/admin");
      return;
    }
  }, [status, isSuperadmin, router]);

  // ===== Carga usuarios =====
  useEffect(() => {
    if (!isSuperadmin) return;
    (async () => {
      try {
        setLoading(true);
        const res = await fetch("/api/admin/usuarios?lite=1");
        const data = await res.json();
        const users = Array.isArray(data?.users) ? data.users : [];
        setUsuarios(users);
      } catch (e) {
        console.error("Carga usuarios:", e);
        setMensaje("❌ No se pudieron cargar usuarios");
      } finally {
        setLoading(false);
      }
    })();
  }, [isSuperadmin]);

  // ===== Filtrado live =====
  useEffect(() => {
    const q = (formData.busquedaUsuario || "").trim().toLowerCase();
    if (q) {
      setUsuariosFiltrados(
        usuarios.filter(
          (u) =>
            (u.name || "").toLowerCase().includes(q) ||
            (u.email || "").toLowerCase().includes(q)
        )
      );
    } else {
      setUsuariosFiltrados([]);
    }
  }, [formData.busquedaUsuario, usuarios]);

  // ===== Helpers selección =====
  const isSelected = (id) => selectedUsers.some((u) => u.id === id);

  const toggleUser = (u) => {
    setMensaje("");
    setSelectAll(false);
    setSelectedGroups(new Set()); // si selecciono individual, desactivo grupos
    setSelectedUsers((prev) => {
      if (prev.some((x) => x.id === u.id)) {
        return prev.filter((x) => x.id !== u.id);
      }
      return [
        ...prev,
        { id: u.id, name: u.name, email: u.email, role: (u.role || "").toUpperCase() },
      ];
    });
  };

  const seleccionarUsuarioUnico = (u) => {
    setSelectAll(false);
    setSelectedGroups(new Set());
    setSelectedUsers((prev) =>
      prev.some((x) => x.id === u.id)
        ? prev
        : [
            ...prev,
            { id: u.id, name: u.name, email: u.email, role: (u.role || "").toUpperCase() },
          ]
    );
    setFormData((p) => ({
      ...p,
      busquedaUsuario: `${u.name || "(sin nombre)"} (${u.email})`,
    }));
    setUsuariosFiltrados([]);
  };

  const clearSelection = () => {
    setSelectedUsers([]);
    setSelectedGroups(new Set());
    setSelectAll(false);
    setFormData((p) => ({ ...p, busquedaUsuario: "" }));
    setUsuariosFiltrados([]);
  };

  const handleGroupToggle = (role) => {
    setMensaje("");
    setSelectAll(false);
    setSelectedUsers([]); // al usar grupos, vaciamos selección manual
    setSelectedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(role)) next.delete(role);
      else next.add(role);
      return next;
    });
  };

  const handleSelectAllToggle = () => {
    if (!isSuperadmin) return;
    setMensaje("");
    setSelectAll((v) => !v);
    // al activar "todos", limpiar otras selecciones
    if (!selectAll) {
      setSelectedUsers([]);
      setSelectedGroups(new Set());
    }
  };

  // Users por grupos seleccionados
  const groupedUserIds = useMemo(() => {
    if (selectedGroups.size === 0) return [];
    const rolesSel = Array.from(selectedGroups);
    return usuarios
      .filter((u) => rolesSel.includes(String(u.role || "").toUpperCase()))
      .map((u) => u.id);
  }, [selectedGroups, usuarios]);

  const totalSeleccionados = useMemo(() => {
    if (selectAll) return usuarios.length;
    if (selectedGroups.size > 0) return groupedUserIds.length;
    return selectedUsers.length;
  }, [selectAll, selectedGroups.size, groupedUserIds.length, selectedUsers.length, usuarios.length]);

  // ===== Envío =====
  const generarTickets = async (e) => {
    e.preventDefault();
    const qty = Number(formData.cantidad);
    if (!Number.isInteger(qty) || qty < 1 || qty > 100) {
      setMensaje("❌ Completa una cantidad válida (1..100)");
      return;
    }
    if (!selectAll && selectedGroups.size === 0 && selectedUsers.length === 0) {
      setMensaje("❌ Selecciona usuarios (individuales), grupos o 'Todos'");
      return;
    }

    setGenerando(true);
    setMensaje("");

    try {
      let body;
      if (selectAll) {
        body = { all: true, cantidad: qty };
      } else if (selectedGroups.size > 0) {
        body = { userIds: groupedUserIds, cantidad: qty };
      } else {
        body = { userIds: selectedUsers.map((u) => u.id), cantidad: qty };
      }

      const resp = await fetch("/api/admin/tickets/issue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      let payload;
      try {
        payload = await resp.json();
      } catch {
        setMensaje("❌ Respuesta no válida del servidor");
        setGenerando(false);
        return;
      }

      if (!resp.ok || !payload?.ok) {
        setMensaje(`❌ ${payload?.error || "Error al generar los tickets"}`);
        setGenerando(false);
        return;
      }

      setMensaje(
        `✅ ${payload.count} ticket(s) generados • Afectados: ${payload.usersAffected ?? totalSeleccionados}`
      );
      clearSelection();
      setFormData((p) => ({ ...p, cantidad: 1 }));
    } catch (err) {
      console.error("Error generando tickets:", err);
      setMensaje("❌ Error interno del servidor");
    } finally {
      setGenerando(false);
    }
  };

  // ===== Loading =====
  if (status === "loading" || loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
        <div className="max-w-4xl mx-auto p-6">
          <div className="flex items-center justify-center min-h-[400px]">
            <div className="text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
              <p className="text-slate-600 text-lg">Cargando...</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ===== UI =====
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      <div className="max-w-4xl mx-auto p-6">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-4 mb-4">
            <button
              onClick={() => router.push("/admin")}
              className="inline-flex items-center px-4 py-2 bg-white text-slate-700 border border-slate-300 rounded-lg hover:bg-slate-50 hover:border-slate-400 transition-all duration-200 shadow-sm"
            >
              <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
              Volver
            </button>
            <div className="flex-1">
              <h1 className="text-3xl font-bold text-slate-800 mb-1">Generar Tickets</h1>
              <p className="text-slate-600">Asigná tickets genéricos a uno, varios, grupos o a todos los usuarios</p>
            </div>
            {isSuperadmin && (
              <span className="px-4 py-2 bg-gradient-to-r from-red-500 to-red-600 text-white text-sm font-semibold rounded-full shadow-sm">
                SUPERADMIN
              </span>
            )}
          </div>
        </div>

        {/* Form */}
        <form onSubmit={generarTickets} className="bg-white shadow-xl rounded-2xl p-8 relative border border-slate-200">
          {/* Búsqueda */}
          <div className="mb-6">
            <label className="block text-sm font-semibold text-slate-700 mb-3">
              Buscar usuarios (por nombre o email)
            </label>
            <input
              type="text"
              name="busquedaUsuario"
              value={formData.busquedaUsuario}
              onChange={(e) => {
                setMensaje("");
                setFormData((p) => ({ ...p, busquedaUsuario: e.target.value }));
              }}
              placeholder="Ej: juan, @gmail.com"
              className="w-full px-4 py-3 text-slate-800 bg-slate-50 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 focus:bg-white transition-all duration-200 placeholder-slate-400"
              autoComplete="off"
            />
            {/* Resultados con checkboxes (selección individual) */}
            {usuariosFiltrados.length > 0 && !selectAll && selectedGroups.size === 0 && (
              <div className="mt-2 bg-white border border-slate-200 rounded-xl shadow-2xl max-h-72 overflow-y-auto">
                {usuariosFiltrados.map((u) => (
                  <label
                    key={u.id}
                    className="flex items-start gap-3 px-4 py-3 hover:bg-slate-50 border-b border-slate-100 last:border-b-0 cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={isSelected(u.id)}
                      onChange={() => toggleUser(u)}
                      className="mt-1 w-4 h-4"
                    />
                    <div
                      className="flex-1"
                      onClick={() => seleccionarUsuarioUnico(u)}
                      role="button"
                      title="Agregar a la selección"
                    >
                      <div className="font-semibold text-slate-800">{u.name || "(sin nombre)"}</div>
                      <div className="text-sm text-slate-600">{u.email}</div>
                      <div className="text-xs text-slate-500 mt-1">
                        Rol: {u.role} {u.createdAt ? `| Creado: ${new Date(u.createdAt).toLocaleDateString()}` : ""}
                      </div>
                    </div>
                  </label>
                ))}
              </div>
            )}
          </div>

          {/* Grupos por rol */}
          <div className="mb-6">
            <label className="block text-sm font-semibold text-slate-700 mb-3">
              Seleccionar por grupos (rol)
            </label>
            <div className="flex flex-wrap gap-3">
              {ROLES.map((role) => {
                const checked = selectedGroups.has(role);
                const count = usuarios.filter((u) => String(u.role || "").toUpperCase() === role).length;
                return (
                  <label
                    key={role}
                    className={`inline-flex items-center gap-2 px-3 py-2 rounded-xl border ${
                      checked ? "bg-blue-50 border-blue-400" : "bg-white border-slate-300"
                    } cursor-pointer`}
                  >
                    <input
                      type="checkbox"
                      className="w-4 h-4"
                      checked={checked}
                      onChange={() => handleGroupToggle(role)}
                      disabled={selectAll}
                    />
                    <span className="text-slate-800 font-medium">{role}</span>
                    <span className="text-xs text-slate-500">({count})</span>
                  </label>
                );
              })}
              {!!selectedGroups.size && (
                <button
                  type="button"
                  onClick={() => setSelectedGroups(new Set())}
                  className="text-sm text-slate-600 hover:text-slate-800 underline"
                >
                  Limpiar grupos
                </button>
              )}
            </div>
          </div>

          {/* Seleccionar todos (solo superadmin) */}
          {isSuperadmin && (
            <div className="mb-6">
              <label className="inline-flex items-center gap-2 cursor-pointer select-none">
                <input type="checkbox" className="w-4 h-4" checked={selectAll} onChange={handleSelectAllToggle} />
                <span className="text-sm text-slate-700">Seleccionar todos ({usuarios.length})</span>
              </label>
              {selectAll && (
                <div className="mt-2 px-3 py-2 bg-blue-50 border border-blue-200 rounded-lg text-blue-800 text-sm">
                  Se aplicará a <b>todos</b> los usuarios actuales.
                </div>
              )}
            </div>
          )}

          {/* Chips de selección manual */}
          {!selectAll && selectedGroups.size === 0 && selectedUsers.length > 0 && (
            <div className="mb-6 flex flex-wrap gap-2">
              {selectedUsers.map((u) => (
                <span
                  key={u.id}
                  className="inline-flex items-center gap-2 px-3 py-1.5 bg-slate-100 text-slate-800 rounded-full text-sm"
                >
                  {u.name || u.email} <span className="text-xs text-slate-500">({u.role || "?"})</span>
                  <button type="button" onClick={() => toggleUser(u)} className="text-slate-500 hover:text-slate-700">
                    ✕
                  </button>
                </span>
              ))}
              <button
                type="button"
                onClick={clearSelection}
                className="text-sm text-slate-600 hover:text-slate-800 underline"
              >
                Limpiar selección
              </button>
            </div>
          )}

          {/* Cantidad */}
          <div className="mb-8">
            <label htmlFor="cantidad" className="block text-sm font-semibold text-slate-700 mb-3">
              Cantidad de Tickets <span className="text-red-500">*</span>
            </label>
            <input
              type="number"
              id="cantidad"
              name="cantidad"
              value={formData.cantidad}
              onChange={(e) => {
                setMensaje("");
                setFormData((p) => ({ ...p, cantidad: e.target.value }));
              }}
              min="1"
              max="100"
              className="w-full px-4 py-3 text-slate-800 bg-slate-50 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 focus:bg-white transition-all duration-200"
              required
            />
            <p className="text-sm text-slate-500 mt-2 flex items-center">
              <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Máximo 100 tickets por operación
            </p>
          </div>

          {/* Mensajes */}
          {mensaje && (
            <div
              className={`p-4 rounded-xl mb-8 border-l-4 ${
                mensaje.startsWith("✅")
                  ? "bg-emerald-50 border-l-emerald-500 text-emerald-800"
                  : mensaje.startsWith("❌")
                  ? "bg-red-50 border-l-red-500 text-red-800"
                  : "bg-blue-50 border-l-blue-500 text-blue-800"
              }`}
            >
              <div className="flex items-center">
                <span className="text-lg mr-2">
                  {mensaje.startsWith("✅") ? "✅" : mensaje.startsWith("❌") ? "❌" : "ℹ️"}
                </span>
                <span className="font-medium">{mensaje.replace(/^.. /, "")}</span>
              </div>
            </div>
          )}

          {/* Botones */}
          <div className="flex gap-4">
            <button
              type="submit"
              disabled={generando || (!selectAll && selectedGroups.size === 0 && selectedUsers.length === 0)}
              className="flex-1 px-6 py-4 bg-gradient-to-r from-red-600 to-red-700 text-white rounded-xl font-semibold hover:from-red-700 hover:to-red-800 disabled:from-slate-400 disabled:to-slate-500 disabled:cursor-not-allowed transition-all duration-200 shadow-lg hover:shadow-xl flex items-center justify-center gap-3"
            >
              {generando ? (
                <>
                  <div className="animate-spin rounded-full h-5 w-5 border-2 border-white border-t-transparent"></div>
                  Generando...
                </>
              ) : (
                <>
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                  Generar Tickets {totalSeleccionados > 0 ? `(${totalSeleccionados} usuario/s)` : ""}
                </>
              )}
            </button>

            <button
              type="button"
              onClick={() => router.push("/admin")}
              className="px-6 py-4 bg-slate-500 text-white rounded-xl font-semibold hover:bg-slate-600 transition-colors duration-200 shadow-lg hover:shadow-xl"
            >
              Cancelar
            </button>
          </div>
        </form>

        {/* Info */}
        <div className="mt-8 p-6 bg-gradient-to-r from-amber-50 to-yellow-50 border border-amber-200 rounded-2xl">
          <div className="flex items-start gap-3">
            <div className="flex-shrink-0 w-8 h-8 bg-amber-100 rounded-full flex items-center justify-center">
              <svg className="w-5 h-5 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 15.5c-.77.833.192 2.5 1.732 2.5z" />
              </svg>
            </div>
            <div>
              <h3 className="font-bold text-amber-800 text-lg mb-3">Información Importante</h3>
              <div className="space-y-2 text-amber-700">
                <div className="flex items-start gap-2">
                  <span className="text-amber-600 mt-1">•</span>
                  <span>Solo SUPERADMIN puede generar tickets manualmente.</span>
                </div>
                <div className="flex items-start gap-2">
                  <span className="text-amber-600 mt-1">•</span>
                  <span>Puedes seleccionar usuarios individuales, por grupo (rol) o aplicar a todos.</span>
                </div>
                <div className="flex items-start gap-2">
                  <span className="text-amber-600 mt-1">•</span>
                  <span>Los tickets son genéricos (sin rifa) y quedan en estado AVAILABLE.</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div> 
    </div>
  );
}
