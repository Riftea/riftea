// src/app/sorteo/[id]/page.js
"use client";

import { useEffect, useMemo, useState, useCallback, useRef } from "react";
import { useSession } from "next-auth/react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import ProgressBar from "@/components/raffle/ProgressBar";
import ParticipateModal from "@/components/raffle/ParticipateModal";

/* ======================= Helpers ======================= */

function parseMinFromDescription(desc = "") {
  const m1 = String(desc).match(/Mínimo de tickets por participante:\s*(\d+)/i);
  if (m1) return { min: Math.max(1, parseInt(m1[1], 10)), mandatory: false };

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

/* ======================= Agrupado ======================= */

function safeTicketCode(p) {
  return (
    p?.ticket?.code ||
    p?.ticketCode ||
    (p?.id ? String(p.id).slice(-6) : null) ||
    "Código oculto"
  );
}

function participantKey(p, fallbackIndex) {
  return (
    p?.userId ||
    p?.user?.id ||
    p?.user?.email ||
    p?.email ||
    (p?.user?.name ? `name:${p.user.name}` : null) ||
    `anon-${fallbackIndex}`
  );
}

function groupParticipants(list) {
  const map = new Map();
  list.forEach((p, idx) => {
    const key = String(participantKey(p, idx));
    if (!map.has(key)) {
      map.set(key, {
        key,
        name: p?.user?.name || p?.name || "Usuario",
        avatar: p?.user?.image || p?.userImage || null,
        userId: p?.userId || p?.user?.id || null,
        tickets: [],
        isWinner: !!p?.isWinner,
      });
    }
    const g = map.get(key);
    g.tickets.push({
      id: p?.ticket?.id || p?.id || `${key}-${g.tickets.length}`,
      code: safeTicketCode(p),
      isWinner: !!p?.isWinner,
      raw: p,
    });
    if (p?.isWinner) g.isWinner = true;
  });
  return Array.from(map.values());
}

/* ======================= Page ======================= */

export default function SorteoPage() {
  const { id } = useParams();
  const { data: session } = useSession();
  const router = useRouter();

  const [raffle, setRaffle] = useState(null);
  const [participants, setParticipants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [participantsLoading, setParticipantsLoading] = useState(false);
  const [error, setError] = useState(null);

  const [showParticipateModal, setShowParticipateModal] = useState(false);
  const [userParticipation, setUserParticipation] = useState(null);

  /* =================== Carga base =================== */

  const unitPrice = useMemo(() => {
    if (!raffle) return 0;
    const n = Number(raffle.unitPrice ?? raffle?.meta?.ticketPrice ?? 0);
    return Number.isFinite(n) ? n : 0;
  }, [raffle]);

  const loadParticipants = useCallback(
    async (raffleId = id) => {
      if (!raffleId) return;
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
        const { list } = extractProgressPayload(data);
        setParticipants(list);
      } catch {
        setParticipants([]);
      } finally {
        setParticipantsLoading(false);
      }
    },
    [id]
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
      if (!id) return;
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/raffles/${id}`, {
          cache: "no-store",
          credentials: "include",
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) {
          if (res.status === 404) throw new Error("Sorteo no encontrado");
          if (res.status >= 500) throw new Error("Error del servidor");
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

  // Polling ligero mientras el sorteo está abierto/publicado/listo
  useEffect(() => {
    if (!raffle?.id) return;
    const ok = ["ACTIVE", "PUBLISHED", "READY_TO_DRAW"];
    if (!ok.includes(raffle.status)) return;
    const t = setInterval(() => loadParticipants(raffle.id), 30000);
    return () => clearInterval(t);
  }, [raffle?.id, raffle?.status, loadParticipants]);

  /* =================== Estado derivado =================== */

  const isOwner = session?.user?.id === raffle?.ownerId;
  const isExpired = raffle?.endsAt ? new Date() > new Date(raffle.endsAt) : false;

  const canPurchase =
    !!raffle &&
    !isExpired &&
    (raffle.status === "ACTIVE" || raffle.status === "PUBLISHED") &&
    raffle.publishedAt;
  const canParticipate = canPurchase && !isOwner;

  const participantsCount = useMemo(() => {
    if (participants.length) return participants.length; // total de tickets/participaciones
    return (
      pickNumber(
        raffle?.stats?.participationsCount,
        raffle?.stats?.totalParticipations,
        raffle?._count?.participations
      ) ?? 0
    );
  }, [participants.length, raffle?.stats, raffle?._count]);

  const maxParticipants = useMemo(() => {
    return (
      pickNumber(
        raffle?.stats?.maxParticipants,
        raffle?.maxParticipants,
        raffle?.stats?.capacity,
        raffle?.capacity
      ) ?? null
    );
  }, [raffle?.stats, raffle?.maxParticipants, raffle?.capacity]);

  const isFull = maxParticipants && participantsCount >= maxParticipants;

  // ====== Rol y botón "Realizar sorteo" ======
  const [isPowerAdmin, setIsPowerAdmin] = useState(() => {
    const role = String(session?.user?.role || "").toUpperCase();
    return role === "SUPERADMIN" || role === "SUPER_ADMIN" || role === "ADMIN";
  });

  // Fallback: si el rol no venía en la sesión, lo consultamos a /api/users/me
  useEffect(() => {
    (async () => {
      try {
        const currentRole = String(session?.user?.role || "").toUpperCase();
        if (currentRole) {
          setIsPowerAdmin(
            currentRole === "SUPERADMIN" ||
              currentRole === "SUPER_ADMIN" ||
              currentRole === "ADMIN"
          );
          return;
        }
        const res = await fetch("/api/users/me", { credentials: "include" });
        if (!res.ok) return;
        const data = await res.json().catch(() => ({}));
        const r = String(data?.role || "").toUpperCase();
        setIsPowerAdmin(r === "SUPERADMIN" || r === "SUPER_ADMIN" || r === "ADMIN");
      } catch {
        /* noop */
      }
    })();
  }, [session?.user?.role]);

  const noWinnerYet = !raffle?.drawnAt && !raffle?.winnerParticipationId;
  const showSimpleDrawBtn =
    isPowerAdmin &&
    raffle?.status === "READY_TO_DRAW" &&
    noWinnerYet &&
    (participantsCount ?? 0) >= 2;

  const [runningSimpleDraw, setRunningSimpleDraw] = useState(false);

  async function runSimpleDraw() {
    if (!id) return;
    setRunningSimpleDraw(true);

    const attempts = [
      { url: `/api/admin/raffles/${id}/draw`, body: { action: "run", notify: true } }, // admin/superadmin
      { url: `/api/raffles/${id}/draw`, body: { action: "run", notify: true } },       // público con permisos
      { url: `/api/raffles/${id}/manual-draw`, body: { notify: true } },               // fallback legacy
    ];

    try {
      for (const { url, body } of attempts) {
        const res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify(body),
        });
        const data = await res.json().catch(() => ({}));
        if (res.ok) {
          router.push(`/sorteo/${id}/en-vivo`);
          return;
        }
        const msg = String(data?.error || data?.message || "").toLowerCase();
        // Si es error duro (no de permisos/acción) paramos
        if (![401, 403, 404].includes(res.status) && !msg.includes("acceso denegado")) {
          alert(`Error ejecutando sorteo: ${data?.error || data?.message || "No se pudo completar"}`);
          setRunningSimpleDraw(false);
          return;
        }
        // si 401/403/404 probamos siguiente intento
      }
      alert("Error ejecutando sorteo: Acceso denegado o endpoint no disponible.");
    } catch (e) {
      alert("No se pudo ejecutar el sorteo (red/servidor).");
    } finally {
      setRunningSimpleDraw(false);
    }
  }

  // ganador (si el backend ya lo marcó)
  const winnerParticipation = useMemo(
    () => participants.find((p) => p.isWinner) || null,
    [participants]
  );

  const getOwnerImage = () => {
    if (raffle?.ownerImage) return raffle.ownerImage;
    if (raffle?.owner?.image) return raffle.owner.image;
    return "/favicon.ico";
  };

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

  /* ======================= Agrupado + carrusel ======================= */

  const groupedParticipants = useMemo(() => groupParticipants(participants), [participants]);

  // Índice de ticket visible por cada usuario (key -> idx)
  const [carouselIdx, setCarouselIdx] = useState({});
  const touchStartXRef = useRef({});

  useEffect(() => {
    setCarouselIdx((prev) => {
      const updated = { ...prev };
      const keys = new Set(groupedParticipants.map((g) => g.key));
      Object.keys(updated).forEach((k) => {
        if (!keys.has(k)) delete updated[k];
      });
      groupedParticipants.forEach((g) => {
        const current = updated[g.key] ?? 0;
        updated[g.key] = Math.min(Math.max(0, current), Math.max(0, g.tickets.length - 1));
      });
      return updated;
    });
  }, [groupedParticipants]);

  const changeTicket = useCallback((key, dir, total) => {
    setCarouselIdx((prev) => {
      const current = prev[key] ?? 0;
      const next = total > 0 ? ((current + dir) % total + total) % total : 0;
      return { ...prev, [key]: next };
    });
  }, []);

  const handleKeyNav = useCallback(
    (e, key, total) => {
      if (total <= 1) return;
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        changeTicket(key, -1, total);
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        changeTicket(key, 1, total);
      }
    },
    [changeTicket]
  );

  const onTouchStart = useCallback((key, clientX) => {
    touchStartXRef.current[key] = clientX;
  }, []);

  const onTouchEnd = useCallback(
    (key, clientX, total) => {
      const start = touchStartXRef.current[key];
      if (start == null) return;
      const dx = clientX - start;
      delete touchStartXRef.current[key];
      const threshold = 30;
      if (Math.abs(dx) < threshold || total <= 1) return;
      changeTicket(key, dx < 0 ? 1 : -1, total);
    },
    [changeTicket]
  );

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

  if (error && !raffle) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-900 via-blue-900 to-indigo-900 pt-20">
        <div className="container mx-auto px-4 py-8">
          <div className="border rounded-3xl p-8 text-center bg-red-500/20 border-red-500/50">
            <div className="text-6xl mb-4">❌</div>
            <h1 className="text-2xl font-bold text-white mb-4">Sorteo no encontrado</h1>
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

  const winnerBlock =
    raffle?.status === "FINISHED" && winnerParticipation ? (
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
    ) : null;

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-900 via-blue-900 to-indigo-900 pt-20">
      <div className="container mx-auto px-4 py-8">
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
                raffle?.status === "ACTIVE"
                  ? "bg-green-500/20 text-green-300"
                  : raffle?.status === "PUBLISHED"
                  ? "bg-blue-500/20 text-blue-300"
                  : raffle?.status === "READY_TO_DRAW"
                  ? "bg-yellow-500/20 text-yellow-300"
                  : raffle?.status === "FINISHED"
                  ? "bg-purple-500/20 text-purple-300"
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
            <span>
              Creado:{" "}
              {raffle?.createdAt ? new Date(raffle.createdAt).toLocaleDateString() : "-"}
            </span>
          </div>
        </div>

        {/* Botón simple de sorteo (ADMIN / SUPERADMIN) */}
        {showSimpleDrawBtn && (
          <div className="bg-emerald-500/15 border border-emerald-500/40 rounded-2xl p-5 mb-6">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-emerald-300 font-semibold">Listo para ejecutar</p>
                <p className="text-sm opacity-80">
                  Al hacer clic se realizará el sorteo entre los participantes y se publicará el
                  ganador.
                </p>
              </div>
              <button
                onClick={runSimpleDraw}
                disabled={runningSimpleDraw}
                className="px-4 py-2 rounded-xl bg-emerald-600 text-white font-semibold hover:bg-emerald-700 disabled:opacity-60"
              >
                {runningSimpleDraw ? "Ejecutando…" : "🎲 Realizar sorteo"}
              </button>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Principal */}
          <div className="lg:col-span-2">
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
                      loader={({ src }) => src}
                      unoptimized
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

            {/* Barra de progreso */}
            <div className="mb-8">
              <div className="flex justify-between text-xs text-slate-400 mb-2">
                <span>Participaciones (tickets)</span>
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
            {winnerBlock}

            {/* Participantes agrupados por usuario con carrusel */}
            <div className="bg-white/10 backdrop-blur-lg rounded-3xl p-6 border border-white/20 mb-8">
              <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
                <h3 className="text-xl font-bold text-white">Participantes</h3>
                <div className="text-xs text-slate-300">
                  únicos: <b>{groupedParticipants.length}</b>
                  <span className="opacity-60"> • tickets: {participants.length}</span>
                </div>
                <button
                  onClick={() => loadParticipants()}
                  disabled={participantsLoading}
                  className="ml-auto px-3 py-2 bg-white/20 hover:bg-white/30 text-white text-sm rounded-lg transition-colors disabled:opacity-50"
                >
                  {participantsLoading ? "🔄" : "🔄 Actualizar"}
                </button>
              </div>

              {groupedParticipants.length > 0 ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 max-h-80 overflow-y-auto">
                  {groupedParticipants.map((g, i) => {
                    const total = g.tickets.length;
                    const idx = carouselIdx[g.key] ?? 0;
                    const current =
                      g.tickets[Math.min(idx, Math.max(0, total - 1))] || g.tickets[0];

                    return (
                      <div
                        key={g.key}
                        className={`group relative rounded-xl border overflow-hidden transition focus-within:ring-2 focus-within:ring-purple-400 outline-none ${
                          g.isWinner
                            ? "bg-amber-500/20 border-amber-500/50"
                            : "bg-slate-900/50 border-slate-800 hover:border-slate-700/60"
                        }`}
                        tabIndex={0}
                        role="region"
                        aria-label={`Participante ${g.name}`}
                        onKeyDown={(e) => handleKeyNav(e, g.key, total)}
                        onTouchStart={(e) => onTouchStart(g.key, e.touches?.[0]?.clientX ?? 0)}
                        onTouchEnd={(e) => onTouchEnd(g.key, e.changedTouches?.[0]?.clientX ?? 0, total)}
                      >
                        {/* Flechas / zonas clicables */}
                        {total > 1 && (
                          <>
                            <button
                              type="button"
                              aria-label={`Ticket anterior de ${g.name}`}
                              onClick={() => changeTicket(g.key, -1, total)}
                              className="absolute inset-y-0 left-0 w-8 flex items-center justify-center bg-gradient-to-r from-black/20 to-transparent opacity-0 group-hover:opacity-100 focus:opacity-100 transition"
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-white/80" viewBox="0 0 20 20" fill="currentColor">
                                <path fillRule="evenodd" d="M12.293 15.707a1 1 0 010-1.414L15.586 11H4a1 1 0 110-2h11.586l-3.293-3.293a1 1 0 111.414-1.414l5 5a1 1 0 010 1.414l-5 5a1 1 0 01-1.414 0z" clipRule="evenodd" />
                              </svg>
                            </button>
                            <button
                              type="button"
                              aria-label={`Siguiente ticket de ${g.name}`}
                              onClick={() => changeTicket(g.key, 1, total)}
                              className="absolute inset-y-0 right-0 w-8 flex items-center justify-center bg-gradient-to-l from-black/20 to-transparent opacity-0 group-hover:opacity-100 focus:opacity-100 transition"
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 rotate-180 text-white/80" viewBox="0 0 20 20" fill="currentColor">
                                <path fillRule="evenodd" d="M12.293 15.707a1 1 0 010-1.414L15.586 11H4a1 1 0 110-2h11.586l-3.293-3.293a1 1 0 111.414-1.414l5 5a1 1 0 010 1.414l-5 5a1 1 0 01-1.414 0z" clipRule="evenodd" />
                              </svg>
                            </button>
                          </>
                        )}

                        <div className="p-4">
                          <div className="flex items-center gap-3 mb-2">
                            <div
                              className={`w-10 h-10 rounded-full flex items-center justify-center text-white text-sm font-bold ${
                                g.isWinner
                                  ? "bg-amber-500"
                                  : "bg-gradient-to-r from-purple-500 to-pink-500"
                              }`}
                            >
                              {g.isWinner ? "👑" : i + 1}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <div className="text-white font-medium truncate">
                                  {g.name}
                                </div>
                                {total > 1 && (
                                  <span className="px-2 py-0.5 rounded-full bg-white/10 text-white/80 text-[11px]">
                                    x{total}
                                  </span>
                                )}
                              </div>
                              <div className="text-white/60 text-xs">
                                Participante {g.isWinner ? "ganador" : "activo"}
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center justify-between gap-2">
                            <div className="text-white/80 text-xs font-mono bg-white/5 rounded px-2 py-1">
                              #{current?.code}
                            </div>
                            {total > 1 && (
                              <div className="text-white/50 text-[11px]">
                                {Math.min((carouselIdx[g.key] ?? 0) + 1, total)} / {total}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="text-center py-12">
                  <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-white/5 flex items-center justify-center">
                    <svg
                      className="w-8 h-8 text-white/40"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 0 014 0zM7 10a2 2 0 11-4 0 2 0 4 0z"
                      />
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
                  <div className="text-lg text-white/70 mb-1">
                    Tickets recomendados para participar
                  </div>
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

              {session && userParticipation && raffle?.status !== "FINISHED" && (
                <div className="mb-4 bg-green-500/20 border border-green-500/50 rounded-xl p-4 text-center">
                  <p className="text-green-300 font-bold mb-1">¡Ya estás participando!</p>
                  <p className="text-green-200/80 text-xs">
                    Podés agregar más tickets si querés aumentar tus chances.
                  </p>
                </div>
              )}

              {session &&
                canParticipate &&
                raffle?.status !== "FINISHED" &&
                !isFull && (
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

      {/* Modal de participación */}
      <ParticipateModal
        isOpen={showParticipateModal}
        onClose={() => setShowParticipateModal(false)}
        raffle={raffle}
        onSuccess={handleParticipationSuccess}
        minTicketsRequired={minTicketsRequired}
        minTicketsIsMandatory={minTicketsIsMandatory}
      />
    </div>
  );
}
