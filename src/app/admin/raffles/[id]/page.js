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
      <div className="max-w-2xl mx-auto p-6">
        <div className="animate-pulse">
          <div className="h-8 bg-gray-200 rounded w-1/3 mb-6"></div>
          <div className="space-y-4">
            <div className="h-10 bg-gray-200 rounded"></div>
            <div className="h-24 bg-gray-200 rounded"></div>
            <div className="h-10 bg-gray-200 rounded"></div>
          </div>
        </div>
      </div>
    );
  }

  if (!data || data.error) {
    return (
      <div className="max-w-2xl mx-auto p-6">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <h1 className="text-xl font-bold text-red-800 mb-2">Sorteo no encontrado</h1>
          <p className="text-red-600 mb-4">{error || "El sorteo que buscas no existe o no tienes permisos para editarlo."}</p>
          <Link href="/admin" className="text-red-600 hover:underline">← Volver al panel admin</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto p-6">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-2">
          <h1 className="text-3xl font-bold text-gray-900">Editar Sorteo</h1>
          <Link href={`/sorteo/${id}`} className="text-blue-600 hover:underline text-sm">
            Ver página pública →
          </Link>
        </div>
        <p className="text-gray-600">ID: {id}</p>
        <div className="text-sm text-gray-500 mt-2">
          <Link href="/admin" className="hover:underline">Admin</Link>
          <span className="mx-2">→</span>
          <span>Editar Sorteo</span>
        </div>
      </div>

      {/* Alerts */}
      {error && (
        <div className="mb-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
          {error}
        </div>
      )}

      {success && (
        <div className="mb-4 bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg">
          {success}
        </div>
      )}

      {/* Stats */}
      <div className="bg-gray-50 rounded-lg p-4 mb-6">
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <span className="font-medium">Participantes:</span> {data._count?.participations || 0}
          </div>
          <div>
            <span className="font-medium">Tickets:</span> {data._count?.tickets || 0}
          </div>
          <div>
            <span className="font-medium">Estado:</span> 
            <span className={`ml-1 px-2 py-1 rounded-full text-xs ${
              data.status === 'PUBLISHED' ? 'bg-green-100 text-green-800' :
              data.status === 'ACTIVE' ? 'bg-blue-100 text-blue-800' :
              data.status === 'DRAFT' ? 'bg-gray-100 text-gray-800' :
              'bg-yellow-100 text-yellow-800'
            }`}>
              {data.status}
            </span>
          </div>
          <div>
            <span className="font-medium">Creador:</span> {data.owner?.name || 'N/A'}
          </div>
        </div>
      </div>

      {/* Form */}
      <form onSubmit={handleSave} className="space-y-6">
        {/* Título */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Título *
          </label>
          <input
            type="text"
            required
            className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            value={data.title || ""}
            onChange={e => setData({ ...data, title: e.target.value })}
            placeholder="Título del sorteo"
          />
        </div>

        {/* Descripción */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Descripción
          </label>
          <textarea
            rows={4}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            value={data.description || ""}
            onChange={e => setData({ ...data, description: e.target.value })}
            placeholder="Describe el sorteo..."
          />
        </div>

        {/* Precio del ticket */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Precio del ticket *
          </label>
          <div className="relative">
            <span className="absolute left-3 top-2 text-gray-500">$</span>
            <input
              type="number"
              step="0.01"
              min="0"
              required
              className="w-full border border-gray-300 rounded-lg pl-8 pr-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
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
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Límite de participantes
          </label>
          <input
            type="number"
            min="1"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            value={data.participantLimit || ""}
            onChange={e => setData({ ...data, participantLimit: e.target.value ? parseInt(e.target.value, 10) : null })}
            placeholder="Deja vacío para sin límite"
          />
          <p className="text-sm text-gray-500 mt-1">Déjalo vacío si no quieres límite de participantes</p>
        </div>

        {/* Fecha de finalización */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Fecha de finalización
          </label>
          <input
            type="datetime-local"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            value={formatDateForInput(data.endsAt)}
            onChange={e => setData({ ...data, endsAt: e.target.value ? new Date(e.target.value).toISOString() : null })}
          />
          <p className="text-sm text-gray-500 mt-1">Déjalo vacío si no tiene fecha límite</p>
        </div>

        {/* Publicado */}
        <div>
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={!!data.published}
              onChange={e => setData({ ...data, published: e.target.checked })}
              className="w-4 h-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded"
            />
            <div>
              <span className="font-medium text-gray-700">Publicado</span>
              <p className="text-sm text-gray-500">Hacer visible a los usuarios para que puedan participar</p>
            </div>
          </label>
        </div>

        {/* Botones de acción */}
        <div className="flex flex-col sm:flex-row gap-3 pt-6 border-t">
          <button
            type="submit"
            disabled={saving}
            className="flex-1 sm:flex-none px-6 py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium"
          >
            {saving ? "Guardando..." : "Guardar cambios"}
          </button>

          <button
            type="button"
            onClick={() => router.push("/admin")}
            className="flex-1 sm:flex-none px-6 py-3 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors font-medium"
          >
            Cancelar
          </button>

          <button
            type="button"
            onClick={handleDelete}
            disabled={deleting}
            className="flex-1 sm:flex-none px-6 py-3 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium"
          >
            {deleting ? "Eliminando..." : "Eliminar sorteo"}
          </button>
        </div>
      </form>

      {/* Info adicional */}
      <div className="mt-8 text-xs text-gray-500 bg-gray-50 rounded-lg p-4">
        <p><strong>Nota:</strong> No puedes eliminar un sorteo que ya tiene participantes o tickets vendidos.</p>
        <p className="mt-1">Creado: {data.createdAt ? new Date(data.createdAt).toLocaleString() : "N/A"}</p>
        {data.updatedAt && <p>Última actualización: {new Date(data.updatedAt).toLocaleString()}</p>}
        {data.publishedAt && <p>Publicado: {new Date(data.publishedAt).toLocaleString()}</p>}
      </div>
    </div>
  );
}