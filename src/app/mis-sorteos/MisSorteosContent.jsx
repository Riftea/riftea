// src/app/admin/mis-sorteos/MisSorteosContent.jsx
"use client";

import { useEffect, useMemo, useState, useRef } from "react";
import { useSession } from "next-auth/react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import Link from "next/link";
import QRCode from "qrcode";
import Image from "next/image";

export default function MisSorteosContent() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { data: session, status } = useSession();

  const [raffles, setRaffles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [msg, setMsg] = useState("");
  const [msgType, setMsgType] = useState(""); // success | error | info
  const [deletingId, setDeletingId] = useState(null);

  // Modal compartir
  const [shareOpen, setShareOpen] = useState(false);
  const [shareRaffle, setShareRaffle] = useState(null);
  const [shareUrl, setShareUrl] = useState("");
  const [qrDataUrl, setQrDataUrl] = useState("");
  const [copyCount, setCopyCount] = useState(0);
  const [copying, setCopying] = useState(false);
  const qrWrapRef = useRef(null);

  // Normalización de rol (SUPER_ADMIN, super-admin, etc.)
  const normRole = useMemo(() => {
    const raw = (session?.user?.role ?? "user").toString();
    return raw.toLowerCase().replace(/[\s_-]/g, "");
  }, [session?.user?.role]);

  const isSuperAdmin = normRole === "superadmin";
  const isAdmin = isSuperAdmin || normRole === "admin";

  // Impersonación de lectura: solo tiene efecto si es SUPERADMIN
  const asUser = useMemo(() => {
    if (!isSuperAdmin) return "";
    const raw = (searchParams?.get("asUser") || "").trim();
    return raw;
  }, [searchParams, isSuperAdmin]);

  // Si viene includePrivate desde la URL, lo respetamos; si sos SUPERADMIN forzamos includePrivate=1 por defecto
  const includePrivateFlag = useMemo(() => {
    if (!isSuperAdmin) return false;
    const raw = searchParams?.get("includePrivate");
    if (raw == null) return true; // default para superadmin
    return raw === "1" || raw === "true";
  }, [searchParams, isSuperAdmin]);

  const moneyFmt = useMemo(
    () =>
      new Intl.NumberFormat("es-AR", {
        style: "currency",
        currency: "ARS",
        maximumFractionDigits: 0,
      }),
    []
  );

  // --- Helpers compartir
  function buildShareText(title, url) {
    return `¡Mirá mi sorteo "${title}"! ${url}`;
  }
  function getShareLinks({ url, title }) {
    const text = buildShareText(title || "Sorteo", url);
    const encodedText = encodeURIComponent(text);
    const encodedUrl = encodeURIComponent(url);
    return {
      whatsapp: `https://api.whatsapp.com/send?text=${encodedText}`,
      facebook: `https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}`,
      x: `https://twitter.com/intent/tweet?text=${encodedText}`,
      telegram: `https://t.me/share/url?url=${encodedUrl}&text=${encodedText}`,
      email: `mailto:?subject=${encodeURIComponent(title || "Sorteo")}&body=${encodedText}`,
    };
  }

  // --- Persistencia contador copias
  const loadCopyCount = (id) => {
    try {
      const raw = localStorage.getItem(`shareCopies:${id}`);
      const n = raw ? parseInt(raw, 10) : 0;
      return Number.isFinite(n) ? n : 0;
    } catch {
      return 0;
    }
  };
  const incCopyCount = (id) => {
    try {
      const current = loadCopyCount(id) + 1;
      localStorage.setItem(`shareCopies:${id}`, String(current));
      return current;
    } catch {
      return 0;
    }
  };

  // --- Carga de rifas
  useEffect(() => {
    if (status === "loading") return;
    if (status === "unauthenticated") {
      setError("No estás autenticado.");
      setLoading(false);
      return;
    }
    let abort = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        // Armamos la query en función del rol y asUser
        const params = new URLSearchParams();
        params.set("mine", "1");
        params.set("limit", "100");

        // Si es superadmin y hay asUser, pedimos sorteos de ese usuario
        if (isSuperAdmin && asUser) params.set("asUser", asUser);

        // Si es superadmin, pedimos también privados (por defecto o según query)
        if (isSuperAdmin && includePrivateFlag) params.set("includePrivate", "1");

        const res = await fetch(`/api/raffles?${params.toString()}`, { cache: "no-store" });

        if (!res.ok) {
          let txt = "";
          try {
            txt = await res.text();
          } catch {}
          throw new Error(txt || `HTTP ${res.status}`);
        }

        const data = await res.json();
        const list = Array.isArray(data?.raffles)
          ? data.raffles
          : Array.isArray(data?.items)
          ? data.items
          : [];

        if (!abort) setRaffles(list);
        if (!abort) {
          setMsg(
            `Se cargaron ${list.length} sorteos${
              isSuperAdmin && asUser ? ` del usuario ${asUser}` : ""
            }${isSuperAdmin && includePrivateFlag ? " (incluye privados)" : ""}`
          );
          setMsgType("info");
        }
      } catch (err) {
        console.error("Error cargando mis sorteos:", err);
        if (!abort) {
          setError("No se pudieron cargar los sorteos.");
          setMsg("No se pudieron cargar los sorteos.");
          setMsgType("error");
        }
      } finally {
        if (!abort) setLoading(false);
      }
    }
    load();
    return () => {
      abort = true;
    };
  }, [status, isSuperAdmin, asUser, includePrivateFlag]);

  // --- QR
  useEffect(() => {
    let cancelled = false;
    async function gen() {
      if (!shareOpen || !shareUrl) return setQrDataUrl("");
      try {
        const dataUrl = await QRCode.toDataURL(shareUrl, {
          width: 256,
          margin: 1,
          errorCorrectionLevel: "M",
        });
        if (!cancelled) setQrDataUrl(dataUrl);
      } catch (e) {
        console.error("QR error:", e);
        if (!cancelled) setQrDataUrl("");
      }
    }
    gen();
    return () => {
      cancelled = true;
    };
  }, [shareOpen, shareUrl]);

  // --- Modal UX
  useEffect(() => {
    if (!shareOpen) return;
    const onKey = (e) => e.key === "Escape" && closeShare();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [shareOpen]);

  useEffect(() => {
    if (!shareOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [shareOpen]);

  function noti(text, type = "info") {
    setMsg(text);
    setMsgType(type);
    setTimeout(() => {
      setMsg("");
      setMsgType("");
    }, 2500);
  }

  // --- Permisos (usa ownerId o owner.id si select explícito)
  const isOwnerByRecord = (r) => {
    const sid = session?.user?.id;
    return !!sid && (r.ownerId === sid || r.owner?.id === sid);
  };

  const canDelete = (r) => {
    if (isSuperAdmin) return true;
    if (isOwnerByRecord(r)) {
      return (r._count?.tickets ?? 0) === 0 && (r._count?.participations ?? 0) === 0;
    }
    if (isAdmin) {
      return (r._count?.tickets ?? 0) === 0 && (r._count?.participations ?? 0) === 0;
    }
    return false;
  };

  const canEdit = (r) => {
    if (isAdmin) return true;
    return isOwnerByRecord(r);
  };

  // --- Acciones
  async function handleDelete(id) {
    const raffle = raffles.find((x) => x.id === id);
    if (!raffle) return;
    if (!confirm(`¿Eliminar el sorteo "${raffle.title}"?\nSolo se permite si no hay participantes/tickets.`))
      return;

    setDeletingId(id);
    try {
      const res =
        (await fetch(`/api/admin/raffles/${id}`, { method: "DELETE" }).catch(() => null)) ||
        (await fetch(`/api/raffles/${id}`, { method: "DELETE" }).catch(() => null)) ||
        (await fetch(`/api/raffles?id=${id}`, { method: "DELETE" }).catch(() => null));

      if (!res || !res.ok) {
        const txt = res ? await res.text() : "Sin respuesta del servidor";
        noti("No se pudo eliminar: " + txt, "error");
        return;
      }
      setRaffles((prev) => prev.filter((r) => r.id !== id));
      noti("Sorteo eliminado", "success");
    } catch (err) {
      console.error(err);
      noti("Error al eliminar sorteo.", "error");
    } finally {
      setDeletingId(null);
    }
  }

  const publicUrlFor = (id) => {
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    return `${origin}/sorteo/${id}`;
  };

  function handleEdit(id) {
    router.push(`/admin/raffles/${id}`);
  }

  async function handleShare(r) {
    const url = publicUrlFor(r.id);
    const title = r.title || "Sorteo";
    const text = `¡Mirá mi sorteo "${title}"!`;
    try {
      if (navigator.share) {
        await navigator.share({ title, text, url });
        const c = incCopyCount(r.id);
        setCopyCount(c);
        noti("¡Enlace compartido!", "success");
        // Si no querés abrir el modal después del share nativo, borrá la línea siguiente:
        openShareModal(r, url);
        return;
      }
    } catch (e) {
      console.warn("Fallback a modal de compartir:", e);
    }
    openShareModal(r, url);
  }

  function openShareModal(r, url) {
    setShareRaffle(r);
    setShareUrl(url);
    setCopyCount(loadCopyCount(r.id));
    setShareOpen(true);
  }

  async function copyLink() {
    if (!shareRaffle || !shareUrl) return;
    setCopying(true);
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(shareUrl);
      } else {
        const el = document.createElement("input");
        el.value = shareUrl;
        document.body.appendChild(el);
        el.select();
        document.execCommand("copy");
        el.remove();
      }
      const c = incCopyCount(shareRaffle.id);
      setCopyCount(c);
      noti("Enlace copiado al portapapeles", "success");
    } catch (e) {
      console.error(e);
      noti("No se pudo copiar el enlace", "error");
    } finally {
      setCopying(false);
    }
  }

  function downloadQR() {
    if (!qrDataUrl) return;
    const a = document.createElement("a");
    a.href = qrDataUrl;
    a.download = `qr-${shareRaffle?.id || "sorteo"}.png`;
    a.click();
  }

  function closeShare() {
    setShareOpen(false);
    setShareRaffle(null);
    setShareUrl("");
    setQrDataUrl("");
    setCopying(false);
  }

  const clearImpersonation = () => {
    router.push(pathname); // Quitar parámetros de impersonación de la URL
  };

  if (loading)
    return (
      <div className="min-h-screen bg-gradient-to-br from-indigo-50 to-purple-50 flex items-center justify-center p-4">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-indigo-600 mx-auto mb-4"></div>
          <h2 className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-indigo-600 to-purple-600">
            Cargando tus sorteos...
          </h2>
        </div>
      </div>
    );

  if (error)
    return (
      <div className="min-h-screen bg-gradient-to-br from-red-50 to-pink-50 flex items-center justify-center p-4">
        <div className="text-center max-w-md">
          <div className="bg-red-100 border-l-4 border-red-500 text-red-700 p-4 rounded-lg mb-4">
            <div className="flex">
              <div className="ml-3">
                <p className="font-medium">Error</p>
                <p>{error}</p>
              </div>
            </div>
          </div>
          <button
            onClick={() => window.location.reload()}
            className="px-4 py-2 bg-gradient-to-r from-red-500 to-pink-500 text-white rounded-lg hover:from-red-600 hover:to-pink-600 transition-all transform hover:scale-105 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500"
          >
            Reintentar
          </button>
        </div>
      </div>
    );

  return (
    <>
      <style jsx global>{`
        @keyframes modalEnter {
          0% {
            opacity: 0;
            transform: translateY(30px) scale(0.95);
          }
          60% {
            transform: translateY(-10px) scale(1.02);
          }
          100% {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }
        @keyframes fadeIn {
          from {
            opacity: 0;
          }
          to {
            opacity: 1;
          }
        }
        .animate-modal-enter {
          animation: modalEnter 300ms cubic-bezier(0.175, 0.885, 0.32, 1.275);
        }
        .animate-fadeIn {
          animation: fadeIn 200ms ease-out;
        }
      `}</style>

      <div className="min-h-screen bg-gradient-to-br from-indigo-50 to-purple-50 py-8 px-4 sm:px-6 lg:px-8">
        <div className="max-w-4xl mx-auto">
          {/* Header */}
          <div className="relative mb-4 bg-white/80 backdrop-blur-lg rounded-2xl shadow-xl overflow-hidden border border-white/20">
            <div className="absolute inset-0 bg-gradient-to-r from-indigo-500/10 to-purple-500/10"></div>
            <div className="relative flex items-center justify-between p-6">
              <div>
                <h1 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-indigo-600 to-purple-700">
                  Mis Sorteos
                </h1>
                <p className="text-gray-600 mt-1">
                  {isSuperAdmin && asUser
                    ? "Viendo los sorteos del perfil seleccionado (incluye privados)"
                    : "Administra y comparte tus sorteos"}
                </p>
              </div>
              <button
                onClick={() => router.push("/admin/crear-sorteo")}
                className="group relative px-6 py-3 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-xl shadow-lg hover:shadow-xl transition-all duration-300 transform hover:scale-[1.02] focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
              >
                <span className="absolute inset-0 bg-gradient-to-r from-indigo-700 to-purple-700 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity"></span>
                <span className="relative flex items-center">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                  </svg>
                  Crear sorteo
                </span>
              </button>
            </div>
          </div>

          {/* Banner de impersonación */}
          {isSuperAdmin && asUser && (
            <div className="mb-6 p-4 bg-blue-50 border border-blue-200 text-blue-800 rounded-xl flex items-center justify-between">
              <div>
                <strong>Viendo como:</strong>{" "}
                <code className="px-1.5 py-0.5 bg-white/70 border border-blue-200 rounded">{asUser}</code>{" "}
                <span className="text-sm">(incluye sorteos privados)</span>
              </div>
              <button
                onClick={clearImpersonation}
                className="px-3 py-1.5 rounded-lg bg-blue-600 text-white text-sm hover:bg-blue-700"
              >
                Quitar
              </button>
            </div>
          )}

          {/* Mensajes */}
          {msg && (
            <div
              className={`mb-6 p-4 rounded-xl border-l-4 transition-all duration-300 transform ${
                msgType === "success"
                  ? "bg-green-50 border-green-500 text-green-700 animate-fadeIn"
                  : msgType === "error"
                  ? "bg-red-50 border-red-500 text-red-600 animate-fadeIn"
                  : "bg-blue-50 border-blue-500 text-blue-700 animate-fadeIn"
              }`}
            >
              <div className="flex">
                <div className="ml-3">
                  <p className="text-sm font-medium">{msg}</p>
                </div>
              </div>
            </div>
          )}

          {/* Lista */}
          {raffles.length === 0 ? (
            <div className="text-center py-12 bg-white/80 backdrop-blur-sm rounded-2xl shadow-lg border border-white/20">
              <div className="text-gray-400 mb-4">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.5}
                    d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"
                  />
                </svg>
              </div>
              <h3 className="text-lg font-medium text-gray-900">No hay sorteos para mostrar</h3>
              <p className="mt-1 text-gray-500">Crea un sorteo para comenzar</p>
              <div className="mt-6">
                <button
                  onClick={() => router.push("/admin/crear-sorteo")}
                  className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition-all transform hover:scale-105"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="-ml-1 mr-2 h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                  </svg>
                  Crear sorteo
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-5">
              {raffles.map((r) => {
                const derivedUnitPrice =
                  typeof r?.unitPrice === "number"
                    ? r.unitPrice
                    : typeof r?.ticketPrice === "number"
                    ? r.ticketPrice
                    : undefined;

                return (
                  <div
                    key={r.id}
                    className="group relative bg-white/80 backdrop-blur-sm rounded-2xl shadow-md hover:shadow-xl transition-all duration-300 transform hover:-translate-y-1 border border-white/20 overflow-hidden"
                  >
                    <div className="absolute inset-0 bg-gradient-to-r from-indigo-50/0 to-purple-50/0 group-hover:from-indigo-50/50 group-hover:to-purple-50/50 transition-all duration-300"></div>
                    <div className="relative p-6">
                      <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <h3 className="text-lg font-bold text-gray-900 truncate group-hover:text-indigo-600 transition-colors">
                              {r.title}
                            </h3>

                            {r.isPrivate === true && (
                              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-800 text-white">
                                Privado
                              </span>
                            )}

                            {r.isFeatured && (
                              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-800">
                                Destacado
                              </span>
                            )}
                          </div>

                          <p className="mt-1 text-gray-600 text-sm line-clamp-2">{r.description}</p>

                          <div className="mt-3 flex flex-wrap gap-3 text-xs">
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full bg-indigo-50 text-indigo-700">
                              <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                              </svg>
                              Tickets: {r._count?.tickets ?? 0}
                            </span>
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full bg-purple-50 text-purple-700">
                              <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth={2}
                                  d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a3 3 0 104.644 0m-4.644 0a3 3 0 114.644 0z"
                                />
                              </svg>
                              Participantes: {r._count?.participations ?? 0}
                            </span>

                            {typeof derivedUnitPrice === "number" && (
                              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700">
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={2}
                                    d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M12 7c1.11 0 2.08.402 2.599 1"
                                  />
                                </svg>
                                Precio: {moneyFmt.format(derivedUnitPrice)}
                              </span>
                            )}

                            {r.endsAt && (
                              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full bg-amber-50 text-amber-700">
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                                Finaliza: {new Date(r.endsAt).toLocaleDateString()}
                              </span>
                            )}
                          </div>
                        </div>

                        <div className="flex flex-col sm:flex-row sm:items-center gap-2 min-w-[200px]">
                          <Link
                            href={`/sorteo/${r.id}`}
                            className="group/view inline-flex items-center justify-center px-4 py-2 border border-gray-300 shadow-sm text-sm font-medium rounded-lg text-gray-700 bg-white hover:bg-gray-50 transition-all duration-200 hover:shadow focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                          >
                            <svg
                              xmlns="http://www.w3.org/2000/svg"
                              className="h-4 w-4 mr-2 text-gray-500 group-hover/view:text-indigo-600 transition-colors"
                              fill="none"
                              viewBox="0 0 24 24"
                              stroke="currentColor"
                            >
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                              />
                            </svg>
                            Ver
                          </Link>

                          {canEdit(r) ? (
                            <button
                              onClick={() => handleEdit(r.id)}
                              className="group/edit inline-flex items-center justify-center px-4 py-2 border border-transparent text-sm font-medium rounded-lg shadow-sm text-white bg-indigo-600 hover:bg-indigo-700 transition-all duration-200 transform hover:scale-[1.02] focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                            >
                              <svg
                                xmlns="http://www.w3.org/2000/svg"
                                className="h-4 w-4 mr-2 text-white/90 group-hover/edit:text-white transition-colors"
                                fill="none"
                                viewBox="0 0 24 24"
                                stroke="currentColor"
                              >
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                              </svg>
                              Editar
                            </button>
                          ) : (
                            <button
                              disabled
                              className="group/edit inline-flex items-center justify-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-lg text-gray-400 bg-gray-50 cursor-not-allowed"
                              title="No tenés permisos para editar este sorteo"
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-2 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                              </svg>
                              Editar
                            </button>
                          )}

                          <button
                            onClick={() => handleShare(r)}
                            className="group/share inline-flex items-center justify-center px-4 py-2 border border-transparent text-sm font-medium rounded-lg shadow-sm text-white bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 transition-all duration-200 transform hover:scale-[1.02] focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-emerald-500"
                            title="Compartir enlace público del sorteo"
                          >
                            <svg
                              xmlns="http://www.w3.org/2000/svg"
                              className="h-4 w-4 mr-2 text-white/90 group-hover/share:text-white transition-colors"
                              fill="none"
                              viewBox="0 0 24 24"
                              stroke="currentColor"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684z"
                              />
                            </svg>
                            Compartir
                          </button>

                          {canDelete(r) ? (
                            <button
                              onClick={() => handleDelete(r.id)}
                              disabled={deletingId === r.id}
                              className={`group/delete inline-flex items-center justify-center px-4 py-2 border border-transparent text-sm font-medium rounded-lg text-white transition-all duration-200 transform hover:scale-[1.02] focus:outline-none focus:ring-2 focus:ring-offset-2 ${
                                deletingId === r.id
                                  ? "bg-gray-400 cursor-not-allowed"
                                  : "bg-gradient-to-r from-rose-500 to-pink-600 hover:from-rose-600 hover:to-pink-700 focus:ring-rose-500"
                              }`}
                            >
                              {deletingId === r.id ? (
                                <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                  <path
                                    className="opacity-75"
                                    fill="currentColor"
                                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                                  ></path>
                                </svg>
                              ) : (
                                <svg
                                  xmlns="http://www.w3.org/2000/svg"
                                  className="h-4 w-4 mr-2 text-white/90 group-hover/delete:text-white transition-colors"
                                  fill="none"
                                  viewBox="0 0 24 24"
                                  stroke="currentColor"
                                >
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                </svg>
                              )}
                              {deletingId === r.id ? "Eliminando..." : "Eliminar"}
                            </button>
                          ) : (
                            <button
                              disabled
                              className="group/delete inline-flex items-center justify-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-lg text-gray-400 bg-gray-50 cursor-not-allowed"
                              title="No se puede eliminar: hay participantes o no tenés permisos"
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-2 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                              </svg>
                              Eliminar
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Modal Compartir */}
          {shareOpen && (
            <div className="fixed inset-0 z-50 overflow-y-auto" aria-modal="true" role="dialog">
              <div className="fixed inset-0 bg-black bg-opacity-50 transition-opacity duration-300" onClick={closeShare}></div>
              <div className="min-h-screen flex items-center justify-center p-4">
                <div className="relative w-full max-w-md transform transition-all duration-300 ease-out">
                  <div className="bg-white rounded-2xl shadow-2xl overflow-hidden">
                    <div className="bg-gradient-to-r from-indigo-600 to-purple-600 p-5">
                      <div className="flex items-start justify-between">
                        <h2 className="text-xl font-bold text-white">Compartir sorteo</h2>
                        <button
                          onClick={closeShare}
                          className="text-white hover:text-indigo-100 transition-colors"
                          aria-label="Cerrar"
                          title="Cerrar"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </div>
                    </div>

                    <div className="p-6">
                      {shareRaffle && (
                        <div className="mb-5">
                          <div className="font-bold text-gray-800 text-lg mb-1">{shareRaffle.title}</div>
                          <div className="text-gray-500 text-sm break-all bg-gray-50 p-3 rounded-lg border border-gray-100">
                            {shareUrl}
                          </div>
                        </div>
                      )}

                      <div className="mb-6 flex justify-center">
                        <div ref={qrWrapRef} className="p-4 bg-white rounded-xl shadow-inner border border-gray-100">
                          {qrDataUrl ? (
                            <Image
                              src={qrDataUrl}
                              alt="QR del sorteo"
                              width={176}
                              height={176}
                              className="object-contain animate-fadeIn"
                              unoptimized
                              priority
                            />
                          ) : (
                            <div className="w-44 h-44 flex items-center justify-center border-2 border-dashed border-gray-300 rounded-xl">
                              <div className="text-center">
                                <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-indigo-500 mx-auto mb-2"></div>
                                <span className="text-sm text-gray-500">Generando QR</span>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="grid grid-cols-1 gap-3 mb-5">
                        <button
                          onClick={copyLink}
                          disabled={copying || !shareUrl}
                          className={`w-full py-3 px-4 rounded-xl font-medium transition-all duration-200 transform hover:scale-[1.02] focus:outline-none focus:ring-2 focus:ring-offset-2 ${
                            copying
                              ? "bg-gray-300 text-gray-600 cursor-not-allowed"
                              : "bg-indigo-600 text-white hover:bg-indigo-700 focus:ring-indigo-500"
                          }`}
                        >
                          {copying ? (
                            <span className="flex items-center justify-center">
                              <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                <path
                                  className="opacity-75"
                                  fill="currentColor"
                                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                                ></path>
                              </svg>
                              Copiando...
                            </span>
                          ) : (
                            <span className="flex items-center justify-center">
                              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 11h8" />
                              </svg>
                              Copiar enlace
                            </span>
                          )}
                        </button>

                        <a
                          href={shareUrl || "#"}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="w-full py-3 px-4 rounded-xl font-medium text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 transition-all duration-200 text-center"
                        >
                          <span className="flex items-center justify-center">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2 2 2 0 00-2-2h-1l-4-4a.5.5 0 00-.707 0l-4 4V8a.5.5 0 00.707-.707L9 6.593V6z"
                              />
                            </svg>
                            Abrir enlace
                          </span>
                        </a>

                        <button
                          onClick={downloadQR}
                          disabled={!qrDataUrl}
                          className={`w-full py-3 px-4 rounded-xl font-medium transition-all duration-200 text-center ${
                            qrDataUrl
                              ? "text-purple-700 bg-purple-50 hover:bg-purple-100 border border-purple-200"
                              : "text-gray-400 bg-gray-50 border border-gray-200 cursor-not-allowed"
                          }`}
                        >
                          <span className="flex items-center justify-center">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                            </svg>
                            Descargar QR
                          </span>
                        </button>
                      </div>

                      {shareUrl && (
                        <div className="mt-4">
                          <div className="text-sm text-gray-600 mb-2">Compartir en:</div>
                          {(() => {
                            const links = getShareLinks({ url: shareUrl, title: shareRaffle?.title || "Sorteo" });
                            return (
                              <div className="flex flex-wrap gap-2">
                                <a href={links.whatsapp} target="_blank" rel="noopener noreferrer" className="px-3 py-2 text-sm rounded bg-green-600 text-white hover:bg-green-700 transition-colors">
                                  WhatsApp
                                </a>
                                <a href={links.facebook} target="_blank" rel="noopener noreferrer" className="px-3 py-2 text-sm rounded bg-blue-600 text-white hover:bg-blue-700 transition-colors">
                                  Facebook
                                </a>
                                <a href={links.x} target="_blank" rel="noopener noreferrer" className="px-3 py-2 text-sm rounded bg-black text-white hover:bg-gray-800 transition-colors">
                                  X
                                </a>
                                <a href={links.telegram} target="_blank" rel="noopener noreferrer" className="px-3 py-2 text-sm rounded bg-cyan-600 text-white hover:bg-cyan-700 transition-colors">
                                  Telegram
                                </a>
                                <a href={links.email} className="px-3 py-2 text-sm rounded bg-gray-100 text-gray-800 border hover:bg-gray-200 transition-colors">
                                  Email
                                </a>
                              </div>
                            );
                          })()}
                        </div>
                      )}

                      <div className="text-center py-3 bg-gray-50 rounded-lg border border-gray-100 mt-4">
                        <div className="text-sm text-gray-600">
                          Copias del enlace:{" "}
                          <span className="font-bold text-indigo-600 transition-all duration-300 hover:scale-105 inline-block">
                            {copyCount}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
