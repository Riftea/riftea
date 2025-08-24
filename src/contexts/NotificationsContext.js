// src/contexts/NotificationsContext.js
"use client";
import { createContext, useContext, useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';

const NotificationsContext = createContext();

export function NotificationsProvider({ children }) {
  const { data: session } = useSession();
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(false);

  // Cargar notificaciones
  const loadNotifications = async () => {
    if (!session) {
      setNotifications([]);
      return;
    }
    
    setLoading(true);
    try {
      const res = await fetch("/api/notifications");
      if (res.ok) {
        const data = await res.json();
        setNotifications(data);
      } else {
        setNotifications([]);
      }
    } catch (error) {
      console.error("Error cargando notificaciones:", error);
      setNotifications([]);
    } finally {
      setLoading(false);
    }
  };

  // Cargar cuando cambia la sesión
  useEffect(() => {
    loadNotifications();
  }, [session]);

  // Marcar como leída
  const markAsRead = async (id) => {
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
        return true;
      }
      return false;
    } catch (error) {
      console.error("Error marcando como leída:", error);
      return false;
    }
  };

  // Eliminar notificación
  const deleteNotification = async (id) => {
    try {
      const res = await fetch("/api/notifications", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      
      if (res.ok) {
        setNotifications(prev => prev.filter(n => n.id !== id));
        return true;
      }
      return false;
    } catch (error) {
      console.error("Error eliminando notificación:", error);
      return false;
    }
  };

  // Marcar todas como leídas
  const markAllAsRead = async () => {
    const unreadIds = notifications.filter(n => !n.read).map(n => n.id);
    
    for (const id of unreadIds) {
      await markAsRead(id);
    }
  };

  const value = {
    notifications,
    loading,
    loadNotifications,
    markAsRead,
    deleteNotification,
    markAllAsRead,
    unreadCount: notifications.filter(n => !n.read).length
  };

  return (
    <NotificationsContext.Provider value={value}>
      {children}
    </NotificationsContext.Provider>
  );
}

export function useNotifications() {
  const context = useContext(NotificationsContext);
  if (!context) {
    throw new Error('useNotifications must be used within a NotificationsProvider');
  }
  return context;
}