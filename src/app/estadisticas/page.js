// app/estadisticas/page.js
"use client";
import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";

export default function EstadisticasPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (status === "loading") return;
    if (status === "unauthenticated") {
      router.push("/auth/signin");
      return;
    }

    fetchStats();
  }, [status, router]);

  const fetchStats = async () => {
    try {
      const res = await fetch("/api/users/me");
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || "Error al cargar estadísticas");
      }
      
      const data = await res.json();
      
      // Verificar que la respuesta sea exitosa
      if (!data.success) {
        throw new Error(data.error || "Error en la respuesta del servidor");
      }
      
      setStats(data);
      setError(null);
    } catch (err) {
      console.error("Error fetching stats:", err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-indigo-900 via-purple-900 to-pink-900 pt-20">
        <div className="container mx-auto px-4 py-8">
          <div className="animate-pulse">
            <div className="h-8 bg-white/20 rounded w-1/3 mb-8"></div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
              {[...Array(6)].map((_, i) => (
                <div key={i} className="h-32 bg-white/20 rounded-2xl"></div>
              ))}
            </div>
            <div className="h-64 bg-white/20 rounded-3xl"></div>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-indigo-900 via-purple-900 to-pink-900 pt-20">
        <div className="container mx-auto px-4 py-8">
          <div className="text-center">
            <div className="text-6xl mb-4">⚠️</div>
            <h1 className="text-2xl font-bold text-white mb-4">Error al cargar estadísticas</h1>
            <p className="text-red-400 mb-4">{error}</p>
            <button 
              onClick={fetchStats}
              className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg transition-colors"
            >
              Reintentar
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-900 via-purple-900 to-pink-900 pt-20">
      <div className="container mx-auto px-4 py-8">
        
        <h1 className="text-4xl font-bold text-white mb-8">📊 Estadísticas</h1>

        {/* Estadísticas Generales */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
          
          <div className="bg-gradient-to-r from-blue-500/20 to-cyan-500/20 backdrop-blur-lg rounded-2xl p-6 border border-blue-500/20">
            <div className="flex items-center justify-between mb-4">
              <div className="text-blue-400">🎯</div>
              <div className="text-2xl font-bold text-white">{stats?.totalRafflesCreated || 0}</div>
            </div>
            <div className="text-white/90 font-medium">Sorteos Creados</div>
            <div className="text-blue-400/70 text-sm">Total histórico</div>
          </div>

          <div className="bg-gradient-to-r from-green-500/20 to-emerald-500/20 backdrop-blur-lg rounded-2xl p-6 border border-green-500/20">
            <div className="flex items-center justify-between mb-4">
              <div className="text-green-400">🎫</div>
              <div className="text-2xl font-bold text-white">{stats?.totalTicketsSold || 0}</div>
            </div>
            <div className="text-white/90 font-medium">Tickets Vendidos</div>
            <div className="text-green-400/70 text-sm">Como organizador</div>
          </div>

          <div className="bg-gradient-to-r from-purple-500/20 to-pink-500/20 backdrop-blur-lg rounded-2xl p-6 border border-purple-500/20">
            <div className="flex items-center justify-between mb-4">
              <div className="text-purple-400">💰</div>
              <div className="text-2xl font-bold text-white">
                ${stats?.totalRevenue ? stats.totalRevenue.toLocaleString() : '0'}
              </div>
            </div>
            <div className="text-white/90 font-medium">Ingresos Generados</div>
            <div className="text-purple-400/70 text-sm">Todos los sorteos</div>
          </div>

          <div className="bg-gradient-to-r from-yellow-500/20 to-orange-500/20 backdrop-blur-lg rounded-2xl p-6 border border-yellow-500/20">
            <div className="flex items-center justify-between mb-4">
              <div className="text-yellow-400">🏆</div>
              <div className="text-2xl font-bold text-white">{stats?.totalWins || 0}</div>
            </div>
            <div className="text-white/90 font-medium">Sorteos Ganados</div>
            <div className="text-yellow-400/70 text-sm">Como participante</div>
          </div>

          <div className="bg-gradient-to-r from-red-500/20 to-pink-500/20 backdrop-blur-lg rounded-2xl p-6 border border-red-500/20">
            <div className="flex items-center justify-between mb-4">
              <div className="text-red-400">👥</div>
              <div className="text-2xl font-bold text-white">{stats?.totalParticipants || 0}</div>
            </div>
            <div className="text-white/90 font-medium">Participantes</div>
            <div className="text-red-400/70 text-sm">En mis sorteos</div>
          </div>

          <div className="bg-gradient-to-r from-teal-500/20 to-cyan-500/20 backdrop-blur-lg rounded-2xl p-6 border border-teal-500/20">
            <div className="flex items-center justify-between mb-4">
              <div className="text-teal-400">📈</div>
              <div className="text-2xl font-bold text-white">{stats?.successRate || 0}%</div>
            </div>
            <div className="text-white/90 font-medium">Tasa de Éxito</div>
            <div className="text-teal-400/70 text-sm">Sorteos completados</div>
          </div>

          {/* Nuevas estadísticas basadas en los datos del usuario */}
          <div className="bg-gradient-to-r from-indigo-500/20 to-blue-500/20 backdrop-blur-lg rounded-2xl p-6 border border-indigo-500/20">
            <div className="flex items-center justify-between mb-4">
              <div className="text-indigo-400">🎟️</div>
              <div className="text-2xl font-bold text-white">{stats?.user?.totalTickets || 0}</div>
            </div>
            <div className="text-white/90 font-medium">Tickets Totales</div>
            <div className="text-indigo-400/70 text-sm">Como participante</div>
          </div>

          <div className="bg-gradient-to-r from-emerald-500/20 to-green-500/20 backdrop-blur-lg rounded-2xl p-6 border border-emerald-500/20">
            <div className="flex items-center justify-between mb-4">
              <div className="text-emerald-400">✅</div>
              <div className="text-2xl font-bold text-white">{stats?.user?.availableTickets || 0}</div>
            </div>
            <div className="text-white/90 font-medium">Tickets Disponibles</div>
            <div className="text-emerald-400/70 text-sm">Para usar</div>
          </div>

          <div className="bg-gradient-to-r from-orange-500/20 to-red-500/20 backdrop-blur-lg rounded-2xl p-6 border border-orange-500/20">
            <div className="flex items-center justify-between mb-4">
              <div className="text-orange-400">💸</div>
              <div className="text-2xl font-bold text-white">
                ${stats?.user?.totalSpent ? stats.user.totalSpent.toLocaleString() : '0'}
              </div>
            </div>
            <div className="text-white/90 font-medium">Total Gastado</div>
            <div className="text-orange-400/70 text-sm">En participaciones</div>
          </div>
        </div>

        {/* Gráficos y Análisis */}
        <div className="bg-white/10 backdrop-blur-lg rounded-3xl p-8 border border-white/20 mb-8">
          <h3 className="text-2xl font-bold text-white mb-6">📈 Rendimiento Mensual</h3>
          
          <div className="text-center py-12">
            <div className="text-6xl mb-4">📊</div>
            <p className="text-white/70 mb-4">Gráficos de estadísticas próximamente</p>
            <p className="text-white/50 text-sm">
              Aquí se mostrarán gráficos interactivos de rendimiento,<br />
              tendencias de ventas y análisis de participación.
            </p>
          </div>
        </div>

        {/* Rankings */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          
          <div className="bg-white/10 backdrop-blur-lg rounded-3xl p-6 border border-white/20">
            <h3 className="text-xl font-bold text-white mb-4">🏆 Mis Mejores Sorteos</h3>
            
            {stats?.topRaffles?.length > 0 ? (
              <div className="space-y-3">
                {stats.topRaffles.map((raffle, index) => (
                  <div key={raffle.id} className="flex items-center justify-between p-3 bg-white/5 rounded-xl">
                    <div className="flex items-center gap-3">
                      <span className="text-lg">
                        {index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `${index + 1}.`}
                      </span>
                      <div>
                        <p className="text-white font-medium">{raffle.title}</p>
                        <p className="text-white/70 text-sm">{raffle.ticketsSold} tickets vendidos</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-white font-bold">${raffle.revenue}</p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-white/70">
                <p>Sin datos de sorteos aún</p>
                {stats?.user?.ownedRaffles?.length > 0 && (
                  <div className="mt-4 text-left">
                    <p className="text-white/50 text-sm mb-2">Sorteos creados:</p>
                    {stats.user.ownedRaffles.map((raffle) => (
                      <div key={raffle.id} className="p-2 bg-white/5 rounded-lg mb-2">
                        <p className="text-white text-sm">{raffle.title}</p>
                        <p className="text-white/50 text-xs">Estado: {raffle.status}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="bg-white/10 backdrop-blur-lg rounded-3xl p-6 border border-white/20">
            <h3 className="text-xl font-bold text-white mb-4">🎯 Actividad Reciente</h3>
            
            {stats?.recentActivity?.length > 0 ? (
              <div className="space-y-3">
                {stats.recentActivity.map((activity, index) => (
                  <div key={index} className="flex items-center gap-3 p-3 bg-white/5 rounded-xl">
                    <span className="text-lg">{activity.icon}</span>
                    <div className="flex-1">
                      <p className="text-white text-sm">{activity.description}</p>
                      <p className="text-white/50 text-xs">{activity.timeAgo}</p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-white/70">
                <p>Sin actividad reciente</p>
                {stats?.user?.purchases?.length > 0 && (
                  <div className="mt-4 text-left">
                    <p className="text-white/50 text-sm mb-2">Compras recientes:</p>
                    {stats.user.purchases.slice(0, 3).map((purchase) => (
                      <div key={purchase.id} className="p-2 bg-white/5 rounded-lg mb-2">
                        <p className="text-white text-sm">${purchase.amount}</p>
                        <p className="text-white/50 text-xs">
                          {new Date(purchase.createdAt).toLocaleDateString()}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}