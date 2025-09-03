"use client";

import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

export default function GenerarTicketsPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  
  // Estados del formulario
  const [formData, setFormData] = useState({
    userId: "",
    sorteoId: "",
    cantidad: 1,
    busquedaUsuario: ""
  });
  
  // Estados para datos
  const [usuarios, setUsuarios] = useState([]);
  const [sorteos, setSorteos] = useState([]);
  const [usuariosFiltrados, setUsuariosFiltrados] = useState([]);
  const [loading, setLoading] = useState(true);
  const [generando, setGenerando] = useState(false);
  const [mensaje, setMensaje] = useState("");

  // Verificación de permisos
  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/");
      return;
    }
    
    if (status === "authenticated" && session?.user?.role !== "superadmin") {
      router.push("/admin");
      return;
    }
  }, [status, session, router]);

  // Cargar datos iniciales
  useEffect(() => {
    if (session?.user?.role === "superadmin") {
      cargarDatos();
    }
  }, [session]);

  // Filtrar usuarios cuando cambia la búsqueda
  useEffect(() => {
    if (formData.busquedaUsuario.trim()) {
      const filtrados = usuarios.filter(usuario =>
        usuario.name?.toLowerCase().includes(formData.busquedaUsuario.toLowerCase()) ||
        usuario.email?.toLowerCase().includes(formData.busquedaUsuario.toLowerCase())
      );
      setUsuariosFiltrados(filtrados);
    } else {
      setUsuariosFiltrados([]);
    }
  }, [formData.busquedaUsuario, usuarios]);

  const cargarDatos = async () => {
    try {
      setLoading(true);
      
      // Cargar usuarios y sorteos en paralelo
      const [usuariosRes, sorteosRes] = await Promise.all([
        fetch("/api/admin/usuarios"),
        fetch("/api/admin/sorteos")
      ]);

      if (usuariosRes.ok && sorteosRes.ok) {
        const usuariosData = await usuariosRes.json();
        const sorteosData = await sorteosRes.json();
        
        setUsuarios(usuariosData);
        setSorteos(sorteosData.filter(sorteo => sorteo.estado === "ACTIVO"));
      }
    } catch (error) {
      console.error("Error cargando datos:", error);
      setMensaje("Error cargando los datos iniciales");
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
    
    // Limpiar mensaje al cambiar inputs
    if (mensaje) setMensaje("");
  };

  const seleccionarUsuario = (usuario) => {
    setFormData(prev => ({
      ...prev,
      userId: usuario.id,
      busquedaUsuario: `${usuario.name} (${usuario.email})`
    }));
    setUsuariosFiltrados([]);
  };

  const limpiarSeleccionUsuario = () => {
    setFormData(prev => ({
      ...prev,
      userId: "",
      busquedaUsuario: ""
    }));
  };

  const generarTickets = async (e) => {
    e.preventDefault();
    
    if (!formData.userId || !formData.sorteoId || formData.cantidad < 1) {
      setMensaje("Por favor completa todos los campos correctamente");
      return;
    }

    setGenerando(true);
    setMensaje("");

    try {
      const response = await fetch("/api/admin/generar-tickets", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          userId: formData.userId,
          sorteoId: formData.sorteoId,
          cantidad: parseInt(formData.cantidad)
        })
      });

      const result = await response.json();

      if (response.ok) {
        setMensaje(`✅ ${result.mensaje}`);
        // Limpiar formulario
        setFormData({
          userId: "",
          sorteoId: "",
          cantidad: 1,
          busquedaUsuario: ""
        });
      } else {
        setMensaje(`❌ ${result.error}`);
      }
    } catch (error) {
      console.error("Error generando tickets:", error);
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
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center gap-4 mb-4">
          <button
            onClick={() => router.push("/admin")}
            className="px-4 py-2 bg-gray-500 text-white rounded hover:bg-gray-600"
          >
            ← Volver
          </button>
          <h1 className="text-3xl font-bold">Generar Tickets</h1>
          <span className="px-3 py-1 bg-red-100 text-red-800 text-sm rounded-full font-semibold">
            SUPERADMIN
          </span>
        </div>
        <p className="text-gray-600">
          Genera tickets manualmente para cualquier usuario en sorteos activos.
        </p>
      </div>

      {/* Formulario */}
      <form onSubmit={generarTickets} className="bg-white shadow-lg rounded-lg p-6">
        {/* Búsqueda de Usuario */}
        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Seleccionar Usuario *
          </label>
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
              >
                ✕
              </button>
            )}
          </div>

          {/* Resultados de búsqueda */}
          {usuariosFiltrados.length > 0 && (
            <div className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg max-h-60 overflow-y-auto">
              {usuariosFiltrados.map(usuario => (
                <button
                  key={usuario.id}
                  type="button"
                  onClick={() => seleccionarUsuario(usuario)}
                  className="w-full px-4 py-3 text-left hover:bg-gray-50 border-b border-gray-100 last:border-b-0"
                >
                  <div className="font-medium">{usuario.name}</div>
                  <div className="text-sm text-gray-500">{usuario.email}</div>
                  <div className="text-xs text-gray-400">
                    Rol: {usuario.role} | Creado: {new Date(usuario.createdAt).toLocaleDateString()}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Seleccionar Sorteo */}
        <div className="mb-6">
          <label htmlFor="sorteoId" className="block text-sm font-medium text-gray-700 mb-2">
            Sorteo Activo *
          </label>
          <select
            id="sorteoId"
            name="sorteoId"
            value={formData.sorteoId}
            onChange={handleInputChange}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            required
          >
            <option value="">Selecciona un sorteo...</option>
            {sorteos.map(sorteo => (
              <option key={sorteo.id} value={sorteo.id}>
                {sorteo.nombre} - {sorteo.categoria} 
                (Fin: {new Date(sorteo.fechaFinalizacion).toLocaleDateString()})
              </option>
            ))}
          </select>
        </div>

        {/* Cantidad de Tickets */}
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

        {/* Mensaje */}
        {mensaje && (
          <div className={`p-4 rounded-lg mb-6 ${
            mensaje.includes('✅') 
              ? 'bg-green-50 border border-green-200 text-green-800' 
              : 'bg-red-50 border border-red-200 text-red-800'
          }`}>
            {mensaje}
          </div>
        )}

        {/* Botones */}
        <div className="flex gap-4">
          <button
            type="submit"
            disabled={generando || !formData.userId || !formData.sorteoId}
            className="px-6 py-3 bg-red-600 text-white rounded-lg font-semibold hover:bg-red-700 disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {generando ? (
              <>
                <span className="animate-spin">⚪</span>
                Generando...
              </>
            ) : (
              <>
                ⚡ Generar Tickets
              </>
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

      {/* Información adicional */}
      <div className="mt-8 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
        <h3 className="font-semibold text-yellow-800 mb-2">⚠️ Importante:</h3>
        <ul className="text-sm text-yellow-700 space-y-1">
          <li>• Solo SUPERADMIN puede generar tickets manualmente</li>
          <li>• Los tickets se asignan automáticamente al usuario seleccionado</li>
          <li>• Solo se pueden generar tickets para sorteos activos</li>
          <li>• Máximo 100 tickets por operación</li>
          <li>• La operación es irreversible</li>
        </ul>
      </div>
    </div>
  );
}