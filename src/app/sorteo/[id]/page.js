// src/app/sorteo/[id]/page.js
"use client";
import { use, useEffect, useState, useCallback } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import ProgressBar from "@/components/raffle/ProgressBar";
import ParticipateModal from "@/components/raffle/ParticipateModal";

export default function SorteoPage({ params }) {
  // Unwrap the params Promise using React.use()
  const resolvedParams = use(params);
  const { id } = resolvedParams;
  
  const { data: session } = useSession();
  const router = useRouter();
  
  const [raffle, setRaffle] = useState(null);
  const [participants, setParticipants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [purchasing, setPurchasing] = useState(false);
  const [quantity, setQuantity] = useState(1);
  
  // Estados para participación
  const [showParticipateModal, setShowParticipateModal] = useState(false);
  const [userParticipation, setUserParticipation] = useState(null);
  const [participantsLoading, setParticipantsLoading] = useState(false);

  // ✅ CORREGIDO: Cargar lista de participantes - useCallback para evitar recreación
  const loadParticipants = useCallback(async (raffleId = id) => {
    try {
      setParticipantsLoading(true);
      console.log('Loading participants for raffle:', raffleId);
      
      const res = await fetch(`/api/raffles/${raffleId}/participate`);
      if (res.ok) {
        const data = await res.json();
        console.log('Participants loaded:', data);
        setParticipants(Array.isArray(data.participants) ? data.participants : []);
      } else {
        console.warn('Failed to load participants:', res.status);
        setParticipants([]);
      }
    } catch (err) {
      console.error("Error loading participants:", err);
      setParticipants([]);
    } finally {
      setParticipantsLoading(false);
    }
  }, [id]);

  // ✅ CORREGIDO: Verificar si el usuario ya está participando - useCallback
  const checkUserParticipation = useCallback(async (raffleId) => {
    if (!session?.user?.email || !raffleId) return;

    try {
      console.log('Checking user participation for raffle:', raffleId);
      const res = await fetch('/api/tickets/my');
      if (res.ok) {
        const data = await res.json();
        console.log('User tickets response:', data);
        
        // Manejar diferentes formatos de respuesta
        let tickets = [];
        if (Array.isArray(data)) {
          tickets = data;
        } else if (data.tickets && Array.isArray(data.tickets)) {
          tickets = data.tickets;
        } else if (data.data && Array.isArray(data.data)) {
          tickets = data.data;
        }
        
        const participation = tickets.find(ticket => 
          ticket.raffleId === raffleId && 
          (ticket.status === 'IN_RAFFLE' || ticket.status === 'ACTIVE')
        );
        setUserParticipation(participation || null);
        console.log('User participation:', participation);
      } else {
        console.warn('Failed to check user participation:', res.status);
      }
    } catch (err) {
      console.error("Error checking participation:", err);
    }
  }, [session?.user?.email]);

  // Cargar datos del sorteo
  useEffect(() => {
    let mounted = true;

    async function fetchData() {
      setLoading(true);
      setError(null);
      
      try {
        console.log('Fetching raffle data for ID:', id);
        
        // Cargar información del sorteo - ✅ Con mejor manejo de errores
        const raffleRes = await fetch(`/api/raffles/${id}`);
        console.log('Raffle response status:', raffleRes.status);
        
        if (!raffleRes.ok) {
          let errorMessage = `Error ${raffleRes.status}`;
          try {
            const errJson = await raffleRes.json();
            errorMessage = errJson.error || errorMessage;
          } catch (e) {
            console.warn('Could not parse error response');
          }
          throw new Error(errorMessage);
        }
        
        const raffleData = await raffleRes.json();
        console.log('Raffle data loaded:', raffleData);
        
        if (mounted) {
          setRaffle(raffleData);
          
          // Solo cargar participantes si el usuario está autenticado y el sorteo está cargado
          if (session && raffleData?.id) {
            loadParticipants(raffleData.id);
            checkUserParticipation(raffleData.id);
          }
        }

      } catch (err) {
        console.error("Error cargando sorteo:", err);
        if (mounted) {
          setError(err.message || "Error al cargar el sorteo");
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    }

    if (id) {
      fetchData();
    }
    return () => { mounted = false; };
  }, [id, session, loadParticipants, checkUserParticipation]); // ✅ CORREGIDO: Dependencias incluidas

  // Función para comprar tickets (mantener la funcionalidad existente)
  const handlePurchase = async () => {
    if (!session) {
      router.push('/auth/signin');
      return;
    }

    if (!raffle?.id) {
      alert('Error: ID del sorteo no válido');
      return;
    }

    setPurchasing(true);
    try {
      console.log('Purchasing tickets:', { raffleId: id, quantity });
      
      const res = await fetch('/api/tickets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          raffleId: id,
          quantity: quantity
        })
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || `Error ${res.status}: Error en la compra`);
      }

      const result = await res.json();
      console.log('Purchase result:', result);
      
      // Redirigir a página de confirmación o actualizar estado
      router.push(`/mis-tickets?new=${result.tickets?.count || quantity}`);
      
    } catch (err) {
      console.error('Error en compra:', err);
      alert('Error al procesar la compra: ' + err.message);
    } finally {
      setPurchasing(false);
    }
  };

  // Handler para participación exitosa
  const handleParticipationSuccess = (data) => {
    console.log('Participation successful:', data);
    
    // Actualizar estado local
    setUserParticipation({
      raffleId: id,
      ticketCode: data.participation?.ticketCode || data.ticketCode,
      status: 'IN_RAFFLE'
    });

    // Recargar participantes
    loadParticipants();

    // Mostrar notificación de éxito
    alert(`¡Participación exitosa! Tu ticket ${data.participation?.ticketCode || 'se registró'} está ahora en el sorteo.`);
    
    // Si el sorteo está listo, mostrar mensaje adicional
    if (data.raffleStatus?.isReady) {
      alert(`🎉 ¡El sorteo alcanzó el límite de participantes! Se realizará pronto.`);
    }
  };

  // Estados de carga
  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-900 via-blue-900 to-indigo-900 pt-20">
        <div className="container mx-auto px-4 py-8">
          <div className="animate-pulse">
            <div className="h-8 bg-white/20 rounded w-1/3 mb-6"></div>
            <div className="bg-white/10 rounded-3xl p-8 mb-8">
              <div className="h-64 bg-white/20 rounded-2xl mb-6"></div>
              <div className="space-y-4">
                <div className="h-6 bg-white/20 rounded"></div>
                <div className="h-4 bg-white/20 rounded w-3/4"></div>
                <div className="h-4 bg-white/20 rounded w-1/2"></div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (error || !raffle) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-900 via-blue-900 to-indigo-900 pt-20">
        <div className="container mx-auto px-4 py-8">
          <div className="bg-red-500/20 border border-red-500/50 rounded-3xl p-8 text-center">
            <h1 className="text-2xl font-bold text-white mb-4">Sorteo no encontrado</h1>
            <p className="text-white/70 mb-6">{error}</p>
            <div className="flex gap-4 justify-center">
              <button
                onClick={() => window.location.reload()}
                className="px-6 py-3 bg-purple-500 hover:bg-purple-600 text-white rounded-xl transition-colors"
              >
                Reintentar
              </button>
              <Link 
                href="/" 
                className="inline-block px-6 py-3 bg-white/20 hover:bg-white/30 text-white rounded-xl transition-colors"
              >
                Volver al inicio
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Calcular estadísticas
  const ticketsSold = raffle._count?.tickets || 0;
  const maxTickets = raffle.maxTickets || 1000;
  const progressPercentage = Math.min((ticketsSold / maxTickets) * 100, 100);
  const isOwner = session?.user?.id === raffle.ownerId;
  
  // Verificar si puede comprar/participar
  const canPurchase = (raffle.status === 'ACTIVE' || raffle.status === 'PUBLISHED') && raffle.publishedAt;
  const canParticipate = canPurchase && !isOwner && !userParticipation;
  const isExpired = raffle.endsAt && new Date() > new Date(raffle.endsAt);

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-900 via-blue-900 to-indigo-900 pt-20">
      <div className="container mx-auto px-4 py-8">
        
        {/* Header */}
        <div className="mb-8">
          <Link 
            href="/" 
            className="inline-flex items-center text-white/70 hover:text-white mb-4 transition-colors"
          >
            ← Volver a sorteos
          </Link>
          <h1 className="text-4xl font-bold text-white mb-2">{raffle.title}</h1>
          <div className="flex items-center gap-4 text-white/70">
            <span className={`px-3 py-1 rounded-full text-sm font-medium ${
              raffle.status === 'ACTIVE' ? 'bg-green-500/20 text-green-300' :
              raffle.status === 'PUBLISHED' ? 'bg-blue-500/20 text-blue-300' :
              raffle.status === 'FINISHED' ? 'bg-purple-500/20 text-purple-300' :
              'bg-gray-500/20 text-gray-300'
            }`}>
              {raffle.status === 'ACTIVE' ? '🔥 Activo' :
               raffle.status === 'PUBLISHED' ? '📢 Publicado' :
               raffle.status === 'FINISHED' ? '🏆 Finalizado' :
               raffle.status}
            </span>
            <span>Por: {raffle.owner?.name || 'Anónimo'}</span>
            <span>Creado: {new Date(raffle.createdAt).toLocaleDateString()}</span>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          
          {/* Columna Principal */}
          <div className="lg:col-span-2">
            
            {/* Imagen y Descripción */}
            <div className="bg-white/10 backdrop-blur-lg rounded-3xl p-8 mb-8 border border-white/20">
              {raffle.imageUrl && (
                <div className="mb-6">
                  <Image
                    src={raffle.imageUrl}
                    alt={raffle.title}
                    width={600}
                    height={400}
                    className="w-full h-64 object-cover rounded-2xl"
                    onError={(e) => {
                      e.target.style.display = 'none';
                    }}
                  />
                </div>
              )}
              
              <div className="prose prose-invert max-w-none">
                <p className="text-white/90 text-lg leading-relaxed">
                  {raffle.description || 'Sin descripción disponible'}
                </p>
              </div>
            </div>

            {/* Barra de Progreso */}
            <div className="mb-8">
              <ProgressBar
                current={participants.length}
                target={raffle.maxParticipants || 100}
                title="Progreso de Participantes"
                animated={true}
              />
            </div>

            {/* Lista de Participantes */}
            {participants.length > 0 && (
              <div className="bg-white/10 backdrop-blur-lg rounded-3xl p-6 border border-white/20 mb-8">
                <div className="flex justify-between items-center mb-4">
                  <h3 className="text-xl font-bold text-white">Participantes ({participants.length})</h3>
                  <button
                    onClick={() => loadParticipants()}
                    disabled={participantsLoading}
                    className="px-3 py-1 bg-white/20 hover:bg-white/30 text-white text-sm rounded-lg transition-colors disabled:opacity-50"
                  >
                    {participantsLoading ? '🔄' : '🔄 Actualizar'}
                  </button>
                </div>
                
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 max-h-60 overflow-y-auto">
                  {participants.map((participant, index) => (
                    <div 
                      key={participant.id || index}
                      className={`p-3 rounded-xl border ${
                        participant.isWinner 
                          ? 'bg-yellow-500/20 border-yellow-500/50' 
                          : 'bg-white/5 border-white/20'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 bg-gradient-to-r from-purple-500 to-pink-500 rounded-full flex items-center justify-center text-white text-sm font-bold">
                          {participant.isWinner ? '👑' : index + 1}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-white font-medium truncate">
                            {participant.user?.name || participant.name || 'Usuario'}
                          </div>
                          <div className="text-white/60 text-xs font-mono">
                            {participant.ticket?.code || participant.ticketCode || 'Código oculto'}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Información del Dueño */}
            {raffle.owner && (
              <div className="bg-white/10 backdrop-blur-lg rounded-3xl p-6 border border-white/20">
                <h3 className="text-xl font-bold text-white mb-4">Organizador</h3>
                <div className="flex items-center gap-4">
                  <Image
                    src={raffle.owner.image || '/avatar-default.png'}
                    alt={raffle.owner.name || 'Usuario'}
                    width={48}
                    height={48}
                    className="rounded-full border-2 border-white/20"
                    onError={(e) => {
                      e.target.src = '/avatar-default.png';
                    }}
                  />
                  <div>
                    <p className="text-white font-medium">{raffle.owner.name}</p>
                    <p className="text-white/70 text-sm">Organizador verificado</p>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Sidebar de Acciones */}
          <div className="lg:col-span-1">
            <div className="bg-white/10 backdrop-blur-lg rounded-3xl p-6 border border-white/20 sticky top-24">
              
              {/* Precio */}
              <div className="text-center mb-6">
                <div className="text-4xl font-bold text-white mb-2">
                  ${raffle.ticketPrice}
                </div>
                <div className="text-white/70">por ticket</div>
              </div>

              {/* Estadísticas */}
              <div className="grid grid-cols-2 gap-4 mb-6">
                <div className="text-center p-3 bg-white/5 rounded-xl">
                  <div className="text-2xl font-bold text-white">{participants.length}</div>
                  <div className="text-sm text-white/70">Participantes</div>
                </div>
                <div className="text-center p-3 bg-white/5 rounded-xl">
                  <div className="text-2xl font-bold text-white">{raffle.maxParticipants || '∞'}</div>
                  <div className="text-sm text-white/70">Máximo</div>
                </div>
              </div>

              {/* Fecha de fin */}
              {raffle.endsAt && (
                <div className="mb-6 text-center">
                  <div className="text-white/70 text-sm mb-1">Finaliza:</div>
                  <div className={`font-medium ${isExpired ? 'text-red-400' : 'text-white'}`}>
                    {new Date(raffle.endsAt).toLocaleString()}
                  </div>
                  {isExpired && (
                    <div className="text-red-400 text-sm mt-1">¡Sorteo expirado!</div>
                  )}
                </div>
              )}

              {/* Estado de participación del usuario */}
              {session && userParticipation && (
                <div className="mb-6 bg-green-500/20 border border-green-500/50 rounded-xl p-4 text-center">
                  <p className="text-green-300 font-bold mb-1">¡Ya estás participando!</p>
                  <p className="text-green-200/80 text-sm">
                    Ticket: {userParticipation.ticketCode || userParticipation.code || 'Código oculto'}
                  </p>
                </div>
              )}

              {/* Botón de Participar */}
              {session && canParticipate && (
                <div className="mb-4">
                  <button
                    onClick={() => setShowParticipateModal(true)}
                    className="w-full py-3 bg-gradient-to-r from-green-500 to-teal-500 hover:from-green-600 hover:to-teal-600 text-white font-bold rounded-xl shadow-lg hover:shadow-xl transform hover:scale-105 transition-all duration-200"
                  >
                    🎯 Participar con Ticket
                  </button>
                  <p className="text-white/60 text-xs text-center mt-2">
                    Usa uno de tus tickets disponibles para participar
                  </p>
                </div>
              )}

              {/* Separador si hay ambas opciones */}
              {session && canParticipate && canPurchase && (
                <div className="flex items-center my-4">
                  <hr className="flex-1 border-white/20" />
                  <span className="px-3 text-white/50 text-sm">o</span>
                  <hr className="flex-1 border-white/20" />
                </div>
              )}

              {/* Controles de compra (mantener funcionalidad existente) */}
              {!isOwner && canPurchase && !isExpired && (
                <div className="space-y-4">
                  <div>
                    <label className="block text-white/70 text-sm mb-2">
                      Comprar tickets nuevos:
                    </label>
                    <input
                      type="number"
                      min="1"
                      max="10"
                      value={quantity}
                      onChange={(e) => setQuantity(Math.max(1, parseInt(e.target.value) || 1))}
                      className="w-full px-4 py-2 bg-white/10 border border-white/20 rounded-xl text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-purple-500"
                    />
                  </div>
                  
                  <div className="text-center text-white/70 text-sm">
                    Total: <span className="font-bold">${(raffle.ticketPrice * quantity).toFixed(2)}</span>
                  </div>
                  
                  <button
                    onClick={handlePurchase}
                    disabled={purchasing}
                    className="w-full py-3 bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold rounded-xl shadow-lg hover:shadow-xl transform hover:scale-105 transition-all duration-200"
                  >
                    {purchasing ? 'Procesando...' : '🎟️ Comprar Tickets'}
                  </button>
                </div>
              )}

              {/* Mensajes de estado */}
              {isOwner && (
                <div className="bg-blue-500/20 border border-blue-500/50 rounded-xl p-4 text-center">
                  <p className="text-blue-300 text-sm">
                    👑 Eres el organizador de este sorteo
                  </p>
                  <Link 
                    href={`/admin/raffles/${id}`}
                    className="inline-block mt-2 text-blue-400 hover:underline text-sm"
                  >
                    Administrar sorteo →
                  </Link>
                </div>
              )}

              {!canPurchase && !isOwner && (
                <div className="bg-yellow-500/20 border border-yellow-500/50 rounded-xl p-4 text-center">
                  <p className="text-yellow-300 text-sm">
                    Este sorteo no está disponible
                  </p>
                </div>
              )}

              {!session && (
                <button
                  onClick={() => router.push('/auth/signin')}
                  className="w-full py-3 bg-white/20 hover:bg-white/30 text-white font-bold rounded-xl transition-colors"
                >
                  Iniciar sesión para participar
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Modal de Participación */}
      <ParticipateModal
        isOpen={showParticipateModal}
        onClose={() => setShowParticipateModal(false)}
        raffle={raffle}
        onSuccess={handleParticipationSuccess}
      />
    </div>
  );
}