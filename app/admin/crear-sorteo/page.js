"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";

export default function CrearSorteoPage() {
  const router = useRouter();
  const { data: session, status } = useSession();
  
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [ticketPrice, setTicketPrice] = useState("");
  const [participantLimit, setParticipantLimit] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  // Verificar autenticación
  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/login");
    }
  }, [status, router]);

  // Mostrar loading mientras se verifica la sesión
  if (status === "loading") {
    return (
      <div className="max-w-2xl mx-auto p-6">
        <div className="flex justify-center items-center py-12">
          <div className="flex items-center space-x-2">
            <svg className="animate-spin h-5 w-5 text-orange-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            <span className="text-gray-600">Verificando sesión...</span>
          </div>
        </div>
      </div>
    );
  }

  // Redirigir si no está autenticado
  if (status === "unauthenticated") {
    return (
      <div className="max-w-2xl mx-auto p-6">
        <div className="text-center py-12">
          <p className="text-gray-600">Redirigiendo al login...</p>
        </div>
      </div>
    );
  }

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    setSuccess(false);

    // Validación de sesión adicional
    if (!session?.user?.id) {
      setError("Sesión no válida. Por favor, inicia sesión nuevamente.");
      setLoading(false);
      router.push("/login");
      return;
    }

    // Validaciones básicas
    if (!title.trim() || !description.trim() || !ticketPrice) {
      setError("Todos los campos obligatorios deben ser completados");
      setLoading(false);
      return;
    }

    if (Number(ticketPrice) <= 0) {
      setError("El precio debe ser mayor a 0");
      setLoading(false);
      return;
    }

    if (participantLimit && Number(participantLimit) <= 0) {
      setError("El límite de participantes debe ser mayor a 0");
      setLoading(false);
      return;
    }

    // Validación de fecha
    if (endsAt && new Date(endsAt) <= new Date()) {
      setError("La fecha de finalización debe ser futura");
      setLoading(false);
      return;
    }

    try {
      const res = await fetch("/api/raffles", {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          // Incluir token si tu NextAuth lo provee
          ...(session?.accessToken && { "Authorization": `Bearer ${session.accessToken}` })
        },
        credentials: 'include', // Importante para cookies de sesión
        body: JSON.stringify({ 
          title: title.trim(), 
          description: description.trim(), 
          ticketPrice: Number(ticketPrice),
          participantLimit: participantLimit ? Number(participantLimit) : null,
          endsAt: endsAt || null,
          publishedAt: new Date(),
          userId: session.user.id // Incluir ID del usuario autenticado
        }),
      });

      const data = await res.json();

      if (res.ok) {
        setSuccess(true);
        // Reset form
        resetFormFields();
        
        // Redirigir después de 2 segundos a /mis-sorteos
        setTimeout(() => {
          router.push("/mis-sorteos");
        }, 2000);
      } else {
        // Manejar errores específicos de autenticación
        if (res.status === 401) {
          setError("Sesión expirada. Por favor, inicia sesión nuevamente.");
          setTimeout(() => {
            router.push("/login");
          }, 2000);
        } else {
          setError(data?.error || data?.message || "Error al crear el sorteo");
        }
      }
    } catch (err) {
      console.error("Error creating raffle:", err);
      setError("Error de conexión. Verifica tu red e inténtalo de nuevo.");
    } finally {
      setLoading(false);
    }
  };

  const resetFormFields = () => {
    setTitle("");
    setDescription("");
    setTicketPrice("");
    setParticipantLimit("");
    setEndsAt("");
  };

  const resetForm = () => {
    resetFormFields();
    setError("");
    setSuccess(false);
  };

  return (
    <div className="max-w-2xl mx-auto p-6">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-800 mb-2">Crear Nuevo Sorteo</h1>
        <p className="text-gray-600">
          Completa los datos para crear un nuevo sorteo
          {session?.user?.name && (
            <span className="block text-sm text-orange-600 mt-1">
              👤 Conectado como: {session.user.name}
            </span>
          )}
        </p>
      </div>

      {/* Mensajes de estado */}
      {error && (
        <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg">
          <div className="flex items-center">
            <span className="text-red-600 font-medium">❌ Error:</span>
            <span className="text-red-700 ml-2">{error}</span>
          </div>
        </div>
      )}

      {success && (
        <div className="mb-4 p-4 bg-green-50 border border-green-200 rounded-lg">
          <div className="flex items-center">
            <span className="text-green-600 font-medium">✅ ¡Éxito!</span>
            <span className="text-green-700 ml-2">Sorteo creado correctamente. Redirigiendo...</span>
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Título */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Título del Sorteo *
          </label>
          <input
            type="text"
            className="w-full border border-gray-300 rounded-lg px-4 py-3 focus:ring-2 focus:ring-orange-500 focus:border-transparent"
            placeholder="Ej: iPhone 15 Pro Max"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            disabled={loading}
            maxLength={100}
            required
          />
          <p className="text-xs text-gray-500 mt-1">{title.length}/100 caracteres</p>
        </div>

        {/* Descripción */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Descripción *
          </label>
          <textarea
            className="w-full border border-gray-300 rounded-lg px-4 py-3 focus:ring-2 focus:ring-orange-500 focus:border-transparent"
            placeholder="Describe el premio y las condiciones del sorteo..."
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            disabled={loading}
            rows={4}
            maxLength={500}
            required
          />
          <p className="text-xs text-gray-500 mt-1">{description.length}/500 caracteres</p>
        </div>

        {/* Precio del ticket */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Precio del Ticket *
          </label>
          <div className="relative">
            <span className="absolute left-3 top-3 text-gray-500">$</span>
            <input
              type="number"
              className="w-full border border-gray-300 rounded-lg pl-8 pr-4 py-3 focus:ring-2 focus:ring-orange-500 focus:border-transparent"
              placeholder="0.00"
              value={ticketPrice}
              onChange={(e) => setTicketPrice(e.target.value)}
              disabled={loading}
              min="0.01"
              step="0.01"
              required
            />
          </div>
        </div>

        {/* Límite de participantes */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Límite de Participantes (opcional)
          </label>
          <input
            type="number"
            min="1"
            className="w-full border border-gray-300 rounded-lg px-4 py-3 focus:ring-2 focus:ring-orange-500 focus:border-transparent"
            placeholder="Límite participantes (opcional)"
            value={participantLimit}
            onChange={(e) => setParticipantLimit(e.target.value)}
            disabled={loading}
          />
          <p className="text-xs text-gray-500 mt-1">Si no se especifica, no habrá límite de participantes</p>
        </div>

        {/* Fecha de finalización (opcional) */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Fecha de Finalización (opcional)
          </label>
          <input
            type="datetime-local"
            className="w-full border border-gray-300 rounded-lg px-4 py-3 focus:ring-2 focus:ring-orange-500 focus:border-transparent"
            value={endsAt}
            onChange={(e) => setEndsAt(e.target.value)}
            disabled={loading}
            min={new Date().toISOString().slice(0, 16)}
          />
          <p className="text-xs text-gray-500 mt-1">Si no se especifica, el sorteo no tendrá fecha límite</p>
        </div>

        {/* Botones */}
        <div className="flex gap-4 pt-4">
          <button
            type="submit"
            disabled={loading}
            className="flex-1 px-6 py-3 bg-orange-500 text-white rounded-lg font-medium hover:bg-orange-600 focus:ring-2 focus:ring-orange-500 focus:ring-offset-2 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? (
              <span className="flex items-center justify-center">
                <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Creando Sorteo...
              </span>
            ) : (
              "Crear Sorteo"
            )}
          </button>

          <button
            type="button"
            onClick={() => router.push("/mis-sorteos")}
            disabled={loading}
            className="px-6 py-3 border border-gray-300 text-gray-700 rounded-lg font-medium hover:bg-gray-50 focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 disabled:bg-gray-100 disabled:cursor-not-allowed transition-colors"
          >
            Cancelar
          </button>

          <button
            type="button"
            onClick={resetForm}
            disabled={loading}
            className="px-4 py-3 text-gray-500 hover:text-gray-700 disabled:text-gray-400 transition-colors"
            title="Limpiar formulario"
          >
            🗑️
          </button>
        </div>
      </form>
    </div>
  );
}