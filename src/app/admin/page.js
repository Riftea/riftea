"use client";

import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

export default function AdminPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [generating, setGenerating] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/");
      return;
    }
    
    // Múltiples comparaciones para capturar variaciones
    const userRole = session?.user?.role;
    const isAdmin = userRole === "ADMIN" || userRole === "admin";
    const isSuperAdmin = userRole === "SUPERADMIN" || userRole === "superadmin";
    
    if (status === "authenticated" && !isAdmin && !isSuperAdmin) {
      router.push("/");
      return;
    }
  }, [status, session, router]);

  // Función para generar ticket directamente
  const generateDirectTicket = async () => {
    if (!session?.user?.id) {
      setMessage("Error: No se puede identificar el usuario");
      return;
    }

    setGenerating(true);
    setMessage("");

    try {
      const response = await fetch("/api/admin/generar-tickets", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          userId: session.user.id,
          cantidad: 1,
          crearPurchase: true,
          ticketPrice: 0
        }),
      });

      const result = await response.json();

      if (response.ok) {
        setMessage(`✅ Ticket generado exitosamente! UUID: ${result.tickets?.[0]?.uuid || 'N/A'}`);
        setTimeout(() => setMessage(""), 5000);
      } else {
        setMessage(`❌ Error: ${result.error}`);
        setTimeout(() => setMessage(""), 5000);
      }
    } catch (error) {
      console.error("Error generating ticket:", error);
      setMessage("❌ Error de conexión");
      setTimeout(() => setMessage(""), 5000);
    } finally {
      setGenerating(false);
    }
  };

  if (status === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-orange-500 mx-auto mb-4"></div>
          <p className="text-gray-600 font-medium">Cargando panel de administración...</p>
        </div>
      </div>
    );
  }

  const userRole = session?.user?.role;
  const isSuperAdmin = userRole === "SUPERADMIN" || userRole === "superadmin";

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="bg-white rounded-2xl shadow-xl overflow-hidden border border-gray-100">
        <div className="p-6 bg-gradient-to-r from-orange-50 to-orange-100 border-b border-orange-100">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <h1 className="text-2xl md:text-3xl font-bold text-gray-800 flex items-center gap-3">
                <span className="bg-orange-100 p-2 rounded-lg">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-orange-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                </span>
                Panel de Administración
              </h1>
              <p className="text-gray-600 mt-2 text-lg">
                Bienvenido {session?.user?.name} • <span className="text-orange-600 font-medium">{session?.user?.email}</span>
              </p>
            </div>
            <div className="flex items-center bg-white px-4 py-2 rounded-xl shadow-sm border border-gray-100">
              <div className="w-2 h-2 bg-green-500 rounded-full mr-2"></div>
              <span className="text-sm font-medium text-gray-700">Sesión activa</span>
            </div>
          </div>
        </div>

        {/* Mensaje de estado */}
        {message && (
          <div className={`mx-6 mt-6 p-4 rounded-xl border-l-4 transition-all duration-300 ${
            message.includes('✅') 
              ? 'bg-green-50 border-green-400 text-green-800' 
              : 'bg-red-50 border-red-400 text-red-800'
          }`}>
            <div className="flex items-start">
              <div className="flex-shrink-0 mt-0.5">
                {message.includes('✅') ? (
                  <svg className="h-5 w-5 text-green-400" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                ) : (
                  <svg className="h-5 w-5 text-red-400" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                  </svg>
                )}
              </div>
              <div className="ml-3 flex-1">
                <p className="text-sm font-medium">{message}</p>
              </div>
            </div>
          </div>
        )}

        <div className="p-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            <button
              onClick={() => router.push("/admin/crear-sorteo")}
              className="group relative overflow-hidden rounded-xl bg-gradient-to-br from-orange-500 to-orange-600 p-0.5 hover:shadow-lg transition-all duration-300 transform hover:-translate-y-0.5 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-orange-500"
            >
              <div className="flex items-center justify-center gap-3 bg-white rounded-xl p-5 text-left transition-all duration-300 group-hover:bg-orange-50">
                <div className="bg-orange-100 p-3 rounded-lg">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-orange-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                  </svg>
                </div>
                <div>
                  <p className="text-lg font-semibold text-gray-800">Crear Sorteo</p>
                  <p className="text-sm text-gray-500">Configura un nuevo sorteo</p>
                </div>
              </div>
            </button>

            <button
              onClick={() => router.push("/mis-sorteos")}
              className="group relative overflow-hidden rounded-xl bg-gradient-to-br from-indigo-500 to-indigo-600 p-0.5 hover:shadow-lg transition-all duration-300 transform hover:-translate-y-0.5 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
            >
              <div className="flex items-center justify-center gap-3 bg-white rounded-xl p-5 text-left transition-all duration-300 group-hover:bg-indigo-50">
                <div className="bg-indigo-100 p-3 rounded-lg">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-indigo-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                  </svg>
                </div>
                <div>
                  <p className="text-lg font-semibold text-gray-800">Mis Sorteos</p>
                  <p className="text-sm text-gray-500">Gestiona tus sorteos activos</p>
                </div>
              </div>
            </button>

            {/* ✅ CORREGIDO: Ruta correcta para Mis Tickets */}
            <button
              onClick={() => router.push("/mis-tickets")}
              className="group relative overflow-hidden rounded-xl bg-gradient-to-br from-green-500 to-green-600 p-0.5 hover:shadow-lg transition-all duration-300 transform hover:-translate-y-0.5 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500"
            >
              <div className="flex items-center justify-center gap-3 bg-white rounded-xl p-5 text-left transition-all duration-300 group-hover:bg-green-50">
                <div className="bg-green-100 p-3 rounded-lg">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
                  </svg>
                </div>
                <div>
                  <p className="text-lg font-semibold text-gray-800">Mis Tickets</p>
                  <p className="text-sm text-gray-500">Revisa tus tickets generados</p>
                </div>
              </div>
            </button>

            {isSuperAdmin && (
              <button
                onClick={generateDirectTicket}
                disabled={generating}
                className={`group relative overflow-hidden rounded-xl p-0.5 hover:shadow-lg transition-all duration-300 transform hover:-translate-y-0.5 focus:outline-none focus:ring-2 focus:ring-offset-2 ${
                  generating 
                    ? 'bg-gray-200 cursor-not-allowed' 
                    : 'bg-gradient-to-br from-red-500 to-red-600'
                } focus:ring-red-500`}
              >
                <div className={`flex items-center justify-center gap-3 bg-white rounded-xl p-5 text-left transition-all duration-300 ${
                  generating ? 'bg-gray-50' : 'group-hover:bg-red-50'
                }`}>
                  <div className={`p-3 rounded-lg ${
                    generating ? 'bg-gray-100' : 'bg-red-100'
                  }`}>
                    {generating ? (
                      <svg className="animate-spin h-6 w-6 text-gray-500" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                    ) : (
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                      </svg>
                    )}
                  </div>
                  <div>
                    <p className="text-lg font-semibold text-gray-800">
                      {generating ? "Generando..." : "Generar Ticket"}
                    </p>
                    <p className="text-sm text-gray-500">
                      {generating ? "Espere un momento..." : "Crea un ticket de prueba"}
                    </p>
                  </div>
                </div>
              </button>
            )}

            {/* Botón adicional para generar múltiples tickets */}
            {isSuperAdmin && (
              <button
                onClick={() => router.push("/admin/generar-tickets")}
                className="group relative overflow-hidden rounded-xl bg-gradient-to-br from-purple-500 to-purple-600 p-0.5 hover:shadow-lg transition-all duration-300 transform hover:-translate-y-0.5 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-purple-500"
              >
                <div className="flex items-center justify-center gap-3 bg-white rounded-xl p-5 text-left transition-all duration-300 group-hover:bg-purple-50">
                  <div className="bg-purple-100 p-3 rounded-lg">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-purple-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-lg font-semibold text-gray-800">Generar Múltiples</p>
                    <p className="text-sm text-gray-500">Crea tickets para usuarios</p>
                  </div>
                </div>
              </button>
            )}
          </div>

          <div className="mt-8 grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-gray-50 rounded-xl p-5 border border-gray-100">
              <div className="flex items-center gap-3 mb-3">
                <div className="bg-orange-100 p-2 rounded-lg">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-orange-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                  </svg>
                </div>
                <h3 className="text-lg font-semibold text-gray-800">Información de la cuenta</h3>
              </div>
              <div className="pl-11">
                <div className="bg-white p-4 rounded-lg border border-gray-200">
                  <p className="text-sm text-gray-600 mb-1">Rol actual:</p>
                  <p className="text-lg font-bold text-orange-600 capitalize">{session?.user?.role?.toLowerCase()}</p>
                  
                  <div className="mt-3 pt-3 border-t border-gray-100">
                    <p className="text-sm text-gray-500">
                      <span className="font-medium text-gray-700">ID de usuario:</span> {session?.user?.id}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {isSuperAdmin && (
              <div className="bg-blue-50 rounded-xl p-5 border border-blue-100">
                <div className="flex items-center gap-3 mb-3">
                  <div className="bg-blue-100 p-2 rounded-lg">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                  </div>
                  <h3 className="text-lg font-semibold text-gray-800">Herramientas de SuperAdmin</h3>
                </div>
                <div className="pl-11">
                  <ul className="space-y-2 text-gray-700">
                    <li className="flex items-start">
                      <svg className="h-5 w-5 text-blue-500 mt-0.5 mr-2 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                      </svg>
                      <span><strong>Generar Ticket:</strong> Crea 1 ticket de prueba instantáneo para ti</span>
                    </li>
                    <li className="flex items-start">
                      <svg className="h-5 w-5 text-blue-500 mt-0.5 mr-2 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                      </svg>
                      <span><strong>Generar Múltiples:</strong> Interfaz completa para generar tickets para otros usuarios</span>
                    </li>
                    <li className="flex items-start">
                      <svg className="h-5 w-5 text-blue-500 mt-0.5 mr-2 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                      </svg>
                      <span><strong>Mis Tickets:</strong> Ver todos tus tickets (incluidos los de prueba)</span>
                    </li>
                    <li className="flex items-start">
                      <svg className="h-5 w-5 text-blue-500 mt-0.5 mr-2 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                      </svg>
                      <span>Los tickets generados aparecen en «Mis Tickets» inmediatamente</span>
                    </li>
                  </ul>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}