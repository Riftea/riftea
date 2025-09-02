// app/notificaciones/page.js
"use client";
import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";

// Componente para notificación individual con swipe (reutilizable)
function NotificationItem({ notification, onMarkRead, onDelete }) {
  const [isDragging, setIsDragging] = useState(false);
  const [dragX, setDragX] = useState(0);
  const [startX, setStartX] = useState(0);

  const handleStart = (clientX) => {
    setIsDragging(true);
    setStartX(clientX);
  };

  const handleMove = (clientX) => {
    if (!isDragging) return;
    const deltaX = clientX - startX;
    setDragX(Math.max(Math.min(deltaX, 120), -120));
  };

  const handleEnd = () => {
    if (!isDragging) return;
    setIsDragging(false);
    
    if (Math.abs(dragX) > 80) {
      handleDelete();
    } else {
      setDragX(0);
    }
  };

  const handleDelete = async () => {
    try {
      const res = await fetch("/api/notifications", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: notification.id }),
      });
      
      if (res.ok) {
        onDelete(notification.id);
      } else {
        setDragX(0);
      }
    } catch (error) {
      console.error("Error eliminando notificación:", error);
      setDragX(0);
    }
  };

  return (
    <div className="relative overflow-hidden bg-white rounded-lg border border-gray-200 mb-3">
      {/* Fondo de eliminación */}
      <div 
        className="absolute inset-0 bg-gray-100 flex items-center justify-center rounded-lg"
        style={{ opacity: Math.abs(dragX) / 120 }}
      >
        <svg className="w-5 h-5 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
        </svg>
        <span className="ml-2 text-red-500 text-sm font-medium">Eliminar</span>
      </div>
      
      {/* Contenido de la notificación */}
      <div
        className="bg-white cursor-grab active:cursor-grabbing select-none rounded-lg"
        style={{
          transform: `translateX(${dragX}px)`,
          transition: isDragging ? 'none' : 'transform 0.3s ease',
        }}
        onTouchStart={(e) => handleStart(e.touches[0].clientX)}
        onTouchMove={(e) => handleMove(e.touches[0].clientX)}
        onTouchEnd={handleEnd}
        onMouseDown={(e) => handleStart(e.clientX)}
        onMouseMove={(e) => isDragging && handleMove(e.clientX)}
        onMouseUp={handleEnd}
        onMouseLeave={() => isDragging && handleEnd()}
      >
        <div className="p-4 space-y-3">
          {/* Header de la notificación */}
          <div className="flex justify-between items-start gap-3">
            <div className="flex items-center gap-2">
              {!notification.read && (
                <div className="w-2 h-2 bg-orange-500 rounded-full flex-shrink-0"></div>
              )}
              <span className={`text-xs px-2 py-1 rounded-full ${
                !notification.read 
                  ? 'bg-orange-100 text-orange-800' 
                  : 'bg-gray-100 text-gray-600'
              }`}>
                {!notification.read ? 'Nueva' : 'Leída'}
              </span>
            </div>
            <span className="text-xs text-gray-400">
              {new Date(notification.createdAt).toLocaleString('es-AR', {
                day: '2-digit',
                month: '2-digit',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
              })}
            </span>
          </div>

          {/* Mensaje */}
          <div className={`text-sm ${!notification.read ? 'font-medium text-gray-900' : 'text-gray-700'}`}>
            {notification.message}
          </div>

          {/* Acciones */}
          <div className="flex justify-end gap-2 pt-2">
            {!notification.read && (
              <button 
                onClick={() => onMarkRead(notification.id)} 
                className="text-xs text-blue-600 hover:text-blue-800 transition-colors px-2 py-1 rounded hover:bg-blue-50"
              >
                Marcar como leída
              </button>
            )}
            <button 
              onClick={handleDelete} 
              className="text-xs text-red-600 hover:text-red-800 transition-colors px-2 py-1 rounded hover:bg-red-50"
            >
              Eliminar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function NotificationsPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('todas'); // 'todas', 'no_leidas', 'leidas'

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/");
      return;
    }

    if (status === "loading") return;

    loadNotifications();
  }, [session, status]);

  const loadNotifications = async () => {
    if (!session) return;
    
    try {
      const res = await fetch("/api/notifications");
      if (res.ok) {
        const data = await res.json();
        setNotifications(data);
      } else {
        console.error("Error cargando notificaciones");
      }
    } catch (error) {
      console.error("Error:", error);
    } finally {
      setLoading(false);
    }
  };

  const markRead = async (id) => {
    try {
      const res = await fetch("/api/notifications", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      
      if (res.ok) {
        setNotifications(prev => 
          prev.map(n => n.id === id ? { ...n, read: true } : n)
        );
      }
    } catch (error) {
      console.error("Error marcando como leída:", error);
    }
  };

  const deleteNotification = (id) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
  };

  const markAllAsRead = async () => {
    const unreadIds = notifications.filter(n => !n.read).map(n => n.id);
    
    for (const id of unreadIds) {
      await markRead(id);
    }
  };

  if (status === "loading" || loading) {
    return (
      <div className="min-h-screen bg-gray-50 pt-20">
        <div className="max-w-2xl mx-auto p-4">
          <div className="text-center">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-orange-500"></div>
            <p className="mt-2 text-gray-600">Cargando notificaciones...</p>
          </div>
        </div>
      </div>
    );
  }

  if (!session) {
    return null; // Se redirige en useEffect
  }

  // Filtrar notificaciones
  const filteredNotifications = notifications.filter(n => {
    if (filter === 'no_leidas') return !n.read;
    if (filter === 'leidas') return n.read;
    return true; // todas
  });

  const unreadCount = notifications.filter(n => !n.read).length;

  return (
    <div className="min-h-screen bg-gray-50 pt-20">
      <div className="max-w-2xl mx-auto p-4">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Notificaciones</h1>
          <p className="text-gray-600">
            {unreadCount > 0 
              ? `Tienes ${unreadCount} notificación${unreadCount !== 1 ? 'es' : ''} sin leer`
              : 'Todas las notificaciones están leídas'
            }
          </p>
        </div>

        {/* Controles */}
        <div className="bg-white rounded-lg border border-gray-200 p-4 mb-6">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            {/* Filtros */}
            <div className="flex gap-2">
              <button
                onClick={() => setFilter('todas')}
                className={`px-3 py-1 rounded-full text-sm transition-colors ${
                  filter === 'todas' 
                    ? 'bg-orange-500 text-white' 
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                Todas ({notifications.length})
              </button>
              <button
                onClick={() => setFilter('no_leidas')}
                className={`px-3 py-1 rounded-full text-sm transition-colors ${
                  filter === 'no_leidas' 
                    ? 'bg-orange-500 text-white' 
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                No leídas ({unreadCount})
              </button>
              <button
                onClick={() => setFilter('leidas')}
                className={`px-3 py-1 rounded-full text-sm transition-colors ${
                  filter === 'leidas' 
                    ? 'bg-orange-500 text-white' 
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                Leídas ({notifications.length - unreadCount})
              </button>
            </div>

            {/* Acciones */}
            {unreadCount > 0 && (
              <button
                onClick={markAllAsRead}
                className="text-sm text-blue-600 hover:text-blue-800 transition-colors"
              >
                Marcar todas como leídas
              </button>
            )}
          </div>
        </div>

        {/* Instrucción de swipe */}
        {filteredNotifications.length > 0 && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-6">
            <div className="flex items-center gap-2 text-blue-800">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span className="text-sm">Desliza las notificaciones ↔ para eliminarlas</span>
            </div>
          </div>
        )}

        {/* Lista de notificaciones */}
        <div>
          {filteredNotifications.length === 0 ? (
            <div className="bg-white rounded-lg border border-gray-200 p-8 text-center">
              <svg className="w-12 h-12 text-gray-300 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6 6 0 10-12 0v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
              </svg>
              <p className="text-gray-500">
                {filter === 'todas' && 'No tienes notificaciones'}
                {filter === 'no_leidas' && 'No tienes notificaciones sin leer'}
                {filter === 'leidas' && 'No tienes notificaciones leídas'}
              </p>
            </div>
          ) : (
            filteredNotifications.map(notification => (
              <NotificationItem
                key={notification.id}
                notification={notification}
                onMarkRead={markRead}
                onDelete={deleteNotification}
              />
            ))
          )}
        </div>
      </div>
    </div>
  );
}