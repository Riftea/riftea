// src/app/sorteo/[id]/page.js
"use client";

import { use, useEffect, useMemo, useState, useCallback } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import ProgressBar from "@/components/raffle/ProgressBar";
import ParticipateModal from "@/components/raffle/ParticipateModal";

export default function SorteoPage({ params }) {
  const { id } = use(params);
  const { data: session } = useSession();
  const router = useRouter();

  const [raffle, setRaffle] = useState(null);
  const [participants, setParticipants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [participantsLoading, setParticipantsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [showParticipateModal, setShowParticipateModal] = useState(false);
  const [userParticipation, setUserParticipation] = useState(null);

  // ⏱️ reloj local para countdown
  const [nowTs, setNowTs] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNowTs(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  // Precio unitario derivado del endpoint (NUNCA DB)
  const unitPrice = useMemo(() => {
    if (!raffle) return 0;
    const n = Number(raffle.unitPrice ?? raffle?.meta?.ticketPrice ?? 0);
    return Number.isFinite(n) ? n : 0;
  }, [raffle]);

  // GET participantes
  const loadParticipants = useCallback(
    async (raffleId = id) => {
      try {
        setParticipantsLoading(true);
        const res = await fetch(`/api/raffles/${raffleId}/participate`, {
          cache: "no-store",
        });
        if (!res.ok) {
          setParticipants([]);
          return;
        }
        const data = await res.json().catch(() => ({}));
        setParticipants(Array.isArray(data.participants) ? data.participants : []);
      } catch {
        setParticipants([]);
      } finally {
        setParticipantsLoading(false);
      }
    },
    [id]
  );

  // ¿ya participa el usuario?
  const checkUserParticipation = useCallback(
    async (raffleId) => {
      if (!session?.user?.email || !raffleId) return;
      try {
        const res = await fetch("/api/tickets/my", { cache: "no-store" });
        if (!res.ok) return;
        const data = await res.json().catch(() => ({}));
        const list = Array.isArray(data) ? data : data.tickets || data.data || [];
        const participation = list.find(
          (t) => t.raffleId === raffleId && (t.status === "IN_RAFFLE" || t.status === "ACTIVE")
        );
        setUserParticipation(participation || null);
      } catch {
        /* noop */
      }
    },
    [session?.user?.email]
  );

  // Cargar sorteo
  useEffect(() => {
    let mounted = true;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/raffles/${id}`, { cache: "no-store" });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(json?.error || `Error ${res.status}`);
        }
        const raffleObj = json?.raffle ?? json;
        const merged = {
          ...raffleObj,
          unitPrice: raffleObj?.unitPrice ?? json?.meta?.ticketPrice ?? 0,
        };
        if (!mounted) return;
        setRaffle(merged);
        loadParticipants(merged?.id || id);
        if (session) checkUserParticipation(merged?.id || id);
      } catch (e) {
        if (mounted) setError(e.message || "Error al cargar el sorteo");
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [id, session, loadParticipants, checkUserParticipation]);

  // Polling de participantes mientras esté abierto
  useEffect(() => {
    if (!raffle?.id) return;
    if (!["ACTIVE", "PUBLISHED"].includes(raffle.status)) return;
    const t = setInterval(() => loadParticipants(raffle.id), 10000);
    return () => clearInterval(t);
  }, [raffle?.id, raffle?.status, loadParticipants]);

  // Derivados de estado
  const isOwner = session?.user?.id === raffle?.ownerId;
  const isExpired = raffle?.endsAt ? new Date() > new Date(raffle.endsAt) : false;

  // Participar: sólo ACTIVE/PUBLISHED, no owner, y no cuando READY_TO_DRAW/FINISHED
  const canPurchase =
    !!raffle && !isExpired && (raffle.status === "ACTIVE" || raffle.status === "PUBLISHED") && raffle.publishedAt;
  const canParticipate = canPurchase && !isOwner && !userParticipation;

  const participationsCount = useMemo(
    () => Number(raffle?.stats?.participationsCount ?? participants.length ?? 0),
    [raffle?.stats?.participationsCount, participants.length]
  );
  const maxParticipants = raffle?.stats?.maxParticipants ?? raffle?.maxParticipants ?? null;

  // ⏳ draw / countdown
  const drawAtDate = raffle?.drawAt ? new Date(raffle.drawAt) : null;
  const drawnAtDate = raffle?.drawnAt ? new Date(raffle.drawnAt) : null;
  const isReadyToDraw = raffle?.status === "READY_TO_DRAW";
  const msUntilDraw = drawAtDate ? drawAtDate.getTime() - nowTs : null;
  const minutesUntilDraw = msUntilDraw != null ? Math.max(0, Math.ceil(msUntilDraw / 60000)) : null;

  // Mostrar callout si está programado y aún no ejecutado
  const showDrawCallout = isReadyToDraw && !!drawAtDate && !drawnAtDate;

  const canGoLive = isReadyToDraw && !!drawAtDate && nowTs >= drawAtDate.getTime();
  const goLive = () => router.push(`/sorteo/${id}/en-vivo`);

  // Ganador (FINISHED)
  const winnerParticipation = useMemo(
    () => participants.find((p) => p.isWinner) || null,
    [participants]
  );

  const getOwnerImage = () => {
    if (raffle?.ownerImage) return raffle.ownerImage;
    if (raffle?.owner?.image) return raffle.owner.image;
    return "/favicon.ico";
  };

  // Handler de éxito del modal (refresca lista)
  const handleParticipationSuccess = (payload) => {
    setShowParticipateModal(false);
    setUserParticipation((prev) => ({
      ...(prev || {}),
      raffleId: id,
      ticketCode: payload?.participation?.ticketCode || payload?.ticketCode,
      status: "IN_RAFFLE",
    }));
    loadParticipants();
  };

  // UI: loading / error
  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-900 via-blue-900 to-indigo-900 pt-20">
        <div className="container mx-auto px-4 py-8">
          <div className="animate-pulse">
            <div className="h-8 bg-white/20 rounded w-1/3 mb-6"></div>
            <div className="bg-white/10 rounded-3xl p-8 mb-8">
              <div className="h-64 bg-white/20 rounded-2xl mb-6"></div>
              <div className="space-y-4">
                <div className="h-6 bg-white/20 rounded"></div>
                <div className="h-4 bg-white/20 rounded w-3/4"></div>
                <div className="h-4 bg-white/20 rounded w-1/2"></div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (error || !raffle) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-900 via-blue-900 to-indigo-900 pt-20">
        <div className="container mx-auto px-4 py-8">
          <div className="bg-red-500/20 border border-red-500/50 rounded-3xl p-8 text-center">
            <h1 className="text-2xl font-bold text-white mb-4">Sorteo no encontrado</h1>
            <p className="text-white/70 mb-6">{error}</p>
            <div className="flex gap-4 justify-center">
              <button
                onClick={() => window.location.reload()}
                className="px-6 py-3 bg-purple-500 hover:bg-purple-600 text-white rounded-xl transition-colors"
              >
                Reintentar
              </button>
              <Link
                href="/"
                className="inline-block px-6 py-3 bg-white/20 hover:bg-white/30 text-white rounded-xl transition-colors"
              >
                Volver al inicio
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // HH:MM local para banner
  const drawTimeHHMM = drawAtDate
    ? drawAtDate.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    : null;

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-900 via-blue-900 to-indigo-900 pt-20">
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-8">
          <Link
            href="/"
            className="inline-flex items-center text-white/70 hover:text-white mb-4 transition-colors"
          >
            ← Volver a sorteos
          </Link>
          <h1 className="text-4xl font-bold text-white mb-2">{raffle.title}</h1>
          <div className="flex items-center gap-4 text-white/70">
            <span
              className={`px-3 py-1 rounded-full text-sm font-medium ${
                raffle.status === "ACTIVE"
                  ? "bg-green-500/20 text-green-300"
                  : raffle.status === "PUBLISHED"
                  ? "bg-blue-500/20 text-blue-300"
                  : raffle.status === "FINISHED"
                  ? "bg-purple-500/20 text-purple-300"
                  : raffle.status === "READY_TO_DRAW"
                  ? "bg-yellow-500/20 text-yellow-300"
                  : "bg-gray-500/20 text-gray-300"
              }`}
            >
              {raffle.status === "ACTIVE"
                ? "🔥 Activo"
                : raffle.status === "PUBLISHED"
                ? "📢 Publicado"
                : raffle.status === "FINISHED"
                ? "🏆 Finalizado"
                : raffle.status === "READY_TO_DRAW"
                ? "⏳ Listo para sortear"
                : raffle.status}
            </span>
            <span>Por: {raffle.owner?.name || "Anónimo"}</span>
            <span>Creado: {new Date(raffle.createdAt).toLocaleDateString()}</span>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Principal */}
          <div className="lg:col-span-2">
            {/* READY_TO_DRAW → banner + countdown + CTA */}
            {showDrawCallout && (
              <div className="bg-yellow-500/20 border border-yellow-500/50 rounded-2xl p-5 mb-6">
                <div className="flex items-center gap-3 text-yellow-200">
                  <span className="text-2xl">🕒</span>
                  <div className="flex-1">
                    <p className="font-semibold">
                      El sorteo se realizará a las <b>{drawTimeHHMM}</b>{" "}
                      ({minutesUntilDraw > 0 ? `en ${minutesUntilDraw} min.` : "en instantes"}).
                    </p>
                    <p className="text-sm opacity-80">Programado para: {drawAtDate.toLocaleString()}</p>
                  </div>
                  <button
                    onClick={goLive}
                    disabled={!canGoLive}
                    className={`px-4 py-2 rounded-xl font-bold transition-all ${
                      canGoLive
                        ? "bg-yellow-500 hover:bg-yellow-600 text-black"
                        : "bg-white/10 text-white/60 cursor-not-allowed"
                    }`}
                  >
                    Ir al sorteo →
                  </button>
                </div>
              </div>
            )}

            {/* Imagen + descripción */}
            <div className="bg-white/10 backdrop-blur-lg rounded-3xl p-8 mb-8 border border-white/20">
              {raffle.imageUrl && (
                <div className="mb-6">
                  <Image
                    src={raffle.imageUrl}
                    alt={raffle.title}
                    width={1200}
                    height={675}
                    className="w-full aspect-[16/9] object-cover rounded-2xl"
                    onError={(e) => {
                      e.currentTarget.style.display = "none";
                    }}
                  />
                </div>
              )}
              <div className="prose prose-invert max-w-none">
                <p className="text-white/90 text-lg leading-relaxed">
                  {raffle.description || "Sin descripción disponible"}
                </p>
              </div>
            </div>

            {/* Barra de progreso por PARTICIPACIONES */}
            {Number.isFinite(maxParticipants) && maxParticipants > 0 && (
              <div className="mb-8">
                <ProgressBar
                  current={Number(participationsCount) || 0}
                  target={Number(maxParticipants)}
                  title="Progreso de participantes (tickets aplicados)"
                  animated
                />
              </div>
            )}

            {/* FINISHED → Ganador */}
            {raffle.status === "FINISHED" && winnerParticipation && (
              <div className="bg-amber-500/20 border border-amber-500/40 rounded-2xl p-6 mb-8 text-center">
                <div className="text-5xl mb-2">🏆</div>
                <h3 className="text-2xl font-bold text-white">Ganador</h3>
                <p className="mt-2 text-white/90">
                  {winnerParticipation.user?.name || "Usuario"} —{" "}
                  <span className="font-mono">
                    {winnerParticipation.ticket?.code ||
                      winnerParticipation.ticketCode ||
                      winnerParticipation.id?.slice(0, 6)}
                  </span>
                </p>
                <Link
                  href={`/sorteo/${id}/en-vivo`}
                  className="inline-block mt-3 text-amber-300 hover:underline"
                >
                  Ver resultados →
                </Link>
              </div>
            )}

            {/* Lista de participantes (opcional) */}
            {participants.length > 0 && (
              <div className="bg-white/10 backdrop-blur-lg rounded-3xl p-6 border border-white/20 mb-8">
                <div className="flex justify-between items-center mb-4">
                  <h3 className="text-xl font-bold text-white">
                    Participaciones ({participants.length})
                  </h3>
                  <button
                    onClick={() => loadParticipants()}
                    disabled={participantsLoading}
                    className="px-3 py-1 bg-white/20 hover:bg-white/30 text-white text-sm rounded-lg transition-colors disabled:opacity-50"
                  >
                    {participantsLoading ? "🔄" : "🔄 Actualizar"}
                  </button>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 max-h-60 overflow-y-auto">
                  {participants.map((p, i) => (
                    <div
                      key={p.id || i}
                      className={`p-3 rounded-xl border ${
                        p.isWinner ? "bg-yellow-500/20 border-yellow-500/50" : "bg-white/5 border-white/20"
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 bg-gradient-to-r from-purple-500 to-pink-500 rounded-full flex items-center justify-center text-white text-sm font-bold">
                          {p.isWinner ? "👑" : i + 1}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-white font-medium truncate">
                            {p.user?.name || p.name || "Usuario"}
                          </div>
                          <div className="text-white/60 text-xs font-mono">
                            {p.ticket?.code || p.ticketCode || "Código oculto"}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Organizador */}
            {raffle.owner && (
              <div className="bg-white/10 backdrop-blur-lg rounded-3xl p-6 border border-white/20">
                <h3 className="text-xl font-bold text-white mb-4">Organizador</h3>
                <div className="flex items-center gap-4">
                  <Image
                    src={getOwnerImage()}
                    alt={raffle.owner.name || "Usuario"}
                    width={48}
                    height={48}
                    className="rounded-full border-2 border-white/20"
                    onError={(e) => {
                      e.currentTarget.src = "/favicon.ico";
                    }}
                  />
                  <div>
                    <p className="text-white font-medium">{raffle.owner.name}</p>
                    <p className="text-white/70 text-sm">Organizador verificado</p>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Sidebar */}
          <div className="lg:col-span-1">
            <div className="bg-white/10 backdrop-blur-lg rounded-3xl p-6 border border-white/20 sticky top-24">
              {/* Precio (informativo) — sólo si > 0 */}
              {unitPrice > 0 && (
                <div className="text-center mb-6">
                  <div className="text-4xl font-bold text-white mb-2">${unitPrice}</div>
                  <div className="text-white/70">por ticket</div>
                </div>
              )}

              {/* Stats simples */}
              <div className="grid grid-cols-2 gap-4 mb-6">
                <div className="text-center p-3 bg-white/5 rounded-xl">
                  <div className="text-2xl font-bold text-white">{participationsCount}</div>
                  <div className="text-sm text-white/70">Participaciones</div>
                </div>
                <div className="text-center p-3 bg-white/5 rounded-xl">
                  <div className="text-2xl font-bold text-white">{maxParticipants ?? "∞"}</div>
                  <div className="text-sm text-white/70">Máximo</div>
                </div>
              </div>

              {/* Fecha fin (opcional) */}
              {raffle.endsAt && (
                <div className="mb-6 text-center">
                  <div className="text-white/70 text-sm mb-1">Finaliza:</div>
                  <div className={`font-medium ${isExpired ? "text-red-400" : "text-white"}`}>
                    {new Date(raffle.endsAt).toLocaleString()}
                  </div>
                  {isExpired && <div className="text-red-400 text-sm mt-1">¡Sorteo expirado!</div>}
                </div>
              )}

              {/* READY_TO_DRAW → bloque CTA */}
              {showDrawCallout && (
                <div className="mb-6 bg-yellow-500/20 border border-yellow-500/50 rounded-xl p-4 text-center">
                  <p className="text-yellow-300 font-bold mb-1">
                    Se realizará a las <b>{drawTimeHHMM}</b>{" "}
                    ({minutesUntilDraw > 0 ? `en ${minutesUntilDraw} min.` : "en instantes"})
                  </p>
                  <button
                    onClick={goLive}
                    disabled={!canGoLive}
                    className={`w-full py-3 rounded-xl font-bold transition-all ${
                      canGoLive
                        ? "bg-yellow-500 hover:bg-yellow-600 text-black"
                        : "bg-white/10 text-white/60 cursor-not-allowed"
                    }`}
                  >
                    Ir al sorteo →
                  </button>
                </div>
              )}

              {/* Estado usuario */}
              {session && userParticipation && raffle.status !== "FINISHED" && (
                <div className="mb-6 bg-green-500/20 border border-green-500/50 rounded-xl p-4 text-center">
                  <p className="text-green-300 font-bold mb-1">¡Ya estás participando!</p>
                  <p className="text-green-200/80 text-sm">
                    Ticket: {userParticipation.ticketCode || userParticipation.code || "Código oculto"}
                  </p>
                </div>
              )}

              {/* Participar con ticket → sólo ACTIVE/PUBLISHED (no READY_TO_DRAW/FINISHED) */}
              {session && canParticipate && !showDrawCallout && raffle.status !== "FINISHED" && (
                <div className="mb-4">
                  <button
                    onClick={() => setShowParticipateModal(true)}
                    className="w-full py-3 bg-gradient-to-r from-green-500 to-teal-500 hover:from-green-600 hover:to-teal-600 text-white font-bold rounded-xl shadow-lg hover:shadow-xl transform hover:scale-105 transition-all duration-200"
                  >
                    🎯 Participar con Ticket
                  </button>
                  <p className="text-white/60 text-xs text-center mt-2">
                    Usa uno de tus tickets disponibles para participar
                  </p>
                </div>
              )}

              {/* Mensajes */}
              {isOwner && (
                <div className="bg-blue-500/20 border border-blue-500/50 rounded-xl p-4 text-center">
                  <p className="text-blue-300 text-sm">👑 Eres el organizador de este sorteo</p>
                  <Link
                    href={`/admin/raffles/${id}`}
                    className="inline-block mt-2 text-blue-400 hover:underline text-sm"
                  >
                    Administrar sorteo →
                  </Link>
                </div>
              )}

              {!canPurchase && !isOwner && raffle.status !== "READY_TO_DRAW" && raffle.status !== "FINISHED" && (
                <div className="mt-4 bg-yellow-500/20 border border-yellow-500/50 rounded-xl p-4 text-center">
                  <p className="text-yellow-300 text-sm">Este sorteo no está disponible</p>
                </div>
              )}

              {!session && (
                <button
                  onClick={() => router.push("/auth/signin")}
                  className="w-full mt-4 py-3 bg-white/20 hover:bg-white/30 text-white font-bold rounded-xl transition-colors"
                >
                  Iniciar sesión para participar
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Modal de participación (multi-selección) */}
      <ParticipateModal
        isOpen={showParticipateModal}
        onClose={() => setShowParticipateModal(false)}
        raffle={raffle}
        onSuccess={handleParticipationSuccess}
      />
    </div>
  );
}
