"use client";

import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

/* ============================================================
   Helpers utilitarios (seguros, sin romper lo existente)
   ============================================================ */

/** Normaliza rol a MAYÚSCULAS */
function toRole(x) {
  return String(x || "").toUpperCase();
}
function isAdminish(role) {
  const r = toRole(role);
  return r === "ADMIN" || r === "SUPERADMIN";
}

/** Delay simple por si se usa en futuros flujos */
function sleep(ms) {
  return new Promise((res) => setTimeout(res, ms));
}

/** Lee un posible total desde varias formas comunes del backend */
function pickTotalFromPagination(obj = {}) {
  const p = obj?.pagination || obj;
  return (
    (typeof p?.totalItems === "number" && p.totalItems) ||
    (typeof p?.total === "number" && p.total) ||
    (typeof obj?.total === "number" && obj.total) ||
    0
  );
}

/** Parseo JSON con tolerancia a content-type */
async function safeJson(res) {
  try {
    const ct = res.headers.get("content-type") || "";
    if (ct.includes("application/json")) return await res.json();
    const txt = await res.text();
    return { raw: txt };
  } catch {
    return {};
  }
}

/* ============================================================
   UI: Tarjeta de botón unificada (mismo alto y centrado)
   ============================================================ */

function ButtonCard({
  onClick,
  disabled = false,
  gradientFrom = "from-gray-500/10",
  gradientTo = "to-gray-600/10",
  ring = "focus:ring-gray-500/40",
  hoverShadow = "hover:shadow-[0_0_25px_rgba(255,255,255,0.08)]",
  iconClass = "text-gray-300",
  iconBg = "bg-gray-500/10",
  iconBorder = "border-gray-500/20",
  title,
  subtitle,
  badgeCount = 0,
  badgeTitle = "",
  loading = false,
  childrenIcon, // SVG
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={[
        "group relative overflow-hidden rounded-xl p-0.5 transition-all duration-300 transform",
        "focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-900",
        ring,
        hoverShadow,
        disabled ? "cursor-not-allowed opacity-80" : `bg-gradient-to-br ${gradientFrom} ${gradientTo} hover:-translate-y-0.5`,
        "h-full",
      ].join(" ")}
    >
      <div
        className={[
          "h-full",
          "flex items-center justify-center gap-3",
          "bg-gray-800/70 border border-gray-700/50 rounded-xl",
          "p-5 text-left transition-all duration-300",
          disabled ? "bg-gray-700/50 border-gray-700/50" : "group-hover:bg-gray-700/70 group-hover:border-gray-600/50",
          "min-h-[116px]",
        ].join(" ")}
      >
        <div className="relative">
          <div className={`grid place-content-center ${iconBg} rounded-lg border ${iconBorder} w-11 h-11`}>
            {loading ? (
              <svg className="animate-spin h-5 w-5 text-gray-400" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
            ) : (
              <span className={`block ${iconClass}`}>
                {/* ICON SLOT */}
                {childrenIcon}
              </span>
            )}
          </div>

          {badgeCount > 0 && (
            <span
              title={badgeTitle || `${badgeCount} pendientes`}
              className="absolute -top-2 -right-2 inline-flex items-center justify-center text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-amber-500 text-gray-900 border border-amber-300 shadow"
            >
              {badgeCount > 99 ? "99+" : badgeCount}
            </span>
          )}
        </div>

        <div className="flex-1 min-w-0">
          <p className="text-[15px] leading-5 font-semibold text-white truncate">{title}</p>
          {subtitle ? <p className="text-sm text-gray-400 mt-0.5 line-clamp-1">{subtitle}</p> : null}
        </div>
      </div>
    </button>
  );
}

/* ============================================================
   Componente principal del Panel de Administración
   ============================================================ */

