// app/mis-sorteos/page.js
"use client";
import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";

export default function MisSorteos() {
  const { data: session, status } = useSession();
  const [raffles, setRaffles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (status === "loading") return;
    if (status === "unauthenticated") {
      setError("No estás autenticado.");
      setLoading(false);
      return;
    }

    let abort = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch("/api/raffles?mine=1");
        if (!res.ok) {
          const text = await res.text();
          throw new Error(text || `Status ${res.status}`);
        }
        const data = await res.json();
        if (!abort) setRaffles(data.raffles ?? []);
      } catch (err) {
        console.error("Error cargando mis sorteos:", err);
        if (!abort) setError("No se pudieron cargar tus sorteos.");
      } finally {
        if (!abort) setLoading(false);
      }
    }
    load();
    return () => { abort = true; };
  }, [status]);

  async function handleDelete(id) {
    if (!confirm("¿Eliminar sorteo? Solo se permite si no hay participantes/tickets.")) return;
    try {
      const res = await fetch(`/api/raffles/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const txt = await res.text();
        alert("No se pudo eliminar: " + txt);
        return;
      }
      // quitar de la lista local
      setRaffles(prev => prev.filter(r => r.id !== id));
    } catch (err) {
      console.error(err);
      alert("Error al eliminar sorteo.");
    }
  }

  const role = (session?.user?.role || "user").toLowerCase();

  const canDelete = (r) => {
    if (role === "superadmin") return true; // superadmin puede siempre
    const isOwner = session?.user?.id === r.ownerId;
    if (isOwner) {
      // owner puede si no hay tickets/participations
      return (r._count?.tickets ?? 0) === 0 && (r._count?.participations ?? 0) === 0;
    }
    // admin (no owner) puede solo si no hay participantes
    if (role === "admin") {
      return (r._count?.tickets ?? 0) === 0 && (r._count?.participations ?? 0) === 0;
    }
    return false;
  };

  if (loading) return <div className="p-6">Cargando tus sorteos...</div>;
  if (error) return <div className="p-6 text-red-600">{error}</div>;

  return (
    <div className="max-w-4xl mx-auto p-6">
      <h1 className="text-2xl font-bold mb-4">Mis Sorteos</h1>
      {raffles.length === 0 ? (
        <div>No tenés sorteos creados aún.</div>
      ) : (
        <ul className="space-y-4">
          {raffles.map(r => (
            <li key={r.id} className="p-4 border rounded flex justify-between items-start gap-4">
              <div>
                <h3 className="font-semibold">{r.title}</h3>
                <p className="text-sm text-gray-600">{r.description}</p>
                <div className="text-xs text-gray-400 mt-1">
                  Tickets: {r._count?.tickets ?? 0} — Participantes: {r._count?.participations ?? 0} — Precio: ${r.ticketPrice}
                </div>
              </div>
              <div className="flex flex-col items-end gap-2">
                <a href={`/raffle/${r.id}`} className="text-sm text-indigo-600 hover:underline">Ver</a>
                {canDelete(r) ? (
                  <button onClick={() => handleDelete(r.id)} className="px-3 py-1 bg-red-500 text-white rounded">Eliminar</button>
                ) : (
                  <button disabled className="px-3 py-1 bg-gray-200 text-gray-500 rounded cursor-not-allowed" title="No se puede eliminar: hay participantes o no tienes permisos">Eliminar</button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
