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
      <div className="min-h-screen bg-gradient-to-br from-gray-900 to-gray-800 flex items-center justify-center p-4">
        <div className="text-center">
          <div className="relative mb-6">
            <div className="w-16 h-16 border-4 border-orange-500 border-t-transparent rounded-full animate-spin mx-auto"></div>
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="w-12 h-12 border-4 border-orange-400 border-t-transparent rounded-full animate-spin-reverse"></div>
            </div>
          </div>
          <h2 className="text-xl font-semibold text-white mb-2">Verificando sesión</h2>
          <p className="text-gray-400">Preparando el panel de creación de sorteos...</p>
        </div>
      </div>
    );
  }

  // Redirigir si no está autenticado
  if (status === "unauthenticated") {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 to-gray-800 flex items-center justify-center p-4">
        <div className="text-center">
          <div className="bg-gray-800 border-l-4 border-orange-500 text-orange-200 p-4 rounded-r-lg mb-6 max-w-md">
            <div className="flex">
              <div className="ml-3">
                <h3 className="font-medium">Sesión no iniciada</h3>
                <div className="mt-2 text-sm">
                  <p>Redirigiendo al login para acceder al panel de administración...</p>
                </div>
              </div>
            </div>
          </div>
          <div className="mt-4">
            <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-orange-500 mx-auto"></div>
          </div>
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
        credentials: 'include',
        body: JSON.stringify({ 
          title: title.trim(), 
          description: description.trim(), 
          ticketPrice: Number(ticketPrice),
          participantLimit: participantLimit ? Number(participantLimit) : null,
          endsAt: endsAt || null,
          publishedAt: new Date(),
          userId: session.user.id
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
    <div className="min-h-screen bg-gradient-to-br from-gray-950 to-gray-900 text-gray-100">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="bg-gray-800/50 backdrop-blur-sm border border-gray-700 rounded-2xl overflow-hidden shadow-2xl">
          {/* Encabezado con efecto de gradiente */}
          <div className="relative p-8 bg-gradient-to-r from-gray-800 to-gray-800/90 border-b border-gray-700">
            <div className="absolute inset-0 bg-gradient-to-r from-orange-500/5 to-transparent pointer-events-none"></div>
            <div className="relative">
              <div className="flex items-center mb-4">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-orange-500 to-orange-600 flex items-center justify-center mr-4">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                  </svg>
                </div>
                <h1 className="text-2xl font-bold text-white">Crear Nuevo Sorteo</h1>
              </div>
              
              <p className="text-gray-300 mb-4 max-w-2xl">
                Completa los datos para crear un nuevo sorteo con las mejores condiciones
              </p>
              
              <div className="flex items-center bg-gray-700/50 border border-gray-600 rounded-lg p-3">
                <div className="w-2 h-2 bg-green-500 rounded-full mr-2"></div>
                <span className="text-gray-200 font-medium">Sesión activa como:</span>
                <span className="text-orange-400 ml-2">{session?.user?.name || 'Administrador'}</span>
                {session?.user?.role && (
                  <span className="ml-3 px-2 py-0.5 bg-orange-500/20 text-orange-300 text-xs rounded-full">
                    {session.user.role.toLowerCase()}
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="p-8">
            {/* Mensajes de estado */}
            {error && (
              <div className="mb-6 p-5 bg-red-900/30 border border-red-800 rounded-xl">
                <div className="flex items-start">
                  <svg className="h-5 w-5 text-red-400 mt-0.5 mr-3 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                  </svg>
                  <div>
                    <h3 className="text-lg font-medium text-red-200">Error al crear sorteo</h3>
                    <div className="mt-2 text-red-300">
                      <p>{error}</p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {success && (
              <div className="mb-6 p-5 bg-emerald-900/30 border border-emerald-800 rounded-xl">
                <div className="flex items-start">
                  <svg className="h-5 w-5 text-emerald-400 mt-0.5 mr-3 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                  <div>
                    <h3 className="text-lg font-medium text-emerald-200">¡Sorteo creado exitosamente!</h3>
                    <div className="mt-2 text-emerald-300">
                      <p>Redirigiendo a tus sorteos en 2 segundos...</p>
                    </div>
                    <div className="mt-3 h-1.5 bg-gray-700 rounded-full overflow-hidden">
                      <div className="h-full bg-emerald-500 w-1/2 animate-pulse"></div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-7">
              {/* Título */}
              <div>
                <div className="flex justify-between items-center mb-2">
                  <label className="block text-sm font-medium text-gray-200">
                    Título del Sorteo <span className="text-orange-400">*</span>
                  </label>
                  <span className="text-xs text-gray-400">{title.length}/100</span>
                </div>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                    </svg>
                  </div>
                  <input
                    type="text"
                    className="w-full bg-gray-700/50 border border-gray-600 rounded-xl pl-10 pr-4 py-3.5 focus:ring-2 focus:ring-orange-500 focus:border-orange-500 focus:outline-none transition-all text-white placeholder-gray-400"
                    placeholder="Ej: iPhone 15 Pro Max"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    disabled={loading}
                    maxLength={100}
                    required
                  />
                </div>
                <p className="text-xs text-gray-400 mt-1">Un título atractivo ayuda a captar más participantes</p>
              </div>

              {/* Descripción */}
              <div>
                <div className="flex justify-between items-center mb-2">
                  <label className="block text-sm font-medium text-gray-200">
                    Descripción <span className="text-orange-400">*</span>
                  </label>
                  <span className="text-xs text-gray-400">{description.length}/500</span>
                </div>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-start pt-3 pointer-events-none">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-gray-500 mt-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                    </svg>
                  </div>
                  <textarea
                    className="w-full bg-gray-700/50 border border-gray-600 rounded-xl pl-10 pr-4 py-3.5 focus:ring-2 focus:ring-orange-500 focus:border-orange-500 focus:outline-none transition-all text-white placeholder-gray-400 min-h-[140px]"
                    placeholder="Describe el premio y las condiciones del sorteo..."
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    disabled={loading}
                    maxLength={500}
                    required
                  />
                </div>
                <p className="text-xs text-gray-400 mt-1">Sé específico sobre el premio, fechas y condiciones</p>
              </div>

              {/* Precio del ticket */}
              <div>
                <label className="block text-sm font-medium text-gray-200 mb-2">
                  Precio del Ticket <span className="text-orange-400">*</span>
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  <input
                    type="number"
                    className="w-full bg-gray-700/50 border border-gray-600 rounded-xl pl-10 pr-4 py-3.5 focus:ring-2 focus:ring-orange-500 focus:border-orange-500 focus:outline-none transition-all text-white placeholder-gray-400"
                    placeholder="0.00"
                    value={ticketPrice}
                    onChange={(e) => setTicketPrice(e.target.value)}
                    disabled={loading}
                    min="0.01"
                    step="0.01"
                    required
                  />
                </div>
                <p className="text-xs text-gray-400 mt-1">El precio debe ser mayor a $0.01</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Límite de participantes */}
                <div>
                  <label className="block text-sm font-medium text-gray-200 mb-2">
                    Límite de Participantes
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                      </svg>
                    </div>
                    <input
                      type="number"
                      min="1"
                      className="w-full bg-gray-700/50 border border-gray-600 rounded-xl pl-10 pr-4 py-3.5 focus:ring-2 focus:ring-orange-500 focus:border-orange-500 focus:outline-none transition-all text-white placeholder-gray-400"
                      placeholder="Sin límite"
                      value={participantLimit}
                      onChange={(e) => setParticipantLimit(e.target.value)}
                      disabled={loading}
                    />
                  </div>
                  <p className="text-xs text-gray-400 mt-1">Si no se especifica, no habrá límite</p>
                </div>

                {/* Fecha de finalización */}
                <div>
                  <label className="block text-sm font-medium text-gray-200 mb-2">
                    Fecha de Finalización
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                    </div>
                    <input
                      type="datetime-local"
                      className="w-full bg-gray-700/50 border border-gray-600 rounded-xl pl-10 pr-4 py-3.5 focus:ring-2 focus:ring-orange-500 focus:border-orange-500 focus:outline-none transition-all text-white"
                      value={endsAt}
                      onChange={(e) => setEndsAt(e.target.value)}
                      disabled={loading}
                      min={new Date().toISOString().slice(0, 16)}
                    />
                  </div>
                  <p className="text-xs text-gray-400 mt-1">Si no se especifica, no tendrá fecha límite</p>
                </div>
              </div>

              {/* Botones */}
              <div className="flex flex-col sm:flex-row gap-4 pt-6 border-t border-gray-700 pt-6">
                <button
                  type="submit"
                  disabled={loading}
                  className="flex-1 px-6 py-3.5 bg-gradient-to-r from-orange-500 to-orange-600 text-white rounded-xl font-medium hover:from-orange-600 hover:to-orange-700 focus:ring-2 focus:ring-orange-500 focus:ring-offset-2 focus:ring-offset-gray-900 disabled:opacity-60 disabled:cursor-not-allowed transition-all transform hover:scale-[1.02] active:scale-[0.98]"
                >
                  {loading ? (
                    <span className="flex items-center justify-center">
                      <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" fill="none" viewBox="0 0 24 24">
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
                  className="px-6 py-3.5 border border-gray-600 text-gray-300 rounded-xl font-medium hover:bg-gray-700/50 focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 focus:ring-offset-gray-900 disabled:bg-gray-800/50 disabled:cursor-not-allowed transition-all"
                >
                  Cancelar
                </button>

                <button
                  type="button"
                  onClick={resetForm}
                  disabled={loading}
                  className="px-4 py-3.5 text-gray-400 hover:text-white hover:bg-gray-700/50 rounded-xl transition-all"
                  title="Limpiar formulario"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              </div>
            </form>
          </div>

          {/* Información contextual */}
          <div className="px-8 pb-6 bg-gray-800/30 border-t border-gray-700">
            <div className="flex items-start p-4 bg-gray-700/30 rounded-xl border border-gray-600">
              <div className="flex-shrink-0 mt-0.5">
                <svg className="h-5 w-5 text-orange-400" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                </svg>
              </div>
              <div className="ml-3 flex-1">
                <p className="text-sm font-medium text-orange-200">Consejos para sorteos exitosos</p>
                <ul className="mt-1 text-sm text-gray-300 space-y-1">
                  <li className="flex items-start">
                    <span className="h-1.5 w-1.5 bg-orange-400 rounded-full mt-1.5 mr-2 flex-shrink-0"></span>
                    <span>Usa títulos llamativos y descriptivos para aumentar la participación</span>
                  </li>
                  <li className="flex items-start">
                    <span className="h-1.5 w-1.5 bg-orange-400 rounded-full mt-1.5 mr-2 flex-shrink-0"></span>
                    <span>Describe claramente el premio y las condiciones del sorteo</span>
                  </li>
                  <li className="flex items-start">
                    <span className="h-1.5 w-1.5 bg-orange-400 rounded-full mt-1.5 mr-2 flex-shrink-0"></span>
                    <span>Establece un precio de ticket acorde al valor del premio</span>
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}