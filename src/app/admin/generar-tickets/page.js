"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";

export default function GenerarTicketsPage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [generando, setGenerando] = useState(false);
  const [usuarios, setUsuarios] = useState([]);
  const [usuariosFiltrados, setUsuariosFiltrados] = useState([]);
  const [mensaje, setMensaje] = useState("");

  const [formData, setFormData] = useState({
    userId: "",
    cantidad: 1,
    busquedaUsuario: "",
  });

  // Guardas
  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/");
      return;
    }
    if (status === "authenticated") {
      const role = String(session?.user?.role || "").toUpperCase();
      if (role !== "SUPERADMIN") {
        router.push("/admin");
        return;
      }
    }
  }, [status, session, router]);

  // Carga usuarios (modo lite)
  useEffect(() => {
    const role = String(session?.user?.role || "").toUpperCase();
    if (role === "SUPERADMIN") {
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
    }
  }, [session]);

  // Filtrado live
  useEffect(() => {
    if (formData.busquedaUsuario.trim()) {
      const q = formData.busquedaUsuario.toLowerCase();
      setUsuariosFiltrados(
        usuarios.filter(
          (u) => (u.name || "").toLowerCase().includes(q) || (u.email || "").toLowerCase().includes(q)
        )
      );
    } else {
      setUsuariosFiltrados([]);
    }
  }, [formData.busquedaUsuario, usuarios]);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData((p) => ({ ...p, [name]: value }));
    if (mensaje) setMensaje("");
  };

  const seleccionarUsuario = (usuario) => {
    setFormData((p) => ({
      ...p,
      userId: usuario.id,
      busquedaUsuario: `${usuario.name || "(sin nombre)"} (${usuario.email})`,
    }));
    setUsuariosFiltrados([]);
  };

  const limpiarSeleccionUsuario = () => {
    setFormData((p) => ({ ...p, userId: "", busquedaUsuario: "" }));
  };

  const generarTickets = async (e) => {
    e.preventDefault();

    const qty = Number(formData.cantidad);
    if (!formData.userId || !Number.isInteger(qty) || qty < 1 || qty > 100) {
      setMensaje("Completa usuario y cantidad (1..100)");
      return;
    }

    setGenerando(true);
    setMensaje("");

    try {
      const resp = await fetch("/api/admin/tickets/issue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: formData.userId, cantidad: qty }),
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

      setMensaje(`✅ ${payload.count} ticket(s) generados para el usuario`);
      setFormData({ userId: "", cantidad: 1, busquedaUsuario: "" });
    } catch (err) {
      console.error("Error generando tickets:", err);
      setMensaje("❌ Error interno del servidor");
    } finally {
      setGenerando(false);
    }
  };

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

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      <div className="max-w-4xl mx-auto p-6">
        {/* Header mejorado */}
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
              <p className="text-slate-600">Asigna tickets genéricos a cualquier usuario</p>
            </div>
            <span className="px-4 py-2 bg-gradient-to-r from-red-500 to-red-600 text-white text-sm font-semibold rounded-full shadow-sm">
              SUPERADMIN
            </span>
          </div>
        </div>

        {/* Formulario mejorado */}
        <form onSubmit={generarTickets} className="bg-white shadow-xl rounded-2xl p-8 relative border border-slate-200">
          {/* Campo de búsqueda de usuario */}
          <div className="mb-8">
            <label className="block text-sm font-semibold text-slate-700 mb-3">
              Seleccionar Usuario <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <input
                type="text"
                name="busquedaUsuario"
                value={formData.busquedaUsuario}
                onChange={handleInputChange}
                placeholder="Buscar por nombre o email..."
                className="w-full px-4 py-3 text-slate-800 bg-slate-50 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 focus:bg-white transition-all duration-200 placeholder-slate-400"
                autoComplete="off"
              />
              {formData.userId && (
                <button
                  type="button"
                  onClick={limpiarSeleccionUsuario}
                  className="absolute right-3 top-1/2 transform -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1 rounded-full hover:bg-slate-100 transition-colors duration-200"
                  title="Quitar selección"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>

            {usuariosFiltrados.length > 0 && (
              <div className="absolute z-10 w-[calc(100%-4rem)] mt-2 bg-white border border-slate-200 rounded-xl shadow-2xl max-h-60 overflow-y-auto">
                {usuariosFiltrados.map((u) => (
                  <button
                    key={u.id}
                    type="button"
                    onClick={() => seleccionarUsuario(u)}
                    className="w-full px-4 py-4 text-left hover:bg-slate-50 border-b border-slate-100 last:border-b-0 first:rounded-t-xl last:rounded-b-xl transition-colors duration-150"
                  >
                    <div className="font-semibold text-slate-800">{u.name || "(sin nombre)"}</div>
                    <div className="text-sm text-slate-600">{u.email}</div>
                    <div className="text-xs text-slate-500 mt-1">
                      Rol: {u.role} {u.createdAt ? `| Creado: ${new Date(u.createdAt).toLocaleDateString()}` : ""}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Campo cantidad */}
          <div className="mb-8">
            <label htmlFor="cantidad" className="block text-sm font-semibold text-slate-700 mb-3">
              Cantidad de Tickets <span className="text-red-500">*</span>
            </label>
            <input
              type="number"
              id="cantidad"
              name="cantidad"
              value={formData.cantidad}
              onChange={handleInputChange}
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

          {/* Mensaje de estado */}
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
                <span className="font-medium">{mensaje.substring(2)}</span>
              </div>
            </div>
          )}

          {/* Botones */}
          <div className="flex gap-4">
            <button
              type="submit"
              disabled={generando || !formData.userId}
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
                  Generar Tickets
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

        {/* Info importante mejorada */}
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
                  <span>Solo SUPERADMIN puede generar tickets manualmente</span>
                </div>
                <div className="flex items-start gap-2">
                  <span className="text-amber-600 mt-1">•</span>
                  <span>Los tickets son genéricos (sin sorteo) y quedan en estado AVAILABLE</span>
                </div>
                <div className="flex items-start gap-2">
                  <span className="text-amber-600 mt-1">•</span>
                  <span>Los usuarios los aplican luego a la rifa que quieran</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}