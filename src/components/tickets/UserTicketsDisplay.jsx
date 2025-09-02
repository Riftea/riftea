import { useState, useEffect } from 'react';

export default function UserTicketsDisplay({ session }) {
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');

  useEffect(() => {
    if (session) {
      fetchTickets();
    }
  }, [session, filter]);

  const fetchTickets = async () => {
    try {
      setLoading(true);
      // ✅ Usar el endpoint que ya tienes
      const response = await fetch('/api/tickets/my');
      
      if (response.ok) {
        const data = await response.json();
        console.log('🎫 Tickets recibidos:', data);
        
        // Filtrar por status si es necesario
        let filteredTickets = data.tickets || [];
        if (filter !== 'all') {
          filteredTickets = filteredTickets.filter(ticket => ticket.status === filter);
        }
        
        setTickets(filteredTickets);
      } else {
        const errorData = await response.json();
        console.error('❌ Error fetching tickets:', errorData);
        setTickets([]);
      }
    } catch (error) {
      console.error('❌ Error fetching tickets:', error);
      setTickets([]);
    } finally {
      setLoading(false);
    }
  };

  const useTicketInRaffle = async (ticketId) => {
    try {
      const response = await fetch('/api/tickets/use', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ticketId,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        alert(data.message || 'Ticket usado exitosamente');
        // Refrescar la lista de tickets
        fetchTickets();
      } else {
        const data = await response.json();
        alert(data.error || 'Error al usar el ticket');
      }
    } catch (error) {
      console.error('Error usando ticket:', error);
      alert('Error de conexión');
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'AVAILABLE':
        return 'bg-green-100 text-green-800';
      case 'IN_RAFFLE':
        return 'bg-blue-100 text-blue-800';
      case 'PENDING':
        return 'bg-yellow-100 text-yellow-800';
      case 'ACTIVE':
        return 'bg-blue-100 text-blue-800';
      case 'WINNER':
        return 'bg-purple-100 text-purple-800';
      case 'LOST':
        return 'bg-gray-100 text-gray-800';
      case 'DELETED':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const getStatusText = (status) => {
    switch (status) {
      case 'AVAILABLE':
        return 'Disponible';
      case 'IN_RAFFLE':
        return 'En Sorteo';
      case 'PENDING':
        return 'Pendiente';
      case 'ACTIVE':
        return 'Activo';
      case 'WINNER':
        return 'Ganador';
      case 'LOST':
        return 'Perdió';
      case 'DELETED':
        return 'Eliminado';
      default:
        return status;
    }
  };

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString('es-ES', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  if (!session) {
    return (
      <div className="bg-yellow-50 border border-yellow-200 rounded-md p-4">
        <p className="text-yellow-600">Debes iniciar sesión para ver tus tickets</p>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto p-6">
      <div className="bg-white rounded-lg shadow-md">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-2xl font-bold text-gray-900">Mis Tickets</h2>
          <p className="text-gray-600 mt-1">
            Gestiona y visualiza todos tus tickets disponibles
          </p>
        </div>

        {/* Filtros */}
        <div className="px-6 py-4 bg-gray-50 border-b border-gray-200">
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setFilter('all')}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                filter === 'all'
                  ? 'bg-blue-600 text-white'
                  : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
              }`}
            >
              Todos
            </button>
            <button
              onClick={() => setFilter('AVAILABLE')}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                filter === 'AVAILABLE'
                  ? 'bg-blue-600 text-white'
                  : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
              }`}
            >
              Disponibles
            </button>
            <button
              onClick={() => setFilter('ACTIVE')}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                filter === 'ACTIVE'
                  ? 'bg-blue-600 text-white'
                  : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
              }`}
            >
              Activos
            </button>
            <button
              onClick={() => setFilter('WINNER')}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                filter === 'WINNER'
                  ? 'bg-blue-600 text-white'
                  : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
              }`}
            >
              Ganadores
            </button>
          </div>
        </div>

        {/* Lista de Tickets */}
        <div className="p-6">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mr-3"></div>
              <span className="text-gray-600">Cargando tickets...</span>
            </div>
          ) : tickets.length === 0 ? (
            <div className="text-center py-8">
              <div className="w-16 h-16 mx-auto mb-4 text-gray-400">
                <svg fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M5 3a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2V5a2 2 0 00-2-2H5zm0 2h10v7h-2l-1-2H8l-1 2H5V5z" clipRule="evenodd" />
                </svg>
              </div>
              <h3 className="text-lg font-medium text-gray-900 mb-1">
                No tienes tickets
              </h3>
              <p className="text-gray-600">
                {filter === 'all' 
                  ? 'Aún no se han generado tickets para tu cuenta'
                  : `No tienes tickets con estado "${getStatusText(filter)}"`
                }
              </p>
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {tickets.map((ticket) => (
                <div
                  key={ticket.id}
                  className="bg-white border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow"
                >
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs text-gray-500 font-mono">
                      {ticket.uuid}
                    </span>
                    <span className={`px-2 py-1 text-xs font-medium rounded-full ${getStatusColor(ticket.status)}`}>
                      {getStatusText(ticket.status)}
                    </span>
                  </div>

                  <div className="space-y-2 text-sm text-gray-600">
                    <div className="flex justify-between">
                      <span>Creado:</span>
                      <span className="font-medium">{formatDate(ticket.createdAt)}</span>
                    </div>
                    
                    {ticket.metodoPago && (
                      <div className="flex justify-between">
                        <span>Método:</span>
                        <span className="font-medium text-blue-600">
                          {ticket.metodoPago === 'MANUAL_ADMIN' ? 'Admin' : ticket.metodoPago}
                        </span>
                      </div>
                    )}
                    
                    {ticket.raffle && (
                      <div>
                        <span className="font-medium text-gray-900">Sorteo:</span>
                        <div className="mt-1 text-xs bg-gray-50 p-2 rounded">
                          <div className="font-medium">{ticket.raffle.title}</div>
                          <div className="text-gray-500">
                            Estado: {ticket.raffle.status}
                          </div>
                          {ticket.isWinner && (
                            <div className="text-purple-600 font-bold">
                              🎉 ¡GANADOR!
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>

                  {ticket.status === 'AVAILABLE' && (
                    <div className="mt-4 pt-3 border-t border-gray-200">
                      <button
                        onClick={() => useTicketInRaffle(ticket.id)}
                        className="w-full bg-blue-600 text-white py-2 px-4 rounded-md text-sm font-medium hover:bg-blue-700 transition-colors"
                      >
                        Usar en Sorteo
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Estadísticas */}
        {!loading && tickets.length > 0 && (
          <div className="px-6 py-4 bg-gray-50 border-t border-gray-200">
            <div className="grid grid-cols-2 md:grid-cols-6 gap-4 text-center">
              <div>
                <div className="text-2xl font-bold text-gray-900">
                  {tickets.length}
                </div>
                <div className="text-xs text-gray-600">Total</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-green-600">
                  {tickets.filter(t => t.status === 'AVAILABLE').length}
                </div>
                <div className="text-xs text-gray-600">Disponibles</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-blue-600">
                  {tickets.filter(t => t.status === 'ACTIVE').length}
                </div>
                <div className="text-xs text-gray-600">Activos</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-purple-600">
                  {tickets.filter(t => t.status === 'WINNER').length}
                </div>
                <div className="text-xs text-gray-600">Ganadores</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-gray-600">
                  {tickets.filter(t => t.status === 'LOST').length}
                </div>
                <div className="text-xs text-gray-600">Perdieron</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-red-600">
                  {tickets.filter(t => t.status === 'DELETED').length}
                </div>
                <div className="text-xs text-gray-600">Eliminados</div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}