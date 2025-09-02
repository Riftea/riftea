// app/perfil/page.js
"use client";
import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import Image from "next/image";

export default function PerfilPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [userStats, setUserStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (status === "loading") return;
    if (status === "unauthenticated") {
      router.push("/auth/signin");
      return;
    }

    fetchUserStats();
  }, [status, router]);

  const fetchUserStats = async () => {
    try {
      const res = await fetch("/api/users/me");
      if (!res.ok) throw new Error("Error al cargar datos");
      
      const data = await res.json();
      setUserStats(data);
      setLoading(false);
    } catch (err) {
      setError(err.message);
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-900 via-purple-900 to-indigo-900 pt-20">
        <div className="container mx-auto px-4 py-8">
          <div className="animate-pulse">
            <div className="bg-white/10 rounded-3xl p-8">
              <div className="flex items-center gap-6 mb-8">
                <div className="w-24 h-24 bg-white/20 rounded-full"></div>
                <div className="space-y-3">
                  <div className="h-8 bg-white/20 rounded w-48"></div>
                  <div className="h-4 bg-white/20 rounded w-32"></div>
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {[...Array(6)].map((_, i) => (
                  <div key={i} className="h-24 bg-white/20 rounded-2xl"></div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-900 via-purple-900 to-indigo-900 pt-20">
        <div className="container mx-auto px-4 py-8">
          <div className="bg-red-500/20 border border-red-500/50 rounded-3xl p-8 text-center">
            <p className="text-red-300">Error: {error}</p>
          </div>
        </div>
      </div>
    );
  }

  const user = session?.user;
  const stats = userStats || {};

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-900 via-purple-900 to-indigo-900 pt-20">
      <div className="container mx-auto px-4 py-8">
        
        <h1 className="text-4xl font-bold text-white mb-8">Mi Perfil</h1>

        {/* Información Personal */}
        <div className="bg-white/10 backdrop-blur-lg rounded-3xl p-8 mb-8 border border-white/20">
          <div className="flex items-center gap-6 mb-8">
            <Image
              src={user?.image || "/avatar-default.png"}
              alt={user?.name || "Avatar"}
              width={96}
              height={96}
              className="rounded-full border-4 border-white/20 object-cover"
            />
            <div>
              <h2 className="text-3xl font-bold text-white mb-2">{user?.name}</h2>
              <p className="text-white/70 mb-2">{user?.email}</p>
              <div className="flex items-center gap-4 text-sm">
                <span className={`px-3 py-1 rounded-full ${
                  user?.role === 'ADMIN' ? 'bg-purple-500/20 text-purple-300' :
                  user?.role === 'SUPERADMIN' ? 'bg-red-500/20 text-red-300' :
                  'bg-blue-500/20 text-blue-300'
                }`}>
                  {user?.role === 'ADMIN' ? '👑 Admin' :
                   user?.role === 'SUPERADMIN' ? '⚡ Super Admin' :
                   '👤 Usuario'}
                </span>
                <span className="text-white/70">
                  Miembro desde: {new Date(stats.createdAt || Date.now()).toLocaleDateString()}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Estadísticas */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          
          <div className="bg-gradient-to-r from-green-500/20 to-emerald-500/20 backdrop-blur-lg rounded-2xl p-6 border border-green-500/20">
            <div className="flex items-center justify-between mb-4">
              <div className="text-green-400">🎟️</div>
              <div className="text-2xl font-bold text-white">{stats.totalTickets || 0}</div>
            </div>
            <div className="text-white/90 font-medium">Tickets Activos</div>
            <div className="text-green-400/70 text-sm">En sorteos activos</div>
          </div>

          <div className="bg-gradient-to-r from-blue-500/20 to-cyan-500/20 backdrop-blur-lg rounded-2xl p-6 border border-blue-500/20">
            <div className="flex items-center justify-between mb-4">
              <div className="text-blue-400">🎯</div>
              <div className="text-2xl font-bold text-white">{stats.totalRaffles || 0}</div>
            </div>
            <div className="text-white/90 font-medium">Sorteos Creados</div>
            <div className="text-blue-400/70 text-sm">Como organizador</div>
          </div>

          <div className="bg-gradient-to-r from-purple-500/20 to-pink-500/20 backdrop-blur-lg rounded-2xl p-6 border border-purple-500/20">
            <div className="flex items-center justify-between mb-4">
              <div className="text-purple-400">🏆</div>
              <div className="text-2xl font-bold text-white">{stats.rafflesWon || 0}</div>
            </div>
            <div className="text-white/90 font-medium">Sorteos Ganados</div>
            <div className="text-purple-400/70 text-sm">¡Felicitaciones!</div>
          </div>

          <div className="bg-gradient-to-r from-yellow-500/20 to-orange-500/20 backdrop-blur-lg rounded-2xl p-6 border border-yellow-500/20">
            <div className="flex items-center justify-between mb-4">
              <div className="text-yellow-400">💰</div>
              <div className="text-2xl font-bold text-white">
                ${stats.totalSpent ? stats.totalSpent.toLocaleString() : '0'}
              </div>
            </div>
            <div className="text-white/90 font-medium">Total Invertido</div>
            <div className="text-yellow-400/70 text-sm">En participaciones</div>
          </div>
        </div>

        {/* Actividad Reciente */}
        <div className="bg-white/10 backdrop-blur-lg rounded-3xl p-8 border border-white/20">
          <h3 className="text-2xl font-bold text-white mb-6">Actividad Reciente</h3>
          
          <div className="space-y-4">
            {stats.recentActivity ? stats.recentActivity.map((activity, index) => (
              <div key={index} className="flex items-center justify-between p-4 bg-white/5 rounded-2xl">
                <div className="flex items-center gap-4">
                  <div className="text-2xl">{activity.icon}</div>
                  <div>
                    <p className="text-white font-medium">{activity.title}</p>
                    <p className="text-white/70 text-sm">{activity.description}</p>
                  </div>
                </div>
                <div className="text-white/70 text-sm">
                  {new Date(activity.date).toLocaleDateString()}
                </div>
              </div>
            )) : (
              <div className="text-center py-8 text-white/70">
                <p>No hay actividad reciente</p>
              </div>
            )}
          </div>
        </div>

        {/* Acciones Rápidas */}
        <div className="mt-8 flex flex-wrap gap-4">
          <button 
            onClick={() => router.push('/mis-sorteos')}
            className="px-6 py-3 bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 text-white font-medium rounded-xl shadow-lg hover:shadow-xl transform hover:scale-105 transition-all duration-200"
          >
            Ver Mis Sorteos
          </button>
          <button 
            onClick={() => router.push('/mis-tickets')}
            className="px-6 py-3 bg-white/20 hover:bg-white/30 text-white font-medium rounded-xl transition-colors"
          >
            Ver Mis Tickets
          </button>
          {(user?.role === 'ADMIN' || user?.role === 'SUPERADMIN') && (
            <button 
              onClick={() => router.push('/admin/crear-sorteo')}
              className="px-6 py-3 bg-gradient-to-r from-green-500 to-teal-500 hover:from-green-600 hover:to-teal-600 text-white font-medium rounded-xl shadow-lg hover:shadow-xl transform hover:scale-105 transition-all duration-200"
            >
              Crear Nuevo Sorteo
            </button>
          )}
        </div>
      </div>
    </div>
  );
}