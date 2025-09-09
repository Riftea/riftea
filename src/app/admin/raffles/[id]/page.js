// src/app/admin/raffles/[id]/page.js
"use client";
import { useEffect, useState, use } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function AdminRaffleEdit({ params }) {
  const { id } = use(params);
  const router = useRouter();

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  // Imagen
  const [originalImageUrl, setOriginalImageUrl] = useState(null);
  const [imagePreview, setImagePreview] = useState("");
  const [isEditingImage, setIsEditingImage] = useState(false);

  // Notificaciones
  const [notify, setNotify] = useState(true);

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
        const json = await res.json();
        const raffle = json?.raffle;
        if (!raffle) throw new Error("Sorteo no encontrado");

        if (mounted) {
          const processed = {
            ...raffle,
            // Toggle publicado: si nunca se publicó, arranca en true (visible)
            published:
              raffle.publishedAt != null
                ? raffle.status === "PUBLISHED" || raffle.status === "ACTIVE"
                : true,
            participantLimit: raffle.maxParticipants ?? null,
          };

          setData(processed);
          setOriginalImageUrl(raffle.imageUrl || null);
          setImagePreview(raffle.imageUrl || "");
          const hasParts =
            (raffle?._count?.participations ?? 0) > 0 ||
            (raffle?._count?.tickets ?? 0) > 0;
          setNotify(hasParts ? true : false); // si hay participantes/tickets, ON por defecto
          setLoading(false);
        }
      } catch (err) {
        console.error("Error loading raffle:", err);
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

  const ticketsSold = data?._count?.tickets ?? 0;
  const hasParticipants =
    (data?._count?.participations ?? 0) > 0 || ticketsSold > 0;
  const isFinalized =
    data?.status === "FINISHED" ||
    data?.status === "COMPLETED" ||
    data?.status === "CANCELLED";

  // Título bloqueado si ya hay participantes y no finalizó
  const titleDisabled = hasParticipants && !isFinalized;

  // Extender +7 días (si no se alcanzó el objetivo)
  function handleExtend7Days() {
    if (!data) return;
    const reached =
      (data?._count?.tickets ?? 0) >=
      (data?.maxParticipants ?? Number.MAX_SAFE_INTEGER);
    if (reached) {
      setError(
        "Ya se alcanzó el objetivo de participantes, no es necesario extender."
      );
      return;
    }
    const base = data.endsAt ? new Date(data.endsAt) : new Date();
    const extended = new Date(base.getTime() + 7 * 24 * 60 * 60 * 1000);
    const iso = extended.toISOString();
    setData((prev) => ({ ...prev, endsAt: iso }));
    setSuccess("Fecha extendida +7 días (sin guardar aún)");
    setTimeout(() => setSuccess(null), 2000);
  }

  // Fecha → input datetime-local (local time)
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
    } catch {
      return "";
    }
  }

  async function handleSave(e) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      if (!data) throw new Error("Datos inválidos");

      const payload = {};

      // Título (bloqueado si ya hay participantes y no finalizó)
      if (data.title?.trim()) {
        if (!titleDisabled) {
          payload.title = data.title.trim();
        }
      } else if (!titleDisabled) {
        throw new Error("El título es requerido");
      }

      // Descripción
      if (data.description !== undefined) {
        payload.description = data.description;
      }

      // Imagen
      // Solo enviar si realmente cambió respecto al original
      const imageChanged = (data.imageUrl || null) !== originalImageUrl;
      if (imageChanged) {
        payload.imageUrl = data.imageUrl?.trim() || null; // si la quitás, va null
      }

      // Límite de participantes
      if (data.participantLimit !== undefined && data.participantLimit !== "") {
        const limit = parseInt(data.participantLimit, 10);
        if (!Number.isFinite(limit) || limit <= 0) {
          throw new Error(
            "El límite de participantes debe ser un número mayor a 0"
          );
        }
        payload.participantLimit = limit;
      } else {
        payload.participantLimit = null;
      }

      // Fecha de finalización
      payload.endsAt = data.endsAt ? new Date(data.endsAt).toISOString() : null;

      // Publicado → al publicar, pasa a público (sale de privado por link)
      payload.published = !!data.published;
      payload.makePublicIfPublished = true;

      // Notificar participantes
      payload.notifyParticipants = !!notify;

      const res = await fetch(`/api/raffles/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `Error ${res.status}`);
      }

      const json = await res.json();
      const updated = json?.raffle || json;

      const processedUpdated = {
        ...updated,
        published:
          updated.publishedAt != null &&
          (updated.status === "PUBLISHED" || updated.status === "ACTIVE"),
        participantLimit: updated.maxParticipants,
      };

      setData(processedUpdated);
      setOriginalImageUrl(processedUpdated.imageUrl || null);
      setImagePreview(processedUpdated.imageUrl || "");
      setIsEditingImage(false);
      setSuccess("Sorteo guardado exitosamente");

      // ✔ Redirigir a la vista pública para ver cómo quedó
      setTimeout(() => router.push(`/sorteo/${id}`), 1200);
    } catch (err) {
      console.error("Error saving raffle:", err);
      setError(err.message || "No se pudo guardar el sorteo");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (
      !confirm("¿Eliminar este sorteo? Esta acción no se puede deshacer.")
    )
      return;

    setDeleting(true);
    setError(null);
    try {
      const res = await fetch(`/api/raffles/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `Error ${res.status}`);
      }
      router.push("/admin");
    } catch (err) {
      console.error("Error deleting raffle:", err);
      setError(err.message || "No se pudo eliminar el sorteo");
    } finally {
      setDeleting(false);
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
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-6 w-6 text-rose-400"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                  />
                </svg>
              </div>
              <h1 className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-rose-400 to-pink-400">
                Sorteo no encontrado
              </h1>
            </div>
            <p className="text-slate-300 mb-6">
              {error ||
                "El sorteo que buscas no existe o no tienes permisos para editarlo."}
            </p>
            <Link
              href="/admin"
              className="group inline-flex items-center text-rose-400 hover:text-rose-300 transition-all"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-4 w-4 mr-2 group-hover:-translate-x-1 transition-transform"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M10 19l-7-7m0 0l7-7m-7 7h18"
                />
              </svg>
              Volver al panel admin
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const readOnlyUnitPrice =
    data?.unitPrice ?? data?.derivedTicketPrice ?? null;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 to-slate-800 text-slate-50">
      {/* Header */}
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
                <span className="bg-slate-800/40 px-2 py-0.5 rounded mr-2 text-xs border border-slate-700/30">
                  ID:
                </span>
                <span className="font-mono text-indigo-300">{id}</span>
              </p>
            </div>
            <Link
              href={`/sorteo/${id}`}
              className="group bg-slate-800/40 hover:bg-slate-700/40 border border-slate-700/30 text-slate-300 px-4 py-2 rounded-lg transition-all flex items-center"
            >
              <span className="mr-2 group-hover:translate-x-0.5 transition-transform">
                →
              </span>
              Vista pública
            </Link>
          </div>
        </div>
      </div>

      <div className="max-w-2xl mx-auto p-6 pt-0">
        {/* Breadcrumbs */}
        <div className="flex items-center text-sm text-slate-400 mb-6">
          <Link
            href="/admin"
            className="hover:text-indigo-400 transition-colors"
          >
            Admin
          </Link>
          <span className="mx-2">/</span>
          <span className="text-slate-300">Editar Sorteo</span>
        </div>

        {/* Alerts */}
        {error && (
          <div className="mb-6 p-4 rounded-xl border border-rose-900/20 bg-gradient-to-r from-rose-900/10 to-slate-800/40 backdrop-blur-sm">
            <div className="flex items-start">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-5 w-5 text-rose-400 mt-0.5 mr-3 flex-shrink-0"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                />
              </svg>
              <p className="text-slate-200">{error}</p>
            </div>
          </div>
        )}

        {success && (
          <div className="mb-6 p-4 rounded-xl border border-emerald-900/20 bg-gradient-to-r from-emerald-900/10 to-slate-800/40 backdrop-blur-sm">
            <div className="flex items-start">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-5 w-5 text-emerald-400 mt-0.5 mr-3 flex-shrink-0"
                fill="none"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                />
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
                <div
                  className={`px-3 py-1.5 rounded-full text-sm font-medium mt-1 ${
                    data.status === "PUBLISHED"
                      ? "bg-emerald-900/20 text-emerald-300"
                      : data.status === "ACTIVE"
                      ? "bg-blue-900/20 text-blue-300"
                      : data.status === "DRAFT"
                      ? "bg-slate-700/30 text-slate-200"
                      : "bg-amber-900/20 text-amber-300"
                  }`}
                >
                  {data.status}
                </div>
              </div>
              <div className="text-right">
                <div className="text-sm text-slate-400">Creador</div>
                <div className="font-medium text-slate-200">
                  {data.owner?.name || "N/A"}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleSave} className="space-y-8">
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
              required={!titleDisabled}
              disabled={titleDisabled}
              className={`w-full bg-slate-800/40 border border-slate-700/30 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500/30 transition-all placeholder:text-slate-500 ${
                titleDisabled ? "opacity-70 cursor-not-allowed" : ""
              }`}
              value={data.title || ""}
              onChange={(e) => setData({ ...data, title: e.target.value })}
              placeholder="Título del sorteo"
            />
            {titleDisabled && (
              <p className="text-xs text-slate-400 mt-1">
                No puedes cambiar el título porque el sorteo ya tiene
                participantes y no ha finalizado.
              </p>
            )}
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
              onChange={(e) =>
                setData({ ...data, description: e.target.value })
              }
              placeholder="Describe el sorteo..."
            />
          </div>

          {/* Imagen (recuadro responsive + acciones) */}
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">
              Imagen del sorteo
            </label>

            {/* Recuadro responsive 16:9 */}
            <div className="relative w-full rounded-xl overflow-hidden border border-slate-700/30 bg-slate-900/30">
              <div style={{ paddingTop: "56.25%" }} />
              {imagePreview ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  alt="Preview"
                  src={imagePreview}
                  className="absolute inset-0 w-full h-full object-cover"
                />
              ) : (
                <div className="absolute inset-0 flex items-center justify-center text-slate-500 text-sm">
                  Sin imagen
                </div>
              )}
            </div>

            {/* Controles de imagen */}
            <div className="mt-3 flex flex-wrap gap-2">
              {!isEditingImage ? (
                <>
                  <button
                    type="button"
                    className="px-3 py-2 rounded-lg border border-slate-700/40 bg-slate-800/40 hover:bg-slate-800/60 transition"
                    onClick={() => setIsEditingImage(true)}
                  >
                    Cambiar imagen
                  </button>
                  {imagePreview && (
                    <button
                      type="button"
                      className="px-3 py-2 rounded-lg border border-slate-700/40 bg-slate-800/40 hover:bg-slate-800/60 transition"
                      onClick={() => {
                        setData((p) => ({ ...p, imageUrl: "" }));
                        setImagePreview("");
                      }}
                    >
                      Quitar imagen
                    </button>
                  )}
                  {(originalImageUrl || "") !== (imagePreview || "") && (
                    <button
                      type="button"
                      className="px-3 py-2 rounded-lg border border-slate-700/40 bg-slate-800/40 hover:bg-slate-800/60 transition"
                      onClick={() => {
                        setData((p) => ({ ...p, imageUrl: originalImageUrl }));
                        setImagePreview(originalImageUrl || "");
                        setIsEditingImage(false);
                      }}
                    >
                      Restaurar
                    </button>
                  )}
                </>
              ) : (
                <div className="w-full">
                  <input
                    type="text" // ← no valida como URL, no te obliga
                    className="w-full bg-slate-800/40 border border-slate-700/30 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500/30 transition-all placeholder:text-slate-500"
                    value={data.imageUrl || ""}
                    onChange={(e) => {
                      setData({ ...data, imageUrl: e.target.value });
                      setImagePreview(e.target.value);
                    }}
                    placeholder="Pega una URL (opcional)"
                  />
                  <div className="mt-2 flex gap-2">
                    <button
                      type="button"
                      className="px-3 py-2 rounded-lg border border-slate-700/40 bg-slate-800/40 hover:bg-slate-800/60 transition"
                      onClick={() => setIsEditingImage(false)}
                    >
                      Listo
                    </button>
                    <button
                      type="button"
                      className="px-3 py-2 rounded-lg border border-slate-700/40 bg-slate-800/40 hover:bg-slate-800/60 transition"
                      onClick={() => {
                        setData((p) => ({ ...p, imageUrl: originalImageUrl }));
                        setImagePreview(originalImageUrl || "");
                        setIsEditingImage(false);
                      }}
                    >
                      Cancelar cambios
                    </button>
                  </div>
                  <p className="text-xs text-slate-400 mt-2">
                    Si no pegás nada, se mantiene la imagen actual.
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Precio del ticket (solo lectura) */}
          {readOnlyUnitPrice !== null && (
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                Precio del ticket (fijo)
              </label>
              <div className="w-full bg-slate-800/40 border border-slate-700/30 rounded-xl px-4 py-3 text-slate-300">
                ${Number(readOnlyUnitPrice).toLocaleString()}
              </div>
              <p className="text-xs text-slate-400 mt-1">
                Valor definido en el servidor (.env). No se edita desde aquí.
              </p>
            </div>
          )}

          {/* Límite de participantes */}
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">
              Límite de participantes
            </label>
            <input
              type="number"
              min="1"
              className="w-full bg-slate-800/40 border border-slate-700/30 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500/30 transition-all placeholder:text-slate-500"
              value={data.participantLimit ?? ""}
              onChange={(e) =>
                setData({
                  ...data,
                  participantLimit: e.target.value
                    ? parseInt(e.target.value, 10)
                    : null,
                })
              }
              placeholder="Deja vacío para sin límite"
            />
            <p className="text-xs text-slate-400 mt-1">
              Déjalo vacío si no quieres límite de participantes
            </p>
          </div>

          {/* Fecha de finalización + Extender */}
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">
              Fecha de finalización
            </label>
            <div className="flex gap-2">
              <input
                type="datetime-local"
                className="flex-1 bg-slate-800/40 border border-slate-700/30 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500/30 transition-all"
                value={formatDateForInput(data.endsAt)}
                onChange={(e) =>
                  setData({
                    ...data,
                    endsAt: e.target.value
                      ? new Date(e.target.value).toISOString()
                      : null,
                  })
                }
              />
              <button
                type="button"
                onClick={handleExtend7Days}
                className="px-4 py-3 bg-slate-800/40 border border-slate-700/30 rounded-xl hover:bg-slate-800/60 transition"
                title="Extender +7 días"
              >
                +7d
              </button>
            </div>
            <p className="text-xs text-slate-400 mt-1">
              Déjalo vacío si no tiene fecha límite
            </p>
          </div>

          {/* Publicado (pasa a público si estaba privado) */}
          <div className="pt-4 border-t border-slate-700/30">
            <label className="flex items-center gap-3 cursor-pointer group">
              <div className="relative">
                <input
                  type="checkbox"
                  checked={!!data.published}
                  onChange={(e) =>
                    setData({ ...data, published: e.target.checked })
                  }
                  className="sr-only"
                />
                <div
                  className={`w-12 h-6 rounded-full transition-colors duration-300 ${
                    data.published
                      ? "bg-gradient-to-r from-indigo-600 to-purple-600"
                      : "bg-slate-600"
                  }`}
                ></div>
                <div
                  className={`absolute left-1 top-1 bg-white w-4 h-4 rounded-full transition-transform duration-300 ${
                    data.published ? "transform translate-x-6" : ""
                  }`}
                ></div>
              </div>
              <div>
                <span className="font-medium text-slate-200 group-hover:text-white transition-colors">
                  Publicado
                </span>
                <p className="text-sm text-slate-400 group-hover:text-slate-300 transition-colors">
                  Al publicar, el sorteo se vuelve visible (sale de “privado por
                  link”).
                </p>
              </div>
            </label>
          </div>

          {/* Notificar participantes */}
          <div className="flex items-center gap-3">
            <input
              id="notify"
              type="checkbox"
              className="h-4 w-4 text-indigo-600 rounded border-slate-700/30 bg-slate-800/40"
              checked={notify}
              onChange={(e) => setNotify(e.target.checked)}
            />
            <label htmlFor="notify" className="text-sm text-slate-300">
              Notificar a los participantes sobre estos cambios
            </label>
          </div>

        {/* Botones */}
          <div className="flex flex-col sm:flex-row gap-3 pt-4 border-t border-slate-700/30">
            <button
              type="submit"
              disabled={saving}
              className="flex-1 sm:flex-none px-6 py-3.5 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-xl hover:from-indigo-700 hover:to-purple-700 disabled:opacity-70 disabled:cursor-not-allowed transition-all font-medium shadow-lg shadow-indigo-500/10 hover:shadow-indigo-500/20"
            >
              {saving ? (
                <span className="flex items-center justify-center">
                  <svg
                    className="animate-spin -ml-1 mr-2 h-4 w-4 text-white"
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    ></circle>
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    ></path>
                  </svg>
                  Guardando...
                </span>
              ) : (
                "Guardar y ver público"
              )}
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
                  <svg
                    className="animate-spin -ml-1 mr-2 h-4 w-4 text-white"
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    ></circle>
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    ></path>
                  </svg>
                  Eliminando...
                </span>
              ) : (
                "Eliminar sorteo"
              )}
            </button>
          </div>
        </form>

        {/* Info adicional */}
        <div className="mt-8 text-xs text-slate-400 bg-slate-800/40 rounded-xl p-5 border border-slate-700/30 backdrop-blur-sm">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-slate-500">Creado</p>
              <p>
                {data.createdAt
                  ? new Date(data.createdAt).toLocaleString()
                  : "N/A"}
              </p>
            </div>
            <div>
              <p className="text-slate-500">Última actualización</p>
              <p>
                {data.updatedAt
                  ? new Date(data.updatedAt).toLocaleString()
                  : "N/A"}
              </p>
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
