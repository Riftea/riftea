// app/components/header/Header.jsx
"use client";
import React, { useState, useRef, useEffect } from "react";
import { useSession, signIn, signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import Link from "next/link";

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
    document.addEventListener("mousedown", handleDown);
    return () => document.removeEventListener("mousedown", handleDown);
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
      
      const updated = await res.json();
      setNotifications(prev => 
        prev.map(n => n.id === id ? { ...n, read: true } : n)
      );
    } catch (err) {
      console.error("Error marcando como leído:", err);
    }
  };

  // Función para manejar el cierre de sesión con redirect forzado
  const handleSignOut = async () => {
    try {
      await signOut({ callbackUrl: "/" });
    } catch (error) {
      // En caso de que signOut no redirija por alguna razón,
      // forzar navegación al home
      console.error("Error al cerrar sesión:", error);
      router.push("/");
    }
  };

  // Contar notificaciones no leídas
  const unreadCount = notifications.filter(n => !n.read).length;

  // Determinar roles
  const role = (session?.user?.role || "user").toString().toLowerCase();
  const isAdmin = role === "admin";
  const isSuper = role === "superadmin";

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
                onClick={() => setNotifOpen(v => !v)}
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

              {/* Dropdown de notificaciones */}
              {notifOpen && (
                <div className="absolute right-0 mt-2 w-80 bg-white text-gray-800 rounded-lg shadow-lg overflow-hidden ring-1 ring-black ring-opacity-5">
                  <div className="p-3 border-b text-sm font-medium">
                    Notificaciones
                  </div>
                  <div className="max-h-56 overflow-auto">
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
                        <div 
                          key={n.id} 
                          className="p-3 hover:bg-gray-50 border-b last:border-b-0 text-sm flex justify-between items-start gap-3"
                        >
                          <div className="flex-1">
                            <div className={`${!n.read ? 'font-medium' : ''}`}>
                              {n.message}
                            </div>
                            <div className="text-xs text-gray-400 mt-1">
                              {new Date(n.createdAt).toLocaleString('es-AR', {
                                day: '2-digit',
                                month: '2-digit',
                                year: 'numeric',
                                hour: '2-digit',
                                minute: '2-digit'
                              })}
                            </div>
                          </div>
                          <div>
                            {!n.read && (
                              <button 
                                onClick={() => markRead(n.id)} 
                                className="text-xs text-blue-600 hover:text-blue-800 transition-colors"
                              >
                                Marcar leído
                              </button>
                            )}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                  <div className="p-2 text-center text-sm border-t">
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
                onClick={() => setMenuOpen(v => !v)}
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

              {/* Dropdown del menú de usuario */}
              {menuOpen && (
                <div className="absolute right-0 mt-2 w-56 bg-white text-gray-800 rounded-lg shadow-lg overflow-hidden ring-1 ring-black ring-opacity-5">
                  <div className="p-2">
                    <Link 
                      href="/perfil" 
                      className="block px-3 py-2 rounded hover:bg-gray-50 transition-colors"
                    >
                      Perfil
                    </Link>
                    
                    {/* Mostrar Crear Sorteo a admin y superadmin */}
                    {(isAdmin || isSuper) && (
                      <Link 
                        href="/admin/crear-sorteo" 
                        className="block px-3 py-2 rounded hover:bg-gray-50 transition-colors"
                      >
                        Crear Sorteo
                      </Link>
                    )}
                    
                    <Link 
                      href="/mis-sorteos" 
                      className="block px-3 py-2 rounded hover:bg-gray-50 transition-colors"
                    >
                      Mis Sorteos
                    </Link>
                    <Link 
                      href="/mis-tickets" 
                      className="block px-3 py-2 rounded hover:bg-gray-50 transition-colors"
                    >
                      Mis Tickets
                    </Link>
                    <Link 
                      href="/ventas" 
                      className="block px-3 py-2 rounded hover:bg-gray-50 transition-colors"
                    >
                      Ventas
                    </Link>
                    <Link 
                      href="/estadisticas" 
                      className="block px-3 py-2 rounded hover:bg-gray-50 transition-colors"
                    >
                      Estadísticas
                    </Link>
                    
                    {/* Mostrar Panel Admin a admin y superadmin */}
                    {(isAdmin || isSuper) && (
                      <Link 
                        href="/admin" 
                        className="block px-3 py-2 rounded hover:bg-gray-50 transition-colors"
                      >
                        Panel Admin
                      </Link>
                    )}
                    
                    <Link 
                      href="/soporte" 
                      className="block px-3 py-2 rounded hover:bg-gray-50 transition-colors"
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