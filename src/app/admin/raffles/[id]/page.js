// app/admin/raffles/[id]/page.js
"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function AdminRaffleEdit({ params }) {
  const { id } = params;
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
        const res = await fetch(`/api/raffles/${id}`);
        if (!res.ok) {
          const errJson = await res.json().catch(() => null);
          throw new Error(errJson?.error || `Status ${res.status}`);
        }
        const d = await res.json();
        if (mounted) {
          setData(d);
          setLoading(false);
        }
      } catch (err) {
        console.error(err);
        if (mounted) {
          setError("Error al cargar el sorteo");
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

      // Construir payload explícito (evita enviar campos no deseados como _count, owner, etc.)
      const payload = {
        title: (data.title ?? "").toString().trim(),
        description: data.description ?? "",
        ticketPrice:
          data.ticketPrice === "" ||
          data.ticketPrice === null ||
          typeof data.ticketPrice === "undefined"
            ? undefined
            : Number(data.ticketPrice),
        participantLimit:
          data.participantLimit === "" ||
          data.participantLimit === null ||
          typeof data.participantLimit === "undefined"
            ? null
            : parseInt(data.participantLimit, 10),
        endsAt: data.endsAt ? new Date(data.endsAt).toISOString() : null,
        published: !!data.published,
      };

      if (typeof payload.ticketPrice === "undefined" || Number.isNaN(payload.ticketPrice)) {
        delete payload.ticketPrice;
      }

      const res = await fetch(`/api/raffles/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || `Status ${res.status}`);
      }

      const updatedData = await res.json();
      setData(updatedData);
      setSuccess("Sorteo guardado exitosamente");

      // Opcional: redirigir después de un tiempo
      setTimeout(() => {
        router.push("/admin");
      }, 2000);
    } catch (err) {
      console.error(err);
      setError(err.message || "No se pudo guardar");
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
      const res = await fetch(`/api/raffles/${id}`, {
        method: "DELETE",
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || `Status ${res.status}`);
      }

      router.push("/admin");
    } catch (err) {
      console.error(err);
      setError(err.message || "No se pudo eliminar");
    } finally {
      setDeleting(false);
    }
  }

  // Formatea la fecha para el input datetime-local en hora local (YYYY-MM-DDTHH:mm)
  function formatDateForInput(dateString) {
    if (!dateString) return "";
    const date = new Date(dateString);
    const pad = (n) => String(n).padStart(2, "0");
    const yyyy = date.getFullYear();
    const mm = pad(date.getMonth() + 1);
    const dd = pad(date.getDate());
    const hh = pad(date.getHours());
    const min = pad(date.getMinutes());
    return `${yyyy}-${mm}-${dd}T${hh}:${min}`;
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
          <p className="text-red-600 mb-4">El sorteo que buscas no existe o no tienes permisos para editarlo.</p>
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
          {/* Enlace a la página pública - corregido para apuntar a /sorteo/[id] */}
          <Link href={`/sorteo/${id}`} className="text-blue-600 hover:underline text-sm">
            Ver página pública →
          </Link>
        </div>
        <p className="text-gray-600">ID: {id}</p>
        {/* Breadcrumb navigation */}
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
            value={data.title ?? ""}
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
            value={data.description ?? ""}
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
              value={typeof data.ticketPrice !== "undefined" && data.ticketPrice !== null ? data.ticketPrice : ""}
              onChange={e => {
                const v = e.target.value;
                setData({ ...data, ticketPrice: v === "" ? "" : Number(v) });
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
            value={data.participantLimit ?? ""}
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
      </div>
    </div>
  );
}