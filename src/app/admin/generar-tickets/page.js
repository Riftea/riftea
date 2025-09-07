// src/app/admin/generar-tickets/page.jsx
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
      <div className="max-w-4xl mx-auto p-6">
        <p className="text-center">Cargando...</p>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto p-6">
      <div className="mb-6">
        <div className="flex items-center gap-4 mb-4">
          <button onClick={() => router.push("/admin")} className="px-4 py-2 bg-gray-500 text-white rounded hover:bg-gray-600">
            ← Volver
          </button>
          <h1 className="text-3xl font-bold">Generar Tickets (genéricos)</h1>
          <span className="px-3 py-1 bg-red-100 text-red-800 text-sm rounded-full font-semibold">SUPERADMIN</span>
        </div>
        <p className="text-gray-600">Asigna tickets genéricos a cualquier usuario.</p>
      </div>

      <form onSubmit={generarTickets} className="bg-white shadow-lg rounded-lg p-6 relative">
        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-700 mb-2">Seleccionar Usuario *</label>
          <div className="relative">
            <input
              type="text"
              name="busquedaUsuario"
              value={formData.busquedaUsuario}
              onChange={handleInputChange}
              placeholder="Buscar por nombre o email..."
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              autoComplete="off"
            />
            {formData.userId && (
              <button
                type="button"
                onClick={limpiarSeleccionUsuario}
                className="absolute right-2 top-2 text-gray-400 hover:text-gray-600"
                title="Quitar selección"
              >
                ✕
              </button>
            )}
          </div>

          {usuariosFiltrados.length > 0 && (
            <div className="absolute z-10 w-[calc(100%-3rem)] mt-1 bg-white border border-gray-300 rounded-lg shadow-lg max-h-60 overflow-y-auto">
              {usuariosFiltrados.map((u) => (
                <button
                  key={u.id}
                  type="button"
                  onClick={() => seleccionarUsuario(u)}
                  className="w-full px-4 py-3 text-left hover:bg-gray-50 border-b border-gray-100 last:border-b-0"
                >
                  <div className="font-medium">{u.name || "(sin nombre)"}</div>
                  <div className="text-sm text-gray-500">{u.email}</div>
                  <div className="text-xs text-gray-400">
                    Rol: {u.role} {u.createdAt ? `| Creado: ${new Date(u.createdAt).toLocaleDateString()}` : ""}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="mb-6">
          <label htmlFor="cantidad" className="block text-sm font-medium text-gray-700 mb-2">
            Cantidad de Tickets *
          </label>
          <input
            type="number"
            id="cantidad"
            name="cantidad"
            value={formData.cantidad}
            onChange={handleInputChange}
            min="1"
            max="100"
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            required
          />
          <p className="text-sm text-gray-500 mt-1">Máximo 100 tickets por operación</p>
        </div>

        {mensaje && (
          <div
            className={`p-4 rounded-lg mb-6 ${
              mensaje.startsWith("✅")
                ? "bg-green-50 border border-green-200 text-green-800"
                : mensaje.startsWith("❌")
                ? "bg-red-50 border border-red-200 text-red-800"
                : "bg-blue-50 border border-blue-200 text-blue-800"
            }`}
          >
            {mensaje}
          </div>
        )}

        <div className="flex gap-4">
          <button
            type="submit"
            disabled={generando || !formData.userId}
            className="px-6 py-3 bg-red-600 text-white rounded-lg font-semibold hover:bg-red-700 disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {generando ? (
              <>
                <span className="animate-spin">⚪</span>
                Generando...
              </>
            ) : (
              <>⚡ Generar Tickets</>
            )}
          </button>

          <button
            type="button"
            onClick={() => router.push("/admin")}
            className="px-6 py-3 bg-gray-500 text-white rounded-lg font-semibold hover:bg-gray-600"
          >
            Cancelar
          </button>
        </div>
      </form>

      <div className="mt-8 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
        <h3 className="font-semibold text-yellow-800 mb-2">⚠️ Importante:</h3>
        <ul className="text-sm text-yellow-700 space-y-1">
          <li>• Solo SUPERADMIN puede generar tickets manualmente</li>
          <li>• Los tickets son genéricos (sin sorteo) y quedan en estado AVAILABLE</li>
          <li>• Los usuarios los aplican luego a la rifa que quieran</li>
        </ul>
      </div>
    </div>
  );
}
