// app/components/header/Header.jsx
"use client";
import React, { useState, useRef, useEffect, useMemo } from "react";
import { useSession, signIn, signOut } from "next-auth/react";
import { useRouter, usePathname } from "next/navigation";
import Image from "next/image";
import Link from "next/link";

/* ========================= Constantes ========================= */

const BASE_TITLE = "Riftea";

/* ========================= Helpers ========================= */

function isModerationNotification(n) {
  // Marcá como "moderación" si el backend ya manda type, o por heurística en title/message
  const t = String(n?.type || "").toLowerCase();
  if (t.includes("publish") || t.includes("pending") || t.includes("approval")) return true;
  const title = String(n?.title || "").toLowerCase();
  const msg = String(n?.message || "").toLowerCase();
  return (
    title.includes("publicación") ||
    title.includes("pendiente") ||
    title.includes("aprobar") ||
    title.includes("activar") ||
    msg.includes("publicación") ||
    msg.includes("pendiente") ||
    msg.includes("aprobar") ||
    msg.includes("activar")
  );
}

// Extrae un id de rifa desde varias posibles ubicaciones
function getRaffleIdFrom(n) {
  const targets = (n && typeof n.targets === "object" && n.targets) || {};
  return (
    n?.raffleId ||
    targets?.raffleId ||
    targets?.raffle?.id ||
    n?.targetId ||
    targets?.id ||
    null
  );
}

function getSlugFrom(n) {
  const targets = (n && typeof n.targets === "object" && n.targets) || {};
  return n?.slug || targets?.slug || null;
}

// 👇 NUEVO: extrae ticketId desde varios posibles lugares
function getTicketIdFrom(n) {
  const targets = (n && typeof n.targets === "object" && n.targets) || {};
  return (
    n?.ticketId ||
    targets?.ticketId ||
    targets?.ticket_id ||
    targets?.ticketID ||
    null
  );
}

/**
 * Ruteo “fino”:
 *  1) Si viene actionUrl desde backend, se usa tal cual.
 *  2) Se prioriza subtype (ej: TICKET_GIFT_RECEIVED, PURCHASE_CONFIRMED).
 *  3) Heurística: si detectamos evento de "ticket" (por ticketId o texto), vamos a /mis-tickets.
 *  4) Tipos macro como fallback.
 *  5) Fallback final seguro.
 */
function routeForNotification(n, { isAdmin, isSuper }) {
  // 1) actionUrl directa del backend
  if (n?.actionUrl) return n.actionUrl;

  const subtype = String(n?.subtype || "").toUpperCase();
  const type = String(n?.type || "").toUpperCase();
  const raffleId = getRaffleIdFrom(n);
  const ticketId = getTicketIdFrom(n);
  const slug = getSlugFrom(n);

  const title = String(n?.title || "").toLowerCase();
  const message = String(n?.message || "").toLowerCase();

  // Heurísticas de intención
  const isTicketEvent =
    !!ticketId ||
    subtype.includes("TICKET") ||
    subtype.includes("GIFT") ||
    type.includes("PURCHASE") ||
    type.includes("TICKET") ||
    title.includes("ticket") ||
    message.includes("ticket") ||
    title.includes("regalo") ||
    message.includes("regalo") ||
    title.includes("obsequio") ||
    message.includes("obsequio");

  // 2) Subtypes que definen destino claro (sin 404)
  switch (subtype) {
    case "TICKET_GIFT_RECEIVED":
    case "PURCHASE_CONFIRMED":
    case "PURCHASE_APPROVED":
    case "TICKET_PURCHASED":
    case "PURCHASE_CONFIRMATION":
      return "/mis-tickets";

    case "YOU_WON":
    case "WINNER_NOTIFICATION":
      return raffleId ? `/sorteo/${raffleId}` : "/mis-tickets";

    case "STARTING_SOON":
      return raffleId ? `/sorteo/${raffleId}` : "/sorteos";

    case "PUBLICACION_PENDIENTE":
    case "APPROVAL_REQUIRED":
    case "NEEDS_APPROVAL":
      if (isAdmin || isSuper) {
        return raffleId
          ? `/admin/publicaciones-pendientes?raffleId=${raffleId}`
          : "/admin/publicaciones-pendientes";
      }
      return "/";
    default:
      break;
  }

  // 3) Heurística fuerte: cualquier evento de ticket → Mis tickets
  if (isTicketEvent) {
    return "/mis-tickets";
  }

  // 4) Tipos “macro” (compatibilidad)
  switch (type) {
    case "RAFFLE_CREATED":
    case "CREATED_PUBLICATION":
    case "PUBLICACION_CREADA":
      // En creación solemos querer ir a mis sorteos o a la rifa si existe id
      return raffleId ? `/sorteo/${raffleId}` : "/mis-sorteos";

    case "NEW_PARTICIPANT":
    case "USER_JOINED":
      // Actividad de rifa: llevamos a la rifa
      return raffleId ? `/sorteo/${raffleId}` : "/ventas";

    case "TICKET_PURCHASED":
    case "PURCHASE_CONFIRMATION":
      // ✅ Tickets y compras llevan a "Mis Tickets"
      return "/mis-tickets";

    case "YOU_WON":
    case "RAFFLE_WINNER":
    case "WINNER":
    case "GANASTE":
      return raffleId ? `/sorteo/${raffleId}` : "/mis-tickets";

    case "STARTING_SOON":
    case "PROXIMO_SORTEO":
      return raffleId ? `/sorteo/${raffleId}` : "/sorteos";

    case "APPROVAL_REQUIRED":
    case "NEEDS_APPROVAL":
    case "PUBLICACION_PENDIENTE":
      if (isAdmin || isSuper) {
        return raffleId
          ? `/admin/publicaciones-pendientes?raffleId=${raffleId}`
          : "/admin/publicaciones-pendientes";
      }
      return "/";
    default:
      break;
  }

  // 5) Fallbacks seguros:
  if (raffleId) return `/sorteo/${raffleId}`;
  if (slug) return `/sorteo/${slug}`;
  if (isModerationNotification(n) && (isAdmin || isSuper)) {
    return "/admin/publicaciones-pendientes";
  }
  return "/notificaciones";
}

