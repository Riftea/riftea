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
          crearPurchase: true, // Para que sea completamente funcional
          ticketPrice: 0 // Precio 0 para tickets de prueba del admin
        }),
      });

      const result = await response.json();

      if (response.ok) {
        setMessage(`✅ Ticket generado exitosamente! UUID: ${result.tickets?.[0]?.uuid || 'N/A'}`);
        // Auto-limpiar mensaje después de 5 segundos
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
    return <p className="p-6">Cargando...</p>;
  }

  const userRole = session?.user?.role;
  const isSuperAdmin = userRole === "SUPERADMIN" || userRole === "superadmin";

  return (
    <div className="max-w-4xl mx-auto p-6">
      <h1 className="text-3xl font-bold mb-4">Panel de Administración</h1>
      <p className="text-gray-600 mb-6">
        Bienvenido {session?.user?.name}. Aquí podés gestionar sorteos y tickets.
      </p>

      {/* Mensaje de estado */}
      {message && (
        <div className={`p-4 rounded-lg mb-6 transition-all duration-300 ${
          message.includes('✅') 
            ? 'bg-green-50 border border-green-200 text-green-800' 
            : 'bg-red-50 border border-red-200 text-red-800'
        }`}>
          {message}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <button
          onClick={() => router.push("/admin/crear-sorteo")}
          className="px-4 py-3 rounded-lg bg-orange-500 text-white font-semibold shadow hover:bg-orange-600"
        >
          + Crear Sorteo
        </button>

        <button
          onClick={() => router.push("/mis-sorteos")}
          className="px-4 py-3 rounded-lg bg-indigo-500 text-white font-semibold shadow hover:bg-indigo-600"
        >
          Mis Sorteos
        </button>

        {/* ✅ CORREGIDO: Ruta correcta para Mis Tickets */}
        <button
          onClick={() => router.push("/mis-tickets")}
          className="px-4 py-3 rounded-lg bg-green-500 text-white font-semibold shadow hover:bg-green-600"
        >
          Mis Tickets
        </button>

        {isSuperAdmin && (
          <button
            onClick={generateDirectTicket}
            disabled={generating}
            className={`px-4 py-3 rounded-lg font-semibold shadow border-2 border-red-400 transition-all duration-200 flex items-center justify-center gap-2 ${
              generating 
                ? 'bg-gray-400 text-gray-600 cursor-not-allowed' 
                : 'bg-red-600 text-white hover:bg-red-700 hover:scale-105'
            }`}
          >
            {generating ? (
              <>
                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                  <circle 
                    className="opacity-25" 
                    cx="12" 
                    cy="12" 
                    r="10" 
                    stroke="currentColor" 
                    strokeWidth="4" 
                    fill="none"
                  />
                  <path 
                    className="opacity-75" 
                    fill="currentColor" 
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  />
                </svg>
                Generando...
              </>
            ) : (
              <>
                ⚡ Generar Ticket
              </>
            )}
          </button>
        )}

        {/* Botón adicional para generar múltiples tickets */}
        {isSuperAdmin && (
          <button
            onClick={() => router.push("/admin/generar-tickets")}
            className="px-4 py-3 rounded-lg bg-purple-600 text-white font-semibold shadow hover:bg-purple-700"
          >
            🎫 Generar Múltiples
          </button>
        )}
      </div>

      <div className="mt-6 p-3 bg-gray-100 rounded-lg">
        <p className="text-sm text-gray-600">
          Rol actual: <span className="font-semibold">{session?.user?.role}</span>
        </p>
        {isSuperAdmin && (
          <p className="text-xs text-gray-500 mt-1">
            💡 Haz clic en &quot;Generar Ticket&quot; para crear un ticket de prueba instantáneamente
          </p>
        )}
      </div>

      {/* Información adicional para SuperAdmins */}
      {isSuperAdmin && (
        <div className="mt-8 p-4 bg-blue-50 border border-blue-200 rounded-lg">
          <h3 className="font-semibold text-blue-800 mb-2">🔧 Herramientas de SuperAdmin:</h3>
          <ul className="text-sm text-blue-700 space-y-1">
            <li>• <strong>Generar Ticket:</strong> Crea 1 ticket de prueba instantáneo para ti</li>
            <li>• <strong>Generar Múltiples:</strong> Interfaz completa para generar tickets para otros usuarios</li>
            <li>• <strong>Mis Tickets:</strong> Ver todos tus tickets (incluidos los de prueba)</li>
            <li>• Los tickets generados aparecen en &quot;Mis Tickets&quot; inmediatamente</li>
          </ul>
        </div>
      )}
    </div>
  );
}