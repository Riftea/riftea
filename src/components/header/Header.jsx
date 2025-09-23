// app/components/header/Header.jsx
"use client";
import React, { useState, useRef, useEffect } from "react";
import { useSession, signIn, signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import Link from "next/link";

// Componente para notificación individual con swipe mejorado
function NotificationItem({ notification, onMarkRead, onDelete, onUndo, onNotificationClick }) {
  const [isDragging, setIsDragging] = useState(false);
  const [dragX, setDragX] = useState(0);
  const [startX, setStartX] = useState(0);
  const [showUndoMessage, setShowUndoMessage] = useState(false);
  const [isDeleted, setIsDeleted] = useState(false);
  const itemRef = useRef(null);
  const undoTimeoutRef = useRef(null);

  const handleTouchStart = (e) => {
    if (showUndoMessage) return;
    setIsDragging(true);
    setStartX(e.touches[0].clientX);
  };

  const handleTouchMove = (e) => {
    if (!isDragging || showUndoMessage) return;
    
    const currentX = e.touches[0].clientX;
    const deltaX = currentX - startX;
    
    // Permitir deslizar hacia ambos lados con límites
    setDragX(Math.max(Math.min(deltaX, 120), -120));
  };

  const handleTouchEnd = () => {
    if (!isDragging || showUndoMessage) return;
    
    setIsDragging(false);
    
    // Si se deslizó más de 80px en cualquier dirección, mostrar mensaje de eliminación
    if (Math.abs(dragX) > 80) {
      handleShowUndo();
    } else {
      // Volver a la posición original
      setDragX(0);
    }
  };

  const handleMouseDown = (e) => {
    if (showUndoMessage) return;
    setIsDragging(true);
    setStartX(e.clientX);
  };

  const handleMouseMove = (e) => {
    if (!isDragging || showUndoMessage) return;
    
    const currentX = e.clientX;
    const deltaX = currentX - startX;
    
    // Permitir deslizar hacia ambos lados con límites
    setDragX(Math.max(Math.min(deltaX, 120), -120));
  };

  const handleMouseUp = () => {
    if (!isDragging || showUndoMessage) return;
    
    setIsDragging(false);
    
    // Si se deslizó más de 80px en cualquier dirección, mostrar mensaje de eliminación
    if (Math.abs(dragX) > 80) {
      handleShowUndo();
    } else {
      setDragX(0);
    }
  };

  const handleShowUndo = () => {
    setDragX(0);
    setShowUndoMessage(true);
    
    // Auto-eliminar después de 2 segundos si no se deshace
    undoTimeoutRef.current = setTimeout(() => {
      handleConfirmDelete();
    }, 2000);
  };

  const handleUndo = () => {
    if (undoTimeoutRef.current) {
      clearTimeout(undoTimeoutRef.current);
    }
    setShowUndoMessage(false);
    setDragX(0);
  };

  const handleConfirmDelete = async () => {
    if (undoTimeoutRef.current) {
      clearTimeout(undoTimeoutRef.current);
    }
    
    setIsDeleted(true);
    
    try {
      const res = await fetch("/api/notifications", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: notification.id }),
      });
      
      if (res.ok) {
        // Esperar un poco antes de eliminar para mostrar la animación
        setTimeout(() => {
          onDelete(notification.id);
        }, 300);
      } else {
        console.error("Error eliminando notificación");
        setIsDeleted(false);
        setShowUndoMessage(false);
      }
    } catch (error) {
      console.error("Error eliminando notificación:", error);
      setIsDeleted(false);
      setShowUndoMessage(false);
    }
  };

  // Limpiar timeout al desmontar
  useEffect(() => {
    return () => {
      if (undoTimeoutRef.current) {
        clearTimeout(undoTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const handleMouseMoveGlobal = (e) => handleMouseMove(e);
    const handleMouseUpGlobal = () => handleMouseUp();

    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMoveGlobal);
      document.addEventListener('mouseup', handleMouseUpGlobal);
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMoveGlobal);
      document.removeEventListener('mouseup', handleMouseUpGlobal);
    };
  }, [isDragging, startX, dragX]);

  // Si está eliminada, mostrar con fade out
  if (isDeleted) {
    return (
      <div className="relative overflow-hidden bg-white transition-all duration-300 opacity-0 transform scale-95">
        <div className="h-0"></div>
      </div>
    );
  }

  return (
    <div className="relative overflow-hidden bg-white">
      {/* Mensaje de eliminación con opción de deshacer - COLOR NEGRO */}
      {showUndoMessage ? (
        <div className="p-3 bg-gray-50 border-l-4 border-gray-400 flex flex-col gap-2 sm:flex-row sm:justify-between sm:items-center sm:gap-3">
          <div className="flex items-center">
            <svg className="w-5 h-5 text-gray-600 mr-2 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
            <span className="text-gray-700 text-sm font-medium">
              Eliminaste la notificación
            </span>
          </div>
          <button
            onClick={handleUndo}
            className="px-3 py-1 text-sm font-medium text-gray-700 hover:text-gray-900 border border-gray-300 rounded hover:bg-gray-100 transition-colors self-start sm:self-auto"
          >
            Deshacer
          </button>
        </div>
      ) : (
        <>
          {/* Fondo de eliminación */}
          <div 
            className="absolute inset-0 bg-gray-100 flex items-center justify-center"
            style={{ 
              opacity: Math.abs(dragX) / 120 
            }}
          >
            <svg className="w-5 h-5 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
            <span className="ml-2 text-red-500 text-sm font-medium">Eliminar</span>
          </div>
          
          {/* Contenido de la notificación */}
          <div
            ref={itemRef}
            className="bg-white border-b last:border-b-0 cursor-grab active:cursor-grabbing select-none"
            style={{
              transform: `translateX(${dragX}px)`,
              transition: isDragging ? 'none' : 'transform 0.3s ease',
            }}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
            onMouseDown={handleMouseDown}
          >
            <div 
              className="p-3 hover:bg-gray-50 text-sm flex justify-between items-start gap-3 cursor-pointer"
              onClick={() => onNotificationClick && onNotificationClick(notification)}
            >
              <div className="flex-1 min-w-0">
                <div className={`${!notification.read ? 'font-medium' : ''} break-words`}>
                  {notification.message}
                </div>
                <div className="text-xs text-gray-400 mt-1">
                  {new Date(notification.createdAt).toLocaleString('es-AR', {
                    day: '2-digit',
                    month: '2-digit',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit'
                  })}
                </div>
              </div>
              <div className="flex-shrink-0">
                {!notification.read && (
                  <button 
                    onClick={(e) => {
                      e.stopPropagation(); // Evitar que se active el click de la notificación
                      onMarkRead(notification.id);
                    }} 
                    className="text-xs text-blue-600 hover:text-blue-800 transition-colors whitespace-nowrap"
                  >
                    Marcar leído
                  </button>
                )}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export default function Header() {
  const { data: session } = useSession();
  const router = useRouter();
  const [notifOpen, setNotifOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(false);
  const notifRef = useRef(null);
  const menuRef = useRef(null);

  // Cerrar dropdowns al hacer click fuera
  useEffect(() => {
    function handleDown(e) {
      if (notifRef.current && !notifRef.current.contains(e.target)) {
        setNotifOpen(false);
      }
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener("click", handleDown);
    return () => document.removeEventListener("click", handleDown);
  }, []);

  // Cargar notificaciones cuando hay sesión
  useEffect(() => {
    let abort = false;
    
    async function loadNotifications() {
      if (!session) {
        setNotifications([]);
        return;
      }
      
      setLoading(true);
      try {
        const res = await fetch("/api/notifications");
        if (!res.ok) {
          throw new Error(`HTTP error! status: ${res.status}`);
        }
        const data = await res.json();
        if (!abort) {
          setNotifications(data);
        }
      } catch (err) {
        console.error("Error cargando notificaciones:", err);
        if (!abort) {
          setNotifications([]);
        }
      } finally {
        if (!abort) {
          setLoading(false);
        }
      }
    }

    loadNotifications();
    return () => { abort = true; };
  }, [session]);

  // Marcar notificación como leída
  const markRead = async (id) => {
    try {
      const res = await fetch("/api/notifications", {
        method: "PUT",
        headers: { 
          "Content-Type": "application/json" 
        },
        body: JSON.stringify({ id }),
      });
      
      if (!res.ok) {
        throw new Error(`HTTP error! status: ${res.status}`);
      }
      
      setNotifications(prev => 
        prev.map(n => n.id === id ? { ...n, read: true } : n)
      );
    } catch (err) {
      console.error("Error marcando como leído:", err);
    }
  };

  // Eliminar notificación
  const deleteNotification = (id) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
  };

  // Función para cerrar dropdown cuando se hace clic en una notificación
  const handleNotificationClick = (notification) => {
    setNotifOpen(false);

    if (notification && !notification.read) {
      markRead(notification.id);
    }

    // Roles
    const role = (session?.user?.role || "user").toString().toLowerCase();
    const isAdmin = role === "admin";
    const isSuper = role === "superadmin";

    // Deep-link directo si viene desde el backend
    if (notification?.actionUrl) {
      router.push(notification.actionUrl);
      return;
    }

    // Heurística de "publicación pendiente"
    const title = notification?.title ? String(notification.title).toLowerCase() : "";
    const msg = notification?.message ? String(notification.message).toLowerCase() : "";
    const isPublishRequest =
      title.includes("publicación") ||
      title.includes("pendiente") ||
      title.includes("aprobar") ||
      msg.includes("publicación") ||
      msg.includes("pendiente") ||
      msg.includes("aprobar") ||
      msg.includes("activar");

    if ((isAdmin || isSuper) && isPublishRequest) {
      const base = "/admin/publicaciones-pendientes";
      const url = notification?.raffleId ? `${base}?raffleId=${notification.raffleId}` : base;
      router.push(url);
      return;
    }

    // Fallbacks
    if (notification?.raffleId) {
      router.push(`/raffles/${notification.raffleId}`);
      return;
    }

    router.push("/notificaciones");
  };

  // Contar notificaciones no leídas
  const unreadCount = notifications.filter(n => !n.read).length;

  // Determinar roles
  const role = (session?.user?.role || "user").toString().toLowerCase();
  const isAdmin = role === "admin";
  const isSuper = role === "superadmin";

  // Función para manejar el cierre de sesión con redirect forzado
  const handleSignOut = async () => {
    try {
      await signOut({ callbackUrl: "/" });
    } catch (error) {
      console.error("Error al cerrar sesión:", error);
      router.push("/");
    }
  };

  return (
    <header className="fixed top-0 left-0 w-full bg-orange-500 text-white shadow-md z-50">
      <div className="max-w-6xl mx-auto flex justify-between items-center px-4 py-3">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-3">
          <Image 
            src="/logo.png" 
            alt="Logo" 
            width={120} 
            height={40}
            className="object-contain"
          />
        </Link>

        <div className="flex items-center gap-4">
          {/* Notificaciones (solo si hay sesión) */}
          {session && (
            <div className="relative" ref={notifRef}>
              <button
                aria-label="Notificaciones"
                onClick={(e) => { e.stopPropagation(); setNotifOpen(v => !v); }}
                className="relative p-2 rounded-md hover:bg-orange-600/20 transition-colors"
              >
                <svg 
                  xmlns="http://www.w3.org/2000/svg" 
                  className="h-6 w-6 text-white" 
                  fill="none" 
                  viewBox="0 0 24 24" 
                  stroke="currentColor"
                >
                  <path 
                    strokeLinecap="round" 
                    strokeLinejoin="round" 
                    strokeWidth={1.5} 
                    d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6 6 0 10-12 0v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" 
                  />
                </svg>
                {unreadCount > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 inline-flex items-center justify-center px-1.5 py-0.5 text-xs font-bold leading-none text-orange-500 bg-white rounded-full">
                    {unreadCount}
                  </span>
                )}
              </button>

              {/* Dropdown de notificaciones - Responsive */}
              {notifOpen && (
                <div className="absolute right-0 mt-2 w-[calc(100vw-1rem)] max-w-sm bg-white text-gray-800 rounded-lg shadow-lg overflow-hidden ring-1 ring-black ring-opacity-5 sm:w-80 md:w-96 sm:max-w-none z-50">
                  <div className="p-3 border-b text-sm font-medium bg-gray-50">
                    <span>Notificaciones</span>
                  </div>
                  <div className="max-h-64 overflow-auto sm:max-h-56">
                    {loading ? (
                      <div className="p-3 text-sm text-gray-500 text-center">
                        Cargando...
                      </div>
                    ) : notifications.length === 0 ? (
                      <div className="p-3 text-sm text-gray-500 text-center">
                        No hay notificaciones
                      </div>
                    ) : (
                      notifications.map(n => (
                        <NotificationItem
                          key={n.id}
                          notification={n}
                          onMarkRead={markRead}
                          onDelete={deleteNotification}
                          onNotificationClick={handleNotificationClick}
                        />
                      ))
                    )}
                  </div>
                  <div className="p-2 text-center text-sm border-t bg-gray-50">
                    <Link 
                      href="/notificaciones" 
                      className="text-orange-500 hover:text-orange-600 hover:underline transition-colors"
                    >
                      Ver todas
                    </Link>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Botón de login o menú de usuario */}
          {!session ? (
            <button 
              onClick={() => signIn("google")} 
              className="px-4 py-2 bg-white text-orange-500 font-semibold rounded-lg hover:bg-gray-100 transition-colors"
            >
              Iniciar sesión
            </button>
          ) : (
            <div className="relative" ref={menuRef}>
              <button
                onClick={(e) => { e.stopPropagation(); setMenuOpen(v => !v); }}
                className="flex items-center gap-2 px-2 py-1 rounded hover:bg-orange-600/20 transition-colors"
                aria-expanded={menuOpen}
              >
                <Image 
                  src={session.user?.image || "/avatar.png"} 
                  alt={session.user?.name || "Avatar"} 
                  width={36} 
                  height={36} 
                  className="rounded-full border-2 border-white object-cover" 
                />
                <span className="hidden sm:inline-block text-sm font-medium">
                  {session.user?.name}
                </span>
                <svg 
                  xmlns="http://www.w3.org/2000/svg" 
                  className="h-4 w-4" 
                  viewBox="0 0 20 20" 
                  fill="currentColor"
                >
                  <path 
                    fillRule="evenodd" 
                    d="M5.23 7.21a.75.75 0 011.06.02L10 11.293l3.71-4.06a.75.75 0 111.08 1.04l-4.25 4.665a.75.75 0 01-1.08 0L5.25 8.27a.75.75 0 01-.02-1.06z" 
                    clipRule="evenodd" 
                  />
                </svg>
              </button>

              {/* Dropdown del menú de usuario - Responsive */}
              {menuOpen && (
                <div className="absolute right-0 mt-2 w-56 max-w-[calc(100vw-1rem)] bg-white text-gray-800 rounded-lg shadow-lg overflow-hidden ring-1 ring-black ring-opacity-5 z-50">
                  <div className="p-2">
                    <Link 
                      href="/perfil" 
                      className="block px-3 py-2 rounded hover:bg-gray-50 transition-colors"
                      onClick={() => setMenuOpen(false)}
                    >
                      Perfil
                    </Link>
                    
                    {/* NUEVAS OPCIONES: Explorar y Favoritos */}
                    <Link 
                      href="/sorteos" 
                      className="block px-3 py-2 rounded hover:bg-gray-50 transition-colors"
                      onClick={() => setMenuOpen(false)}
                    >
                      Explorar
                    </Link>
                    <Link 
                      href="/sorteos?filter=favorites" 
                      className="block px-3 py-2 rounded hover:bg-gray-50 transition-colors"
                      onClick={() => setMenuOpen(false)}
                    >
                      Favoritos
                    </Link>
                    
                    {/* Mostrar Crear Sorteo a admin y superadmin */}
                    {(isAdmin || isSuper) && (
                      <Link 
                        href="/admin/crear-sorteo" 
                        className="block px-3 py-2 rounded hover:bg-gray-50 transition-colors"
                        onClick={() => setMenuOpen(false)}
                      >
                        Crear Sorteo
                      </Link>
                    )}
                    
                    <Link 
                      href="/mis-sorteos" 
                      className="block px-3 py-2 rounded hover:bg-gray-50 transition-colors"
                      onClick={() => setMenuOpen(false)}
                    >
                      Mis Sorteos
                    </Link>
                    <Link 
                      href="/mis-tickets" 
                      className="block px-3 py-2 rounded hover:bg-gray-50 transition-colors"
                      onClick={() => setMenuOpen(false)}
                    >
                      Mis Tickets
                    </Link>
                    <Link 
                      href="/ventas" 
                      className="block px-3 py-2 rounded hover:bg-gray-50 transition-colors"
                      onClick={() => setMenuOpen(false)}
                    >
                      Ventas
                    </Link>
                    <Link 
                      href="/estadisticas" 
                      className="block px-3 py-2 rounded hover:bg-gray-50 transition-colors"
                      onClick={() => setMenuOpen(false)}
                    >
                      Estadísticas
                    </Link>
                    
                    {/* Mostrar Panel Admin a admin y superadmin */}
                    {(isAdmin || isSuper) && (
                      <>
                        <Link 
                          href="/admin" 
                          className="block px-3 py-2 rounded hover:bg-gray-50 transition-colors"
                          onClick={() => setMenuOpen(false)}
                        >
                          Panel Admin
                        </Link>
                        <Link 
                          href="/admin/publicaciones-pendientes" 
                          className="block px-3 py-2 rounded hover:bg-gray-50 transition-colors"
                          onClick={() => setMenuOpen(false)}
                        >
                          Publicaciones pendientes
                        </Link>
                      </>
                    )}
                    
                    <Link 
                      href="/soporte" 
                      className="block px-3 py-2 rounded hover:bg-gray-50 transition-colors"
                      onClick={() => setMenuOpen(false)}
                    >
                      Soporte
                    </Link>
                    <hr className="my-1 border-gray-200" />
                    <button 
                      onClick={handleSignOut}
                      className="w-full text-left px-3 py-2 rounded hover:bg-gray-50 transition-colors text-red-600"
                    >
                      Cerrar sesión
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
