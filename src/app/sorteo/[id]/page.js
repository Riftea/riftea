// src/app/sorteo/[id]/page.js
"use client";

import { useEffect, useMemo, useState, useCallback, useRef } from "react";
import { useSession } from "next-auth/react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import ParticipateModal from "@/components/raffle/ParticipateModal";
import ShareButton from "@/components/ui/ShareButton";

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
        isVerified: !!p?.user?.verified || !!p?.userVerified,
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

function initials(name = "Usuario") {
  const parts = String(name).trim().split(/\s+/).slice(0, 2);
  return parts.map((p) => p[0]?.toUpperCase() || "").join("") || "U";
}

/** Embellece el título */
function beautifyTitle(s = "") {
  const t = String(s).trim();
  if (!t) return "";
  const isAllCaps = t === t.toUpperCase();
  const isAllLower = t === t.toLowerCase();
  if (isAllCaps || isAllLower) {
    const lower = t.toLowerCase();
    return lower.charAt(0).toUpperCase() + lower.slice(1);
  }
  return t.charAt(0).toUpperCase() + t.slice(1);
}

/* ===== Ícono de Ticket con muescas ===== */
function TicketIcon({ className = "" }) {
  return (
    <svg viewBox="0 0 48 48" aria-hidden="true" className={className} role="img">
      <path
        d="M8 14a4 4 0 0 1 4-4h24a4 4 0 0 1 4 4v5a4 4 0 1 0 0 10v5a4 4 0 0 1-4 4H12a4 4 0 0 1-4-4v-5a4 4 0 1 0 0-10v-5z"
        fill="currentColor"
      />
      <path
        d="M24 10v28"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
        strokeDasharray="2 6"
        className="opacity-70"
        fill="none"
      />
    </svg>
  );
}

/* ======================= Progress animada local ======================= */
function FancyProgress({ current = 0, target = 1 }) {
  const pct = Math.max(0, Math.min(100, Math.round((current / Math.max(1, target)) * 100)));

  return (
    <div className="w-full h-3 rounded-lg bg-white/10 overflow-hidden relative ring-1 ring-white/10">
      <div
        className="h-full bg-gradient-to-r from-emerald-400 via-lime-400 to-emerald-500 relative"
        style={{ width: `${pct}%` }}
      >
        <div className="absolute inset-0 opacity-30 progress-stripes" />
        <div
          className="absolute inset-0 bg-white/20 mix-blend-overlay pointer-events-none"
          style={{ maskImage: "linear-gradient(to bottom, rgba(0,0,0,0.15), rgba(0,0,0,0.6))" }}
        />
      </div>

      <style jsx>{`
        .progress-stripes {
          background-image: linear-gradient(
            45deg,
            rgba(255,255,255,0.6) 25%,
            transparent 25%,
            transparent 50%,
            rgba(255,255,255,0.6) 50%,
            rgba(255,255,255,0.6) 75%,
            transparent 75%,
            transparent
          );
          background-size: 16px 16px;
          animation: progress-move 1.6s linear infinite;
        }
        @keyframes progress-move {
          from { background-position: 0 0; }
          to   { background-position: 16px 0; }
        }
      `}</style>
    </div>
  );
}

/* ======================= Media helpers (YouTube) ======================= */

/** Extrae videoId de varios formatos: watch?v=, youtu.be/, /embed/, /shorts/, /live/ */
function extractYouTubeId(url = "") {
  try {
    const s = String(url || "").trim();
    if (!s) return null;

    const pathId = s.match(/youtube\.com\/(?:shorts|live)\/([a-zA-Z0-9_-]{6,})/i);
    if (pathId) return pathId[1];

    const yb = s.match(/youtu\.be\/([a-zA-Z0-9_-]{6,})/i);
    if (yb) return yb[1];

    const v = s.match(/[?&]v=([a-zA-Z0-9_-]{6,})/i);
    if (v) return v[1];

    const em = s.match(/youtube\.com\/embed\/([a-zA-Z0-9_-]{6,})/i);
    if (em) return em[1];

    return null;
  } catch {
    return null;
  }
}

/** Obtiene URL embebible si el raffle trae un link de YouTube válido */
function getRaffleYouTubeEmbed(raffle) {
  const candidates = [
    raffle?.youtubeUrl,   // <— este es el que envía tu formulario
    raffle?.youtubeLink,
    raffle?.videoUrl,
    raffle?.video,
    raffle?.media?.youtube,
  ].filter(Boolean);

  for (const c of candidates) {
    const id = extractYouTubeId(c);
    if (id) return `https://www.youtube.com/embed/${id}?rel=0&modestbranding=1`;
  }
  return null;
}

function getYouTubeIdFromEmbed(embedUrl = "") {
  // Ej: https://www.youtube.com/embed/VIDEOID?rel=0...
  const m = String(embedUrl || "").match(/\/embed\/([A-Za-z0-9_-]{6,})(?:\?|$)/);
  return m ? m[1] : null;
}

/* ======================= MediaCarousel ======================= */

