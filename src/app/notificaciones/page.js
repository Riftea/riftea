// app/notificaciones/page.js
"use client";
import { useState, useEffect, useCallback, useMemo } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";

/* ===================== Helpers ===================== */
function isModerationNotification(n) {
  // Si tu backend manda un "type" úsalo primero
  const t = String(n?.type || "").toLowerCase();
  if (t.includes("publish") || t.includes("pending") || t.includes("approval")) return true;

  // Heurística por título/mensaje
  const title = String(n?.title || "").toLowerCase();
  const msg = String(n?.message || "").toLowerCase();
  const hit =
    title.includes("publicación") ||
    title.includes("pendiente") ||
    title.includes("aprobar") ||
    title.includes("activar") ||
    msg.includes("publicación") ||
    msg.includes("pendiente") ||
    msg.includes("aprobar") ||
    msg.includes("activar");
  return hit;
}

/* ============ Item de notificación con swipe ============ */
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

      {/* Contenido */}
      <div
        className="bg-white cursor-grab active:cursor-grabbing select-none rounded-lg"
        style={{
          transform: `translateX(${dragX}px)`,
          transition: isDragging ? "none" : "transform 0.3s ease",
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
          {/* Header */}
          <div className="flex justify-between items-start gap-3">
            <div className="flex items-center gap-2">
              {!notification.read && <div className="w-2 h-2 bg-orange-500 rounded-full flex-shrink-0" />}
              <span
                className={`text-xs px-2 py-1 rounded-full ${
                  !notification.read ? "bg-orange-100 text-orange-800" : "bg-gray-100 text-gray-600"
                }`}
              >
                {!notification.read ? "Nueva" : "Leída"}
              </span>
              {isModerationNotification(notification) && (
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-yellow-100 text-yellow-800 border border-yellow-200">
                  Moderación
                </span>
              )}
            </div>
            <span className="text-xs text-gray-400">
              {new Date(notification.createdAt).toLocaleString("es-AR", {
                day: "2-digit",
                month: "2-digit",
                year: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </span>
          </div>

          {/* Mensaje */}
          <div className={`text-sm ${!notification.read ? "font-medium text-gray-900" : "text-gray-700"}`}>
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

/* ===================== Página ===================== */
export default function NotificationsPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("todas"); // 'todas', 'no_leidas', 'leidas'
  const role = String(session?.user?.role || "").toLowerCase();
  const isAdmin = role === "admin" || role === "superadmin";

  const loadNotifications = useCallback(async () => {
    if (!session) return;
    setLoading(true);
    try {
      const res = await fetch("/api/notifications");
      if (res.ok) {
        const data = await res.json();
        setNotifications(Array.isArray(data) ? data : []);
      } else {
        console.error("Error cargando notificaciones");
      }
    } catch (error) {
      console.error("Error:", error);
    } finally {
      setLoading(false);
    }
  }, [session]);

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/");
      return;
    }
    if (status === "loading") return;
    loadNotifications();
  }, [session, status, router, loadNotifications]);

  const markRead = useCallback(async (id) => {
    try {
      const res = await fetch("/api/notifications", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      if (res.ok) {
        setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
      }
    } catch (error) {
      console.error("Error marcando como leída:", error);
    }
  }, []);

  const deleteNotification = useCallback((id) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  }, []);

  // ============ Acciones masivas ============
  const markAllAsRead = useCallback(async () => {
    const unreadIds = notifications.filter((n) => !n.read).map((n) => n.id);
    if (unreadIds.length === 0) return;

    // 1) Intento bulk
    try {
      const bulk = await fetch("/api/notifications", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ all: true }),
      });
      if (bulk.ok) {
        setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
        return;
      }
    } catch {}

    // 2) Fallback: de a una (en paralelo controlado)
    try {
      await Promise.all(
        unreadIds.map((id) =>
          fetch("/api/notifications", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id }),
          })
        )
      );
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    } catch (e) {
      console.error("Error marcando todas como leídas:", e);
    }
  }, [notifications]);

  const deleteAll = useCallback(async () => {
    if (notifications.length === 0) return;

    const confirm = window.confirm("¿Eliminar todas las notificaciones? Esta acción no se puede deshacer.");
    if (!confirm) return;

    // 1) Intento bulk
    try {
      const bulk = await fetch("/api/notifications", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ all: true }),
      });
      if (bulk.ok) {
        setNotifications([]);
        return;
      }
    } catch {}

    // 2) Fallback: de a una (en paralelo)
    try {
      await Promise.all(
        notifications.map((n) =>
          fetch("/api/notifications", {
            method: "DELETE",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id: n.id }),
          })
        )
      );
      setNotifications([]);
    } catch (e) {
      console.error("Error eliminando todas:", e);
    }
  }, [notifications]);

  // ============ Derivados ============
  const unreadCount = useMemo(() => notifications.filter((n) => !n.read).length, [notifications]);

  const filteredNotifications = useMemo(() => {
    if (filter === "no_leidas") return notifications.filter((n) => !n.read);
    if (filter === "leidas") return notifications.filter((n) => n.read);
    return notifications;
  }, [notifications, filter]);

  const pendingModerationCount = useMemo(
    () => notifications.filter(isModerationNotification).length,
    [notifications]
  );

  // ============ UI ============
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

  if (!session) return null;

  return (
    <div className="min-h-screen bg-gray-50 pt-20">
      <div className="max-w-2xl mx-auto p-4">
        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-gray-900">Notificaciones</h1>
            {unreadCount > 0 && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-orange-100 text-orange-800 border border-orange-200">
                {unreadCount} sin leer
              </span>
            )}
          </div>
          <p className="text-gray-600 mt-1">
            {unreadCount > 0
              ? `Tienes ${unreadCount} notificación${unreadCount !== 1 ? "es" : ""} sin leer`
              : "Todas las notificaciones están leídas"}
          </p>
        </div>

        {/* Aviso moderación para admins */}
        {isAdmin && pendingModerationCount > 0 && (
          <div className="mb-6 rounded-lg border border-yellow-300 bg-yellow-50 p-3">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-yellow-900">
                <span className="inline-flex h-2 w-2 rounded-full bg-yellow-500"></span>
                <b className="text-sm">Pendientes de revisión:</b>
                <span className="text-sm">
                  {pendingModerationCount} sorteo{pendingModerationCount !== 1 ? "s" : ""} por aprobar/rechazar
                </span>
              </div>
              <button
                onClick={() => router.push("/admin/publicaciones-pendientes")}
                className="text-xs font-semibold px-3 py-1 rounded-md bg-yellow-600 text-white hover:bg-yellow-700 transition-colors"
              >
                Ir a revisar
              </button>
            </div>
          </div>
        )}

        {/* Controles */}
        <div className="bg-white rounded-lg border border-gray-200 p-4 mb-6">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            {/* Filtros */}
            <div className="flex gap-2">
              <button
                onClick={() => setFilter("todas")}
                className={`px-3 py-1 rounded-full text-sm transition-colors ${
                  filter === "todas" ? "bg-orange-500 text-white" : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                }`}
              >
                Todas ({notifications.length})
              </button>
              <button
                onClick={() => setFilter("no_leidas")}
                className={`px-3 py-1 rounded-full text-sm transition-colors ${
                  filter === "no_leidas" ? "bg-orange-500 text-white" : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                }`}
              >
                No leídas ({unreadCount})
              </button>
              <button
                onClick={() => setFilter("leidas")}
                className={`px-3 py-1 rounded-full text-sm transition-colors ${
                  filter === "leidas"
                    ? "bg-orange-500 text-white"
                    : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                }`}
              >
                Leídas ({notifications.length - unreadCount})
              </button>
            </div>

            {/* Acciones */}
            <div className="flex items-center gap-3">
              <button
                onClick={loadNotifications}
                className="text-sm text-gray-600 hover:text-gray-900 transition-colors"
                title="Refrescar"
              >
                Refrescar
              </button>

              {notifications.length > 0 && (
                <button
                  onClick={deleteAll}
                  className="text-sm text-red-600 hover:text-red-800 transition-colors"
                >
                  Eliminar todas
                </button>
              )}

              {unreadCount > 0 && (
                <button onClick={markAllAsRead} className="text-sm text-blue-600 hover:text-blue-800 transition-colors">
                  Marcar todas como leídas
                </button>
              )}
            </div>
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

        {/* Lista */}
        <div>
          {filteredNotifications.length === 0 ? (
            <div className="bg-white rounded-lg border border-gray-200 p-8 text-center">
              <svg className="w-12 h-12 text-gray-300 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6 6 0 10-12 0v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
              </svg>
              <p className="text-gray-500">
                {filter === "todas" && "No tienes notificaciones"}
                {filter === "no_leidas" && "No tienes notificaciones sin leer"}
                {filter === "leidas" && "No tienes notificaciones leídas"}
              </p>
            </div>
          ) : (
            filteredNotifications.map((notification) => (
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
