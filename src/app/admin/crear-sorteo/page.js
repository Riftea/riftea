// src/app/admin/crear-sorteo/page.js
"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import Image from "next/image";
import SimpleCropper from "@/components/ui/SimpleCropper";

/* =======================
   Zona horaria (AR)
   ======================= */
const AR_TZ = "America/Argentina/Buenos_Aires";
const AR_OFFSET_MIN = 180; // UTC-03:00 -> sumar 180 min para pasar a UTC

function pad(n) { return String(n).padStart(2, "0"); }

/** Convierte Date a "YYYY-MM-DDTHH:mm" como si fuera hora AR, para <input type="datetime-local"> */
function dateToArInputValue(date = new Date()) {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: AR_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const parts = Object.fromEntries(fmt.formatToParts(date).map(p => [p.type, p.value]));
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}

/** Convierte Date a "YYYY-MM-DD" como si fuera fecha AR, para <input type="date"> */
function dateToArDateInputValue(date = new Date()) {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: AR_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return fmt.format(date); // "YYYY-MM-DD"
}

/** Convierte Date a HH:mm como si fuera hora AR (para <input type="time">) */
function dateToArTimeInputValue(date = new Date()) {
  const fmt = new Intl.DateTimeFormat("en-GB", {
    timeZone: AR_TZ,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  return fmt.format(date); // "HH:mm"
}

/** Parsea "YYYY-MM-DDTHH:mm" (hora AR) a ISO UTC */
function arLocalInputToUtcISO(inputStr = "") {
  if (!inputStr) return null;
  const m = String(inputStr).match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/);
  if (!m) return null;
  const [_, y, mo, d, h, mi] = m.map(Number);
  const ms = Date.UTC(y, mo - 1, d, h, mi);
  const utcMs = ms + AR_OFFSET_MIN * 60 * 1000;
  return new Date(utcMs).toISOString();
}

/** Combina "YYYY-MM-DD" + "HH:mm" (hora AR) a ISO UTC */
function arDateTimeToUtcISO(dateStr = "", timeStr = "") {
  if (!dateStr || !timeStr) return null;
  return arLocalInputToUtcISO(`${dateStr}T${timeStr}`);
}

/** Epoch UTC (ms) desde "YYYY-MM-DDTHH:mm" en AR */
function arLocalInputToEpochUtcMs(inputStr = "") {
  const iso = arLocalInputToUtcISO(inputStr);
  return iso ? Date.parse(iso) : NaN;
}

/** Fecha AR "hoy" vs otra fecha "YYYY-MM-DD" */
function isArSameDay(dateStr) {
  if (!dateStr) return false;
  const todayAr = dateToArDateInputValue(new Date());
  return todayAr === dateStr;
}

/** Fecha AR: dateStr (YYYY-MM-DD) es futura (mañana o más) */
function isArFutureDay(dateStr) {
  if (!dateStr) return false;
  const todayAr = dateToArDateInputValue(new Date());
  return dateStr > todayAr; // strings YYYY-MM-DD comparan bien lexicográficamente
}

/** Badge UI */
function tzBadge() {
  return "Hora Argentina (UTC-03:00)";
}

/* =======================
   Helpers existentes
   ======================= */
function onlyDigits(s = "") { return String(s).replace(/[^\d]/g, ""); }
function parseIntOrNull(v) { if (v === "" || v == null) return null; const n = parseInt(String(v), 10); return Number.isFinite(n) ? n : null; }
function normalizeThousandRule(raw) {
  const clean = onlyDigits(raw);
  if (!clean) return null;
  const n = parseInt(clean, 10);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n < 1000 ? n * 1000 : n;
}

const POT_CONTRIBUTION_CLIENT = 500; // aporte por ticket
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/jpg", "image/avif"];
const MAX_FILE_BYTES = 10 * 1024 * 1024;

async function resizeImageFile(file, maxW = 1600, quality = 0.85) {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxW / bitmap.width);
  const w = Math.round(bitmap.width * scale);
  const h = Math.round(bitmap.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(bitmap, 0, 0, w, h);
  let blob = await new Promise((r) => canvas.toBlob(r, "image/webp", quality));
  if (!blob) blob = await new Promise((r) => canvas.toBlob(r, file.type || "image/jpeg", 0.9));
  const name = (file.name || "upload").replace(/\.\w+$/, ".webp");
  return new File([blob], name, { type: blob.type });
}

// Probabilidad de ganar con k tickets en un total de N tickets: 1 - ((N-1)/N)^k
function probabilityPct(k, total) {
  const kk = parseIntOrNull(k);
  const tt = parseIntOrNull(total);
  if (!kk || !tt || kk <= 0 || tt <= 0) return null;
  const p = 1 - Math.pow((tt - 1) / tt, kk);
  return Math.max(0, Math.min(1, p)) * 100;
}

/* =======================
   UI: Modal Términos
   ======================= */
function TermsModal({ open, onClose }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4">
      <div className="max-w-2xl w-full bg-gray-900 text-gray-100 rounded-2xl border border-gray-700 shadow-xl overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-800 flex items-center justify-between">
          <h3 className="text-lg font-semibold">Términos y condiciones del sorteo</h3>
          <button onClick={onClose} className="px-3 py-1 bg-gray-800 rounded-lg hover:bg-gray-700">Cerrar</button>
        </div>
        <div className="p-5 space-y-3 text-sm leading-relaxed text-gray-200">
          <p>• El organizador se compromete a entregar el premio según el mecanismo de sorteo de la plataforma.</p>
          <p>• La plataforma puede anular/posponer el sorteo ante irregularidades o incumplimiento de reglas.</p>
          <p>• Las probabilidades dependen de la cantidad de tickets; el sorteo es auditable criptográficamente.</p>
          <p>• No se admiten premios prohibidos por ley. El organizador responde por la legalidad.</p>
          <p>• Al participar, los usuarios aceptan estos términos y las políticas de la plataforma.</p>
        </div>
      </div>
    </div>
  );
}

