// src/app/sorteo/[id]/page.js
"use client";

import { use, useEffect, useMemo, useState, useCallback } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import ProgressBar from "@/components/raffle/ProgressBar";
import ParticipateModal from "@/components/raffle/ParticipateModal";
import CountdownTimer from "@/components/ui/CountdownTimer";

/* ======================= Helpers ======================= */

function parseMinFromDescription(desc = "") {
  // Soporta texto "Mínimo de tickets por participante: X" (sugerido)
  const m1 = String(desc).match(/Mínimo de tickets por participante:\s*(\d+)/i);
  if (m1) return { min: Math.max(1, parseInt(m1[1], 10)), mandatory: false };

  // Soporta texto "Cada participante debe comprar al menos X ticket(s)." (obligatorio)
  const m2 = String(desc).match(/Cada participante debe comprar al menos\s*(\d+)/i);
  if (m2) return { min: Math.max(1, parseInt(m2[1], 10)), mandatory: true };

  return { min: 1, mandatory: false };
}

function pickNumber(...cands) {
  for (const v of cands) {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function toNum(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function deepCountAll(obj) {
  return (
    toNum(obj?._count?._all) ??
    toNum(obj?._count?.participations) ??
    toNum(obj?.count?.all) ??
    toNum(obj?.count) ??
    toNum(obj?.total) ??
    null
  );
}

function extractProgressPayload(raw) {
  const list =
    (Array.isArray(raw?.participants) && raw.participants) ||
    (Array.isArray(raw?.data) && raw.data) ||
    (Array.isArray(raw?.items) && raw.items) ||
    (Array.isArray(raw) ? raw : []);

  const applied =
    toNum(raw?.stats?.participationsCount) ??
    toNum(raw?.stats?.totalParticipations) ??
    toNum(raw?.participationsCount) ??
    toNum(raw?.totalParticipations) ??
    deepCountAll(raw) ??
    toNum(raw?.applied) ??
    (Array.isArray(list) ? list.length : null) ??
    0;

  const max =
    toNum(raw?.stats?.maxParticipants) ??
    toNum(raw?.maxParticipants) ??
    toNum(raw?.stats?.capacity) ??
    toNum(raw?.capacity) ??
    toNum(raw?.max) ??
    toNum(raw?.limit) ??
    toNum(raw?.target) ??
    toNum(raw?.goal) ??
    null;

  return { list: Array.isArray(list) ? list : [], applied, max };
}

/* ======================= Storage Helpers ======================= */

function getStorageKey(id, suffix) {
  return `raffle_${suffix}_${id}`;
}

function saveGoalData(id, timestamp, drawTime) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(getStorageKey(id, 'goal_timestamp'), timestamp);
    localStorage.setItem(getStorageKey(id, 'draw_time'), drawTime);
  } catch (e) {
    console.warn('No se pudo guardar en localStorage:', e);
  }
}

function getGoalData(id) {
  if (typeof window === 'undefined') return { timestamp: null, drawTime: null };
  try {
    const timestamp = localStorage.getItem(getStorageKey(id, 'goal_timestamp'));
    const drawTime = localStorage.getItem(getStorageKey(id, 'draw_time'));
    return { 
      timestamp: timestamp ? new Date(timestamp) : null,
      drawTime: drawTime ? new Date(drawTime) : null
    };
  } catch (e) {
    return { timestamp: null, drawTime: null };
  }
}

function clearGoalData(id) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(getStorageKey(id, 'goal_timestamp'));
    localStorage.removeItem(getStorageKey(id, 'draw_time'));
  } catch (e) {
    console.warn('No se pudo limpiar localStorage:', e);
  }
}

