"use client";

import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

export default function AdminPage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  useEffect(() => {
    // Si no está logueado → redirigir al home
    if (status === "unauthenticated") {
      router.push("/");
    }
    // Si está logueado pero no es admin → redirigir al home
    if (status === "authenticated" && session?.user?.role !== "ADMIN") {
      router.push("/");
    }
  }, [status, session, router]);

  if (status === "loading") {
    return <p className="p-6">Cargando...</p>;
  }

  return (
    <div className="max-w-4xl mx-auto p-6">
      <h1 className="text-3xl font-bold mb-4">Panel de Administración</h1>
      <p className="text-gray-600 mb-6">
        Bienvenido {session?.user?.name}. Aquí podés gestionar sorteos y tickets.
      </p>

      <div className="grid gap-4 sm:grid-cols-2">
        {/* Botón Crear Sorteo */}
        <button
          onClick={() => router.push("/admin/crear-sorteo")}
          className="px-4 py-3 rounded-lg bg-orange-500 text-white font-semibold shadow hover:bg-orange-600"
        >
          ➕ Crear Sorteo
        </button>

        {/* Botón Ver Mis Sorteos */}
        <button
          onClick={() => router.push("/admin/mis-sorteos")}
          className="px-4 py-3 rounded-lg bg-indigo-500 text-white font-semibold shadow hover:bg-indigo-600"
        >
          🎟️ Mis Sorteos
        </button>

        {/* Botón Ver Tickets */}
        <button
          onClick={() => router.push("/admin/tickets")}
          className="px-4 py-3 rounded-lg bg-green-500 text-white font-semibold shadow hover:bg-green-600"
        >
          🎫 Mis Tickets
        </button>
      </div>
    </div>
  );
}