export default function AdminPage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  const [generating, setGenerating] = useState(false);
  const [message, setMessage] = useState("");
  const clearMsgRef = useRef(null);

  const userRole = useMemo(() => toRole(session?.user?.role), [session?.user?.role]);
  const isAdmin = userRole === "ADMIN";
  const isSuperAdmin = userRole === "SUPERADMIN";

  // 🔔 Contador de publicaciones pendientes (solo para ADMIN/SUPERADMIN)
  const [pendingCount, setPendingCount] = useState(0);
  const [pendingLoading, setPendingLoading] = useState(false);
  const abortRef = useRef(null);

  // Limpieza de mensajes temporales
  useEffect(() => {
    return () => {
      if (clearMsgRef.current) clearTimeout(clearMsgRef.current);
      if (abortRef.current) abortRef.current.abort();
    };
  }, []);

  const setAutoClearMessage = (text) => {
    setMessage(text);
    if (clearMsgRef.current) clearTimeout(clearMsgRef.current);
    clearMsgRef.current = setTimeout(() => setMessage(""), 5000);
  };

  const fetchPendingCount = async () => {
    if (!isAdminish(userRole)) return;
    try {
      if (abortRef.current) abortRef.current.abort();
      abortRef.current = new AbortController();
      setPendingLoading(true);

      const url = new URL("/api/raffles", window.location.origin);
      url.searchParams.set("listingStatus", "PENDING");
      url.searchParams.set("limit", "1");
      url.searchParams.set("page", "1");

      const res = await fetch(url.toString(), {
        credentials: "include",
        signal: abortRef.current.signal,
      });
      const data = await safeJson(res);
      const total = pickTotalFromPagination(data);
      if (Number.isFinite(total) && total >= 0) {
        setPendingCount(total);
      }
    } catch {
      // silencioso
    } finally {
      setPendingLoading(false);
    }
  };

  useEffect(() => {
    if (status === "authenticated" && isAdminish(userRole)) {
      fetchPendingCount();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, userRole]);

  useEffect(() => {
    if (!isAdminish(userRole)) return;

    const onFocus = () => fetchPendingCount();
    const onVisibility = () => {
      if (document.visibilityState === "visible") fetchPendingCount();
    };

    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibility);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userRole]);

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/");
      return;
    }
    if (status === "authenticated" && !(isAdmin || isSuperAdmin)) {
      router.push("/");
    }
  }, [status, isAdmin, isSuperAdmin, router]);

  // ✅ Generar 1 ticket genérico para el usuario actual
  const generateDirectTicket = async () => {
    if (!session?.user?.id) {
      setAutoClearMessage("❌ Error: No se puede identificar el usuario");
      return;
    }

    setGenerating(true);
    setMessage("");

    try {
      const res = await fetch("/api/admin/tickets/issue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: session.user.id,
          cantidad: 1,
          status: "AVAILABLE",
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok || data?.ok === false) {
        const errMsg = data?.error || "Operación fallida";
        setAutoClearMessage(`❌ Error: ${errMsg}`);
        return;
      }

      const t = Array.isArray(data?.tickets) ? data.tickets[0] : null;
      const uuid = t?.uuid ?? "—";
      const code = t?.code ?? t?.displayCode ?? "—";

      setAutoClearMessage(`✅ Ticket generado. CODE: ${code} • UUID: ${uuid}`);

      fetchPendingCount();
    } catch (err) {
      console.error("Error generating ticket:", err);
      setAutoClearMessage("❌ Error de conexión");
    } finally {
      setGenerating(false);
    }
  };

  if (status === "loading") {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-950 to-gray-900 flex items-center justify-center p-4">
        <div className="text-center">
          <div className="relative mb-6">
            <div className="w-16 h-16 border-4 border-orange-500/60 border-t-transparent rounded-full animate-spin mx-auto"></div>
          </div>
          <h2 className="text-xl font-semibold text-white mb-2">Cargando panel de administración</h2>
          <p className="text-gray-400">Preparando el sistema de gestión...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-950 to-gray-900 text-gray-100">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="bg-gray-800/50 backdrop-blur-sm border border-gray-700 rounded-2xl overflow-hidden shadow-2xl">
          <div className="relative p-6 bg-gradient-to-r from-gray-800 to-gray-800/90 border-b border-gray-700">
            <div className="absolute inset-0 bg-gradient-to-r from-orange-500/5 to-transparent pointer-events-none"></div>
            <div className="relative">
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                <div>
                  <h1 className="text-2xl md:text-3xl font-bold text-white flex items-center gap-3">
                    <span className="bg-gray-700/50 p-2.5 rounded-xl border border-gray-600">
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-orange-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      </svg>
                    </span>
                    Panel de Administración
                  </h1>
                  <p className="text-gray-300 mt-2 text-lg">
                    Bienvenido {session?.user?.name} •{" "}
                    <span className="text-orange-400 font-medium">{session?.user?.email}</span>
                  </p>
                </div>
                <div className="flex items-center bg-gray-700/50 px-4 py-2.5 rounded-xl border border-gray-600">
                  <div className="w-2.5 h-2.5 bg-emerald-500 rounded-full mr-2.5"></div>
                  <span className="text-sm font-medium text-gray-200">Sesión activa</span>
                </div>
              </div>
            </div>
          </div>

          {message && (
            <div
              className={`mx-6 mt-6 p-4 rounded-xl border-l-4 transition-all duration-300 ${
                message.includes("✅")
                  ? "bg-emerald-900/30 border-emerald-700 text-emerald-200"
                  : "bg-rose-900/30 border-rose-700 text-rose-200"
              }`}
            >
              <div className="flex items-start">
                <div className="flex-shrink-0 mt-0.5">
                  {message.includes("✅") ? (
                    <svg className="h-5 w-5 text-emerald-400" fill="currentColor" viewBox="0 0 20 20">
                      <path
                        fillRule="evenodd"
                        d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                        clipRule="evenodd"
                      />
                    </svg>
                  ) : (
                    <svg className="h-5 w-5 text-rose-400" fill="currentColor" viewBox="0 0 20 20">
                      <path
                        fillRule="evenodd"
                        d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z"
                        clipRule="evenodd"
                      />
                    </svg>
                  )}
                </div>
                <div className="ml-3 flex-1">
                  <p className="text-sm font-medium">{message}</p>
                </div>
              </div>
            </div>
          )}

          <div className="p-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 items-stretch">
              {/* Crear sorteo */}
              <ButtonCard
                onClick={() => router.push("/admin/crear-sorteo")}
                gradientFrom="from-orange-500/10"
                gradientTo="to-orange-600/10"
                ring="focus:ring-orange-500/50"
                hoverShadow="hover:shadow-[0_0_25px_rgba(249,115,22,0.2)]"
                iconClass="text-orange-400"
                iconBg="bg-orange-500/10"
                iconBorder="border-orange-500/20"
                title="Crear Sorteo"
                subtitle="Configura un nuevo sorteo"
                childrenIcon={
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                  </svg>
                }
              />

              {/* Mis sorteos */}
              <ButtonCard
                onClick={() => router.push("/mis-sorteos")}
                gradientFrom="from-indigo-500/10"
                gradientTo="to-indigo-600/10"
                ring="focus:ring-indigo-500/50"
                hoverShadow="hover:shadow-[0_0_25px_rgba(79,70,229,0.2)]"
                iconClass="text-indigo-400"
                iconBg="bg-indigo-500/10"
                iconBorder="border-indigo-500/20"
                title="Mis Sorteos"
                subtitle="Gestiona tus sorteos activos"
                childrenIcon={
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                  </svg>
                }
              />

              {/* Mis tickets */}
              <ButtonCard
                onClick={() => router.push("/mis-tickets")}
                gradientFrom="from-emerald-500/10"
                gradientTo="to-emerald-600/10"
                ring="focus:ring-emerald-500/50"
                hoverShadow="hover:shadow-[0_0_25px_rgba(16,185,129,0.2)]"
                iconClass="text-emerald-400"
                iconBg="bg-emerald-500/10"
                iconBorder="border-emerald-500/20"
                title="Mis Tickets"
                subtitle="Revisa tus tickets generados"
                childrenIcon={
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
                  </svg>
                }
              />

              {/* Mis Favoritos */}
              <ButtonCard
                onClick={() => router.push("/mis-favoritos")}
                gradientFrom="from-pink-500/10"
                gradientTo="to-pink-600/10"
                ring="focus:ring-pink-500/50"
                hoverShadow="hover:shadow-[0_0_25px_rgba(236,72,153,0.2)]"
                iconClass="text-pink-400"
                iconBg="bg-pink-500/10"
                iconBorder="border-pink-500/20"
                title="Mis Favoritos"
                subtitle="Accede a tus rifas marcadas"
                childrenIcon={
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 016.364 0L12 7.636l1.318-1.318a4.5 4.5 0 116.364 6.364L12 21l-7.682-7.682a4.5 4.5 0 010-6.364z" />
                  </svg>
                }
              />

              {/* Publicaciones pendientes */}
              {isAdminish(userRole) && (
                <ButtonCard
                  onClick={() => router.push("/admin/publicaciones-pendientes")}
                  gradientFrom="from-amber-500/10"
                  gradientTo="to-amber-600/10"
                  ring="focus:ring-amber-500/50"
                  hoverShadow="hover:shadow-[0_0_25px_rgba(245,158,11,0.2)]"
                  iconClass="text-amber-400"
                  iconBg="bg-amber-500/10"
                  iconBorder="border-amber-500/20"
                  title="Publicaciones pendientes"
                  subtitle={pendingLoading ? "Comprobando…" : pendingCount > 0 ? "Hay publicaciones por revisar" : "Al día"}
                  badgeCount={pendingCount}
                  badgeTitle={pendingLoading ? "Actualizando…" : `${pendingCount} pendientes`}
                  childrenIcon={
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                    </svg>
                  }
                />
              )}

              {/* SuperAdmin: generar 1 ticket */}
              {isSuperAdmin && (
                <ButtonCard
                  onClick={generateDirectTicket}
                  disabled={generating}
                  loading={generating}
                  gradientFrom="from-rose-500/10"
                  gradientTo="to-rose-600/10"
                  ring="focus:ring-rose-500/50"
                  hoverShadow="hover:shadow-[0_0_25px_rgba(239,68,68,0.2)]"
                  iconClass={generating ? "text-gray-400" : "text-rose-400"}
                  iconBg={generating ? "bg-gray-700/50" : "bg-rose-500/10"}
                  iconBorder={generating ? "border-gray-700/50" : "border-rose-500/20"}
                  title={generating ? "Generando..." : "Generar Ticket"}
                  subtitle={generating ? "Espere un momento..." : "Crea un ticket de prueba"}
                  childrenIcon={
                    generating ? (
                      <svg className="animate-spin h-5 w-5 text-gray-400" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                    ) : (
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                      </svg>
                    )
                  }
                />
              )}

              {/* SuperAdmin: generar múltiples */}
              {isSuperAdmin && (
                <ButtonCard
                  onClick={() => router.push("/admin/generar-tickets")}
                  gradientFrom="from-purple-500/10"
                  gradientTo="to-purple-600/10"
                  ring="focus:ring-purple-500/50"
                  hoverShadow="hover:shadow-[0_0_25px_rgba(168,85,247,0.2)]"
                  iconClass="text-purple-400"
                  iconBg="bg-purple-500/10"
                  iconBorder="border-purple-500/20"
                  title="Generar Múltiples"
                  subtitle="Crea tickets para usuarios"
                  childrenIcon={
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
                    </svg>
                  }
                />
              )}

              {/* SuperAdmin: Usuarios y verificación */}
              {isSuperAdmin && (
                <ButtonCard
                  onClick={() => router.push("/admin/usuarios")}
                  gradientFrom="from-blue-500/10"
                  gradientTo="to-blue-600/10"
                  ring="focus:ring-blue-500/50"
                  hoverShadow="hover:shadow-[0_0_25px_rgba(59,130,246,0.2)]"
                  iconClass="text-blue-400"
                  iconBg="bg-blue-500/10"
                  iconBorder="border-blue-500/20"
                  title="Usuarios y verificación"
                  subtitle="Ver perfiles, roles y verificar cuentas"
                  childrenIcon={
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197m13.5-9a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z" />
                    </svg>
                  }
                />
              )}
            </div>

            <div className="mt-8 grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="bg-gray-800/50 rounded-xl p-5 border border-gray-700/50">
                <div className="flex items-center gap-3 mb-3">
                  <div className="bg-gray-700/50 p-2.5 rounded-xl border border-gray-600/50">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-orange-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
                      />
                    </svg>
                  </div>
                  <h3 className="text-lg font-semibold text-white">Información de la cuenta</h3>
                </div>
                <div className="pl-11">
                  <div className="bg-gray-800/70 p-4 rounded-xl border border-gray-700/50">
                    <p className="text-sm text-gray-400 mb-1">Rol actual:</p>
                    <p className="text-lg font-bold text-orange-400 capitalize">
                      {userRole ? userRole.toLowerCase() : "—"}
                    </p>

                    <div className="mt-3 pt-3 border-t border-gray-700/50">
                      <p className="text-sm text-gray-400">
                        <span className="font-medium text-gray-300">ID de usuario:</span> {session?.user?.id}
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {isSuperAdmin && (
                <div className="bg-gray-800/50 rounded-xl p-5 border border-blue-900/30">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="bg-blue-900/30 p-2.5 rounded-xl border border-blue-800/30">
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
                        />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      </svg>
                    </div>
                    <h3 className="text-lg font-semibold text-white">Herramientas de SuperAdmin</h3>
                  </div>
                  <div className="pl-11">
                    <ul className="space-y-3 text-gray-300">
                      <li className="flex items-start">
                        <svg className="h-5 w-5 text-blue-400 mt-0.5 mr-2.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                          <path
                            fillRule="evenodd"
                            d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                            clipRule="evenodd"
                          />
                        </svg>
                        <span>
                          <strong className="text-white">Usuarios:</strong> Ver perfiles, roles y <em>verificar</em> cuentas.
                        </span>
                      </li>
                      <li className="flex items-start">
                        <svg className="h-5 w-5 text-blue-400 mt-0.5 mr-2.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                          <path
                            fillRule="evenodd"
                            d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                            clipRule="evenodd"
                          />
                        </svg>
                        <span>Los tickets generados aparecen en «Mis Tickets» inmediatamente.</span>
                      </li>
                    </ul>
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="px-6 pb-6 bg-gray-800/30 border-t border-gray-700/50">
            <div className="flex items-start p-4 bg-gray-800/50 rounded-xl border border-gray-700/50">
              <div className="flex-shrink-0 mt-0.5">
                <svg className="h-5 w-5 text-orange-400" fill="currentColor" viewBox="0 0 20 20">
                  <path
                    fillRule="evenodd"
                    d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
                    clipRule="evenodd"
                  />
                </svg>
              </div>
              <div className="ml-3 flex-1">
                <p className="text-sm font-medium text-orange-200">Consejos para administradores</p>
                <ul className="mt-1 text-sm text-gray-300 space-y-1.5">
                  <li className="flex items-start">
                    <span className="h-1.5 w-1.5 bg-orange-400 rounded-full mt-1.5 mr-2.5 flex-shrink-0"></span>
                    <span>Los tickets “directos” se emiten como GENERIC/AVAILABLE y no quedan pegados a ningún sorteo.</span>
                  </li>
                  {isAdminish(userRole) && (
                    <li className="flex items-start">
                      <span className="h-1.5 w-1.5 bg-orange-400 rounded-full mt-1.5 mr-2.5 flex-shrink-0"></span>
                      <span>
                        El indicador de <b>Publicaciones</b> se actualiza al abrir el panel y cuando volvés a esta pestaña
                        (no usa intervalos).
                      </span>
                    </li>
                  )}
                </ul>
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