function MediaCarousel({ imageUrl, youtubeEmbedUrl, title = "Sorteo" }) {
  const slides = useMemo(() => {
    const arr = [];
    if (imageUrl) arr.push({ type: "image", src: imageUrl });
    if (youtubeEmbedUrl) arr.push({ type: "video", src: youtubeEmbedUrl });
    return arr;
  }, [imageUrl, youtubeEmbedUrl]);

  const [idx, setIdx] = useState(0);
  const total = slides.length;

  useEffect(() => {
    if (idx >= total) setIdx(0);
  }, [total, idx]);

  if (total === 0) {
    return <div className="w-full aspect-[16/9] md:aspect-[4/3] rounded-xl bg-white/10 border border-white/15" />;
  }

  const current = slides[idx];
  const ytThumb =
    youtubeEmbedUrl && getYouTubeIdFromEmbed(youtubeEmbedUrl)
      ? `https://img.youtube.com/vi/${getYouTubeIdFromEmbed(youtubeEmbedUrl)}/hqdefault.jpg`
      : null;

  return (
    <div className="relative">
      <div className="relative w-full aspect-[16/9] md:aspect-[4/3] rounded-xl overflow-hidden shadow-xl border border-white/15 bg-black/20">
        {current.type === "image" ? (
          <>
            <Image
              src={current.src}
              alt={title || "Sorteo"}
              fill
              className="object-cover"
              loader={({ src }) => src}
              unoptimized
              priority
            />
            {/* Zonas de toque (solo en imagen) */}
            {total > 1 && (
              <>
                <button
                  aria-label="Anterior"
                  onClick={() => setIdx((p) => (p - 1 + total) % total)}
                  className="absolute inset-y-0 left-0 w-2/5 md:w-1/3 cursor-pointer"
                  style={{ background: "linear-gradient(to right, rgba(0,0,0,.1), transparent)" }}
                  title="Anterior"
                />
                <button
                  aria-label="Siguiente"
                  onClick={() => setIdx((p) => (p + 1) % total)}
                  className="absolute inset-y-0 right-0 w-2/5 md:w-1/3 cursor-pointer"
                  style={{ background: "linear-gradient(to left, rgba(0,0,0,.08), transparent)" }}
                  title="Siguiente"
                />
              </>
            )}
          </>
        ) : (
          <iframe
            src={current.src}
            title={title || "Video del sorteo"}
            className="w-full h-full"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            referrerPolicy="strict-origin-when-cross-origin"
            allowFullScreen
          />
        )}
      </div>

      {/* Flechas visibles */}
      {total > 1 && (
        <>
          <button
            aria-label="Anterior"
            onClick={() => setIdx((p) => (p - 1 + total) % total)}
            className="absolute inset-y-0 left-0 px-2 flex items-center justify-center text-white/90 hover:text-white"
          >
            <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-black/30">‹</span>
          </button>
          <button
            aria-label="Siguiente"
            onClick={() => setIdx((p) => (p + 1) % total)}
            className="absolute inset-y-0 right-0 px-2 flex items-center justify-center text-white/90 hover:text-white"
          >
            <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-black/30">›</span>
          </button>
        </>
      )}

      {/* Miniaturas */}
      {total > 1 && (
        <div className="mt-2 flex items-center gap-2">
          {slides.map((s, i) => (
            <button
              key={i}
              onClick={() => setIdx(i)}
              className={`border rounded-lg overflow-hidden bg-white/10 hover:bg-white/20 transition
                          ${i === idx ? "ring-2 ring-white/80" : "ring-1 ring-white/20"}`}
              style={{ width: 56, height: 40 }}
              title={s.type === "image" ? "Imagen" : "Video"}
            >
              {s.type === "image" ? (
                <div className="relative w-full h-full">
                  <Image
                    src={s.src}
                    alt={title || "Miniatura"}
                    fill
                    className="object-cover"
                    loader={({ src }) => src}
                    unoptimized
                  />
                </div>
              ) : ytThumb ? (
                <div className="relative w-full h-full">
                  <Image
                    src={ytThumb}
                    alt="Video"
                    fill
                    className="object-cover"
                    loader={({ src }) => src}
                    unoptimized
                  />
                  <div className="absolute inset-0 grid place-items-center">
                    <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-black/60 text-white text-xs">
                      ▶
                    </span>
                  </div>
                </div>
              ) : (
                <div className="w-full h-full flex items-center justify-center text-white/90">▶</div>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ======================= Reusables ======================= */

function FadeIn({ children, delay = 0, duration = 300, className = "" }) {
  const [show, setShow] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setShow(true), delay);
    return () => clearTimeout(t);
  }, [delay]);
  return (
    <div
      className={className}
      style={{
        opacity: show ? 1 : 0,
        transform: show ? "translateY(0px)" : "translateY(8px)",
        transition: `opacity ${duration}ms ease, transform ${duration}ms ease`,
      }}
    >
      {children}
    </div>
  );
}

function SkeletonCard() {
  return (
    <div className="rounded-xl p-2 ring-1 ring-white/10">
      <div className="w-full aspect-square rounded-lg bg-white/10 animate-pulse" />
      <div className="mt-2 h-3 rounded bg-white/10 animate-pulse" />
    </div>
  );
}

/* ======================= Page ======================= */

export default function SorteoPage() {
  const { id } = useParams();
  const { data: session } = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();

  const [raffle, setRaffle] = useState(null);
  const [participants, setParticipants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [participantsLoading, setParticipantsLoading] = useState(false);
  const [error, setError] = useState(null);

  const [showParticipateModal, setShowParticipateModal] = useState(false);
  const [userParticipation, setUserParticipation] = useState(null);

  const [descOpen, setDescOpen] = useState(false);
  const [ticketIdx, setTicketIdx] = useState({});

  // Control de tabs y resaltados
  const [activeTab, setActiveTab] = useState("Participantes");
  const [focusWinner, setFocusWinner] = useState(false);
  const [highlightKey, setHighlightKey] = useState(null);
  const [tempGlowId, setTempGlowId] = useState(null);
  const winnerCardRef = useRef(null);

  // Sticky hide-on-scroll
  const [showSticky, setShowSticky] = useState(true);
  const lastYRef = useRef(0);

  // NEW: flag para evitar disparos múltiples del auto-sorteo
  const [autoDrawAttempted, setAutoDrawAttempted] = useState(false);

  useEffect(() => {
    const onScroll = () => {
      const y = window.scrollY || 0;
      const goingDown = y > lastYRef.current + 6;
      const goingUp = y < lastYRef.current - 6;
      if (goingDown && showSticky) setShowSticky(false);
      if (goingUp && !showSticky) setShowSticky(true);
      lastYRef.current = y;
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [showSticky]);

  /* =================== Carga base =================== */

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
        setTimeout(() => setParticipantsLoading(false), 250);
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
      } catch {}
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
        const merged = { ...raffleObj };

        if (!mounted) return;
        setRaffle(merged);

        await loadParticipants(merged?.id || id);
        if (session) checkUserParticipation(merged?.id || id);
      } catch (e) {
        if (mounted) setError(e.message || "Error al cargar el sorteo");
      } finally {
        setTimeout(() => mounted && setLoading(false), 400);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [id, session, loadParticipants, checkUserParticipation]);

  useEffect(() => {
    if (!raffle?.id) return;
    const ok = ["ACTIVE", "PUBLISHED", "READY_TO_DRAW", "READY_TO_FINISH"];
    if (!ok.includes(raffle.status)) return;
    const t = setInterval(() => loadParticipants(raffle.id), 30000);
    return () => clearInterval(t);
  }, [raffle?.id, raffle?.status, loadParticipants]);

  // Leer ?tab y ?highlight
  useEffect(() => {
    const t = (searchParams.get("tab") || "").toLowerCase();
    if (t === "detalles") setActiveTab("Detalles");
    if (t === "resultado") {
      setActiveTab("Participantes");
      setFocusWinner(true);
    }
    const hl = (searchParams.get("highlight") || "").trim();
    if (hl) setHighlightKey(hl.toLowerCase());
  }, [searchParams]);

  /* =================== Estado derivado =================== */

  const isOwner = session?.user?.id === raffle?.ownerId;
  const isExpired = raffle?.endsAt ? new Date() > new Date(raffle.endsAt) : false;

  const canPurchase =
    !!raffle &&
    !isExpired &&
    (raffle.status === "ACTIVE" || raffle.status === "PUBLISHED") &&
    raffle.publishedAt;
  const canParticipate = canPurchase && !isOwner;

  const participationsCount = useMemo(() => {
    if (participants.length) return participants.length;
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

  const isFull = maxParticipants && participationsCount >= maxParticipants;

  const groupedParticipants = useMemo(
    () => groupParticipants(participants),
    [participants]
  );
  const uniqueParticipantsCount = groupedParticipants.length;

  const remaining = useMemo(() => {
    if (!maxParticipants && maxParticipants !== 0) return null;
    return Math.max(0, maxParticipants - participationsCount);
  }, [maxParticipants, participationsCount]);

  const showAlmostFull =
    typeof remaining === "number" &&
    maxParticipants &&
    remaining > 0 &&
    remaining <= Math.ceil(maxParticipants * 0.25);

  const [isPowerAdmin, setIsPowerAdmin] = useState(() => {
    const role = String(session?.user?.role || "").toUpperCase();
    return role === "SUPERADMIN" || role === "SUPER_ADMIN" || role === "ADMIN";
  });

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
      } catch {}
    })();
  }, [session?.user?.role]);

  const noWinnerYet = !raffle?.drawnAt && !raffle?.winnerParticipationId;
  const showSimpleDrawBtn =
    isPowerAdmin &&
    raffle?.status === "READY_TO_DRAW" &&
    noWinnerYet &&
    (participationsCount ?? 0) >= 2;

  const [runningSimpleDraw, setRunningSimpleDraw] = useState(false);

  async function runSimpleDraw() {
    if (!id) return;
    setRunningSimpleDraw(true);
    const attempts = [
      { url: `/api/admin/raffles/${id}/draw`, body: { action: "run", notify: true } },
      { url: `/api/raffles/${id}/draw`, body: { action: "run", notify: true } },
      { url: `/api/raffles/${id}/manual-draw`, body: { notify: true } },
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
        if (![401, 403, 404].includes(res.status) && !msg.includes("acceso denegado")) {
          alert(`Error ejecutando sorteo: ${data?.error || data?.message || "No se pudo completar"}`);
          setRunningSimpleDraw(false);
          return;
        }
      }
      alert("Error ejecutando sorteo: Acceso denegado o endpoint no disponible.");
    } catch (e) {
      alert("No se pudo ejecutar el sorteo (red/servidor).");
    } finally {
      setRunningSimpleDraw(false);
    }
  }

  const winnerParticipation = useMemo(
    () => participants.find((p) => p.isWinner) || null,
    [participants]
  );

  const isUserWinner = useMemo(() => {
    if (!winnerParticipation || !session?.user?.id) return false;
    return (
      winnerParticipation.user?.id === session.user.id ||
      winnerParticipation.userId === session.user.id
    );
  }, [winnerParticipation, session?.user?.id]);

  useEffect(() => {
    if (!focusWinner) return;
    if (participantsLoading) return;
    if (!winnerParticipation) return;
    const el = winnerCardRef.current || document.querySelector('[data-winner-card="true"]');
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      const idAttr = el.getAttribute("id") || "winner-card";
      setTempGlowId(idAttr);
      setTimeout(() => setTempGlowId(null), 3000);
    }
    setFocusWinner(false);
  }, [focusWinner, winnerParticipation, participantsLoading]);

  useEffect(() => {
    if (!highlightKey || groupedParticipants.length === 0) return;
    const idx = groupedParticipants.findIndex((g) =>
      g.tickets.some((t) => String(t.code || "").toLowerCase().includes(highlightKey)) ||
      String(g.userId || g.key || "").toLowerCase() === highlightKey
    );
    if (idx >= 0) {
      setActiveTab("Participantes");
      const el = document.getElementById(`p-${idx}`);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        setTempGlowId(el.id);
        setTimeout(() => setTempGlowId(null), 3000);
      }
    }
  }, [highlightKey, groupedParticipants]);

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
  }, [
    raffle?.minTicketsPerParticipant,
    raffle?.minTicketsIsMandatory,
    raffle?.description,
  ]);

  const showRequiredCount =
    !!minTicketsIsMandatory && Number.isFinite(minTicketsRequired) && minTicketsRequired >= 1;

  const showSuggestedCount =
    !minTicketsIsMandatory && Number.isFinite(minTicketsRequired) && minTicketsRequired > 1;

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

  const reportIssue = async () => {
    try {
      const res = await fetch(`/api/raffles/${id}/report`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ reason: "user_report" }),
      });
      if (res.ok) {
        alert("¡Gracias! Revisaremos este sorteo.");
        return;
      }
    } catch {}
    const url = typeof window !== "undefined" ? window.location.href : "";
    window.location.href =
      "mailto:soporte@riftea.com?subject=Denuncia sorteo " +
      id +
      "&body=Detecté un problema en: " +
      encodeURIComponent(url);
  };

  const changeTicket = (key, dir, total) => {
    if (!total || total <= 1) return;
    setTicketIdx((prev) => {
      const curr = prev[key] ?? 0;
      const next = ((curr + dir) % total + total) % total;
      return { ...prev, [key]: next };
    });
  };

  /* ======================= NUEVO: Auto-sorteo público ======================= */
  useEffect(() => {
    if (!raffle?.id) return;
    if (autoDrawAttempted) return;
    // Resultado ya efectuado si hay timestamp de sorteo o participación ganadora
    const alreadyDrawn = raffle?.drawnAt || raffle?.winnerParticipationId;
    if (alreadyDrawn) return;

    const status = String(raffle?.status || "").toUpperCase();
    if (status === "READY_TO_DRAW" || status === "READY_TO_FINISH") {
      setAutoDrawAttempted(true);
      (async () => {
        const attempts = [
          { url: `/api/admin/raffles/${id}/draw`, body: { action: "run", notify: true } },
          { url: `/api/raffles/${id}/draw`, body: { action: "run", notify: true } },
          { url: `/api/raffles/${id}/manual-draw`, body: { notify: true } },
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
            if (![401, 403, 404].includes(res.status) && !msg.includes("acceso denegado")) {
              console.warn("Auto-draw falló:", data?.error || data?.message || "No se pudo completar");
              break;
            }
          }
        } catch (e) {
          console.warn("Auto-draw error:", e);
        }
      })();
    }
  }, [raffle?.id, raffle?.status, raffle?.drawnAt, raffle?.winnerParticipationId, autoDrawAttempted, id, router]);
  /* ======================================================================== */

  /* ======================= UI ======================= */

  const TABS = ["Participantes", "Detalles"];

  // Título embellecido
  const prettyTitle = useMemo(() => beautifyTitle(raffle?.title || ""), [raffle?.title]);

  // URL de YouTube embebible (si existe)
  const youtubeEmbedUrl = useMemo(() => getRaffleYouTubeEmbed(raffle), [raffle]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-violet-900 via-indigo-900 to-sky-900 pt-10">
        <div className="container mx-auto px-4 py-6">
          <div className="animate-pulse max-w-6xl mx-auto">
            <div className="h-6 bg-white/20 rounded w-1/4 mb-4"></div>
            <div className="h-8 bg-white/20 rounded w-1/2 mb-6"></div>
            <div className="grid grid-cols-12 gap-6">
              <div className="col-span-12 lg:col-span-6 h-64 bg-white/10 rounded-2xl"></div>
              <div className="col-span-12 lg:col-span-6 h-64 bg-white/10 rounded-2xl"></div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (error && !raffle) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-violet-900 via-indigo-900 to-sky-900 pt-10">
        <div className="container mx-auto px-4 py-8">
          <div className="max-w-md mx-auto border rounded-2xl p-8 text-center bg-red-500/20 border-red-500/50">
            <div className="text-5xl mb-4">❌</div>
            <h1 className="text-xl font-bold text-white mb-4">Sorteo no encontrado</h1>
            <p className="text-white/70 mb-6 text-sm">
              {error || "No se pudo cargar la información del sorteo"}
            </p>
            <div className="flex gap-3 justify-center">
              <button
                onClick={() => window.location.reload()}
                className="px-4 py-2 bg-purple-500 hover:bg-purple-600 text-white text-sm rounded-lg transition-colors"
              >
                Reintentar
              </button>
              <Link
                href="/sorteos"
                className="inline-block px-4 py-2 bg-white/20 hover:bg-white/30 text-white text-sm rounded-lg transition-colors"
              >
                Ir a sorteos
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const statusPill = (
    <span
      className={`px-2 py-0.5 rounded-full text-xs font-medium ${
        raffle?.status === "ACTIVE"
          ? "bg-green-500/25 text-green-100"
          : raffle?.status === "PUBLISHED"
          ? "bg-blue-500/25 text-blue-100"
          : raffle?.status === "READY_TO_DRAW" || raffle?.status === "READY_TO_FINISH"
          ? "bg-yellow-500/25 text-yellow-100"
          : raffle?.status === "FINISHED"
          ? "bg-fuchsia-500/25 text-fuchsia-100"
          : "bg-gray-500/25 text-gray-100"
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
        : raffle?.status === "READY_TO_FINISH"
        ? "⏳ Listo para finalizar"
        : raffle?.status === "READY_TO_DRAW"
        ? "⏳ Listo para sortear"
        : raffle?.status}
    </span>
  );

  // Badges de categoría y entrega (metadatos persistidos, NO en la descripción)
  const categoryPill = raffle?.prizeCategory ? (
    <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-indigo-500/25 text-indigo-100">
      🏷️ {raffle.prizeCategory}
    </span>
  ) : null;

  const shippingPill =
    typeof raffle?.freeShipping === "boolean" ? (
      <span
        className={`px-2 py-0.5 rounded-full text-xs font-medium ${
          raffle.freeShipping
            ? "bg-emerald-500/20 text-emerald-100"
            : "bg-cyan-500/20 text-cyan-100"
        }`}
        title={raffle.freeShipping ? "El organizador ofrece envío gratis" : "Se coordina la entrega"}
      >
        {raffle.freeShipping ? "🚚 Envío gratis" : "🤝 Acordar entrega"}
      </span>
    ) : null;

  const winnerParticipationObj = winnerParticipation;
  const winnerBlock =
    raffle?.status === "FINISHED" && winnerParticipationObj ? (
      <div className="bg-amber-500/20 border border-amber-500/40 rounded-lg px-2 py-1 text-center">
        <p className="text-white text-xs font-semibold flex items-center justify-center gap-1">
          <span>🏆</span> Ganador: {winnerParticipationObj.user?.name || "Usuario"}{" "}
          <span className="font-mono">
            #
            {winnerParticipationObj.ticket?.code ||
              winnerParticipationObj.ticketCode ||
              winnerParticipationObj.id?.slice(0, 6)}
          </span>
        </p>
      </div>
    ) : null;

  const pct =
    maxParticipants && maxParticipants > 0
      ? Math.min(100, Math.round((participationsCount / maxParticipants) * 100))
      : null;

  const canViewResults =
    raffle?.status === "READY_TO_DRAW" ||
    raffle?.status === "READY_TO_FINISH" ||
    raffle?.status === "FINISHED";

  return (
    <div className="min-h-screen bg-gradient-to-br from-violet-900 via-indigo-900 to-sky-900 pt-10">
      <div className="container mx-auto px-4 py-4">
        <div className="max-w-6xl mx-auto">
          {/* Top bar */}
          <div className="flex items-center justify-between mb-2">
            <button
              onClick={() => router.push("/sorteos")}
              className="inline-flex items-center text-white/90 hover:text-white transition-colors text-sm drop-shadow-[0_1px_1px_rgba(0,0,0,0.9)]"
              title="Volver a sorteos"
            >
              ← Volver
            </button>

            <div className="flex items-center gap-2">
              <ShareButton raffle={raffle} variant="solid" size="sm" />
              {canViewResults && (
                <button
                  onClick={() => router.push(`/sorteo/${id}/en-vivo`)}
                  className="px-3 py-1.5 bg-amber-400 hover:bg-amber-500 text-slate-900 text-sm font-semibold rounded-lg transition-colors"
                >
                  Ver resultados
                </button>
              )}
              {session?.user?.id === raffle?.ownerId && (
                <Link
                  href={`/admin/raffles/${id}`}
                  className="px-3 py-1.5 bg-white/10 hover:bg-white/20 text-white text-sm rounded-lg transition-colors"
                >
                  Admin
                </Link>
              )}
            </div>
          </div>

          {/* ===== Título principal arriba ===== */}
          <h1
            className="text-2xl md:text-4xl font-extrabold text-white tracking-tight mb-3 drop-shadow-[0_2px_2px_rgba(0,0,0,0.8)]"
            style={{ WebkitTextStroke: "0.35px rgba(255,255,255,.35)" }}
            title={raffle?.title || ""}
          >
            {prettyTitle}
          </h1>

          {/* Banner ganador propio */}
          {focusWinner && isUserWinner && (
            <div className="mb-3 rounded-lg border border-emerald-500/40 bg-emerald-500/20 px-3 py-2 text-emerald-50 text-sm">
              🎉 <b>¡Felicidades!</b> Este sorteo te tiene como ganador/a. Abajo resaltamos tu tarjeta.
            </div>
          )}

          {/* HERO */}
          <div className="grid grid-cols-12 gap-5 mb-6">
            {/* Izquierda: Imagen + Descripción */}
            <div className="col-span-12 lg:col-span-6">
              <MediaCarousel
                imageUrl={raffle?.imageUrl || null}
                youtubeEmbedUrl={youtubeEmbedUrl}
                title={raffle?.title || "Sorteo"}
              />

              {raffle?.description && (
                <FadeIn delay={120}>
                  <div className="mt-3 bg-white/5 backdrop-blur-lg rounded-xl p-3 border border-white/15 relative">
                    <h3 className="text-white font-semibold mb-2 drop-shadow-[0_1px_1px_rgba(0,0,0,0.9)]">
                      Descripción
                    </h3>

                    <div className={`relative ${descOpen ? "" : "max-h-32 overflow-hidden"}`}>
                      <p className="text-white/85 text-sm leading-relaxed drop-shadow-[0_1px_1px_rgba(0,0,0,0.8)]">
                        {raffle?.description}
                      </p>
                    </div>

                    {/* Handle inferior con triangulito */}
                    <div
                      role="button"
                      aria-label={descOpen ? "Contraer descripción" : "Expandir descripción"}
                      onClick={() => setDescOpen((v) => !v)}
                      className={`absolute left-0 right-0 bottom-0 rounded-b-xl cursor-pointer select-none
                               ${descOpen ? "h-7" : "h-10"} flex items-end justify-center`}
                      style={{ zIndex: 1 }}
                    >
                      <div
                        className={`pointer-events-none w-full h-full rounded-b-xl 
                                  ${descOpen ? "bg-white/5" : "bg-gradient-to-t from-[#0b0f1a]/80 to-transparent"}`}
                      />
                      <svg
                        width="14"
                        height="14"
                        viewBox="0 0 24 24"
                        className="absolute bottom-1 opacity-70"
                        style={{
                          transform: descOpen ? "rotate(180deg)" : "rotate(0deg)",
                          transition: "transform 200ms ease",
                        }}
                        aria-hidden="true"
                      >
                        <path d="M12 16L6 10h12l-6 6z" fill="white" fillOpacity="0.85" />
                      </svg>
                    </div>
                  </div>
                </FadeIn>
              )}
            </div>

            {/* Derecha: Estado + progreso + CTA + info */}
            <div className="col-span-12 lg:col-span-6 flex flex-col">
              <div className="flex-1 bg-white/5 backdrop-blur-lg rounded-xl p-5 border border-white/15">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex flex-wrap items-center gap-2 text-white/80 text-xs">
                    {statusPill}
                    {categoryPill}
                    {shippingPill}
                  </div>
                  {winnerBlock}
                </div>

                {/* Progreso */}
                <div className="mt-4">
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-white/90 text-sm drop-shadow-[0_1px_1px_rgba(0,0,0,0.9)]">Progreso</span>
                    <div className="flex items-center gap-2">
                      {typeof remaining === "number" && remaining > 0 && (
                        <span className="px-2 py-0.5 rounded-full bg-white/10 text-white text-[11px]">
                          Restan {remaining}
                        </span>
                      )}
                      <span className="text-white/90 text-xs font-semibold drop-shadow-[0_1px_1px_rgba(0,0,0,0.9)]">
                        {participationsCount}
                        {maxParticipants ? ` / ${maxParticipants}` : ""}{" "}
                        participaciones {pct !== null ? `· ${pct}%` : ""}
                      </span>
                    </div>
                  </div>
                  <FancyProgress current={participationsCount} target={maxParticipants || Math.max(1, participationsCount)} />
                </div>

                {/* CTA principal (desktop) */}
                <div className="mt-4 hidden lg:block">
                  {session && canParticipate && raffle?.status !== "FINISHED" && !isFull ? (
                    <>
                      <FadeIn delay={80}>
                        <button
                          onClick={() => setShowParticipateModal(true)}
                          className="relative w-full py-3 rounded-xl font-extrabold
                                   bg-gradient-to-r from-lime-400 via-lime-500 to-emerald-600
                                   hover:from-lime-500 hover:via-emerald-600 hover:to-emerald-700
                                   text-slate-900 shadow-lg hover:shadow-xl ring-1 ring-black/10
                                   transition-all duration-200 flex items-center justify-center gap-2"
                          aria-label={
                            showRequiredCount
                              ? `Participar, requiere ${minTicketsRequired} ticket${minTicketsRequired > 1 ? "s" : ""}`
                              : "Participar"
                          }
                        >
                          <span>Participar</span>
                          <span className="inline-flex items-center ml-1">
                            <TicketIcon className="-rotate-12 w-5 h-5 opacity-95 drop-shadow" />
                            {showRequiredCount && (
                              <span className="ml-1 font-extrabold tracking-tight">
                                {minTicketsRequired}
                              </span>
                            )}
                          </span>
                        </button>
                      </FadeIn>

                      {!showRequiredCount && showSuggestedCount && (
                        <FadeIn delay={140}>
                          <div className="mt-2 flex items-center justify-center sm:justify-start gap-2
                                        px-3 py-2 rounded-lg bg-lime-400/15 ring-1 ring-lime-300/40">
                            <TicketIcon className="-rotate-12 w-4 h-4 text-lime-300" />
                            <span className="text-lime-100 text-xs drop-shadow-[0_1px_1px_rgba(0,0,0,0.9)]">
                              <span className="font-semibold">Sugerido:</span>{" "}
                              <span className="font-extrabold">{minTicketsRequired}</span>{" "}
                              ticket{minTicketsRequired > 1 ? "s" : ""} para mejores chances
                            </span>
                          </div>
                        </FadeIn>
                      )}
                    </>
                  ) : !session ? (
                    <button
                      onClick={() => router.push("/login")}
                      className="w-full py-3 bg-white/15 hover:bg-white/25 text-white font-bold rounded-xl transition-colors text-sm"
                    >
                      Iniciar sesión
                    </button>
                  ) : null}
                </div>

                {/* Info bajo CTA */}
                <div className="mt-3 flex items-center justify-between gap-3 flex-wrap">
                  <div className="flex items-center gap-3">
                    <div className="text-white text-sm font-semibold drop-shadow-[0_1px_1px_rgba(0,0,0,0.9)]">
                      {participationsCount}
                      {maxParticipants ? ` / ${maxParticipants}` : ""}{" "}
                      <span className="font-normal text-white/90">participaciones</span>
                    </div>

                    <span className="px-2 py-1 rounded-full bg-white/10 text-white text-xs drop-shadow-[0_1px_1px_rgba(0,0,0,0.9)]">
                      👤 {uniqueParticipantsCount} participantes
                    </span>
                  </div>

                  <ShareButton raffle={raffle} variant="soft" size="sm" />
                </div>

                {showAlmostFull && (
                  <div className="mt-1 text-amber-100 text-xs drop-shadow-[0_1px_1px_rgba(0,0,0,0.9)]">
                    Faltan solo <b>{remaining}</b> participaciones.
                  </div>
                )}
              </div>

              {/* Botón Admin sorteo manual */}
              {showSimpleDrawBtn && (
                <div className="mt-3 bg-emerald-500/15 border border-emerald-500/40 rounded-xl p-3">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-emerald-200 font-semibold text-xs drop-shadow-[0_1px_1px_rgba(0,0,0,0.9)]">
                      Listo para ejecutar
                    </p>
                    <button
                      onClick={runSimpleDraw}
                      disabled={runningSimpleDraw}
                      className="px-4 py-2 rounded-lg bg-emerald-600 text-white font-semibold hover:bg-emerald-700 disabled:opacity-60 text-sm"
                    >
                      {runningSimpleDraw ? "Ejecutando…" : "🎲 Sortear ahora"}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* TABS */}
          <div className="bg-white/10 backdrop-blur-lg rounded-xl border border-white/20">
            <div className="flex gap-1 p-1">
              {["Participantes", "Detalles"].map((t) => (
                <button
                  key={t}
                  onClick={() => setActiveTab(t)}
                  className={`px-4 py-2 rounded-lg text-sm transition ${
                    activeTab === t
                      ? "bg-white/25 text-white drop-shadow-[0_1px_1px_rgba(0,0,0,0.9)]"
                      : "text-white/90 hover:text-white hover:bg-white/10"
                  }`}
                >
                  {t}
                </button>
              ))}
              <div className="ml-auto pr-1">
                <button
                  onClick={() => loadParticipants()}
                  disabled={participantsLoading}
                  className="px-3 py-2 rounded-lg text-sm bg-white/10 hover:bg-white/20 text-white/90 disabled:opacity-50"
                  title="Actualizar"
                >
                  🔄
                </button>
              </div>
            </div>

            {/* Participantes */}
            {activeTab === "Participantes" && (
              <div className="p-4">
                {participantsLoading ? (
                  <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 xl:grid-cols-8 gap-3">
                    {Array.from({ length: 12 }).map((_, i) => (
                      <SkeletonCard key={i} />
                    ))}
                  </div>
                ) : groupedParticipants.length > 0 ? (
                  <FadeIn delay={60}>
                    <div className="grid grid-cols-4 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 xl:grid-cols-8 gap-3">
                      {groupedParticipants.map((g, i) => {
                        const total = g.tickets.length;
                        const idx = Math.min(ticketIdx[g.key] ?? 0, Math.max(0, total - 1));
                        const current = g.tickets[idx] || g.tickets[0];

                        return (
                          <div
                            key={g.key}
                            id={`p-${i}`}
                            ref={g.isWinner ? winnerCardRef : null}
                            data-winner-card={g.isWinner ? "true" : "false"}
                            className={`group bg-white/5 hover:bg-white/10 transition rounded-xl p-2 ring-1 ring-white/10
                              ${
                                (tempGlowId === `p-${i}` || (g.isWinner && tempGlowId === "winner-card"))
                                  ? "ring-2 ring-amber-300 animate-pulse"
                                  : ""
                              }`}
                          >
                            <div className="relative w-full aspect-square rounded-lg overflow-hidden bg-gradient-to-br from-fuchsia-700/30 to-sky-700/30 flex items-center justify-center">
                              {g.avatar ? (
                                <Image
                                  src={g.avatar}
                                  alt={g.name}
                                  fill
                                  className="object-cover"
                                  loader={({ src }) => src}
                                  unoptimized
                                />
                              ) : (
                                <div className="w-full h-full flex items-center justify-center">
                                  <div className="w-14 h-14 rounded-full bg-white/10 flex items-center justify-center text-white text-lg font-bold drop-shadow-[0_1px_1px_rgba(0,0,0,0.9)]">
                                    {initials(g.name)}
                                  </div>
                                </div>
                              )}
                              {total > 1 && (
                                <span className="absolute top-1.5 right-1.5 px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-white/90 text-slate-900 shadow">
                                  x{total}
                                </span>
                              )}
                              {g.isWinner && (
                                <span className="absolute bottom-1.5 left-1.5 px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-400 text-black shadow">
                                  🏆 Ganador
                                </span>
                              )}
                            </div>

                            <div className="mt-1.5">
                              <p
                                className="text-white text-[12px] font-semibold truncate drop-shadow-[0_1px_1px_rgba(0,0,0,0.9)]"
                                title={g.name}
                              >
                                {g.name}
                              </p>

                              <div className="mt-0.5 flex items-center justify-center gap-1">
                                <button
                                  onClick={() => changeTicket(g.key, -1, total)}
                                  disabled={total <= 1}
                                  className="px-1.5 py-0.5 text-white/90 hover:text-white disabled:opacity-40"
                                  aria-label="Anterior ticket"
                                >
                                  ‹
                                </button>
                                <span className="font-mono text-[10px] text-white drop-shadow-[0_1px_1px_rgba(0,0,0,0.9)]">
                                  #{current?.code}
                                </span>
                                <button
                                  onClick={() => changeTicket(g.key, 1, total)}
                                  disabled={total <= 1}
                                  className="px-1.5 py-0.5 text-white/90 hover:text-white disabled:opacity-40"
                                  aria-label="Siguiente ticket"
                                >
                                  ›
                                </button>
                              </div>
                              {total > 1 && (
                                <div className="text-center text-[10px] text-white/80 mt-0.5 drop-shadow-[0_1px_1px_rgba(0,0,0,0.9)]">
                                  {idx + 1} / {total}
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </FadeIn>
                ) : (
                  <div className="text-center py-12">
                    <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-white/5 flex items-center justify-center">
                      <svg className="w-6 h-6 text-white/70" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 0 016 0zm6 3a2 2 0 11-4 0 2 0 014 0z" />
                      </svg>
                    </div>
                    <h4 className="text-white font-semibold mb-1 text-sm drop-shadow-[0_1px_1px_rgba(0,0,0,0.9)]">Sin participantes</h4>
                    <p className="text-white/90 text-xs mb-3 drop-shadow-[0_1px_1px_rgba(0,0,0,0.9)]">Sé el primero en participar</p>
                    {session && canParticipate && (
                      <>
                        <button
                          onClick={() => setShowParticipateModal(true)}
                          className="inline-flex items-center px-3 py-2 rounded-lg font-extrabold
                                     bg-gradient-to-r from-lime-400 via-lime-500 to-emerald-600
                                     hover:from-lime-500 hover:via-emerald-600 hover:to-emerald-700
                                     text-slate-900 transition-all"
                          aria-label={
                            showRequiredCount
                              ? `Participar, requiere ${minTicketsRequired} ticket${minTicketsRequired > 1 ? "s" : ""}`
                              : "Participar"
                          }
                        >
                          <span>Participar</span>
                          <span className="inline-flex items-center ml-1">
                            <TicketIcon className="-rotate-12 w-4 h-4 opacity-95" />
                            {showRequiredCount && (
                              <span className="ml-0.5 font-extrabold">{minTicketsRequired}</span>
                            )}
                          </span>
                        </button>

                        {!showRequiredCount && showSuggestedCount && (
                          <div className="mt-2 mx-auto w-max flex items-center gap-2
                                          px-3 py-2 rounded-lg bg-lime-400/15 ring-1 ring-lime-300/40">
                            <TicketIcon className="-rotate-12 w-4 h-4 text-lime-300" />
                            <span className="text-lime-100 text-xs drop-shadow-[0_1px_1px_rgba(0,0,0,0.9)]">
                              <span className="font-semibold">Sugerido:</span>{" "}
                              <span className="font-extrabold">{minTicketsRequired}</span>{" "}
                              ticket{minTicketsRequired > 1 ? "s" : ""} para mejores chances
                            </span>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Detalles */}
            {activeTab === "Detalles" && (
              <div className="p-4 grid grid-cols-1 md:grid-cols-3 gap-4 text-sm text-white/90">
                {/* Organizador */}
                <div className="bg-white/10 border border-white/20 rounded-lg p-4 md:col-span-1">
                  <h3 className="text-white font-semibold mb-3 drop-shadow-[0_1px_1px_rgba(0,0,0,0.9)]">Organizador</h3>
                  {raffle?.owner ? (
                    <div className="flex items-center gap-3">
                      <div className="relative">
                        <Image
                          src={getOwnerImage()}
                          alt={raffle?.owner?.name || "Usuario"}
                          width={44}
                          height={44}
                          className="rounded-full border-2 border-white/20 object-cover"
                          loader={({ src }) => src}
                          unoptimized
                        />
                        {raffle?.owner?.verified && (
                          <div className="absolute -top-1 -right-1 w-5 h-5 bg-blue-500 rounded-full flex items-center justify-center">
                            <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                              <path
                                fillRule="evenodd"
                                d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                                clipRule="evenodd"
                              />
                            </svg>
                          </div>
                        )}
                      </div>
                      <div>
                        <p className="text-white font-semibold text-sm drop-shadow-[0_1px_1px_rgba(0,0,0,0.9)]">{raffle?.owner?.name}</p>
                        <p className="text-white/90 text-xs">Verificado: {raffle?.owner?.verified ? "Sí" : "No"}</p>
                      </div>
                    </div>
                  ) : (
                    <p className="text-white/80">—</p>
                  )}

                  <button
                    onClick={reportIssue}
                    className="mt-4 w-full px-3 py-2 rounded-lg bg-red-500/20 hover:bg-red-500/30 text-red-100 text-sm"
                  >
                    🚩 Denunciar / Reportar problema
                  </button>
                </div>

                {/* Reglas y metadatos */}
                <div className="bg-white/10 border border-white/20 rounded-lg p-4 md:col-span-2">
                  <h3 className="text-white font-semibold mb-2 drop-shadow-[0_1px_1px_rgba(0,0,0,0.9)]">Detalles</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <p>
                        <span className="text-white/90">ID:</span>{" "}
                        <span className="font-mono">{raffle?.id}</span>
                      </p>
                      <p className="mt-1">
                        <span className="text-white/90">Estado:</span> {raffle?.status}
                      </p>
                      {maxParticipants && (
                        <p className="mt-1">
                          <span className="text-white/90">Capacidad (máx. participaciones):</span>{" "}
                          {maxParticipants}
                        </p>
                      )}
                      {typeof raffle?.freeShipping === "boolean" && (
                        <p className="mt-1">
                          <span className="text-white/90">Entrega:</span>{" "}
                          {raffle.freeShipping ? "Envío gratis" : "Acordar entrega"}
                        </p>
                      )}
                    </div>
                    <div>
                      {raffle?.publishedAt && (
                        <p className="mt-1">
                          <span className="text-white/90">Publicado:</span>{" "}
                          {new Date(raffle.publishedAt).toLocaleString()}
                        </p>
                      )}
                      {raffle?.endsAt && (
                        <p className="mt-1">
                          <span className="text-white/90">Finaliza:</span>{" "}
                          {new Date(raffle.endsAt).toLocaleString()}
                        </p>
                      )}
                      {minTicketsRequired > 1 && (
                        <p className="mt-1">
                          <span className="text-white/90">
                            Mínimo {minTicketsIsMandatory ? "obligatorio" : "sugerido"}:
                          </span>{" "}
                          {minTicketsRequired} ticket(s)
                        </p>
                      )}
                      {raffle?.prizeCategory && (
                        <p className="mt-1">
                          <span className="text-white/90">Categoría:</span>{" "}
                          {raffle.prizeCategory}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Sticky action bar (mobile) */}
          <div
            className={`lg:hidden fixed left-0 right-0 z-40 transition-transform duration-200 ${
              showSticky ? "translate-y-0 bottom-0" : "translate-y-[110%] bottom-0"
            }`}
          >
            {session && canParticipate && raffle?.status !== "FINISHED" && !isFull ? (
              <div className="m-2 p-2 rounded-xl bg-slate-900/70 backdrop-blur border border-white/10 shadow-xl">
                <button
                  onClick={() => setShowParticipateModal(true)}
                  className="relative w-full py-2 rounded-xl font-extrabold
                             bg-gradient-to-r from-lime-400 via-lime-500 to-emerald-600
                             hover:from-lime-500 hover:via-emerald-600 hover:to-emerald-700
                             text-slate-900 ring-1 ring-black/10 flex items-center justify-center gap-2"
                  aria-label={
                    showRequiredCount
                      ? `Participar, requiere ${minTicketsRequired} ticket${minTicketsRequired > 1 ? "s" : ""}`
                      : "Participar"
                  }
                >
                  <span>Participar</span>
                  <span className="inline-flex items-center">
                    <TicketIcon className="-rotate-12 w-5 h-5 opacity-95" />
                    {showRequiredCount && (
                      <span className="ml-1 font-extrabold">{minTicketsRequired}</span>
                    )}
                  </span>
                </button>

                {!showRequiredCount && showSuggestedCount && (
                  <div className="mt-1.5 flex items-center justify-center gap-2
                                  px-3 py-1.5 rounded-lg bg-lime-400/15 ring-1 ring-lime-300/40">
                    <TicketIcon className="-rotate-12 w-4 h-4 text-lime-300" />
                    <span className="text-lime-100 text-xs drop-shadow-[0_1px_1px_rgba(0,0,0,0.9)]">
                      <span className="font-semibold">Sugerido:</span>{" "}
                      <span className="font-extrabold">{minTicketsRequired}</span>{" "}
                      ticket{minTicketsRequired > 1 ? "s" : ""} para mejores chances
                    </span>
                  </div>
                )}
              </div>
            ) : null}
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