/* ========= Notificación individual con swipe + deshacer ========= */

function NotificationItem({
  notification,
  onMarkRead,
  onDelete,
  onNotificationClick,
}) {
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
    setDragX(Math.max(Math.min(deltaX, 120), -120));
  };

  const handleTouchEnd = () => {
    if (!isDragging || showUndoMessage) return;
    setIsDragging(false);
    if (Math.abs(dragX) > 80) {
      handleShowUndo();
    } else {
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
    setDragX(Math.max(Math.min(deltaX, 120), -120));
  };

  const handleMouseUp = () => {
    if (!isDragging || showUndoMessage) return;
    setIsDragging(false);
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
    if (undoTimeoutRef.current) clearTimeout(undoTimeoutRef.current);
    setShowUndoMessage(false);
    setDragX(0);
  };

  const handleConfirmDelete = async () => {
    if (undoTimeoutRef.current) clearTimeout(undoTimeoutRef.current);
    setIsDeleted(true);
    try {
      const res = await fetch("/api/notifications", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: notification.id }),
      });
      if (res.ok) {
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

  useEffect(() => {
    return () => {
      if (undoTimeoutRef.current) clearTimeout(undoTimeoutRef.current);
    };
  }, []);

  useEffect(() => {
    const handleMouseMoveGlobal = (e) => handleMouseMove(e);
    const handleMouseUpGlobal = () => handleMouseUp();

    if (isDragging) {
      document.addEventListener("mousemove", handleMouseMoveGlobal);
      document.addEventListener("mouseup", handleMouseUpGlobal);
    }
    return () => {
      document.removeEventListener("mousemove", handleMouseMoveGlobal);
      document.removeEventListener("mouseup", handleMouseUpGlobal);
    };
  }, [isDragging, startX, dragX]);

  if (isDeleted) {
    return (
      <div className="relative overflow-hidden bg-white transition-all duration-300 opacity-0 transform scale-95">
        <div className="h-0"></div>
      </div>
    );
  }

  return (
    <div className="relative overflow-hidden bg-white">
      {/* Mensaje de eliminación con opción de deshacer */}
      {showUndoMessage ? (
        <div className="p-3 bg-gray-50 border-l-4 border-gray-400 flex flex-col gap-2 sm:flex-row sm:justify-between sm:items-center sm:gap-3">
          <div className="flex items-center">
            <svg
              className="w-5 h-5 text-gray-600 mr-2 flex-shrink-0"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
              />
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
            style={{ opacity: Math.abs(dragX) / 120 }}
          >
            <svg
              className="w-5 h-5 text-red-500"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
              />
            </svg>
            <span className="ml-2 text-red-500 text-sm font-medium">
              Eliminar
            </span>
          </div>

          {/* Contenido de la notificación */}
          <div
            ref={itemRef}
            className="bg-white border-b last:border-b-0 cursor-grab active:cursor-grabbing select-none"
            style={{
              transform: `translateX(${dragX}px)`,
              transition: isDragging ? "none" : "transform 0.3s ease",
            }}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
            onMouseDown={handleMouseDown}
          >
            <div
              className="p-3 hover:bg-gray-50 text-sm flex justify-between items-start gap-3 cursor-pointer"
              onClick={() =>
                onNotificationClick && onNotificationClick(notification)
              }
            >
              <div className="flex-1 min-w-0">
                <div
                  className={`${!notification.read ? "font-medium" : ""} break-words`}
                >
                  {notification.message}
                </div>
                <div className="text-xs text-gray-400 mt-1">
                  {new Date(notification.createdAt).toLocaleString("es-AR", {
                    day: "2-digit",
                    month: "2-digit",
                    year: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </div>
              </div>
              <div className="flex-shrink-0">
                {!notification.read && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
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

/* ============================= Header ============================= */

export default function Header() {
  const { data: session } = useSession();
  const router = useRouter();
  const pathname = usePathname();

  const [notifOpen, setNotifOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(false);
  const [bulkWorking, setBulkWorking] = useState(false);
  const [dropdownTop, setDropdownTop] = useState(0);

  const notifRef = useRef(null);
  const menuRef = useRef(null);
  const headerRef = useRef(null);

  // Favicon handling
  const faviconLinkRef = useRef(null);
  const originalFaviconHrefRef = useRef(null);

  /* Posición dropdowns (mobile fija + desktop absoluta) */
  useEffect(() => {
    const calculateDropdownPosition = () => {
      if (headerRef.current) {
        const headerRect = headerRef.current.getBoundingClientRect();
        setDropdownTop(headerRect.bottom + 8);
      }
    };
    calculateDropdownPosition();
    window.addEventListener("resize", calculateDropdownPosition);
    window.addEventListener("orientationchange", calculateDropdownPosition);
    return () => {
      window.removeEventListener("resize", calculateDropdownPosition);
      window.removeEventListener("orientationchange", calculateDropdownPosition);
    };
  }, [notifOpen, menuOpen]);

  /* Cerrar dropdowns al hacer click fuera */
  useEffect(() => {
    function handleDown(e) {
      if (notifRef.current && !notifRef.current.contains(e.target))
        setNotifOpen(false);
      if (menuRef.current && !menuRef.current.contains(e.target))
        setMenuOpen(false);
    }
    document.addEventListener("click", handleDown);
    return () => document.removeEventListener("click", handleDown);
  }, []);

  /* Cargar notificaciones */
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
        if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
        const data = await res.json();
        if (!abort) setNotifications(Array.isArray(data) ? data : []);
      } catch (err) {
        console.error("Error cargando notificaciones:", err);
        if (!abort) setNotifications([]);
      } finally {
        if (!abort) setLoading(false);
      }
    }
    loadNotifications();
    return () => {
      abort = true;
    };
  }, [session]);

  /* Acciones unitarias */
  const markRead = async (id) => {
    try {
      const res = await fetch("/api/notifications", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, read: true } : n))
      );
    } catch (err) {
      console.error("Error marcando como leído:", err);
    }
  };

  const deleteNotification = (id) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  };

  /* Eliminar todas (icono sutil de tachito) */
  const deleteAll = async () => {
    if (notifications.length === 0) return;
    if (
      !window.confirm(
        "¿Eliminar todas las notificaciones? Esta acción no se puede deshacer."
      )
    )
      return;

    setBulkWorking(true);
    // 1) Intento bulk
    try {
      const bulk = await fetch("/api/notifications", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ all: true }),
      });
      if (bulk.ok) {
        setNotifications([]);
        setBulkWorking(false);
        return;
      }
    } catch {}
    // 2) Fallback en paralelo
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
    } finally {
      setBulkWorking(false);
    }
  };

  /* Click en una notificación */
  const handleNotificationClick = (notification) => {
    setNotifOpen(false);
    if (notification && !notification.read) {
      markRead(notification.id);
    }

    const role = (session?.user?.role || "user").toString().toLowerCase();
    const isAdmin = role === "admin";
    const isSuper = role === "superadmin";

    const target = routeForNotification(notification, { isAdmin, isSuper });
    router.push(target);
  };

  /* Contadores y roles */
  const unreadCount = notifications.filter((n) => !n.read).length;
  const unreadActionableCount = useMemo(
    () =>
      notifications.filter(
        (n) => !n.read && (n.isActionable === undefined || n.isActionable === true)
      ).length,
    [notifications]
  );

  const role = (session?.user?.role || "user").toString().toLowerCase();
  const isAdmin = role === "admin";
  const isSuper = role === "superadmin";
  const moderationCount = notifications.filter(isModerationNotification).length;
  const showModerationBadge = (isAdmin || isSuper) && moderationCount > 0;

  /* ======= Título y Favicon con badge ======= */

  // Asegura que tengamos un <link rel="icon"> y recordá el href original
  useEffect(() => {
    if (typeof document === "undefined") return;
    if (!faviconLinkRef.current) {
      let link =
        document.querySelector('link[rel="icon"]') ||
        document.querySelector('link[rel="shortcut icon"]');
      if (!link) {
        link = document.createElement("link");
        link.rel = "icon";
        document.head.appendChild(link);
      }
      faviconLinkRef.current = link;
      originalFaviconHrefRef.current = link.href || "/favicon.ico";
    }
  }, []);

  // Dibuja un favicon con badge (99+ cap)
  async function generateFaviconWithBadge(baseHref, count) {
    const c = document.createElement("canvas");
    const size = 64;
    c.width = size;
    c.height = size;
    const ctx = c.getContext("2d");

    // 1) base: intentamos cargar el favicon original
    await new Promise((resolve) => {
      try {
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.onload = () => {
          try {
            ctx.drawImage(img, 0, 0, size, size);
          } catch {}
          resolve();
        };
        img.onerror = () => resolve();
        img.src = baseHref || "/favicon.ico";
      } catch {
        resolve();
      }
    });

    // 2) badge
    const n = Math.min(999, Math.max(1, Number(count) || 0));
    const text = n > 99 ? "99+" : String(n);

    // círculo
    const r = 18;
    const cx = size - 16;
    const cy = 16;
    ctx.beginPath();
    ctx.fillStyle = "#E11D48"; // rose-600
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();

    // texto
    ctx.fillStyle = "#fff";
    ctx.font = "bold 28px system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text, cx, cy + 1);

    return c.toDataURL("image/png");
  }

  // Actualiza título y favicon cuando cambia el contador o el estado del dropdown
  useEffect(() => {
    if (typeof document === "undefined") return;

    const count = notifOpen ? 0 : unreadActionableCount;

    // Título de la pestaña
    document.title = count > 0 ? `(${count}) ${BASE_TITLE}` : BASE_TITLE;

    // Favicon
    const link = faviconLinkRef.current;
    const original = originalFaviconHrefRef.current;
    let cancelled = false;

    (async () => {
      try {
        if (!link) return;
        if (count <= 0) {
          // restaurar
          if (original) link.href = original;
          return;
        }
        const dataUrl = await generateFaviconWithBadge(original, count);
        if (!cancelled && dataUrl) {
          link.href = dataUrl;
        }
      } catch {
        // si algo falla, restaurar
        if (link && original) link.href = original;
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [unreadActionableCount, notifOpen]);

  // Restaurar favicon si el componente se desmonta
  useEffect(() => {
    return () => {
      const link = faviconLinkRef.current;
      const original = originalFaviconHrefRef.current;
      if (link && original) {
        try {
          link.href = original;
        } catch {}
      }
      if (typeof document !== "undefined") {
        document.title = BASE_TITLE;
      }
    };
  }, []);

  /* Cerrar sesión: en página de sorteo quedate en la misma URL */
  const handleSignOut = async () => {
    try {
      const isRafflePath =
        /^\/sorteo\/[^/?#]+(\/.*)?$/.test(pathname || "") ||
        /^\/raffles\/[^/?#]+(\/.*)?$/.test(pathname || "");
      if (isRafflePath) {
        await signOut({ redirect: false });
        setMenuOpen(false);
        setNotifOpen(false);
        router.refresh();
      } else {
        await signOut({ callbackUrl: "/" });
      }
    } catch (error) {
      console.error("Error al cerrar sesión:", error);
      setMenuOpen(false);
      setNotifOpen(false);
      router.refresh();
    }
  };

  /* ============================= UI ============================= */

  return (
    <header
      ref={headerRef}
      className="fixed top-0 left-0 w-full bg-orange-500 text-white shadow-md z-50"
    >
      <div className="max-w-6xl mx-auto flex justify-between items-center px-4 py-3">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-3">
          <div className="relative h-13 w-[127px] rounded-[4px] overflow-hidden bg-white ring-1 ring-white">
            <Image
              src="/logo.png"
              alt="Logo"
              fill
              className="object-contain p-0.5"
              priority
            />
          </div>
        </Link>

        <div className="flex items-center gap-4">
          {/* Campana de notificaciones */}
          {session && (
            <div className="relative" ref={notifRef}>
              <button
                aria-label="Notificaciones"
                onClick={(e) => {
                  e.stopPropagation();
                  setNotifOpen((v) => !v);
                }}
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
                    d="M15 17h5l-1.405-1.405A2 2 0 0118 14.158V11a6 6 0 10-12 0v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
                  />
                </svg>

                {/* Badge total no leídas (visual en campana) */}
                {unreadCount > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 inline-flex items-center justify-center px-1.5 py-0.5 text-xs font-bold leading-none text-orange-500 bg-white rounded-full">
                    {unreadCount}
                  </span>
                )}

                {/* Indicador moderación (admins/superadmins) */}
                {showModerationBadge && (
                  <span
                    className="absolute -bottom-0.5 -right-0.5 block w-2 h-2 bg-yellow-300 rounded-full ring-2 ring-orange-500"
                    title="Pendientes de moderación"
                  />
                )}
              </button>

              {/* Dropdown de notificaciones */}
              {notifOpen && (
                <div
                  className="fixed inset-x-4 bg-white text-gray-800 rounded-lg shadow-lg overflow-hidden ring-1 ring-black ring-opacity-5 z-[9999] sm:absolute sm:inset-x-auto sm:right-0 sm:top-full sm:mt-2 sm:w-80 md:w-96"
                  style={{
                    top:
                      typeof window !== "undefined" && window.innerWidth < 640
                        ? `${dropdownTop}px`
                        : "calc(100% + 8px)",
                    maxHeight:
                      typeof window !== "undefined" && window.innerWidth < 640
                        ? `calc(100vh - ${dropdownTop + 20}px)`
                        : "22rem",
                  }}
                >
                  <div className="p-3 border-b bg-gray-50 flex items-center justify-between">
                    <span className="text-sm font-medium">Notificaciones</span>
                    {/* Solo icono de tachito */}
                    {notifications.length > 0 && (
                      <button
                        onClick={deleteAll}
                        disabled={bulkWorking}
                        className="p-1 rounded hover:bg-gray-200 disabled:opacity-50"
                        title="Eliminar todas"
                        aria-label="Eliminar todas"
                      >
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          className="h-4 w-4 text-gray-700"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth="2"
                            d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6M9 7V4a1 1 0 011-1h4a1 1 0 011 1v3m-9 0h10"
                          />
                        </svg>
                      </button>
                    )}
                  </div>

                  <div className="max-h-72 overflow-auto">
                    {loading ? (
                      <div className="p-3 text-sm text-gray-500 text-center">
                        Cargando...
                      </div>
                    ) : notifications.length === 0 ? (
                      <div className="p-3 text-sm text-gray-500 text-center">
                        No hay notificaciones
                      </div>
                    ) : (
                      notifications.map((n) => (
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
                      onClick={() => setNotifOpen(false)} // cierra el dropdown al ir
                    >
                      Ver todas
                    </Link>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Botón login / Menú usuario */}
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
                onClick={(e) => {
                  e.stopPropagation();
                  setMenuOpen((v) => !v);
                }}
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

              {/* Dropdown menú usuario */}
              {menuOpen && (
                <div
                  className="fixed inset-x-4 bg-white text-gray-800 rounded-lg shadow-lg overflow-hidden ring-1 ring-black ring-opacity-5 z-[9999] sm:absolute sm:inset-x-auto sm:right-0 sm:top-full sm:mt-2 sm:w-56"
                  style={{
                    top:
                      typeof window !== "undefined" && window.innerWidth < 640
                        ? `${dropdownTop}px`
                        : "calc(100% + 8px)",
                    maxHeight:
                      typeof window !== "undefined" && window.innerWidth < 640
                        ? `calc(100vh - ${dropdownTop + 20}px)`
                        : "auto",
                  }}
                >
                  <div className="p-2">
                    <Link
                      href="/perfil"
                      className="block px-3 py-2 rounded hover:bg-gray-50 transition-colors"
                      onClick={() => setMenuOpen(false)}
                    >
                      Perfil
                    </Link>

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
                      Favoritos 🤍
                    </Link>

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
                          className="relative block px-3 py-2 rounded hover:bg-gray-50 transition-colors"
                          onClick={() => setMenuOpen(false)}
                        >
                          <span className="inline-flex items-center gap-2">
                            <span>Publicaciones pendientes</span>
                            {showModerationBadge && (
                              <span className="inline-flex items-center justify-center h-5 min-w-[1.25rem] px-1.5 text-[11px] font-bold leading-none bg-red-600 text-white rounded-full">
                                {Math.min(moderationCount, 99)}
                              </span>
                            )}
                          </span>
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
