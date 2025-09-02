// app/ventas/page.js
"use client";
import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function VentasPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [sales, setSales] = useState([]);
  const [stats, setStats] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filter, setFilter] = useState('all'); // all, completed, pending, failed

  useEffect(() => {
    if (status === "loading") return;
    if (status === "unauthenticated") {
      router.push("/auth/signin");
      return;
    }

    fetchSales();
  }, [status, router]);

  const fetchSales = async () => {
    try {
      const res = await fetch("/api/purchases/my-sales");
      if (!res.ok) throw new Error("Error al cargar ventas");
      
      const data = await res.json();
      setSales(data.sales || []);
      setStats(data.stats || {});
      setLoading(false);
    } catch (err) {
      setError(err.message);
      setLoading(false);
    }
  };

  // Filtrar ventas
  const filteredSales = sales.filter(sale => {
    if (filter === 'completed') return sale.status === 'COMPLETED';
    if (filter === 'pending') return sale.status === 'PENDING';
    if (filter === 'failed') return sale.status === 'FAILED';
    return true;
  });

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-emerald-900 via-teal-900 to-cyan-900 pt-20">
        <div className="container mx-auto px-4 py-8">
          <div className="animate-pulse">
            <div className="h-8 bg-white/20 rounded w-1/3 mb-8"></div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="h-32 bg-white/20 rounded-2xl"></div>
              ))}
            </div>
            <div className="space-y-4">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="h-24 bg-white/20 rounded-2xl"></div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-emerald-900 via-teal-900 to-cyan-900 pt-20">
        <div className="container mx-auto px-4 py-8">
          <div className="bg-red-500/20 border border-red-500/50 rounded-3xl p-8 text-center">
            <p className="text-red-300">Error: {error}</p>
            <button 
              onClick={fetchSales}
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
    <div className="min-h-screen bg-gradient-to-br from-emerald-900 via-teal-900 to-cyan-900 pt-20">
      <div className="container mx-auto px-4 py-8">
        
        {/* Header */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8">
          <div>
            <h1 className="text-4xl font-bold text-white mb-2">Ventas de Mis Sorteos</h1>
            <p className="text-white/70">
              Gestiona las ventas y compradores de tus sorteos
            </p>
          </div>
        </div>

        {/* Estadísticas de Ventas */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          
          <div className="bg-gradient-to-r from-green-500/20 to-emerald-500/20 backdrop-blur-lg rounded-2xl p-6 border border-green-500/20">
            <div className="flex items-center justify-between mb-4">
              <div className="text-green-400">💰</div>
              <div className="text-2xl font-bold text-white">
                ${stats.totalRevenue ? stats.totalRevenue.toLocaleString() : '0'}
              </div>
            </div>
            <div className="text-white/90 font-medium">Ingresos Totales</div>
            <div className="text-green-400/70 text-sm">Todos los tiempo</div>
          </div>

          <div className="bg-gradient-to-r from-blue-500/20 to-cyan-500/20 backdrop-blur-lg rounded-2xl p-6 border border-blue-500/20">
            <div className="flex items-center justify-between mb-4">
              <div className="text-blue-400">🎫</div>
              <div className="text-2xl font-bold text-white">{stats.totalTicketsSold || 0}</div>
            </div>
            <div className="text-white/90 font-medium">Tickets Vendidos</div>
            <div className="text-blue-400/70 text-sm">En todos los sorteos</div>
          </div>

          <div className="bg-gradient-to-r from-purple-500/20 to-pink-500/20 backdrop-blur-lg rounded-2xl p-6 border border-purple-500/20">
            <div className="flex items-center justify-between mb-4">
              <div className="text-purple-400">👥</div>
              <div className="text-2xl font-bold text-white">{stats.uniqueBuyers || 0}</div>
            </div>
            <div className="text-white/90 font-medium">Compradores Únicos</div>
            <div className="text-purple-400/70 text-sm">Diferentes usuarios</div>
          </div>

          <div className="bg-gradient-to-r from-yellow-500/20 to-orange-500/20 backdrop-blur-lg rounded-2xl p-6 border border-yellow-500/20">
            <div className="flex items-center justify-between mb-4">
              <div className="text-yellow-400">📊</div>
              <div className="text-2xl font-bold text-white">
                ${stats.averageSale ? stats.averageSale.toFixed(2) : '0'}
              </div>
            </div>
            <div className="text-white/90 font-medium">Venta Promedio</div>
            <div className="text-yellow-400/70 text-sm">Por transacción</div>
          </div>
        </div>

        {/* Filtros */}
        <div className="flex flex-wrap gap-2 mb-8">
          {[
            { key: 'all', label: 'Todas', icon: '💳' },
            { key: 'completed', label: 'Completadas', icon: '✅' },
            { key: 'pending', label: 'Pendientes', icon: '⏳' },
            { key: 'failed', label: 'Fallidas', icon: '❌' }
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

        {/* Lista de Ventas */}
        {filteredSales.length === 0 ? (
          <div className="bg-white/10 backdrop-blur-lg rounded-3xl p-12 text-center border border-white/20">
            <div className="text-6xl mb-4">💳</div>
            <h3 className="text-2xl font-bold text-white mb-4">No hay ventas</h3>
            <p className="text-white/70 mb-6">
              {filter === 'all' 
                ? 'Aún no tienes ventas en tus sorteos'
                : `No tienes ventas ${filter === 'completed' ? 'completadas' : filter === 'pending' ? 'pendientes' : 'fallidas'}`
              }
            </p>
            <Link
              href="/admin/crear-sorteo"
              className="inline-block px-6 py-3 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 text-white font-medium rounded-xl shadow-lg hover:shadow-xl transform hover:scale-105 transition-all duration-200"
            >
              Crear Nuevo Sorteo
            </Link>
          </div>
        ) : (
          <div className="space-y-4">
            {filteredSales.map(sale => (
              <div key={sale.id} className="bg-white/10 backdrop-blur-lg rounded-2xl p-6 border border-white/20">
                <div className="flex flex-col md:flex-row justify-between items-start gap-4">
                  
                  {/* Info de la Venta */}
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <div className="text-2xl">
                        {sale.status === 'COMPLETED' ? '✅' :
                         sale.status === 'PENDING' ? '⏳' : '❌'}
                      </div>
                      <div>
                        <h3 className="text-lg font-bold text-white">
                          Compra #{sale.id.slice(-8)}
                        </h3>
                        <p className="text-white/70 text-sm">
                          {sale.raffle?.title || 'Sorteo eliminado'}
                        </p>
                      </div>
                    </div>
                    
                    <div className="flex flex-wrap gap-4 text-sm text-white/70">
                      <span>👤 {sale.user?.name || 'Usuario anónimo'}</span>
                      <span>🎫 {sale.ticketCount || 1} tickets</span>
                      <span>📅 {new Date(sale.createdAt).toLocaleDateString()}</span>
                      <span>💳 {sale.paymentMethod || 'No especificado'}</span>
                    </div>
                  </div>

                  {/* Monto y Estado */}
                  <div className="text-right">
                    <div className="text-2xl font-bold text-white mb-1">
                      ${sale.amount?.toFixed(2) || '0.00'}
                    </div>
                    <div className={`px-3 py-1 rounded-full text-sm font-medium ${
                      sale.status === 'COMPLETED' ? 'bg-green-500/20 text-green-300' :
                      sale.status === 'PENDING' ? 'bg-yellow-500/20 text-yellow-300' :
                      'bg-red-500/20 text-red-300'
                    }`}>
                      {sale.status === 'COMPLETED' ? 'Completada' :
                       sale.status === 'PENDING' ? 'Pendiente' : 'Fallida'}
                    </div>
                  </div>
                </div>

                {/* Acciones */}
                <div className="flex gap-2 mt-4 pt-4 border-t border-white/10">
                  <Link
                    href={`/sorteo/${sale.raffleId}`}
                    className="text-sm px-3 py-1 bg-blue-500/20 hover:bg-blue-500/30 text-blue-300 rounded-lg transition-colors"
                  >
                    Ver Sorteo
                  </Link>
                  <button className="text-sm px-3 py-1 bg-white/10 hover:bg-white/20 text-white rounded-lg transition-colors">
                    Ver Detalles
                  </button>
                  {sale.status === 'PENDING' && (
                    <button className="text-sm px-3 py-1 bg-yellow-500/20 hover:bg-yellow-500/30 text-yellow-300 rounded-lg transition-colors">
                      Seguir Pago
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Resumen del Mes */}
        <div className="mt-12 bg-gradient-to-r from-purple-500/20 to-pink-500/20 backdrop-blur-lg rounded-3xl p-8 border border-purple-500/20">
          <h3 className="text-2xl font-bold text-white mb-6">📊 Resumen del Mes</h3>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="text-center">
              <div className="text-3xl font-bold text-white mb-2">
                ${stats.monthlyRevenue ? stats.monthlyRevenue.toLocaleString() : '0'}
              </div>
              <div className="text-purple-300">Ingresos del Mes</div>
            </div>
            <div className="text-center">
              <div className="text-3xl font-bold text-white mb-2">
                {stats.monthlySales || 0}
              </div>
              <div className="text-purple-300">Ventas del Mes</div>
            </div>
            <div className="text-center">
              <div className="text-3xl font-bold text-white mb-2">
                +{stats.monthlyGrowth || 0}%
              </div>
              <div className="text-purple-300">Crecimiento</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}