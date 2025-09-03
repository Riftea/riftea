// src/components/raffle/ParticipateModal.jsx
"use client";
import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';

export default function ParticipateModal({ 
  isOpen, 
  onClose, 
  raffle, 
  onSuccess 
}) {
  const { data: session } = useSession();
  const [userTickets, setUserTickets] = useState([]);
  const [selectedTicket, setSelectedTicket] = useState(null);
  const [loading, setLoading] = useState(true);
  const [participating, setParticipating] = useState(false);
  const [error, setError] = useState(null);

  // Cargar tickets disponibles del usuario
  useEffect(() => {
    if (isOpen && session) {
      loadUserTickets();
    }
  }, [isOpen, session]);

  const loadUserTickets = async () => {
    try {
      setLoading(true);
      setError(null);
      
      console.log('Loading user tickets...');
      const res = await fetch('/api/tickets/my');
      
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || `Error ${res.status}: ${res.statusText}`);
      }
      
      const data = await res.json();
      console.log('API response:', data);
      
      // Manejar diferentes formatos de respuesta de la API
      let tickets = [];
      if (Array.isArray(data)) {
        tickets = data;
      } else if (data.tickets && Array.isArray(data.tickets)) {
        tickets = data.tickets;
      } else if (data.data && Array.isArray(data.data)) {
        tickets = data.data;
      } else {
        console.warn('Formato de respuesta inesperado:', data);
        tickets = [];
      }
      
      // Filtrar solo tickets disponibles para participar
      const availableTickets = tickets.filter(ticket => {
        // Verificar diferentes condiciones según tu schema
        const isAvailable = ticket.status === 'AVAILABLE';
        const isPendingAndGeneric = ticket.status === 'PENDING' && !ticket.raffleId;
        const isNotUsed = !ticket.isUsed;
        
        return (isAvailable || isPendingAndGeneric) && isNotUsed;
      });
      
      console.log('Available tickets:', availableTickets);
      setUserTickets(availableTickets);
      
      // Seleccionar automáticamente el primer ticket disponible
      if (availableTickets.length > 0) {
        setSelectedTicket(availableTickets[0]);
      }
      
    } catch (err) {
      console.error('Error loading tickets:', err);
      setError('Error al cargar tus tickets disponibles: ' + err.message);
      setUserTickets([]);
    } finally {
      setLoading(false);
    }
  };

  const handleParticipate = async () => {
    if (!selectedTicket) {
      setError('Debes seleccionar un ticket para participar');
      return;
    }

    if (!raffle?.id) {
      setError('Error: ID del sorteo no válido');
      return;
    }

    setParticipating(true);
    setError(null);

    try {
      console.log('Participating with ticket:', selectedTicket.id, 'in raffle:', raffle.id);
      
      const res = await fetch(`/api/raffles/${raffle.id}/participate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ticketId: selectedTicket.id
        })
      });

      const data = await res.json();
      console.log('Participate response:', data);

      if (!res.ok) {
        throw new Error(data.error || `Error ${res.status}: Error al participar en el sorteo`);
      }

      // Éxito
      console.log('Successfully participated in raffle');
      if (onSuccess) {
        onSuccess(data);
      }
      onClose();
      
    } catch (err) {
      console.error('Error participating:', err);
      setError(err.message);
    } finally {
      setParticipating(false);
    }
  };

  const handleClose = () => {
    if (!participating) {
      setError(null);
      setSelectedTicket(null);
      onClose();
    }
  };

  // Función helper para mostrar el código del ticket
  const getTicketDisplayCode = (ticket) => {
    if (ticket.displayCode) return ticket.displayCode;
    if (ticket.code) return ticket.code;
    if (ticket.uuid) return ticket.uuid.slice(-8).toUpperCase();
    return ticket.id.slice(-6).toUpperCase();
  };

  // Función helper para obtener el tipo de ticket
  const getTicketType = (ticket) => {
    if (ticket.raffleId) return 'Ticket específico';
    if (ticket.status === 'AVAILABLE') return 'Ticket genérico';
    return 'Ticket pendiente';
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-gradient-to-br from-purple-900/95 via-blue-900/95 to-indigo-900/95 backdrop-blur-lg rounded-3xl border border-white/20 shadow-2xl max-w-lg w-full max-h-[90vh] overflow-hidden">
        
        {/* Header */}
        <div className="p-6 border-b border-white/10">
          <div className="flex justify-between items-center">
            <div>
              <h2 className="text-2xl font-bold text-white mb-1">
                Participar en Sorteo
              </h2>
              <p className="text-white/70 text-sm">
                {raffle?.title || 'Cargando...'}
              </p>
            </div>
            <button
              onClick={handleClose}
              disabled={participating}
              className="text-white/60 hover:text-white transition-colors disabled:opacity-50"
            >
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-6">
          
          {/* Loading State */}
          {loading && (
            <div className="text-center py-8">
              <div className="animate-spin w-8 h-8 border-4 border-white/30 border-t-white rounded-full mx-auto mb-4"></div>
              <p className="text-white/70">Cargando tus tickets...</p>
            </div>
          )}

          {/* Error State */}
          {!loading && error && !userTickets.length && (
            <div className="text-center py-8">
              <div className="text-6xl mb-4">⚠️</div>
              <h3 className="text-xl font-bold text-white mb-2">Error al cargar tickets</h3>
              <p className="text-white/70 mb-6 text-sm">
                {error}
              </p>
              <div className="flex gap-3 justify-center">
                <button
                  onClick={loadUserTickets}
                  className="px-6 py-2 bg-purple-500 hover:bg-purple-600 text-white rounded-xl transition-colors"
                >
                  Reintentar
                </button>
                <button
                  onClick={handleClose}
                  className="px-6 py-2 bg-white/20 hover:bg-white/30 text-white rounded-xl transition-colors"
                >
                  Cerrar
                </button>
              </div>
            </div>
          )}

          {/* No tickets available */}
          {!loading && !error && userTickets.length === 0 && (
            <div className="text-center py-8">
              <div className="text-6xl mb-4">🎫</div>
              <h3 className="text-xl font-bold text-white mb-2">No tienes tickets disponibles</h3>
              <p className="text-white/70 mb-6">
                Necesitas comprar tickets o generar tickets para poder participar en sorteos.
              </p>
              <button
                onClick={handleClose}
                className="px-6 py-2 bg-white/20 hover:bg-white/30 text-white rounded-xl transition-colors"
              >
                Cerrar
              </button>
            </div>
          )}

          {/* Ticket selection */}
          {!loading && userTickets.length > 0 && (
            <div className="space-y-6">
              
              {/* Warning/Info */}
              <div className="bg-yellow-500/20 border border-yellow-500/30 rounded-2xl p-4">
                <div className="flex items-start gap-3">
                  <span className="text-2xl">⚠️</span>
                  <div>
                    <h4 className="text-yellow-300 font-bold mb-1">Importante</h4>
                    <p className="text-yellow-200/80 text-sm">
                      Una vez que uses tu ticket en este sorteo, quedará vinculado a él hasta que termine.
                    </p>
                  </div>
                </div>
              </div>

              {/* Ticket selection */}
              <div>
                <h4 className="text-white font-bold mb-4">Selecciona un ticket para participar:</h4>
                
                <div className="space-y-3 max-h-60 overflow-y-auto">
                  {userTickets.map(ticket => (
                    <div
                      key={ticket.id}
                      onClick={() => setSelectedTicket(ticket)}
                      className={`p-4 rounded-2xl border-2 cursor-pointer transition-all ${
                        selectedTicket?.id === ticket.id
                          ? 'border-purple-400 bg-purple-500/20'
                          : 'border-white/20 bg-white/10 hover:border-white/40 hover:bg-white/20'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <span className="text-2xl">🎫</span>
                          <div>
                            <div className="font-mono text-white font-bold">
                              {getTicketDisplayCode(ticket)}
                            </div>
                            <div className="text-white/60 text-sm">
                              {getTicketType(ticket)}
                            </div>
                            {ticket.status && (
                              <div className="text-white/40 text-xs">
                                Estado: {ticket.status}
                              </div>
                            )}
                          </div>
                        </div>
                        
                        <div className={`w-4 h-4 rounded-full border-2 ${
                          selectedTicket?.id === ticket.id
                            ? 'bg-purple-400 border-purple-400'
                            : 'border-white/40'
                        }`}>
                          {selectedTicket?.id === ticket.id && (
                            <div className="w-full h-full rounded-full bg-white"></div>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Error message */}
              {error && (
                <div className="bg-red-500/20 border border-red-500/30 rounded-2xl p-4">
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">❌</span>
                    <div>
                      <h4 className="text-red-300 font-bold">Error</h4>
                      <p className="text-red-200/80 text-sm">{error}</p>
                    </div>
                  </div>
                </div>
              )}

              {/* Action buttons */}
              <div className="flex gap-4">
                <button
                  onClick={handleClose}
                  disabled={participating}
                  className="flex-1 py-3 bg-white/10 hover:bg-white/20 disabled:opacity-50 text-white font-bold rounded-xl transition-colors"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleParticipate}
                  disabled={participating || !selectedTicket}
                  className="flex-1 py-3 bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold rounded-xl shadow-lg hover:shadow-xl transform hover:scale-105 transition-all duration-200"
                >
                  {participating ? (
                    <div className="flex items-center justify-center gap-2">
                      <div className="animate-spin w-4 h-4 border-2 border-white/30 border-t-white rounded-full"></div>
                      Participando...
                    </div>
                  ) : (
                    '🎯 Confirmar Participación'
                  )}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}