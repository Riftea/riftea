// src/app/admin/raffles/[id]/page.js
"use client";
import { useEffect, useState, use } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function AdminRaffleEdit({ params }) {
  const { id } = use(params); // ✅ Usar React.use() para los parámetros
  const router = useRouter();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  useEffect(() => {
    let mounted = true;

    async function fetchRaffle() {
      setLoading(true);
      setError(null);
      try {
        // ✅ Usar la nueva ruta de admin
        const res = await fetch(`/api/admin/raffles/${id}`);
        if (!res.ok) {
          const errJson = await res.json().catch(() => null);
          throw new Error(errJson?.error || `Status ${res.status}`);
        }
        const raffleData = await res.json();
        
        if (mounted) {
          // ✅ Mapear campos del schema al formato del frontend
          const processedData = {
            ...raffleData,
            // Mapear published basado en status y publishedAt
            published: raffleData.publishedAt !== null && 
                      (raffleData.status === 'PUBLISHED' || raffleData.status === 'ACTIVE'),
            // Mapear maxParticipants a participantLimit para el frontend
            participantLimit: raffleData.maxParticipants
          };
          
          setData(processedData);
          setLoading(false);
        }
      } catch (err) {
        console.error('Error loading raffle:', err);
        if (mounted) {
          setError("Error al cargar el sorteo: " + err.message);
          setLoading(false);
        }
      }
    }

    fetchRaffle();
    return () => {
      mounted = false;
    };
  }, [id]);

  async function handleSave(e) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      if (!data) throw new Error("Datos inválidos");

      // ✅ Construir payload con validaciones mejoradas
      const payload = {};

      // Campos requeridos
      if (data.title?.trim()) {
        payload.title = data.title.trim();
      } else {
        throw new Error("El título es requerido");
      }

      // Campos opcionales
      if (data.description !== undefined) {
        payload.description = data.description;
      }

      // Precio del ticket con validación
      if (data.ticketPrice !== undefined && data.ticketPrice !== null && data.ticketPrice !== "") {
        const price = Number(data.ticketPrice);
        if (isNaN(price) || price <= 0) {
          throw new Error("El precio del ticket debe ser un número mayor a 0");
        }
        payload.ticketPrice = price;
      }

      // Límite de participantes (mapear a maxParticipants en el backend)
      if (data.participantLimit !== undefined && data.participantLimit !== null && data.participantLimit !== "") {
        const limit = parseInt(data.participantLimit, 10);
        if (isNaN(limit) || limit <= 0) {
          throw new Error("El límite de participantes debe ser un número mayor a 0");
        }
        payload.participantLimit = limit;
      } else {
        payload.participantLimit = null;
      }

      // Fecha de finalización
      if (data.endsAt) {
        payload.endsAt = new Date(data.endsAt).toISOString();
      } else {
        payload.endsAt = null;
      }

      // Estado publicado
      payload.published = !!data.published;

      console.log('Sending payload:', payload);

      // ✅ Usar la nueva ruta de admin
      const res = await fetch(`/api/admin/raffles/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || `Error ${res.status}`);
      }

      const updatedData = await res.json();
      console.log('Updated data received:', updatedData);
      
      // ✅ Procesar los datos actualizados y mapear campos
      const processedUpdatedData = {
        ...updatedData,
        // Mapear campos del schema al frontend
        published: updatedData.publishedAt !== null && 
                  (updatedData.status === 'PUBLISHED' || updatedData.status === 'ACTIVE'),
        participantLimit: updatedData.maxParticipants
      };
      
      setData(processedUpdatedData);
      setSuccess("Sorteo guardado exitosamente");

      // Opcional: redirigir después de un tiempo
      setTimeout(() => {
        router.push("/admin");
      }, 2000);
    } catch (err) {
      console.error('Error saving raffle:', err);
      setError(err.message || "No se pudo guardar el sorteo");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!confirm("¿Estás seguro de que quieres eliminar este sorteo? Esta acción no se puede deshacer.")) {
      return;
    }

    setDeleting(true);
    setError(null);

    try {
      // ✅ Usar la nueva ruta de admin
      const res = await fetch(`/api/admin/raffles/${id}`, {
        method: "DELETE",
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || `Error ${res.status}`);
      }

      // Redirigir al panel de admin
      router.push("/admin");
    } catch (err) {
      console.error('Error deleting raffle:', err);
      setError(err.message || "No se pudo eliminar el sorteo");
    } finally {
      setDeleting(false);
    }
  }

  // Formatea la fecha para el input datetime-local en hora local (YYYY-MM-DDTHH:mm)
  function formatDateForInput(dateString) {
    if (!dateString) return "";
    try {
      const date = new Date(dateString);
      const pad = (n) => String(n).padStart(2, "0");
      const yyyy = date.getFullYear();
      const mm = pad(date.getMonth() + 1);
      const dd = pad(date.getDate());
      const hh = pad(date.getHours());
      const min = pad(date.getMinutes());
      return `${yyyy}-${mm}-${dd}T${hh}:${min}`;
    } catch (error) {
      console.error('Error formatting date:', error);
      return "";
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 to-slate-800 text-slate-50 p-6">
        <div className="max-w-2xl mx-auto">
          <div className="animate-pulse space-y-6">
            <div className="h-10 bg-slate-800/40 rounded-xl border border-slate-700/30"></div>
            <div className="h-40 bg-slate-800/40 rounded-xl border border-slate-700/30"></div>
            <div className="h-12 bg-slate-800/40 rounded-xl border border-slate-700/30"></div>
          </div>
        </div>
      </div>
    );
  }

  if (!data || data.error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 to-slate-800 text-slate-50 p-6">
        <div className="max-w-2xl mx-auto">
          <div className="bg-gradient-to-br from-rose-900/10 to-slate-800/50 border border-rose-900/20 rounded-2xl p-8 backdrop-blur-sm">
            <div className="flex items-center space-x-4 mb-4">
              <div className="p-3 bg-rose-500/5 rounded-xl">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-rose-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
              <h1 className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-rose-400 to-pink-400">
                Sorteo no encontrado
              </h1>
            </div>
            <p className="text-slate-300 mb-6">{error || "El sorteo que buscas no existe o no tienes permisos para editarlo."}</p>
            <Link 
              href="/admin" 
              className="group inline-flex items-center text-rose-400 hover:text-rose-300 transition-all"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-2 group-hover:-translate-x-1 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
              Volver al panel admin
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 to-slate-800 text-slate-50">
      {/* Header con efecto glassmorphism suave */}
      <div className="backdrop-blur-md bg-slate-900/60 border-b border-slate-700/20 sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center space-x-3 mb-1">
                <div className="w-2 h-2 rounded-full bg-gradient-to-r from-indigo-500 to-purple-500 animate-pulse" />
                <h1 className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-indigo-400 to-purple-400">
                  Editar Sorteo
                </h1>
              </div>
              <p className="text-slate-400 flex items-center">
                <span className="bg-slate-800/40 px-2 py-0.5 rounded mr-2 text-xs border border-slate-700/30">ID:</span>
                <span className="font-mono text-indigo-300">{id}</span>
              </p>
            </div>
            <Link 
              href={`/sorteo/${id}`} 
              className="group bg-slate-800/40 hover:bg-slate-700/40 border border-slate-700/30 text-slate-300 px-4 py-2 rounded-lg transition-all flex items-center"
            >
              <span className="mr-2 group-hover:translate-x-0.5 transition-transform">→</span>
              Vista pública
            </Link>
          </div>
        </div>
      </div>

      <div className="max-w-2xl mx-auto p-6 pt-0">
        {/* Breadcrumbs */}
        <div className="flex items-center text-sm text-slate-400 mb-6">
          <Link href="/admin" className="hover:text-indigo-400 transition-colors">Admin</Link>
          <span className="mx-2">/</span>
          <span className="text-slate-300">Editar Sorteo</span>
        </div>

        {/* Alerts */}
        {error && (
          <div className="mb-6 p-4 rounded-xl border border-rose-900/20 bg-gradient-to-r from-rose-900/10 to-slate-800/40 backdrop-blur-sm">
            <div className="flex items-start">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-rose-400 mt-0.5 mr-3 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <p className="text-slate-200">{error}</p>
            </div>
          </div>
        )}

        {success && (
          <div className="mb-6 p-4 rounded-xl border border-emerald-900/20 bg-gradient-to-r from-emerald-900/10 to-slate-800/40 backdrop-blur-sm">
            <div className="flex items-start">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-emerald-400 mt-0.5 mr-3 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p className="text-slate-200">{success}</p>
            </div>
          </div>
        )}

        {/* Stats */}
        <div className="grid grid-cols-2 gap-4 mb-8">
          <div className="bg-slate-800/40 border border-slate-700/30 rounded-xl p-5 backdrop-blur-sm">
            <div className="text-sm text-slate-400 mb-1">Participantes</div>
            <div className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-cyan-400 to-blue-400">
              {data._count?.participations || 0}
            </div>
          </div>
          <div className="bg-slate-800/40 border border-slate-700/30 rounded-xl p-5 backdrop-blur-sm">
            <div className="text-sm text-slate-400 mb-1">Tickets</div>
            <div className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-indigo-400 to-purple-400">
              {data._count?.tickets || 0}
            </div>
          </div>
          <div className="bg-slate-800/40 border border-slate-700/30 rounded-xl p-5 backdrop-blur-sm col-span-2">
            <div className="flex justify-between items-center">
              <div>
                <div className="text-sm text-slate-400">Estado</div>
                <div className={`px-3 py-1.5 rounded-full text-sm font-medium mt-1 ${
                  data.status === 'PUBLISHED' ? 'bg-emerald-900/20 text-emerald-300' :
                  data.status === 'ACTIVE' ? 'bg-blue-900/20 text-blue-300' :
                  data.status === 'DRAFT' ? 'bg-slate-700/30 text-slate-200' :
                  'bg-amber-900/20 text-amber-300'
                }`}>
                  {data.status}
                </div>
              </div>
              <div className="text-right">
                <div className="text-sm text-slate-400">Creador</div>
                <div className="font-medium text-slate-200">{data.owner?.name || 'N/A'}</div>
              </div>
            </div>
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleSave} className="space-y-6">
          {/* Título */}
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2 flex items-center">
              <span>Título *</span>
              <span className="ml-2 px-1.5 py-0.5 text-xs bg-indigo-900/20 text-indigo-300 rounded">
                Requerido
              </span>
            </label>
            <input
              type="text"
              required
              className="w-full bg-slate-800/40 border border-slate-700/30 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500/30 transition-all placeholder:text-slate-500"
              value={data.title || ""}
              onChange={e => setData({ ...data, title: e.target.value })}
              placeholder="Título del sorteo"
            />
          </div>

          {/* Descripción */}
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">
              Descripción
            </label>
            <textarea
              rows={4}
              className="w-full bg-slate-800/40 border border-slate-700/30 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500/30 transition-all placeholder:text-slate-500"
              value={data.description || ""}
              onChange={e => setData({ ...data, description: e.target.value })}
              placeholder="Describe el sorteo..."
            />
          </div>

          {/* Precio del ticket */}
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2 flex items-center">
              <span>Precio del ticket *</span>
              <span className="ml-2 px-1.5 py-0.5 text-xs bg-indigo-900/20 text-indigo-300 rounded">
                Requerido
              </span>
            </label>
            <div className="relative">
              <span className="absolute left-4 top-3.5 text-slate-400">$</span>
              <input
                type="number"
                step="0.01"
                min="0"
                required
                className="w-full bg-slate-800/40 border border-slate-700/30 rounded-xl pl-10 pr-4 py-3 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500/30 transition-all placeholder:text-slate-500"
                value={data.ticketPrice !== undefined && data.ticketPrice !== null ? data.ticketPrice : ""}
                onChange={e => {
                  const value = e.target.value;
                  setData({ ...data, ticketPrice: value === "" ? "" : Number(value) });
                }}
                placeholder="0.00"
              />
            </div>
          </div>

          {/* Límite de participantes */}
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">
              Límite de participantes
            </label>
            <input
              type="number"
              min="1"
              className="w-full bg-slate-800/40 border border-slate-700/30 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500/30 transition-all placeholder:text-slate-500"
              value={data.participantLimit || ""}
              onChange={e => setData({ ...data, participantLimit: e.target.value ? parseInt(e.target.value, 10) : null })}
              placeholder="Deja vacío para sin límite"
            />
            <p className="text-xs text-slate-400 mt-1 flex items-center">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3 mr-1 opacity-70" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Déjalo vacío si no quieres límite de participantes
            </p>
          </div>

          {/* Fecha de finalización */}
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">
              Fecha de finalización
            </label>
            <input
              type="datetime-local"
              className="w-full bg-slate-800/40 border border-slate-700/30 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500/30 transition-all"
              value={formatDateForInput(data.endsAt)}
              onChange={e => setData({ ...data, endsAt: e.target.value ? new Date(e.target.value).toISOString() : null })}
            />
            <p className="text-xs text-slate-400 mt-1 flex items-center">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3 mr-1 opacity-70" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              Déjalo vacío si no tiene fecha límite
            </p>
          </div>

          {/* Publicado */}
          <div className="pt-4 border-t border-slate-700/30">
            <label className="flex items-center gap-3 cursor-pointer group">
              <div className="relative">
                <input
                  type="checkbox"
                  checked={!!data.published}
                  onChange={e => setData({ ...data, published: e.target.checked })}
                  className="sr-only"
                />
                <div className={`w-12 h-6 rounded-full transition-colors duration-300 ${
                  data.published ? 'bg-gradient-to-r from-indigo-600 to-purple-600' : 'bg-slate-600'
                }`}></div>
                <div className={`absolute left-1 top-1 bg-white w-4 h-4 rounded-full transition-transform duration-300 ${
                  data.published ? 'transform translate-x-6' : ''
                }`}></div>
              </div>
              <div>
                <span className="font-medium text-slate-200 group-hover:text-white transition-colors">Publicado</span>
                <p className="text-sm text-slate-400 group-hover:text-slate-300 transition-colors">
                  Hacer visible a los usuarios para que puedan participar
                </p>
              </div>
            </label>
          </div>

          {/* Botones de acción */}
          <div className="flex flex-col sm:flex-row gap-3 pt-6 border-t border-slate-700/30">
            <button
              type="submit"
              disabled={saving}
              className="flex-1 sm:flex-none px-6 py-3.5 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-xl hover:from-indigo-700 hover:to-purple-700 disabled:opacity-70 disabled:cursor-not-allowed transition-all font-medium shadow-lg shadow-indigo-500/10 hover:shadow-indigo-500/20"
            >
              {saving ? (
                <span className="flex items-center justify-center">
                  <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Guardando...
                </span>
              ) : "Guardar cambios"}
            </button>

            <button
              type="button"
              onClick={() => router.push("/admin")}
              className="flex-1 sm:flex-none px-6 py-3.5 border border-slate-600/50 text-slate-300 rounded-xl hover:bg-slate-800/30 transition-all font-medium backdrop-blur-sm"
            >
              Cancelar
            </button>

            <button
              type="button"
              onClick={handleDelete}
              disabled={deleting}
              className="flex-1 sm:flex-none px-6 py-3.5 bg-gradient-to-r from-rose-600 to-rose-700 text-white rounded-xl hover:from-rose-700 hover:to-rose-800 disabled:opacity-70 disabled:cursor-not-allowed transition-all font-medium shadow-lg shadow-rose-500/10 hover:shadow-rose-500/20"
            >
              {deleting ? (
                <span className="flex items-center justify-center">
                  <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Eliminando...
                </span>
              ) : "Eliminar sorteo"}
            </button>
          </div>
        </form>

        {/* Info adicional */}
        <div className="mt-8 text-xs text-slate-400 bg-slate-800/40 rounded-xl p-5 border border-slate-700/30 backdrop-blur-sm">
          <div className="flex items-start mb-2">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-2 mt-0.5 text-indigo-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <p><strong>Nota:</strong> No puedes eliminar un sorteo que ya tiene participantes o tickets vendidos.</p>
          </div>
          <div className="grid grid-cols-2 gap-4 mt-3 pt-3 border-t border-slate-700/30">
            <div>
              <p className="text-slate-500">Creado</p>
              <p>{data.createdAt ? new Date(data.createdAt).toLocaleString() : "N/A"}</p>
            </div>
            <div>
              <p className="text-slate-500">Última actualización</p>
              <p>{data.updatedAt ? new Date(data.updatedAt).toLocaleString() : "N/A"}</p>
            </div>
            {data.publishedAt && (
              <div className="col-span-2">
                <p className="text-slate-500">Publicado</p>
                <p>{new Date(data.publishedAt).toLocaleString()}</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}