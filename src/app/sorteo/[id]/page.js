// app/sorteo/[id]/page.js
"use client";
import { use, useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import ProgressBar from "@/src/components/raffle/ProgressBar";

export default function SorteoPage({ params }) {
  // Unwrap the params Promise using React.use()
  const resolvedParams = use(params);
  const { id } = resolvedParams;
  
  const { data: session } = useSession();
  const router = useRouter();
  
  const [raffle, setRaffle] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [purchasing, setPurchasing] = useState(false);
  const [quantity, setQuantity] = useState(1);

  // Cargar datos del sorteo
  useEffect(() => {
    let mounted = true;

    async function fetchRaffle() {
      setLoading(true);
      setError(null);
      
      try {
        const res = await fetch(`/api/raffles/${id}`);
        if (!res.ok) {
          const errJson = await res.json().catch(() => null);
          throw new Error(errJson?.error || `Error ${res.status}`);
        }
        
        const data = await res.json();
        if (mounted) {
          setRaffle(data);
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

    fetchRaffle();
    return () => { mounted = false; };
  }, [id]);

  // Función para comprar tickets
  const handlePurchase = async () => {
    if (!session) {
      router.push('/auth/signin');
      return;
    }

    setPurchasing(true);
    try {
      const res = await fetch('/api/purchase', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          raffleId: id,
          quantity: quantity,
          totalAmount: raffle.ticketPrice * quantity
        })
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Error en la compra');
      }

      const result = await res.json();
      
      // Redirigir a página de confirmación o actualizar estado
      router.push(`/mis-tickets?new=${result.tickets?.length || quantity}`);
      
    } catch (err) {
      console.error('Error en compra:', err);
      alert('Error al procesar la compra: ' + err.message);
    } finally {
      setPurchasing(false);
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
            <Link 
              href="/" 
              className="inline-block px-6 py-3 bg-white/20 hover:bg-white/30 text-white rounded-xl transition-colors"
            >
              ← Volver al inicio
            </Link>
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
  const canPurchase = raffle.status === 'ACTIVE' || raffle.status === 'PUBLISHED';
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
                current={ticketsSold}
                target={maxTickets}
                title="Progreso del Sorteo"
                animated={true}
              />
            </div>

            {/* Información del Dueño */}
            {raffle.owner && (
              <div className="bg-white/10 backdrop-blur-lg rounded-3xl p-6 border border-white/20">
                <h3 className="text-xl font-bold text-white mb-4">Organizador</h3>
                <div className="flex items-center gap-4">
                  <Image
                    src={raffle.owner.image || '/avatar-default.png'}
                    alt={raffle.owner.name}
                    width={48}
                    height={48}
                    className="rounded-full border-2 border-white/20"
                  />
                  <div>
                    <p className="text-white font-medium">{raffle.owner.name}</p>
                    <p className="text-white/70 text-sm">Organizador verificado</p>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Sidebar de Compra */}
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
                  <div className="text-2xl font-bold text-white">{ticketsSold}</div>
                  <div className="text-sm text-white/70">Vendidos</div>
                </div>
                <div className="text-center p-3 bg-white/5 rounded-xl">
                  <div className="text-2xl font-bold text-white">{maxTickets}</div>
                  <div className="text-sm text-white/70">Total</div>
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

              {/* Controles de compra */}
              {!isOwner && canPurchase && !isExpired && (
                <div className="space-y-4">
                  <div>
                    <label className="block text-white/70 text-sm mb-2">
                      Cantidad de tickets:
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
                    href={`/admin/raffle/${id}`}
                    className="inline-block mt-2 text-blue-400 hover:underline text-sm"
                  >
                    Administrar sorteo →
                  </Link>
                </div>
              )}

              {!canPurchase && !isOwner && (
                <div className="bg-yellow-500/20 border border-yellow-500/50 rounded-xl p-4 text-center">
                  <p className="text-yellow-300 text-sm">
                    Este sorteo no está disponible para compras
                  </p>
                </div>
              )}

              {!session && canPurchase && (
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
    </div>
  );
}