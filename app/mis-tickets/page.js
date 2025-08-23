// app/mis-tickets/page.js
"use client";
import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";

export default function MisTicketsPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filter, setFilter] = useState('all'); // all, active, won, lost

  // Mostrar notificación de compra exitosa
  const newTickets = searchParams.get('new');
  
  useEffect(() => {
    if (status === "loading") return;
    if (status === "unauthenticated") {
      router.push("/auth/signin");
      return;
    }

    fetchTickets();
  }, [status, router]);

  const fetchTickets = async () => {
    try {
      const res = await fetch("/api/tickets/my");
      if (!res.ok) throw new Error("Error al cargar tickets");
      
      const data = await res.json();
      setTickets(data.tickets || []);
      setLoading(false);
    } catch (err) {
      setError(err.message);
      setLoading(false);
    }
  };

  // Filtrar tickets según el filtro seleccionado
  const filteredTickets = tickets.filter(ticket => {
    if (filter === 'active') return ticket.status === 'ACTIVE' || ticket.status === 'PENDING';
    if (filter === 'won') return ticket.status === 'WINNER';
    if (filter === 'lost') return ticket.status === 'LOST';
    return true;
  });

  // Agrupar tickets por sorteo
  const ticketsByRaffle = filteredTickets.reduce((acc, ticket) => {
    const raffleId = ticket.raffleId;
    if (!acc[raffleId]) {
      acc[raffleId] = {
        raffle: ticket.raffle,
        tickets: []
      };
    }
    acc[raffleId].tickets.push(ticket);
    return acc;
  }, {});

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-green-900 via-teal-900 to-blue-900 pt-20">
        <div className="container mx-auto px-4 py-8">
          <div className="animate-pulse">
            <div className="h-8 bg-white/20 rounded w-1/3 mb-8"></div>
            <div className="space-y-6">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="bg-white/10 rounded-3xl p-6">
                  <div className="h-6 bg-white/20 rounded w-1/2 mb-4"></div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {[...Array(6)].map((_, j) => (
                      <div key={j} className="h-24 bg-white/20 rounded-2xl"></div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-green-900 via-teal-900 to-blue-900 pt-20">
        <div className="container mx-auto px-4 py-8">
          <div className="bg-red-500/20 border border-red-500/50 rounded-3xl p-8 text-center">
            <p className="text-red-300">Error: {error}</p>
            <button 
              onClick={fetchTickets}
              className="mt-4 px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg transition-colors"
            >
              Reintentar
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-900 via-teal-900 to-blue-900 pt-20">
      <div className="container mx-auto px-4 py-8">
        
        {/* Header */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8">
          <div>
            <h1 className="text-4xl font-bold text-white mb-2">Mis Tickets</h1>
            <p className="text-white/70">
              Total: {tickets.length} tickets en {Object.keys(ticketsByRaffle).length} sorteos
            </p>
          </div>

          {/* Notificación de compra exitosa */}
          {newTickets && (
            <div className="bg-green-500/20 border border-green-500/50 rounded-2xl p-4 mb-4 md:mb-0">
              <p className="text-green-300 font-medium">
                🎉 ¡Compra exitosa! {newTickets} tickets agregados
              </p>
            </div>
          )}
        </div>

        {/* Filtros */}
        <div className="flex flex-wrap gap-2 mb-8">
          {[
            { key: 'all', label: 'Todos', icon: '🎫' },
            { key: 'active', label: 'Activos', icon: '🔥' },
            { key: 'won', label: 'Ganadores', icon: '🏆' },
            { key: 'lost', label: 'Perdidos', icon: '😔' }
          ].map(filterOption => (
            <button
              key={filterOption.key}
              onClick={() => setFilter(filterOption.key)}
              className={`px-4 py-2 rounded-xl font-medium transition-all duration-200 ${
                filter === filterOption.key
                  ? 'bg-white text-gray-900'
                  : 'bg-white/20 text-white hover:bg-white/30'
              }`}
            >
              {filterOption.icon} {filterOption.label}
            </button>
          ))}
        </div>

        {/* Estadísticas Rápidas */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <div className="bg-gradient-to-r from-blue-500/20 to-cyan-500/20 backdrop-blur-lg rounded-2xl p-4 border border-blue-500/20 text-center">
            <div className="text-2xl font-bold text-white">
              {tickets.filter(t => t.status === 'ACTIVE' || t.status === 'PENDING').length}
            </div>
            <div className="text-blue-300 text-sm">Activos</div>
          </div>
          <div className="bg-gradient-to-r from-green-500/20 to-emerald-500/20 backdrop-blur-lg rounded-2xl p-4 border border-green-500/20 text-center">
            <div className="text-2xl font-bold text-white">
              {tickets.filter(t => t.status === 'WINNER').length}
            </div>
            <div className="text-green-300 text-sm">Ganadores</div>
          </div>
          <div className="bg-gradient-to-r from-purple-500/20 to-pink-500/20 backdrop-blur-lg rounded-2xl p-4 border border-purple-500/20 text-center">
            <div className="text-2xl font-bold text-white">
              ${tickets.reduce((sum, t) => sum + (t.raffle?.ticketPrice || 0), 0).toFixed(2)}
            </div>
            <div className="text-purple-300 text-sm">Invertido</div>
          </div>
          <div className="bg-gradient-to-r from-yellow-500/20 to-orange-500/20 backdrop-blur-lg rounded-2xl p-4 border border-yellow-500/20 text-center">
            <div className="text-2xl font-bold text-white">
              {Object.keys(ticketsByRaffle).length}
            </div>
            <div className="text-yellow-300 text-sm">Sorteos</div>
          </div>
        </div>

        {/* Lista de Tickets por Sorteo */}
        {Object.keys(ticketsByRaffle).length === 0 ? (
          <div className="bg-white/10 backdrop-blur-lg rounded-3xl p-12 text-center border border-white/20">
            <div className="text-6xl mb-4">🎫</div>
            <h3 className="text-2xl font-bold text-white mb-4">No hay tickets</h3>
            <p className="text-white/70 mb-6">
              {filter === 'all' 
                ? 'Aún no has comprado ningún ticket'
                : `No tienes tickets ${filter === 'active' ? 'activos' : filter === 'won' ? 'ganadores' : 'perdidos'}`
              }
            </p>
            <Link
              href="/"
              className="inline-block px-6 py-3 bg-gradient-to-r from-green-500 to-teal-500 hover:from-green-600 hover:to-teal-600 text-white font-medium rounded-xl shadow-lg hover:shadow-xl transform hover:scale-105 transition-all duration-200"
            >
              Explorar Sorteos
            </Link>
          </div>
        ) : (
          <div className="space-y-8">
            {Object.entries(ticketsByRaffle).map(([raffleId, { raffle, tickets: raffleTickets }]) => (
              <div key={raffleId} className="bg-white/10 backdrop-blur-lg rounded-3xl p-6 border border-white/20">
                
                {/* Header del Sorteo */}
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6">
                  <div className="mb-4 md:mb-0">
                    <Link 
                      href={`/sorteo/${raffleId}`}
                      className="text-xl font-bold text-white hover:text-blue-300 transition-colors"
                    >
                      {raffle?.title || 'Sorteo sin título'}
                    </Link>
                    <div className="flex items-center gap-4 mt-2 text-sm text-white/70">
                      <span className={`px-2 py-1 rounded-full text-xs ${
                        raffle?.status === 'ACTIVE' ? 'bg-green-500/20 text-green-300' :
                        raffle?.status === 'FINISHED' ? 'bg-purple-500/20 text-purple-300' :
                        'bg-gray-500/20 text-gray-300'
                      }`}>
                        {raffle?.status}
                      </span>
                      <span>{raffleTickets.length} tickets</span>
                      <span>${raffle?.ticketPrice || 0} c/u</span>
                    </div>
                  </div>
                  
                  <div className="text-right">
                    <div className="text-2xl font-bold text-white">
                      ${((raffle?.ticketPrice || 0) * raffleTickets.length).toFixed(2)}
                    </div>
                    <div className="text-white/70 text-sm">Total invertido</div>
                  </div>
                </div>

                {/* Grid de Tickets */}
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                  {raffleTickets.map(ticket => (
                    <div key={ticket.uuid} className={`p-4 rounded-2xl border-2 transition-all duration-200 hover:scale-105 ${
                      ticket.status === 'WINNER' 
                        ? 'bg-gradient-to-r from-yellow-500/20 to-orange-500/20 border-yellow-500/50 shadow-yellow-500/20 shadow-lg' 
                        : ticket.status === 'ACTIVE' || ticket.status === 'PENDING'
                        ? 'bg-gradient-to-r from-green-500/20 to-teal-500/20 border-green-500/30'
                        : 'bg-white/5 border-white/20 opacity-60'
                    }`}>
                      <div className="flex items-center justify-between mb-3">
                        <span className="text-2xl">
                          {ticket.status === 'WINNER' ? '🏆' :
                           ticket.status === 'ACTIVE' ? '🎫' :
                           ticket.status === 'PENDING' ? '⏳' : '❌'}
                        </span>
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                          ticket.status === 'WINNER' ? 'bg-yellow-500/20 text-yellow-300' :
                          ticket.status === 'ACTIVE' ? 'bg-green-500/20 text-green-300' :
                          ticket.status === 'PENDING' ? 'bg-blue-500/20 text-blue-300' :
                          'bg-gray-500/20 text-gray-400'
                        }`}>
                          {ticket.status === 'WINNER' ? 'GANADOR' :
                           ticket.status === 'ACTIVE' ? 'ACTIVO' :
                           ticket.status === 'PENDING' ? 'PENDIENTE' : 'PERDIDO'}
                        </span>
                      </div>
                      
                      <div className="text-center">
                        <div className="font-mono text-lg font-bold text-white mb-1">
                          {ticket.displayCode || ticket.uuid?.substr(-8)}
                        </div>
                        <div className="text-white/70 text-xs">
                          {new Date(ticket.generatedAt || ticket.createdAt).toLocaleDateString()}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Botón flotante para comprar más */}
        <div className="fixed bottom-6 right-6">
          <Link
            href="/"
            className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 text-white font-medium rounded-full shadow-lg hover:shadow-xl transform hover:scale-110 transition-all duration-200"
          >
            <span>🎯</span>
            <span className="hidden sm:inline">Comprar más</span>
          </Link>
        </div>
      </div>
    </div>
  );
}