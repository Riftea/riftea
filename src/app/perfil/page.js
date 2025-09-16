// app/perfil/page.js
"use client";
import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import Image from "next/image";

export default function PerfilPage() {
  const { data: session, status, update } = useSession();
  const router = useRouter();
  const [userStats, setUserStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  
  // Estados para edición
  const [isEditingName, setIsEditingName] = useState(false);
  const [isEditingPhoto, setIsEditingPhoto] = useState(false);
  const [isEditingWhatsApp, setIsEditingWhatsApp] = useState(false);
  const [newDisplayName, setNewDisplayName] = useState("");
  const [newWhatsApp, setNewWhatsApp] = useState("");
  const [photoFile, setPhotoFile] = useState(null);
  const [photoPreview, setPhotoPreview] = useState(null);
  const [updateLoading, setUpdateLoading] = useState(false);

  useEffect(() => {
    if (status === "loading") return;
    if (status === "unauthenticated") {
      router.push("/auth/signin");
      return;
    }

    fetchUserStats();
  }, [status, router]);

  useEffect(() => {
    if (session?.user) {
      setNewDisplayName(session.user.displayName || session.user.name || "");
      setNewWhatsApp(session.user.whatsapp || "");
    }
  }, [session]);

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

  const handlePhotoChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      if (file.size > 5 * 1024 * 1024) { // 5MB máximo
        alert("La imagen debe ser menor a 5MB");
        return;
      }
      if (!file.type.startsWith('image/')) {
        alert("Solo se permiten archivos de imagen");
        return;
      }
      setPhotoFile(file);
      const reader = new FileReader();
      reader.onload = (e) => setPhotoPreview(e.target.result);
      reader.readAsDataURL(file);
    }
  };

  const canChangeName = () => {
    if (!session?.user?.lastNameChange) return true;
    const lastChange = new Date(session.user.lastNameChange);
    const monthAgo = new Date();
    monthAgo.setMonth(monthAgo.getMonth() - 1);
    return lastChange < monthAgo;
  };

  const getNextNameChangeDate = () => {
    if (!session?.user?.lastNameChange) return null;
    const lastChange = new Date(session.user.lastNameChange);
    lastChange.setMonth(lastChange.getMonth() + 1);
    return lastChange.toLocaleDateString();
  };

  const validateWhatsApp = (phone) => {
    // Remover espacios y caracteres especiales
    const cleanPhone = phone.replace(/\D/g, '');
    // Validar que tenga entre 10 y 15 dígitos
    return cleanPhone.length >= 10 && cleanPhone.length <= 15;
  };

  const updateDisplayName = async () => {
    if (!canChangeName()) {
      alert(`Podrás cambiar tu nombre nuevamente el ${getNextNameChangeDate()}`);
      return;
    }

    if (newDisplayName.trim().length < 2) {
      alert("El nombre debe tener al menos 2 caracteres");
      return;
    }

    setUpdateLoading(true);
    try {
      const res = await fetch("/api/users/update-profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ displayName: newDisplayName.trim() })
      });

      if (!res.ok) throw new Error("Error al actualizar nombre");
      
      await update(); // Refrescar sesión
      setIsEditingName(false);
      alert("Nombre actualizado correctamente");
    } catch (err) {
      alert("Error al actualizar nombre: " + err.message);
    } finally {
      setUpdateLoading(false);
    }
  };

  const updatePhoto = async () => {
    if (!photoFile) return;

    setUpdateLoading(true);
    try {
      const formData = new FormData();
      formData.append("photo", photoFile);

      const res = await fetch("/api/users/update-photo", {
        method: "POST",
        body: formData
      });

      if (!res.ok) throw new Error("Error al actualizar foto");
      
      await update(); // Refrescar sesión
      setIsEditingPhoto(false);
      setPhotoFile(null);
      setPhotoPreview(null);
      alert("Foto actualizada correctamente");
    } catch (err) {
      alert("Error al actualizar foto: " + err.message);
    } finally {
      setUpdateLoading(false);
    }
  };

  const updateWhatsApp = async () => {
    if (!validateWhatsApp(newWhatsApp)) {
      alert("Por favor ingresa un número de WhatsApp válido (10-15 dígitos)");
      return;
    }

    setUpdateLoading(true);
    try {
      const res = await fetch("/api/users/update-profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ whatsapp: newWhatsApp })
      });

      if (!res.ok) throw new Error("Error al actualizar WhatsApp");
      
      await update(); // Refrescar sesión
      setIsEditingWhatsApp(false);
      alert("WhatsApp actualizado correctamente");
    } catch (err) {
      alert("Error al actualizar WhatsApp: " + err.message);
    } finally {
      setUpdateLoading(false);
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
          <div className="flex items-start gap-6 mb-8">
            {/* Foto de perfil */}
            <div className="relative group">
              <Image
                src={photoPreview || user?.image || "/avatar-default.png"}
                alt={user?.displayName || user?.name || "Avatar"}
                width={96}
                height={96}
                className="rounded-full border-4 border-white/20 object-cover"
              />
              <button
                onClick={() => setIsEditingPhoto(true)}
                className="absolute inset-0 bg-black/50 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <span className="text-white text-sm">📷</span>
              </button>
            </div>

            <div className="flex-1">
              {/* Nombre para mostrar */}
              <div className="mb-4">
                {isEditingName ? (
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={newDisplayName}
                      onChange={(e) => setNewDisplayName(e.target.value)}
                      className="bg-white/10 border border-white/30 rounded-lg px-3 py-2 text-white placeholder-white/50"
                      placeholder="Nombre para mostrar"
                      maxLength={30}
                    />
                    <button
                      onClick={updateDisplayName}
                      disabled={updateLoading}
                      className="px-4 py-2 bg-green-500 hover:bg-green-600 text-white rounded-lg text-sm disabled:opacity-50"
                    >
                      {updateLoading ? "..." : "✓"}
                    </button>
                    <button
                      onClick={() => {
                        setIsEditingName(false);
                        setNewDisplayName(user?.displayName || user?.name || "");
                      }}
                      className="px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg text-sm"
                    >
                      ✕
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-3">
                    <h2 className="text-3xl font-bold text-white">
                      {user?.displayName || user?.name}
                    </h2>
                    <button
                      onClick={() => setIsEditingName(true)}
                      disabled={!canChangeName()}
                      className="text-white/70 hover:text-white disabled:text-white/30 disabled:cursor-not-allowed"
                      title={!canChangeName() ? `Podrás cambiar tu nombre el ${getNextNameChangeDate()}` : "Editar nombre"}
                    >
                      ✏️
                    </button>
                  </div>
                )}
                {!canChangeName() && (
                  <p className="text-yellow-400/70 text-xs mt-1">
                    Próximo cambio disponible: {getNextNameChangeDate()}
                  </p>
                )}
              </div>

              <p className="text-white/70 mb-2">{user?.email}</p>

              {/* WhatsApp */}
              <div className="mb-4">
                {isEditingWhatsApp ? (
                  <div className="flex items-center gap-2">
                    <input
                      type="tel"
                      value={newWhatsApp}
                      onChange={(e) => setNewWhatsApp(e.target.value)}
                      className="bg-white/10 border border-white/30 rounded-lg px-3 py-2 text-white placeholder-white/50"
                      placeholder="+54 9 11 1234-5678"
                    />
                    <button
                      onClick={updateWhatsApp}
                      disabled={updateLoading}
                      className="px-4 py-2 bg-green-500 hover:bg-green-600 text-white rounded-lg text-sm disabled:opacity-50"
                    >
                      {updateLoading ? "..." : "✓"}
                    </button>
                    <button
                      onClick={() => {
                        setIsEditingWhatsApp(false);
                        setNewWhatsApp(user?.whatsapp || "");
                      }}
                      className="px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg text-sm"
                    >
                      ✕
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <span className="text-white/70 text-sm">
                      📱 {user?.whatsapp || "Sin WhatsApp configurado"}
                    </span>
                    <button
                      onClick={() => setIsEditingWhatsApp(true)}
                      className="text-white/70 hover:text-white"
                      title="Editar WhatsApp"
                    >
                      ✏️
                    </button>
                  </div>
                )}
              </div>

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

        {/* Modal de edición de foto */}
        {isEditingPhoto && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-white/10 backdrop-blur-lg rounded-3xl p-8 max-w-md w-full mx-4 border border-white/20">
              <h3 className="text-2xl font-bold text-white mb-6">Cambiar Foto</h3>
              
              <div className="space-y-4">
                <input
                  type="file"
                  accept="image/*"
                  onChange={handlePhotoChange}
                  className="w-full p-3 bg-white/10 border border-white/30 rounded-lg text-white file:bg-white/20 file:border-0 file:text-white file:px-4 file:py-2 file:rounded file:mr-4"
                />
                
                {photoPreview && (
                  <div className="flex justify-center">
                    <Image
                      src={photoPreview}
                      alt="Vista previa"
                      width={120}
                      height={120}
                      className="rounded-full object-cover"
                    />
                  </div>
                )}
                
                <div className="flex gap-3 mt-6">
                  <button
                    onClick={updatePhoto}
                    disabled={!photoFile || updateLoading}
                    className="flex-1 py-3 bg-green-500 hover:bg-green-600 text-white rounded-lg disabled:opacity-50"
                  >
                    {updateLoading ? "Subiendo..." : "Guardar"}
                  </button>
                  <button
                    onClick={() => {
                      setIsEditingPhoto(false);
                      setPhotoFile(null);
                      setPhotoPreview(null);
                    }}
                    className="flex-1 py-3 bg-white/20 hover:bg-white/30 text-white rounded-lg"
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

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