/* ======================= Page ======================= */

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

  // Estados para detección de meta alcanzada
  const [showGoalReached, setShowGoalReached] = useState(false);
  const [previousParticipantsCount, setPreviousParticipantsCount] = useState(0);
  const [notificationsSent, setNotificationsSent] = useState(false);
  const [drawCountdownTarget, setDrawCountdownTarget] = useState(null);
  const [goalReachedTimestamp, setGoalReachedTimestamp] = useState(null);

  const [nowTs, setNowTs] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNowTs(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const unitPrice = useMemo(() => {
    if (!raffle) return 0;
    const n = Number(raffle.unitPrice ?? raffle?.meta?.ticketPrice ?? 0);
    return Number.isFinite(n) ? n : 0;
  }, [raffle]);

  // Inicializar datos del localStorage al cargar
  useEffect(() => {
    if (!id) return;
    const { timestamp, drawTime } = getGoalData(id);
    
    if (timestamp && drawTime) {
      setGoalReachedTimestamp(timestamp);
      
      // Solo configurar countdown si aún no ha expirado
      if (drawTime.getTime() > Date.now()) {
        setDrawCountdownTarget(drawTime);
      } else {
        // Si ya expiró, limpiar datos
        clearGoalData(id);
      }
    }
  }, [id]);

  const loadParticipants = useCallback(
    async (raffleId = id) => {
      try {
        setParticipantsLoading(true);
        const res = await fetch(`/api/raffles/${raffleId}/progress`, {
          cache: "no-store",
          credentials: "include",
        });
        const data = await res.json().catch(() => ({}));

        if (!res.ok) {
          setParticipants([]);
          return;
        }

        const { list, applied, max } = extractProgressPayload(data);
        setParticipants(list);

        // Detectar si se alcanzó la meta por primera vez
        if (max && applied >= max && previousParticipantsCount < max && !goalReachedTimestamp) {
          const now = new Date();
          const drawTime = new Date(Date.now() + 1 * 60 * 1000); // 1 minuto
          
          // Guardar en localStorage
          saveGoalData(id, now.toISOString(), drawTime.toISOString());
          
          // Actualizar estados
          setGoalReachedTimestamp(now);
          setDrawCountdownTarget(drawTime);
          setShowGoalReached(true);
          
          // Enviar notificaciones (solo si es el owner)
          if (session?.user?.id === raffle?.ownerId && !notificationsSent) {
            try {
              await fetch(`/api/raffles/${raffleId}/notify-participants`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' }
              });
              setNotificationsSent(true);
            } catch (error) {
              console.error('Error enviando notificaciones:', error);
            }
          }
          
          // Auto-ocultar la notificación después de 8 segundos
          setTimeout(() => setShowGoalReached(false), 8000);
        }
        
        setPreviousParticipantsCount(applied);

      } catch {
        setParticipants([]);
      } finally {
        setParticipantsLoading(false);
      }
    },
    [id, previousParticipantsCount, session?.user?.id, raffle?.ownerId, notificationsSent, goalReachedTimestamp]
  );

  const checkUserParticipation = useCallback(
    async (raffleId) => {
      if (!session?.user?.email || !raffleId) return;
      try {
        const res = await fetch("/api/tickets/my", {
          cache: "no-store",
          credentials: "include",
        });
        if (!res.ok) return;
        const data = await res.json().catch(() => ({}));
        const list = Array.isArray(data) ? data : data.tickets || data.data || [];
        const participation = list.find(
          (t) =>
            t.raffleId === raffleId &&
            (t.status === "IN_RAFFLE" || t.status === "ACTIVE")
        );
        setUserParticipation(participation || null);
      } catch {
        /* noop */
      }
    },
    [session?.user?.email]
  );

  useEffect(() => {
    let mounted = true;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/raffles/${id}`, {
          cache: "no-store",
          credentials: "include",
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) {
          // Solo mostrar error si es un problema real, no de estado
          if (res.status === 404) {
            throw new Error("Sorteo no encontrado");
          } else if (res.status >= 500) {
            throw new Error("Error del servidor");
          }
          // Para otros códigos, intentar usar la data existente
        }
        
        const raffleObj = json?.raffle ?? json;
        const merged = {
          ...raffleObj,
          unitPrice: raffleObj?.unitPrice ?? json?.meta?.ticketPrice ?? 0,
        };
        
        if (!mounted) return;
        setRaffle(merged);

        await loadParticipants(merged?.id || id);
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

  // Polling más frecuente cuando está cerca de la meta
  useEffect(() => {
    if (!raffle?.id) return;
    if (!["ACTIVE", "PUBLISHED"].includes(raffle.status)) return;
    
    // Calcular frecuencia de polling basada en proximidad a la meta
    const currentCount = participants.length;
    const maxCount = raffle.maxParticipants;
    
    let pollInterval = 10000; // 10s por defecto
    
    if (maxCount) {
      const remainingSlots = maxCount - currentCount;
      if (remainingSlots <= 5) {
        pollInterval = 2000; // 2s cuando quedan 5 o menos
      } else if (remainingSlots <= 10) {
        pollInterval = 5000; // 5s cuando quedan 10 o menos
      }
    }
    
    const t = setInterval(() => loadParticipants(raffle.id), pollInterval);
    return () => clearInterval(t);
  }, [raffle?.id, raffle?.status, raffle?.maxParticipants, participants.length, loadParticipants]);

  const isOwner = session?.user?.id === raffle?.ownerId;
  const isExpired = raffle?.endsAt ? new Date() > new Date(raffle.endsAt) : false;

  const canPurchase =
    !!raffle &&
    !isExpired &&
    (raffle.status === "ACTIVE" || raffle.status === "PUBLISHED") &&
    raffle.publishedAt;
  const canParticipate = canPurchase && !isOwner;

  const participantsCount = useMemo(() => {
    if (participants.length) return participants.length;
    return pickNumber(
      raffle?.stats?.participationsCount,
      raffle?.stats?.totalParticipations,
      raffle?._count?.participations
    ) ?? 0;
  }, [participants.length, raffle?.stats, raffle?._count]);

  const maxParticipants = useMemo(() => {
    return pickNumber(
      raffle?.stats?.maxParticipants,
      raffle?.maxParticipants,
      raffle?.stats?.capacity,
      raffle?.capacity
    ) ?? null;
  }, [raffle?.stats, raffle?.maxParticipants, raffle?.capacity]);

  // Verificar si está lleno
  const isFull = maxParticipants && participantsCount >= maxParticipants;

  const drawAtDate = raffle?.drawAt ? new Date(raffle.drawAt) : null;
  const drawnAtDate = raffle?.drawnAt ? new Date(raffle.drawnAt) : null;
  const isReadyToDraw = raffle?.status === "READY_TO_DRAW";
  const msUntilDraw = drawAtDate ? drawAtDate.getTime() - nowTs : null;
  const minutesUntilDraw =
    msUntilDraw != null ? Math.max(0, Math.ceil(msUntilDraw / 60000)) : null;

  const showDrawCallout = isReadyToDraw && !!drawAtDate && !drawnAtDate;
  const canGoLive = isReadyToDraw && !!drawAtDate && nowTs >= drawAtDate.getTime();
  const goLive = () => router.push(`/sorteo/${id}/en-vivo`);

  const winnerParticipation = useMemo(
    () => participants.find((p) => p.isWinner) || null,
    [participants]
  );

  const getOwnerImage = () => {
    if (raffle?.ownerImage) return raffle.ownerImage;
    if (raffle?.owner?.image) return raffle.owner.image;
    return "/favicon.ico";
  };

  // --------- NUEVO: mínimo por usuario (campo > descripción) ----------
  const { minTicketsRequired, minTicketsIsMandatory } = useMemo(() => {
    const fieldMin = Number(raffle?.minTicketsPerParticipant);
    const fieldMandatory = Boolean(raffle?.minTicketsIsMandatory);
    if (Number.isFinite(fieldMin) && fieldMin >= 1) {
      return { minTicketsRequired: fieldMin, minTicketsIsMandatory: fieldMandatory };
    }
    const parsed = parseMinFromDescription(raffle?.description || "");
    return { minTicketsRequired: parsed.min, minTicketsIsMandatory: parsed.mandatory };
  }, [raffle?.minTicketsPerParticipant, raffle?.minTicketsIsMandatory, raffle?.description]);

  const [copied, setCopied] = useState(false);
  const doShare = async () => {
    try {
      const url = typeof window !== "undefined" ? window.location.href : "";
      const title = raffle?.title || "Sorteo";
      const text = "¡Sumate a mi sorteo en Rifteá!";
      if (navigator.share) {
        await navigator.share({ title, text, url });
      } else {
        await navigator.clipboard.writeText(`${title} — ${url}`);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }
    } catch {
      /* noop */
    }
  };

  const handleParticipationSuccess = async (payload) => {
    const successes = Array.isArray(payload?.successes) ? payload.successes : [];
    setShowParticipateModal(false);

    if (successes.length > 0) {
      setUserParticipation((prev) => ({
        ...(prev || {}),
        raffleId: id,
        ticketCode:
          successes[0]?.data?.ticketCode ||
          successes[0]?.ticketId?.slice?.(-6) ||
          prev?.ticketCode,
        status: "IN_RAFFLE",
      }));
    }

    await loadParticipants(id);

    try {
      const res = await fetch(`/api/raffles/${id}`, {
        cache: "no-store",
        credentials: "include",
      });
      const json = await res.json().catch(() => ({}));
      if (res.ok) {
        const raffleObj = json?.raffle ?? json;
        setRaffle((r) => ({ ...(r || {}), ...(raffleObj || {}) }));
      }
    } catch {}
  };

  /* ======================= UI ======================= */

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

  // Solo mostrar error si realmente no hay raffle y no es un problema de estado
  if (error && !raffle) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-900 via-blue-900 to-indigo-900 pt-20">
        <div className="container mx-auto px-4 py-8">
          <div className="border rounded-3xl p-8 text-center bg-red-500/20 border-red-500/50">
            <div className="text-6xl mb-4">❌</div>
            <h1 className="text-2xl font-bold text-white mb-4">
              Sorteo no encontrado
            </h1>
            <p className="text-white/70 mb-6">
              {error || "No se pudo cargar la información del sorteo"}
            </p>
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

  const drawTimeHHMM = drawAtDate
    ? drawAtDate.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    : null;

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-900 via-blue-900 to-indigo-900 pt-20">
      <div className="container mx-auto px-4 py-8">
        {/* Notificación de meta alcanzada */}
        {showGoalReached && (
          <div className="fixed top-4 right-4 z-50 animate-bounce">
            <div className="bg-gradient-to-r from-green-500 to-emerald-500 text-white p-4 rounded-2xl shadow-2xl border border-green-400 max-w-sm">
              <div className="flex items-center gap-3">
                <div className="text-3xl">🎯</div>
                <div>
                  <div className="font-bold text-lg">¡Meta Alcanzada!</div>
                  <div className="text-sm opacity-90">
                    El sorteo se ejecutará automáticamente
                  </div>
                  {drawCountdownTarget && (
                    <div className="mt-1 bg-white/20 px-2 py-1 rounded text-xs font-mono">
                      <CountdownTimer 
                        endsAt={drawCountdownTarget}
                        mode="draw"
                        compact={true}
                        onExpire={() => {
                          clearGoalData(id);
                          router.push(`/sorteo/${id}/en-vivo`)
                        }}
                      />
                    </div>
                  )}
                </div>
              </div>
              <div className="mt-3 flex gap-2">
                <button
                  onClick={() => router.push(`/sorteo/${id}/en-vivo`)}
                  className="flex-1 bg-white/20 hover:bg-white/30 px-3 py-2 rounded-lg text-sm font-medium transition-colors"
                >
                  Ver sorteo en vivo
                </button>
                <button
                  onClick={() => setShowGoalReached(false)}
                  className="px-3 py-2 bg-white/10 hover:bg-white/20 rounded-lg text-sm"
                >
                  ×
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-3">
            <Link
              href="/"
              className="inline-flex items-center text-white/70 hover:text-white transition-colors"
            >
              ← Volver a sorteos
            </Link>

            <div className="flex items-center gap-2">
              <button
                onClick={doShare}
                className="px-3 py-2 bg-white/20 hover:bg-white/30 text-white text-sm rounded-lg transition-colors"
                title="Compartir"
              >
                {copied ? "¡Copiado!" : "Compartir"}
              </button>
              {session?.user?.id === raffle?.ownerId && (
                <Link
                  href={`/admin/raffles/${id}`}
                  className="px-3 py-2 bg-white/10 hover:bg-white/20 text-white text-sm rounded-lg transition-colors"
                >
                  Administrar
                </Link>
              )}
            </div>
          </div>

          <h1 className="text-4xl font-bold text-white mb-2">{raffle?.title}</h1>
          <div className="flex flex-wrap items-center gap-3 text-white/70">
            <span
              className={`px-3 py-1 rounded-full text-sm font-medium ${
                raffle?.status === "ACTIVE" || (raffle?.status === "ACTIVE" && isFull)
                  ? isFull 
                    ? "bg-green-500/20 text-green-300"
                    : "bg-green-500/20 text-green-300"
                  : raffle?.status === "PUBLISHED"
                  ? "bg-blue-500/20 text-blue-300"
                  : raffle?.status === "FINISHED"
                  ? "bg-purple-500/20 text-purple-300"
                  : raffle?.status === "READY_TO_DRAW"
                  ? "bg-yellow-500/20 text-yellow-300"
                  : "bg-gray-500/20 text-gray-300"
              }`}
            >
              {raffle?.status === "ACTIVE" && isFull
                ? "🎯 Meta alcanzada"
                : raffle?.status === "ACTIVE"
                ? "🔥 Activo"
                : raffle?.status === "PUBLISHED"
                ? "📢 Publicado"
                : raffle?.status === "FINISHED"
                ? "🏆 Finalizado"
                : raffle?.status === "READY_TO_DRAW"
                ? "⏳ Listo para sortear"
                : raffle?.status}
            </span>
            <span>Por: {raffle?.owner?.name || "Anónimo"}</span>
            <span>Creado: {new Date(raffle?.createdAt).toLocaleDateString()}</span>
            {goalReachedTimestamp && (
              <span className="bg-green-500/20 px-2 py-1 rounded text-xs">
                Meta alcanzada: {goalReachedTimestamp.toLocaleString()}
              </span>
            )}
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

            {/* Banner cuando está lleno pero aún no es READY_TO_DRAW */}
            {isFull && raffle?.status === "ACTIVE" && !showDrawCallout && (
              <div className="bg-green-500/20 border border-green-500/50 rounded-2xl p-5 mb-6">
                <div className="flex items-center gap-3 text-green-200">
                  <span className="text-2xl">🎯</span>
                  <div className="flex-1">
                    <p className="font-semibold">¡Meta alcanzada!</p>
                    <p className="text-sm opacity-80">
                      Se alcanzó el número máximo de participantes. El sorteo se está preparando...
                    </p>
                    {goalReachedTimestamp && (
                      <p className="text-xs opacity-70 mt-1">
                        Alcanzada el: {goalReachedTimestamp.toLocaleString()}
                      </p>
                    )}
                    {drawCountdownTarget && (
                      <div className="mt-2 flex items-center gap-2">
                        <span className="text-xs">Sorteo en:</span>
                        <div className="bg-white/10 px-2 py-1 rounded font-mono text-sm">
                          <CountdownTimer 
                            endsAt={drawCountdownTarget}
                            mode="draw"
                            compact={true}
                            onExpire={() => {
                              clearGoalData(id);
                              router.push(`/sorteo/${id}/en-vivo`);
                            }}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                  <div className="animate-spin h-6 w-6 border-2 border-green-300 border-t-transparent rounded-full"></div>
                </div>
              </div>
            )}

            {/* Imagen + descripción */}
            <div className="bg-white/10 backdrop-blur-lg rounded-3xl p-8 mb-8 border border-white/20">
              {raffle?.imageUrl && (
                <div className="mb-6">
                  <div className="relative w-full aspect-[16/9]">
                    <Image
                      src={raffle.imageUrl}
                      alt={raffle.title || "Sorteo"}
                      fill
                      className="object-cover rounded-2xl"
                      loader={({ src }) => src}   // passthrough para dominos no configurados
                      unoptimized                 // evita restricción de dominios
                      priority
                    />
                  </div>
                </div>
              )}
              <div className="prose prose-invert max-w-none">
                <p className="text-white/90 text-lg leading-relaxed">
                  {raffle?.description || "Sin descripción disponible"}
                </p>
              </div>
            </div>

            {/* Barra de progreso mejorada */}
            <div className="mb-8">
              <div className="flex justify-between text-xs text-slate-400 mb-2">
                <span>Participantes</span>
                <span>
                  {participantsCount}
                  {maxParticipants ? ` / ${maxParticipants}` : " / ∞"}
                </span>
              </div>
              <ProgressBar
                current={participantsCount}
                target={maxParticipants || Math.max(1, participantsCount)}
                animated
              />
              {/* Indicador visual cuando está lleno */}
              {isFull && (
                <div className="mt-2 text-center">
                  <span className="inline-flex items-center px-3 py-1 rounded-full bg-green-500/20 text-green-300 text-sm font-medium">
                    <span className="w-2 h-2 bg-green-400 rounded-full mr-2 animate-pulse"></span>
                    Cupo completo
                  </span>
                </div>
              )}
            </div>

            {/* FINISHED → Ganador */}
            {raffle?.status === "FINISHED" && winnerParticipation && (
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

            {/* Lista de participantes */}
            <div className="bg-white/10 backdrop-blur-lg rounded-3xl p-6 border border-white/20 mb-8">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-xl font-bold text-white">
                  Participaciones ({participants.length})
                </h3>
                <button
                  onClick={() => loadParticipants()}
                  disabled={participantsLoading}
                  className="px-3 py-2 bg-white/20 hover:bg-white/30 text-white text-sm rounded-lg transition-colors disabled:opacity-50"
                >
                  {participantsLoading ? "🔄" : "🔄 Actualizar"}
                </button>
              </div>
              
              {participants.length > 0 ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 max-h-80 overflow-y-auto">
                  {participants.map((p, i) => (
                    <div
                      key={p.id || i}
                      className={`group rounded-xl border overflow-hidden transition ${
                        p.isWinner 
                          ? "bg-amber-500/20 border-amber-500/50" 
                          : "bg-slate-900/50 border-slate-800 hover:border-slate-700/60"
                      }`}
                    >
                      <div className="p-4">
                        <div className="flex items-center gap-3 mb-2">
                          <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white text-sm font-bold ${
                            p.isWinner ? "bg-amber-500" : "bg-gradient-to-r from-purple-500 to-pink-500"
                          }`}>
                            {p.isWinner ? "👑" : i + 1}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="text-white font-medium truncate">
                              {p.user?.name || p.name || "Usuario"}
                            </div>
                            <div className="text-white/60 text-xs">
                              Participante {p.isWinner ? "ganador" : "activo"}
                            </div>
                          </div>
                        </div>
                        <div className="text-white/70 text-xs font-mono bg-white/5 rounded px-2 py-1">
                          #{p.ticket?.code || p.ticketCode || p.id?.slice(-6) || "Código oculto"}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-12">
                  <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-white/5 flex items-center justify-center">
                    <svg className="w-8 h-8 text-white/40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                    </svg>
                  </div>
                  <h4 className="text-white font-medium mb-2">Aún no hay participantes</h4>
                  <p className="text-white/60 text-sm mb-4">
                    Sé el primero en participar en este sorteo
                  </p>
                  {session && canParticipate && (
                    <button
                      onClick={() => setShowParticipateModal(true)}
                      className="inline-flex items-center px-4 py-2 bg-gradient-to-r from-green-500 to-teal-500 hover:from-green-600 hover:to-teal-600 text-white text-sm font-medium rounded-lg transition-all"
                    >
                      🎯 Participar ahora
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Organizador */}
            {raffle?.owner && (
              <div className="bg-white/10 backdrop-blur-lg rounded-3xl p-6 border border-white/20">
                <h3 className="text-xl font-bold text-white mb-4">Organizador</h3>
                <div className="flex items-center gap-4">
                  <Image
                    src={getOwnerImage()}
                    alt={raffle.owner.name || "Usuario"}
                    width={48}
                    height={48}
                    className="rounded-full border-2 border-white/20 object-cover"
                    loader={({ src }) => src}
                    unoptimized
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
              {unitPrice > 0 && (
                <div className="text-center mb-6">
                  <div className="text-lg text-white/70 mb-1">Tickets recomendados para participar</div>
                  <div className="text-4xl font-bold text-white mb-2">{unitPrice}</div>
                  <div className="text-white/70">por ticket</div>
                </div>
              )}

              {minTicketsRequired > 1 && (
                <div className="mb-4 text-center">
                  <div className="inline-block px-3 py-1 rounded-full bg-white/15 text-white/90 text-sm">
                    {minTicketsIsMandatory ? "Mínimo obligatorio:" : "Mínimo sugerido:"}{" "}
                    <b>{minTicketsRequired}</b> ticket(s)
                  </div>
                </div>
              )}

              {/* Contadores */}
              <div className="grid grid-cols-2 gap-4 mb-6">
                <div className="text-center p-4 bg-white/5 rounded-xl border border-white/10">
                  <div className="text-2xl font-bold text-white">{participantsCount}</div>
                  <div className="text-sm text-white/70">Participaciones</div>
                </div>
                <div className="text-center p-4 bg-white/5 rounded-xl border border-white/10">
                  <div className="text-2xl font-bold text-white">{maxParticipants ?? "∞"}</div>
                  <div className="text-sm text-white/70">Máximo</div>
                </div>
              </div>

              {raffle?.endsAt && (
                <div className="mb-6 text-center">
                  <div className="text-white/70 text-sm mb-1">Finaliza:</div>
                  <div className={`font-medium ${isExpired ? "text-red-400" : "text-white"}`}>
                    {new Date(raffle.endsAt).toLocaleString()}
                  </div>
                  {isExpired && <div className="text-red-400 text-sm mt-1">¡Sorteo expirado!</div>}
                </div>
              )}

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

              {session && userParticipation && raffle?.status !== "FINISHED" && (
                <div className="mb-4 bg-green-500/20 border border-green-500/50 rounded-xl p-4 text-center">
                  <p className="text-green-300 font-bold mb-1">¡Ya estás participando!</p>
                  <p className="text-green-200/80 text-xs">
                    Podés agregar más tickets si querés aumentar tus chances.
                  </p>
                </div>
              )}

              {session && canParticipate && !showDrawCallout && raffle?.status !== "FINISHED" && !isFull && (
                <div className="mb-4">
                  <button
                    onClick={() => setShowParticipateModal(true)}
                    className="w-full py-3 bg-gradient-to-r from-green-500 to-teal-500 hover:from-green-600 hover:to-teal-600 text-white font-bold rounded-xl shadow-lg hover:shadow-xl transform hover:scale-105 transition-all duration-200"
                  >
                    🎯 Participar
                  </button>
                  <p className="text-white/60 text-xs text-center mt-2">
                    Elegí tus tickets disponibles para participar
                  </p>
                </div>
              )}

              {/* Mensaje cuando está lleno */}
              {isFull && !isOwner && (
                <div className="mb-4 bg-yellow-500/20 border border-yellow-500/50 rounded-xl p-4 text-center">
                  <p className="text-yellow-300 font-bold mb-1">Cupo completo</p>
                  <p className="text-yellow-200/80 text-xs">
                    Este sorteo alcanzó su máximo de participantes
                  </p>
                  {drawCountdownTarget && (
                    <div className="mt-2">
                      <div className="text-xs text-yellow-200/80 mb-1">Sorteo en:</div>
                      <div className="bg-white/10 px-2 py-1 rounded font-mono text-sm">
                        <CountdownTimer 
                          endsAt={drawCountdownTarget}
                          mode="draw"
                          compact={true}
                          onExpire={() => {
                            clearGoalData(id);
                            router.push(`/sorteo/${id}/en-vivo`);
                          }}
                        />
                      </div>
                    </div>
                  )}
                </div>
              )}

              {isOwner && (
                <div className="bg-blue-500/20 border border-blue-500/50 rounded-xl p-4 text-center">
                  <p className="text-blue-300 text-sm">👑 Sos el organizador de este sorteo</p>
                  <Link
                    href={`/admin/raffles/${id}`}
                    className="inline-block mt-2 text-blue-400 hover:underline text-sm"
                  >
                    Administrar sorteo →
                  </Link>
                </div>
              )}

              {!canPurchase &&
                !isOwner &&
                raffle?.status !== "READY_TO_DRAW" &&
                raffle?.status !== "FINISHED" && (
                  <div className="mt-4 bg-yellow-500/20 border border-yellow-500/50 rounded-xl p-4 text-center">
                    <p className="text-yellow-300 text-sm">Este sorteo no está disponible</p>
                  </div>
                )}

              {!session && (
                <button
                  onClick={() => router.push("/login")}
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
        // NUEVO: pasar mínimo y si es obligatorio (para enforcement en el modal)
        minTicketsRequired={minTicketsRequired}
        minTicketsIsMandatory={minTicketsIsMandatory}
      />
    </div>
  );
}