export default function CrearSorteoAdminPage() {
  const router = useRouter();
  const { data: session, status } = useSession();

  // ----- estado formulario
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");

  // Categoría & mínimo de tickets (UX)
  const [category, setCategory] = useState("");
  const [minTicketsPerParticipant, setMinTickets] = useState(1);
  const [minTicketsMandatory, setMinTicketsMandatory] = useState(false);

  // 🚚 Envío gratis / acordar entrega
  const [freeShipping, setFreeShipping] = useState(false);

  // Entradas crudas (strings)
  const [prizeValueInput, setPrizeValueInput] = useState("");
  const [participantGoal, setParticipantGoal] = useState("");

  // INICIO: sólo fecha en creación; si es futura, se habilita horario
  const [startsDate, setStartsDate] = useState(""); // "YYYY-MM-DD" (AR)
  const [startsTime, setStartsTime] = useState(""); // "HH:mm" (AR) — se habilita si startsDate > hoy

  // FIN: sigue siendo datetime-local (AR)
  const [endsAt, setEndsAt] = useState(""); // "YYYY-MM-DDTHH:mm" (AR)

  // Video YouTube (opcional)
  const [youtubeUrl, setYoutubeUrl] = useState("");
  const [youtubeError, setYoutubeError] = useState("");

  // Imagen: archivo + preview + crop
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState("");
  const [croppedDataUrl, setCroppedDataUrl] = useState("");
  const [cropOpen, setCropOpen] = useState(false);

  const [imageError, setImageError] = useState("");
  const [uploading, setUploading] = useState(false);

  // Visibilidad
  const [isPrivate, setIsPrivate] = useState(false);

  // Términos
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [termsOpen, setTermsOpen] = useState(false);

  // UI
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const isAuthLoading = status === "loading";

  const moneyFmt = useMemo(
    () => new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 }),
    []
  );

  // Valor del premio normalizado
  const prizeValueNormalized = useMemo(() => normalizeThousandRule(prizeValueInput), [prizeValueInput]);

  // Tickets totales necesarios para cubrir el premio
  const totalTicketsNeeded = useMemo(() => {
    if (!prizeValueNormalized) return null;
    return Math.ceil(prizeValueNormalized / POT_CONTRIBUTION_CLIENT);
  }, [prizeValueNormalized]);

  // Mínimo de participantes UX
  const minParticipantsUX = useMemo(() => {
    if (!totalTicketsNeeded) return null;
    const m = Math.max(1, Number(minTicketsPerParticipant || 1));
    return Math.ceil(totalTicketsNeeded / (minTicketsMandatory ? m : 1));
  }, [totalTicketsNeeded, minTicketsPerParticipant, minTicketsMandatory]);

  // preview del archivo
  useEffect(() => {
    if (!file) { setPreview(""); return; }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  // auth
  useEffect(() => {
    if (status === "unauthenticated") router.push("/login");
  }, [status, router]);

  // Tope dinámico del stepper (≥2 participantes)
  const totalParticipantsEstimado = useMemo(() => {
    const explicit = parseIntOrNull(participantGoal);
    if (explicit && explicit > 0) return explicit;
    return minParticipantsUX || null;
  }, [participantGoal, minParticipantsUX]);

  const maxMinTickets = useMemo(() => {
    if (!totalParticipantsEstimado) return 1;
    return Math.max(1, Math.floor(totalParticipantsEstimado / 2));
  }, [totalParticipantsEstimado]);

  useEffect(() => {
    setMinTickets((v) => Math.min(Math.max(1, v), maxMinTickets));
  }, [maxMinTickets]);

  // Mínimos para inputs (AR) con pequeño colchón
  function addMs(d, ms) { return new Date(d.getTime() + ms); }
  const minEndInputAR = useMemo(() => dateToArInputValue(addMs(new Date(), 60_000)), []);
  const todayArStr = useMemo(() => dateToArDateInputValue(new Date()), []);
  const isFutureStartDay = isArFutureDay(startsDate);

  // Validaciones
  const validate = () => {
    if (!title.trim()) return "El título es requerido";
    if (!description.trim()) return "La descripción no puede estar vacía";
    if (!termsAccepted) return "Debes aceptar los términos y condiciones";

    const prizeFinal = normalizeThousandRule(prizeValueInput);
    if (!prizeFinal || prizeFinal < 1000) {
      return "El valor del premio es obligatorio y debe ser un entero ≥ 1000";
    }

    if (String(participantGoal).trim() !== "") {
      const goalInt = parseIntOrNull(participantGoal);
      if (!goalInt || goalInt <= 0) return "El objetivo de participantes debe ser un entero mayor a 0";

      const baseNeeded = Math.ceil(prizeFinal / POT_CONTRIBUTION_CLIENT);
      const divisor = minTicketsMandatory ? Math.max(1, Number(minTicketsPerParticipant || 1)) : 1;
      const minParticipantsNeeded = Math.ceil(baseNeeded / divisor);

      if (goalInt < minParticipantsNeeded) {
        return `El objetivo de participantes debe ser ≥ ${minParticipantsNeeded}`;
      }
    }

    // INICIO: reglas
    if (startsDate) {
      if (isArSameDay(startsDate)) {
        // hoy: empieza ya
      } else if (isArFutureDay(startsDate)) {
        if (!startsTime) return "Elegí un horario para la fecha de inicio (solo para días futuros).";
        const startIso = arDateTimeToUtcISO(startsDate, startsTime);
        if (!startIso) return "Fecha/hora de inicio inválida";
        const startUtc = Date.parse(startIso);
        const nowUtc = Date.now();
        const GRACE_MS = 60_000;
        if (startUtc <= nowUtc + GRACE_MS) return "La fecha de inicio debe ser futura (Hora AR).";
      } else {
        return "La fecha de inicio no puede ser anterior a hoy (Hora AR).";
      }
    }

    // FIN: debe ser futuro y si hay inicio futuro, fin > inicio
    if (endsAt) {
      const endUtc = arLocalInputToEpochUtcMs(endsAt);
      if (!Number.isFinite(endUtc)) return "Fecha de finalización inválida";
      const nowUtc = Date.now();
      const GRACE_MS = 60_000;
      if (endUtc <= nowUtc + GRACE_MS) return "La fecha de finalización debe ser futura (Hora AR)";

      if (startsDate && isArFutureDay(startsDate) && startsTime) {
        const startIso = arDateTimeToUtcISO(startsDate, startsTime);
        const startUtc = startIso ? Date.parse(startIso) : NaN;
        if (Number.isFinite(startUtc) && endUtc <= startUtc + GRACE_MS) {
          return "La fecha de finalización debe ser posterior a la de inicio.";
        }
      }
    }

    if (file) {
      if (!ALLOWED_TYPES.includes(file.type)) return "Formato de imagen no soportado (usa JPG/PNG/WebP/AVIF)";
      if (file.size > MAX_FILE_BYTES) return "La imagen supera el tamaño máximo (10MB)";
    }

    if (minTicketsPerParticipant < 1) return "El mínimo de tickets por participante debe ser al menos 1";
    if (minTicketsPerParticipant > maxMinTickets) {
      return `El mínimo de tickets por participante no puede superar ${maxMinTickets} (asegura que haya al menos 2 participantes).`;
    }

    // YouTube (opcional)
    if (youtubeUrl.trim()) {
      const ok = isValidYouTubeUrl(youtubeUrl.trim());
      if (!ok) return "El enlace de YouTube no parece válido. Probá con un enlace tipo https://www.youtube.com/watch?v=...";
    }

    return null;
  };

  // Subida de imagen
  const maybeUploadImage = async () => {
    if (!file && !croppedDataUrl) return null;
    setImageError("");
    setUploading(true);
    try {
      const fd = new FormData();

      if (croppedDataUrl) {
        fd.append("dataUrl", croppedDataUrl);
      } else if (file) {
        let toUpload = file;
        try {
          toUpload = await resizeImageFile(file, 1600, 0.85);
        } catch (e) {
          console.warn("Resize falló; subiendo original:", e);
        }
        fd.append("file", toUpload);
      }

      const res = await fetch("/api/uploads", { method: "POST", body: fd });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "No se pudo subir la imagen");
      return data?.url || null;
    } catch (e) {
      setImageError(e.message || "Error subiendo imagen");
      return null;
    } finally {
      setUploading(false);
    }
  };

  // YouTube helpers
  function isValidYouTubeUrl(u = "") {
    try {
      const url = new URL(u);
      if (!/^(www\.)?(youtube\.com|youtu\.be)$/i.test(url.hostname)) return false;
      if (url.hostname.includes("youtu.be")) return url.pathname.slice(1).length > 0;
      if (url.pathname === "/watch") return !!url.searchParams.get("v");
      if (/^\/(live|shorts)\/[A-Za-z0-9_-]+$/.test(url.pathname)) return true;
      return false;
    } catch { return false; }
  }

  function toEmbedUrl(u = "") {
    try {
      const url = new URL(u);
      if (url.hostname.includes("youtu.be")) {
        const id = url.pathname.slice(1);
        return `https://www.youtube.com/embed/${id}?rel=0&modestbranding=1`;
        }
      if (url.pathname === "/watch") {
        const id = url.searchParams.get("v");
        return id ? `https://www.youtube.com/embed/${id}?rel=0&modestbranding=1` : "";
      }
      const m = url.pathname.match(/^\/(live|shorts)\/([A-Za-z0-9_-]+)$/);
      if (m) return `https://www.youtube.com/embed/${m[2]}?rel=0&modestbranding=1`;
      return "";
    } catch { return ""; }
  }

  // Submit
  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setYoutubeError("");

    if (!session?.user?.id) {
      setError("Sesión no válida. Por favor, inicia sesión nuevamente.");
      router.push("/login");
      return;
    }

    const v = validate();
    if (v) { setError(v); return; }

    const prizeFinal = normalizeThousandRule(prizeValueInput);

    const goalFromUx =
      String(participantGoal).trim() === "" && prizeFinal
        ? (minParticipantsUX ?? Math.ceil(prizeFinal / POT_CONTRIBUTION_CLIENT))
        : null;

    const goalInt =
      String(participantGoal).trim() === ""
        ? goalFromUx
        : parseInt(participantGoal, 10);

    // Footer en descripción según modo (sugerida/obligatoria)
    let descriptionFooter = "";
    if (minTicketsPerParticipant > 1) {
      const ruleLabel = minTicketsMandatory ? "Reglas obligatorias" : "Reglas sugeridas";
      const ruleText = minTicketsMandatory
        ? `• Cada participante debe comprar al menos ${minTicketsPerParticipant} ticket(s).`
        : `• Mínimo de tickets por participante: ${minTicketsPerParticipant}`;
      descriptionFooter = `\n\n—\nℹ️ ${ruleLabel}:\n${ruleText}`;
    }

    // ⛔️ Ya no agregamos la categoría a la descripción
    const finalDescription =
      [description.trim(), descriptionFooter]
        .filter(Boolean)
        .join("");

    // INICIO:
    // - Si no hay fecha o si es HOY (AR) => empieza YA (deja que el backend fije "now"): NO enviar startsAt.
    // - Si fecha FUTURA => usar fecha + horario obligatorios y enviar startsAt en UTC.
    let startsAtUtcISO = null;
    if (!startsDate || isArSameDay(startsDate)) {
      startsAtUtcISO = null;
    } else if (isArFutureDay(startsDate)) {
      startsAtUtcISO = arDateTimeToUtcISO(startsDate, startsTime);
    }

    // FIN: opcional
    const endsAtUtcISO = endsAt ? arLocalInputToUtcISO(endsAt) : null;

    setLoading(true);
    try {
      const finalImageUrl = await maybeUploadImage();

      const payload = {
        title: title.trim(),
        description: finalDescription,
        prizeValue: prizeFinal,
        ...(goalInt != null ? { participantGoal: goalInt } : {}),
        ...(finalImageUrl && { imageUrl: finalImageUrl }),
        ...(startsAtUtcISO != null ? { startsAt: startsAtUtcISO } : {}), // solo si hay fecha futura
        ...(endsAtUtcISO && { endsAt: endsAtUtcISO }),
        ...(category && { prizeCategory: category }), // ✅ categoría como metadato
        ...(youtubeUrl.trim() && { youtubeUrl: youtubeUrl.trim() }),
        isPrivate,
        termsAccepted: true,
        minTicketsPerParticipant: Math.max(1, Number(minTicketsPerParticipant)),
        minTicketsIsMandatory: Boolean(minTicketsMandatory),
        inputTimeZone: AR_TZ,
        startInputMode: !startsDate || isArSameDay(startsDate) ? "NOW_AR" : "SCHEDULE_AR",

        // 🚚 Nuevo: envío
        freeShipping: !!freeShipping, // true => "Envío gratis", false => "Acordar entrega"
      };

      const res = await fetch("/api/raffles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });

      const data = await res.json().catch(() => ({}));

      if (res.ok) {
        router.push("/mis-sorteos");
        return;
      }

      if (res.status === 401) {
        setError("No autorizado. Debes iniciar sesión.");
        router.push("/login");
        return;
      }

      setError(data?.error || data?.message || "Error al crear el sorteo");
    } catch (err) {
      console.error("Error creating raffle:", err);
      setError("Error de conexión. Verifica tu red e inténtalo de nuevo.");
    } finally {
      setLoading(false);
    }
  };

  const onChangePrize = (e) => setPrizeValueInput(onlyDigits(e.target.value));
  const onChangeGoal = (e) => setParticipantGoal(onlyDigits(e.target.value));

  const canSubmit =
    !!title.trim() &&
    !!description.trim() &&
    termsAccepted &&
    !!normalizeThousandRule(prizeValueInput) &&
    !uploading &&
    (!startsDate || isArSameDay(startsDate) || (isArFutureDay(startsDate) && !!startsTime));

  const disabledReason = !normalizeThousandRule(prizeValueInput)
    ? "Ingresá un valor de premio válido"
    : !title.trim()
    ? "Completá el título"
    : !description.trim()
    ? "Completá la descripción"
    : !termsAccepted
    ? "Aceptá los términos y condiciones"
    : (startsDate && isArFutureDay(startsDate) && !startsTime)
    ? "Elegí el horario de inicio para la fecha futura"
    : uploading
    ? "Esperá a que termine la subida de imagen"
    : "";

  const DESC_MAX = 600;

  const minTicketsProb = useMemo(() => {
    if (!minTicketsPerParticipant || !totalParticipantsEstimado) return null;
    return probabilityPct(minTicketsPerParticipant, totalParticipantsEstimado);
  }, [minTicketsPerParticipant, totalParticipantsEstimado]);

  const incMin = () => setMinTickets((v) => Math.min(maxMinTickets, v + 1));
  const decMin = () => setMinTickets((v) => Math.max(1, v - 1));

  return isAuthLoading ? (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 to-gray-800 flex items-center justify-center p-4">
      <div className="text-center">
        <div className="relative mb-6">
          <div className="w-16 h-16 border-4 border-orange-500 border-t-transparent rounded-full animate-spin mx-auto"></div>
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-12 h-12 border-4 border-orange-400 border-t-transparent rounded-full animate-spin-reverse"></div>
          </div>
        </div>
        <h2 className="text-xl font-semibold text-white mb-2">Verificando sesión</h2>
        <p className="text-gray-400">Preparando el panel de creación de sorteos...</p>
      </div>
    </div>
  ) : (
    <div className="min-h-screen bg-gradient-to-br from-gray-950 to-gray-900 text-gray-100">
      <TermsModal open={termsOpen} onClose={() => setTermsOpen(false)} />

      {/* Modal de recorte */}
      <SimpleCropper
        open={cropOpen}
        onClose={() => setCropOpen(false)}
        file={file ? file : (preview ? { src: preview } : null)}
        onCropped={(dataUrl) => setCroppedDataUrl(dataUrl)}
        outputWidth={1200}
        rememberAspectKey="raffles.cropAspect"
        minOutputWidth={700}
      />

      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="bg-gray-800/50 backdrop-blur-sm border border-gray-700 rounded-2xl overflow-hidden shadow-2xl">
          {/* Header */}
          <div className="relative p-8 bg-gradient-to-r from-gray-800 to-gray-800/90 border-b border-gray-700">
            <div className="absolute inset-0 bg-gradient-to-r from-orange-500/5 to-transparent pointer-events-none"></div>
            <div className="relative">
              <div className="flex items-center mb-4">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-orange-500 to-orange-600 flex items-center justify-center mr-4">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                  </svg>
                </div>
                <h1 className="text-2xl font-bold text-white">Crear Nuevo Sorteo</h1>
              </div>
              <p className="text-gray-300 mb-4 max-w-2xl">
                Completá los datos. El inicio se fija automáticamente si el sorteo empieza hoy; si lo programás para otro día, podrás elegir el horario.
              </p>
              <div className="flex items-center bg-gray-700/50 border border-gray-600 rounded-lg p-3">
                <div className="w-2 h-2 bg-green-500 rounded-full mr-2"></div>
                <span className="text-gray-200 font-medium">Sesión: </span>
                <span className="text-orange-400 ml-2">{session?.user?.name || "Usuario"}</span>
                {session?.user?.role && (
                  <span className="ml-3 px-2 py-0.5 bg-orange-500/20 text-orange-300 text-xs rounded-full">
                    {String(session.user.role).toLowerCase()}
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="p-8">
            {/* Mensaje de error */}
            {error && (
              <div className="mb-6 p-5 bg-red-900/30 border border-red-800 rounded-xl">
                <div className="flex items-start">
                  <svg className="h-5 w-5 text-red-400 mt-0.5 mr-3 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                    <path
                      fillRule="evenodd"
                      d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1H9z"
                      clipRule="evenodd"
                    />
                  </svg>
                  <div>
                    <h3 className="text-lg font-medium text-red-200">Error al crear sorteo</h3>
                    <div className="mt-2 text-red-300">
                      <p>{error}</p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-7">
              {/* Título */}
              <div>
                <div className="flex justify-between items-center mb-2">
                  <label className="block text-sm font-medium text-gray-200">
                    Título del Sorteo <span className="text-orange-400">*</span>
                  </label>
                  <span className="text-xs text-gray-400">{title.length}/100</span>
                </div>
                <input
                  type="text"
                  className="w-full bg-gray-700/50 border border-gray-600 rounded-xl px-4 py-3.5 focus:ring-2 focus:ring-orange-500 focus:border-orange-500 text-white placeholder-gray-400"
                  placeholder="Ej: iPhone 15 Pro Max"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  disabled={loading}
                  maxLength={100}
                  required
                  title={!title.trim() ? "Completá el título" : undefined}
                />
              </div>

              {/* Descripción */}
              <div>
                <div className="flex justify-between items-center mb-2">
                  <label className="block text-sm font-medium text-gray-200">
                    Descripción <span className="text-orange-400">*</span>
                  </label>
                  <span className="text-xs text-gray-400">{description.length}/{DESC_MAX}</span>
                </div>
                <textarea
                  className={`w-full bg-gray-700/50 border ${description.trim() ? "border-gray-600" : "border-amber-600"} rounded-xl px-4 py-3.5 focus:ring-2 focus:ring-orange-500 focus:border-orange-500 text-white placeholder-gray-400 min-h-[140px]`}
                  placeholder="Describe el premio y las condiciones del sorteo..."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  disabled={loading}
                  maxLength={DESC_MAX}
                  required
                  title={!description.trim() ? "Completá la descripción" : undefined}
                />
              </div>

              {/* Premio / objetivo / visibilidad */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div>
                  <label className="block text-sm font-medium text-gray-200 mb-2">
                    Quiero recibir <span className="text-orange-400">*</span>
                  </label>
                  <input
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    className="w-full bg-gray-700/50 border border-gray-600 rounded-xl px-4 py-3.5 focus:ring-2 focus:ring-orange-500 focus:border-orange-500 text-white placeholder-gray-400"
                    placeholder="Ej: 500 (se interpreta $500.000) o 1000 literal"
                    value={prizeValueInput}
                    onChange={onChangePrize}
                    disabled={loading}
                    required
                    title={!prizeValueNormalized ? "Ingresá el valor del premio" : undefined}
                  />
                  <p className="text-xs text-gray-400 mt-1">
                    Valor del premio: {moneyFmt.format(prizeValueNormalized || 0)}
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-200 mb-2">
                    Cantidad de participantes
                  </label>
                  <input
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    className="w-full bg-gray-700/50 border border-gray-600 rounded-xl px-4 py-3.5 focus:ring-2 focus:ring-orange-500 focus:border-orange-500 text-white placeholder-gray-400"
                    placeholder={minParticipantsUX ? `≥ ${minParticipantsUX}` : "Ej: 100"}
                    value={participantGoal}
                    onChange={onChangeGoal}
                    disabled={loading}
                    title="Si lo dejás vacío, se usará automáticamente el mínimo requerido"
                  />
                  {minParticipantsUX && (
                    <p className="text-xs mt-1 text-gray-300">
                      Mínimo requerido para cubrir el sorteo:{" "}
                      <b className="text-orange-300">{minParticipantsUX}</b>
                      {minTicketsMandatory && minTicketsPerParticipant > 1 ? (
                        <span className="text-gray-400"> (con mínimo {minTicketsPerParticipant} ticket(s) por usuario)</span>
                      ) : null}
                    </p>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-200 mb-2">Visibilidad</label>
                  <div className="flex items-center h-[52px] bg-gray-700/50 border border-gray-600 rounded-xl px-4">
                    <input
                      id="isPrivate"
                      type="checkbox"
                      checked={isPrivate}
                      onChange={(e) => setIsPrivate(e.target.checked)}
                      className="h-4 w-4 text-orange-600 rounded border-gray-600"
                      disabled={loading}
                    />
                    <label htmlFor="isPrivate" className="ml-3 text-sm text-gray-300">
                      No listado (acceso por link)
                    </label>
                  </div>
                  <p className="text-xs text-gray-400 mt-2">
                    {isPrivate
                      ? "No aparecerá en 'Explorar'; cualquiera con el link podrá verlo."
                      : "Se solicitará aprobación de un admin para aparecer públicamente en 'Explorar'."}
                  </p>
                </div>
              </div>

              {/* Categoría + mínimo de tickets */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-gray-200 mb-2">Categoría</label>
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    className="w-full bg-gray-700/50 border border-gray-600 rounded-xl px-4 py-3.5 text-white"
                    disabled={loading}
                  >
                    {[
                      { value: "", label: "Sin categoría" },
                      { value: "Tecnología", label: "Tecnología" },
                      { value: "Electrodomésticos", label: "Electrodomésticos" },
                      { value: "Hogar y Deco", label: "Hogar y Deco" },
                      { value: "Moda y Accesorios", label: "Moda y Accesorios" },
                      { value: "Deportes", label: "Deportes" },
                      { value: "Gaming", label: "Gaming" },
                      { value: "Otros", label: "Otros" },
                    ].map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                  <p className="text-xs text-gray-400 mt-2">
                    La categoría se guarda como metadato (<b>no</b> se agrega a la descripción).
                  </p>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-2 gap-4">
                    <label className="block text-sm font-medium text-gray-200">
                      Cantidad de tickets por participante
                    </label>
                    <div className="flex items-center gap-3">
                      <label htmlFor="minTicketsMandatory" className="text-xs text-gray-300 whitespace-nowrap">
                        Hacer obligatorio
                      </label>
                      <input
                        id="minTicketsMandatory"
                        type="checkbox"
                        checked={minTicketsMandatory}
                        onChange={(e) => setMinTicketsMandatory(e.target.checked)}
                        className="h-4 w-4 text-orange-600 rounded border-gray-600"
                        disabled={loading}
                      />
                    </div>
                  </div>

                  {/* Stepper */}
                  <div className="inline-flex items-center bg-gray-700/50 border border-gray-600 rounded-xl overflow-hidden">
                    <button
                      type="button"
                      onClick={decMin}
                      disabled={loading || minTicketsPerParticipant <= 1}
                      aria-label="Disminuir"
                      className="px-4 py-3.5 hover:bg-gray-700 disabled:opacity-50"
                    >
                      <svg viewBox="0 0 24 24" className="w-5 h-5" fill="currentColor"><path d="M5 12h14"></path></svg>
                    </button>

                    <div className="min-w-[64px] text-center px-3 py-3.5 font-semibold text-white select-none">
                      {minTicketsPerParticipant}
                    </div>

                    <button
                      type="button"
                      onClick={incMin}
                      disabled={loading || minTicketsPerParticipant >= maxMinTickets}
                      aria-label="Aumentar"
                      className="px-4 py-3.5 hover:bg-gray-700 disabled:opacity-50"
                    >
                      <svg viewBox="0 0 24 24" className="w-5 h-5" fill="currentColor"><path d="M12 5v14M5 12h14"></path></svg>
                    </button>
                  </div>

                  <div className="mt-2 text-xs text-gray-400">
                    Máxima por usuario: <b className="text-gray-300">{maxMinTickets}</b> {maxMinTickets <= 1 ? "" : "(para asegurar al menos 2 participantes)"}
                    {minTicketsMandatory ? (
                      <div className="mt-1 text-orange-300">Esta regla será obligatoria.</div>
                    ) : (
                      <div className="mt-1">Esta regla será una sugerencia.</div>
                    )}
                  </div>

                  {minTicketsProb != null && totalParticipantsEstimado != null && (
                    <p className="text-xs text-gray-400 mt-2">
                      Con <b>{minTicketsPerParticipant} ticket(s)</b> y ~<b>{totalParticipantsEstimado}</b> participantes, tu prob. ≈{" "}
                      <b>{minTicketsProb.toFixed(1)}%</b>
                    </p>
                  )}
                </div>
              </div>

              {/* 🚚 Envío / Entrega */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-200 mb-2">Entrega del premio</label>
                  <div className="inline-flex bg-gray-700/50 border border-gray-600 rounded-xl overflow-hidden">
                    <button
                      type="button"
                      onClick={() => setFreeShipping(true)}
                      className={`px-4 py-3.5 text-sm ${freeShipping ? "bg-orange-600 text-white" : "text-gray-200 hover:bg-gray-700"}`}
                      aria-pressed={freeShipping}
                    >
                      Envío gratis
                    </button>
                    <button
                      type="button"
                      onClick={() => setFreeShipping(false)}
                      className={`px-4 py-3.5 text-sm ${!freeShipping ? "bg-orange-600 text-white" : "text-gray-200 hover:bg-gray-700"}`}
                      aria-pressed={!freeShipping}
                    >
                      Acordar entrega
                    </button>
                  </div>
                  <p className="text-xs text-gray-400 mt-2">
                    Esta preferencia se guarda como metadato del sorteo.
                  </p>
                </div>
              </div>

              {/* INICIO: sólo fecha (AR) + horario si es fecha futura */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="block text-sm font-medium text-gray-200">Fecha de inicio</label>
                    <span className="text-[11px] px-2 py-0.5 rounded bg-gray-700 text-gray-300 border border-gray-600">{tzBadge()}</span>
                  </div>
                  <input
                    type="date"
                    className="w-full bg-gray-700/50 border border-gray-600 rounded-xl px-4 py-3.5 focus:ring-2 focus:ring-orange-500 focus:border-orange-500 text-white"
                    value={startsDate}
                    onChange={(e) => {
                      const v = e.target.value;
                      setStartsDate(v);
                      if (!v || isArSameDay(v)) setStartsTime("");
                    }}
                    min={todayArStr}
                    disabled={loading}
                  />
                  <p className="text-xs text-gray-400 mt-2">
                    Si elegís <b>hoy</b> o dejás vacío, el sorteo <b>empieza ahora</b> al crear. Para programar, elegí un día futuro.
                  </p>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className={`block text-sm font-medium ${isFutureStartDay ? "text-gray-200" : "text-gray-500"}`}>
                      Horario de inicio (solo si la fecha es futura)
                    </label>
                    <span className="text-[11px] px-2 py-0.5 rounded bg-gray-700 text-gray-300 border border-gray-600">{tzBadge()}</span>
                  </div>
                  <input
                    type="time"
                    className={`w-full bg-gray-700/50 border ${isFutureStartDay ? "border-gray-600" : "border-gray-700"} rounded-xl px-4 py-3.5 focus:ring-2 ${isFutureStartDay ? "focus:ring-orange-500 focus:border-orange-500" : "focus:ring-gray-700 focus:border-gray-700"} text-white placeholder-gray-400`}
                    value={startsTime}
                    onChange={(e) => setStartsTime(e.target.value)}
                    disabled={loading || !isFutureStartDay}
                  />
                  {isFutureStartDay ? (
                    <p className="text-xs text-gray-400 mt-2">
                      Requerido para programar el inicio en un día futuro.
                    </p>
                  ) : (
                    <p className="text-xs text-gray-500 mt-2">
                      Se habilita al elegir una fecha posterior a hoy.
                    </p>
                  )}
                </div>
              </div>

              {/* FIN: datetime-local AR */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="md:col-span-2">
                  <div className="flex items-center justify-between mb-2">
                    <label className="block text-sm font-medium text-gray-200">Fecha de finalización (opcional)</label>
                    <span className="text-[11px] px-2 py-0.5 rounded bg-gray-700 text-gray-300 border border-gray-600">{tzBadge()}</span>
                  </div>
                  <input
                    type="datetime-local"
                    className="w-full bg-gray-700/50 border border-gray-600 rounded-xl px-4 py-3.5 focus:ring-2 focus:ring-orange-500 focus:border-orange-500 text-white"
                    value={endsAt}
                    onChange={(e) => setEndsAt(e.target.value)}
                    disabled={loading}
                    min={minEndInputAR}
                  />
                  <p className="text-xs text-gray-400 mt-2">
                    Debe ser futura. Si programaste inicio futuro, la finalización debe ser posterior al inicio.
                  </p>
                </div>
              </div>

              {/* Video YouTube (opcional) */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-sm font-medium text-gray-200">
                    Enlace de YouTube (opcional)
                  </label>
                  <span className="text-xs text-gray-400">
                    Sugerido: poner el video como <b>Oculto (Unlisted)</b>, no Privado.
                  </span>
                </div>
                <input
                  type="url"
                  placeholder="https://www.youtube.com/watch?v=XXXXXXXXXXX"
                  className="w-full bg-gray-700/50 border border-gray-600 rounded-xl px-4 py-3.5 focus:ring-2 focus:ring-orange-500 focus:border-orange-500 text-white placeholder-gray-400"
                  value={youtubeUrl}
                  onChange={(e) => {
                    setYoutubeUrl(e.target.value);
                    setYoutubeError("");
                  }}
                  disabled={loading}
                />
                {youtubeError && <p className="mt-2 text-sm text-red-300">{youtubeError}</p>}

                {youtubeUrl.trim() && isValidYouTubeUrl(youtubeUrl.trim()) && (
                  <div className="mt-3">
                    <div className="relative w-full aspect-video rounded-xl overflow-hidden border border-gray-700 bg-black">
                      <iframe
                        src={toEmbedUrl(youtubeUrl.trim())}
                        className="absolute inset-0 w-full h-full"
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                        allowFullScreen
                        loading="lazy"
                        title="Vista previa del video"
                      />
                    </div>
                    <p className="text-xs text-gray-400 mt-2">
                      Si el video es <b>Privado</b>, no se podrá reproducir aquí. Usá <b>Oculto</b> y compartí el link.
                    </p>
                  </div>
                )}
              </div>

              {/* Imagen (archivo + recorte) */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-gray-200 mb-2">Subir / Sacar foto (opcional)</label>
                  <input
                    type="file"
                    accept={ALLOWED_TYPES.join(",")}
                    capture="environment"
                    onChange={(e) => {
                      const f = e.target.files?.[0] || null;
                      setFile(f);
                      setCroppedDataUrl("");
                    }}
                    disabled={loading}
                    className="block w-full text-sm text-gray-300
                      file:mr-4 file:py-2.5 file:px-4
                      file:rounded-lg file:border-0
                      file:text-sm file:font-semibold
                      file:bg-orange-600 file:text-white
                      hover:file:bg-orange-700"
                    title="Formatos permitidos: JPG, PNG, WebP, AVIF (máx. 10MB)"
                  />
                  {imageError && (
                    <p className="mt-2 text-sm text-red-300">{imageError}</p>
                  )}
                </div>

                {(preview || croppedDataUrl) && (
                  <div className="mt-6 md:mt-0">
                    <p className="block text-sm font-medium text-gray-200 mb-2">Previsualización</p>
                    <div className="relative w-full h-56 overflow-hidden rounded-lg border border-gray-700 bg-gray-800">
                      <Image
                        src={croppedDataUrl || preview}
                        alt="Preview"
                        fill
                        className="object-cover"
                        loader={({ src }) => src}
                        unoptimized
                      />
                    </div>

                    <div className="flex gap-2 mt-3">
                      <button
                        type="button"
                        onClick={() => setCropOpen(true)}
                        disabled={!file || loading}
                        className="px-3 py-2 rounded-lg bg-gray-700 border border-gray-600 text-gray-100 hover:bg-gray-600 disabled:opacity-60"
                        title={!file ? "Primero seleccioná una imagen" : "Abrir recorte"}
                      >
                        Recortar imagen
                      </button>
                      {croppedDataUrl && (
                        <button
                          type="button"
                          onClick={() => setCroppedDataUrl("")}
                          className="px-3 py-2 rounded-lg border border-gray-600 text-gray-200 hover:bg-gray-700"
                          title="Quitar recorte aplicado"
                        >
                          Quitar recorte
                        </button>
                      )}
                    </div>

                    {uploading && (
                      <p className="mt-2 text-xs text-gray-400">Subiendo y optimizando imagen…</p>
                    )}
                  </div>
                )}
              </div>

              {/* Términos */}
              <div className="flex items-start gap-3">
                <input
                  id="termsAccepted"
                  type="checkbox"
                  checked={termsAccepted}
                  onChange={(e) => setTermsAccepted(e.target.checked)}
                  className="mt-1 h-4 w-4 text-orange-600 rounded border-gray-600"
                  disabled={loading}
                />
                <label htmlFor="termsAccepted" className="text-sm text-gray-300">
                  Acepto los{" "}
                  <button
                    type="button"
                    className="text-orange-400 hover:underline"
                    onClick={() => setTermsOpen(true)}
                  >
                    términos y condiciones
                  </button>{" "}
                  del sorteo.
                </label>
              </div>

              {/* Botones */}
              <div className="flex flex-col sm:flex-row gap-4 pt-6 border-t border-gray-700">
                <button
                  type="submit"
                  disabled={loading || !canSubmit}
                  className="group flex-1 px-6 py-3.5 bg-gradient-to-r from-orange-500 to-orange-600 text-white rounded-xl font-medium hover:from-orange-600 hover:to-orange-700 focus:ring-2 focus:ring-orange-500 focus:ring-offset-2 focus:ring-offset-gray-900 disabled:opacity-60 disabled:cursor-not-allowed transition-all"
                  title={!canSubmit ? disabledReason : undefined}
                >
                  {loading ? "Creando sorteo..." : "Crear Sorteo"}
                  {!canSubmit && (
                    <span className="ml-2 text-xs opacity-80 hidden sm:inline">
                      — {disabledReason}
                    </span>
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => router.push("/mis-sorteos")}
                  disabled={loading}
                  className="px-6 py-3.5 border border-gray-600 text-gray-300 rounded-xl font-medium hover:bg-gray-700/50 focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 focus:ring-offset-gray-900 disabled:bg-gray-800/50 disabled:cursor-not-allowed transition-all"
                >
                  Cancelar
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setTitle("");
                    setDescription("");
                    setPrizeValueInput("");
                    setParticipantGoal("");
                    setStartsDate("");
                    setStartsTime("");
                    setEndsAt("");
                    setFile(null);
                    setPreview("");
                    setCroppedDataUrl("");
                    setError("");
                    setIsPrivate(false);
                    setTermsAccepted(false);
                    setCategory("");
                    setMinTickets(1);
                    setMinTicketsMandatory(false);
                    setImageError("");
                    setYoutubeUrl("");
                    setYoutubeError("");
                    setFreeShipping(false);
                  }}
                  disabled={loading}
                  className="px-4 py-3.5 text-gray-400 hover:text-white hover:bg-gray-700/50 rounded-xl transition-all"
                  title="Limpiar formulario"
                >
                  Limpiar
                </button>
              </div>
            </form>
          </div>

          {/* Tips */}
          <div className="px-8 pb-6 bg-gray-800/30 border-t border-gray-700">
            <div className="flex items-start p-4 bg-gray-700/30 rounded-xl border border-gray-600">
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
                <p className="text-sm font-medium text-orange-200">Consejos para sorteos exitosos</p>
                <ul className="mt-1 text-sm text-gray-300 space-y-1">
                  <li className="flex items-start">
                    <span className="h-1.5 w-1.5 bg-orange-400 rounded-full mt-1.5 mr-2 flex-shrink-0"></span>
                    <span>Usá títulos claros y una buena imagen del premio. Podés recortarla en 1:1, 4:3 o 16:9.</span>
                  </li>
                  <li className="flex items-start">
                    <span className="h-1.5 w-1.5 bg-orange-400 rounded-full mt-1.5 mr-2 flex-shrink-0"></span>
                    <span>Podés escribir 1 y se interpreta $1.000; 10 → $10.000, etc.</span>
                  </li>
                  <li className="flex items-start">
                    <span className="h-1.5 w-1.5 bg-orange-400 rounded-full mt-1.5 mr-2 flex-shrink-0"></span>
                    <span>Si dejás vacío el inicio o elegís “hoy”, el sorteo comienza al crear. Para programar, elegí un día futuro y horario.</span>
                  </li>
                  <li className="flex items-start">
                    <span className="h-1.5 w-1.5 bg-orange-400 rounded-full mt-1.5 mr-2 flex-shrink-0"></span>
                    <span>Los horarios/fechas se interpretan en {tzBadge()} y se guardan en UTC para evitar errores.</span>
                  </li>
                  <li className="flex items-start">
                    <span className="h-1.5 w-1.5 bg-orange-400 rounded-full mt-1.5 mr-2 flex-shrink-0"></span>
                    <span>Para videos, usá enlace <b>Oculto</b> (no Privado) para que se pueda reproducir acá.</span>
                  </li>
                </ul>
              </div>
            </div>
          </div>
          {/* /Tips */}
        </div>
      </div>
    </div>
  );
}
