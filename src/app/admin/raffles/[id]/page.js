// src/app/admin/raffles/[id]/page.js
"use client";

import { useEffect, useMemo, useState, useRef } from "react";
import { useRouter, useParams } from "next/navigation";
import NextImage from "next/image";
import { useSession } from "next-auth/react";

/* =======================
   Helpers
   ======================= */

function onlyDigits(s = "") {
  return String(s).replace(/[^\d]/g, "");
}
function parseIntOrNull(v) {
  if (v === "" || v == null) return null;
  const n = parseInt(String(v), 10);
  return Number.isFinite(n) ? n : null;
}
// Regla en miles: 1 → 1000, 10 → 10000; ≥1000 literal
function normalizeThousandRule(raw) {
  const clean = onlyDigits(raw);
  if (!clean) return null;
  const n = parseInt(clean, 10);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n < 1000 ? n * 1000 : n;
}
function toLocalDateTimeInputValue(d) {
  if (!d) return "";
  const dt = d instanceof Date ? d : new Date(d);
  if (isNaN(dt.getTime())) return "";
  const pad = (x) => String(x).padStart(2, "0");
  return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(
    dt.getDate()
  )}T${pad(dt.getHours())}:${pad(dt.getMinutes())}`;
}

// Probabilidad aprox.: 1 - ((N-1)/N)^k
function probabilityPct(k, total) {
  const kk = parseIntOrNull(k);
  const tt = parseIntOrNull(total);
  if (!kk || !tt || kk <= 0 || tt <= 0) return null;
  const p = 1 - Math.pow((tt - 1) / tt, kk);
  return Math.max(0, Math.min(1, p)) * 100;
}

// Resize en el browser → WebP (post-crop para asegurar tamaño razonable)
async function resizeImageFile(file, maxW = 1600, quality = 0.85) {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxW / bitmap.width);
  const w = Math.round(bitmap.width * scale);
  const h = Math.round(bitmap.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(bitmap, 0, 0, w, h);
  let blob = await new Promise((r) => canvas.toBlob(r, "image/webp", quality));
  if (!blob) {
    blob = await new Promise((r) =>
      canvas.toBlob(r, file.type || "image/jpeg", 0.9)
    );
  }
  const name = (file.name || "upload").replace(/\.\w+$/, ".webp");
  return new File([blob], name, { type: blob.type });
}

const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/jpg", "image/avif"];
const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10MB

// Aporte al pozo por ticket (UX); el server usa su propia constante
const POT_CONTRIBUTION_CLIENT = 500;

/* =======================
   Parser/Rebuilder de reglas en descripción
   ======================= */

// Extrae (si existiera) el bloque de reglas del final y devuelve:
// { cleanDescription, min, mandatory }
function parseRulesFromDescription(desc = "") {
  let clean = String(desc || "");
  let min = 1;
  let mandatory = false;

  // Dos variantes: Sugeridas u Obligatorias
  const reMandatory = /\n?—\nℹ️ Reglas obligatorias:\s*\n• Cada participante debe comprar al menos (\d+)\s*ticket\(s\)\.\s*$/m;
  const reSuggested = /\n?—\nℹ️ Reglas sugeridas:\s*\n• Mínimo de tickets por participante:\s*(\d+)\s*$/m;

  const m1 = clean.match(reMandatory);
  const m2 = clean.match(reSuggested);

  if (m1) {
    mandatory = true;
    min = Math.max(1, parseInt(m1[1], 10));
    clean = clean.replace(reMandatory, "").trim();
  } else if (m2) {
    mandatory = false;
    min = Math.max(1, parseInt(m2[1], 10));
    clean = clean.replace(reSuggested, "").trim();
  }

  return { cleanDescription: clean, minTickets: min, mandatory };
}

// Solo agrega el bloque de reglas (no categoría)
function buildRulesFooter(minTicketsPerParticipant, minTicketsIsMandatory) {
  if (!(Number(minTicketsPerParticipant) > 1)) return "";
  const ruleLabel = minTicketsIsMandatory ? "Reglas obligatorias" : "Reglas sugeridas";
  const ruleText = minTicketsIsMandatory
    ? `• Cada participante debe comprar al menos ${minTicketsPerParticipant} ticket(s).`
    : `• Mínimo de tickets por participante: ${minTicketsPerParticipant}`;
  return `\n\n—\nℹ️ ${ruleLabel}:\n${ruleText}`;
}

/* =======================
   CROP LIGERO (cuadrado 1:1)
   ======================= */

function useHTMLImageObject(url) {
  const [img, setImg] = useState(null);
  useEffect(() => {
    if (!url) return setImg(null);
    const i = new window.Image();
    i.crossOrigin = "anonymous";
    i.onload = () => setImg(i);
    i.onerror = () => setImg(null);
    i.src = url;
    return () => {
      setImg(null);
    };
  }, [url]);
  return img;
}

async function blobFromUrl(url) {
  const res = await fetch(url, { cache: "no-store" });
  const blob = await res.blob();
  return blob;
}

async function fileFromUrl(url, filename = "image.webp") {
  const blob = await blobFromUrl(url);
  return new File([blob], filename, { type: blob.type || "image/webp" });
}

/* =======================
   Page
   ======================= */

export default function AdminRaffleEditPage() {
  const router = useRouter();
  const { id } = useParams();

  // Sesión (para habilitar edición libre a SUPERADMIN)
  const { data: session } = useSession();
  const role = String(session?.user?.role || "").toUpperCase();
  const isSuperAdmin = role === "SUPERADMIN";

  // ----- estado base
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState("");

  // Datos del sorteo
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("");
  const [isPrivate, setIsPrivate] = useState(false);

  const [prizeValueInput, setPrizeValueInput] = useState("");
  const [participantGoal, setParticipantGoal] = useState("");

  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");

  // Media/Metadatos
  const [youtubeUrl, setYoutubeUrl] = useState("");
  const [freeShipping, setFreeShipping] = useState(false);

  // Imagen
  const [currentImageUrl, setCurrentImageUrl] = useState("");
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState("");
  const [uploading, setUploading] = useState(false);
  const [imageError, setImageError] = useState("");

  // === Crop modal state
  const [cropOpen, setCropOpen] = useState(false);
  const [cropSrc, setCropSrc] = useState(""); // ObjectURL
  const [cropZoom, setCropZoom] = useState(1.2); // 1..3
  const [cropX, setCropX] = useState(0); // -1..1
  const [cropY, setCropY] = useState(0); // -1..1
  const [cropWorking, setCropWorking] = useState(false);
  const cropCanvasRef = useRef(null);
  const cropSizePx = 640; // tamaño de salida cuadrado (suficiente para web)
  const cropImg = useHTMLImageObject(cropSrc);

  // Reglas: mínimo tickets + obligatoriedad
  const [minTicketsPerParticipant, setMinTickets] = useState(1);
  const [minTicketsMandatory, setMinTicketsMandatory] = useState(false);

  // Estado anterior para restricciones (derivado de la descripción y del sorteo actual)
  const [prevMinTickets, setPrevMinTickets] = useState(1);
  const [prevMandatory, setPrevMandatory] = useState(false);
  const [participantsCount, setParticipantsCount] = useState(0);

  // UI
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");

  // Fmt money
  const moneyFmt = useMemo(
    () =>
      new Intl.NumberFormat("es-AR", {
        style: "currency",
        currency: "ARS",
        maximumFractionDigits: 0,
      }),
    []
  );

  // -------- Derivados
  const prizeValueNormalized = useMemo(
    () => normalizeThousandRule(prizeValueInput),
    [prizeValueInput]
  );

  // Tickets totales necesarios para cubrir el premio (para cálculo UX)
  const totalTicketsNeeded = useMemo(() => {
    if (!prizeValueNormalized) return null;
    return Math.ceil(prizeValueNormalized / POT_CONTRIBUTION_CLIENT);
  }, [prizeValueNormalized]);

  // Mínimo de participantes UX considerando obligatoriedad (coherente con "crear")
  const minParticipantsUX = useMemo(() => {
    if (!totalTicketsNeeded) return null;
    const m = Math.max(1, Number(minTicketsPerParticipant || 1));
    return Math.ceil(totalTicketsNeeded / (minTicketsMandatory ? m : 1));
  }, [totalTicketsNeeded, minTicketsPerParticipant, minTicketsMandatory]);

  // Estimación de total de tickets/participantes en juego: objetivo si lo hay, si no el mínimo requerido
  const totalParticipantsEstimado = useMemo(() => {
    const explicit = parseIntOrNull(participantGoal);
    if (explicit && explicit > 0) return explicit;
    return minParticipantsUX || null;
  }, [participantGoal, minParticipantsUX]);

  // Tope del stepper: floor(totalEstimado / 2) para que siempre haya ≥2 participantes
  const maxMinTickets = useMemo(() => {
    if (!totalParticipantsEstimado) return 1;
    return Math.max(1, Math.floor(totalParticipantsEstimado / 2));
  }, [totalParticipantsEstimado]);

  useEffect(() => {
    setMinTickets((v) => Math.min(Math.max(1, v), maxMinTickets));
  }, [maxMinTickets]);

  // Preview de archivo
  useEffect(() => {
    if (!file) {
      setPreview("");
      return;
    }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  // -------- Carga inicial (usa /api/raffles/[id])
  useEffect(() => {
    let mounted = true;
    (async () => {
      setLoadError("");
      try {
        const res = await fetch(`/api/raffles/${id}`, { credentials: "include" });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data?.error || data?.message || "No se pudo cargar el sorteo");
        const r = data?.raffle || data;

        if (!mounted) return;

        // Parsear reglas desde la descripción (fallback)
        const parsed = parseRulesFromDescription(r.description || "");

        // Preferir valores de DB para reglas si existen
        const dbMin = Number.isFinite(r.minTicketsPerParticipant) && r.minTicketsPerParticipant > 0
          ? r.minTicketsPerParticipant
          : null;
        const dbMandatory = typeof r.minTicketsIsMandatory === "boolean"
          ? r.minTicketsIsMandatory
          : null;

        setTitle(r.title || "");
        setDescription(parsed.cleanDescription);
        setCategory(r.prizeCategory || "");
        setIsPrivate(!!r.isPrivate);

        setPrizeValueInput(String(r.prizeValue ?? ""));
        // En edición, "Objetivo" lo tomamos de maxParticipants si está.
        setParticipantGoal(String(r.maxParticipants ?? ""));

        setStartsAt(toLocalDateTimeInputValue(r.startsAt));
        setEndsAt(toLocalDateTimeInputValue(r.endsAt));

        setCurrentImageUrl(r.imageUrl || "");

        // Media / Metadatos
        setYoutubeUrl(r.youtubeUrl || "");
        setFreeShipping(!!r.freeShipping);

        // Estado/Reglas previas (para restricciones)
        const pCount = (r?._count?.participations ?? 0) + (r?._count?.tickets ?? 0);
        setParticipantsCount(pCount);

        const derivedMin = dbMin ?? (parsed.minTickets || 1);
        const derivedMandatory = dbMandatory ?? Boolean(parsed.mandatory);

        setPrevMinTickets(derivedMin);
        setPrevMandatory(derivedMandatory);

        // Valores iniciales del stepper/toggle
        setMinTickets(derivedMin);
        setMinTicketsMandatory(derivedMandatory);

        setLoaded(true);
      } catch (e) {
        if (!mounted) return;
        setLoadError(e.message || "Error cargando el sorteo");
      }
    })();
    return () => {
      mounted = false;
    };
  }, [id]);

  // -------- Validaciones
  const validate = () => {
    if (!title.trim()) return "El título es requerido";
    if (!description.trim()) return "La descripción no puede estar vacía";

    const prizeFinal = normalizeThousandRule(prizeValueInput);
    if (!prizeFinal || prizeFinal < 1000) {
      return "El valor del premio es obligatorio y debe ser un entero ≥ 1000";
    }

    if (String(participantGoal).trim() !== "") {
      const goalInt = parseIntOrNull(participantGoal);
      if (!goalInt || goalInt <= 0)
        return "El objetivo de participantes debe ser un entero mayor a 0";

      // Mínimo requerido según obligatoriedad y mínimo de tickets actual
      const baseNeeded = Math.ceil(prizeFinal / POT_CONTRIBUTION_CLIENT);
      const divisor = minTicketsMandatory ? Math.max(1, Number(minTicketsPerParticipant || 1)) : 1;
      const minRequired = Math.ceil(baseNeeded / divisor);
      if (goalInt < minRequired) {
        return `El objetivo de participantes debe ser ≥ ${minRequired}`;
      }
    }

    // Restricciones si ya hay participantes (salteadas para SUPERADMIN)
    if (participantsCount > 0 && !isSuperAdmin) {
      if (!prevMandatory && minTicketsMandatory) {
        return "No podés activar la obligatoriedad de tickets porque ya hay participantes.";
      }
      if (minTicketsPerParticipant > prevMinTickets) {
        return `No podés aumentar el mínimo de tickets por participante (actual: ${prevMinTickets}). Solo podés mantener o disminuir.`;
      }
    }

    // Fechas
    const now = new Date();
    const endDate = endsAt ? new Date(endsAt) : null;
    const startDate = startsAt ? new Date(startsAt) : null;

    if (endDate && isNaN(endDate.getTime())) return "Fecha de finalización inválida";
    if (startDate && isNaN(startDate.getTime())) return "Fecha de inicio inválida";
    if (endDate && endDate <= now) return "La fecha de finalización debe ser futura";
    if (startDate && startDate <= now) return "La fecha de inicio debe ser futura";
    if (startDate && endDate && startDate >= endDate)
      return "La fecha de inicio debe ser anterior a la fecha de finalización";

    if (file) {
      if (!ALLOWED_TYPES.includes(file.type))
        return "Formato de imagen no soportado (usa JPG/PNG/WebP/AVIF)";
      if (file.size > MAX_FILE_BYTES) return "La imagen supera el tamaño máximo (10MB)";
    }

    if (minTicketsPerParticipant < 1)
      return "El mínimo de tickets por participante debe ser al menos 1";
    if (minTicketsPerParticipant > maxMinTickets)
      return `El mínimo de tickets por participante no puede superar ${maxMinTickets} (asegura que haya al menos 2 participantes).`;

    // YouTube (validación ligera de formato)
    if (youtubeUrl && !/^https?:\/\/(www\.)?(youtube\.com|youtu\.be)\//i.test(youtubeUrl)) {
      return "El enlace de YouTube no parece válido";
    }

    return null;
  };

  // -------- Subida de imagen (si se cambió)
  const maybeUploadImage = async () => {
    // Si no hay nuevo archivo, devolvemos la actual (puede ser "" para quitar)
    if (!file) return currentImageUrl || null;
    setImageError("");
    setUploading(true);
    try {
      let toUpload = file;
      try {
        toUpload = await resizeImageFile(file, 1600, 0.85);
      } catch (e) {
        console.warn("Resize falló; subiendo original:", e);
      }
      const fd = new FormData();
      fd.append("file", toUpload);
      const res = await fetch("/api/uploads", { method: "POST", body: fd });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "No se pudo subir la imagen");
      return data?.url || null;
    } catch (e) {
      setImageError(e.message || "Error subiendo imagen");
      return currentImageUrl || null; // volvemos a la anterior si falla
    } finally {
      setUploading(false);
    }
  };

  // -------- Guardar cambios (PUT /api/raffles/[id])
  const handleSave = async (e) => {
    e.preventDefault();
    setError("");

    const v = validate();
    if (v) {
      setError(v);
      return;
    }

    const prizeFinal = normalizeThousandRule(prizeValueInput);

    // Si se deja vacío el objetivo, aplicamos el mínimo requerido automáticamente (coherente con "crear")
    const goalFromUx =
      String(participantGoal).trim() === "" && prizeFinal
        ? (minParticipantsUX ?? Math.ceil(prizeFinal / POT_CONTRIBUTION_CLIENT))
        : null;

    const maxParticipants =
      String(participantGoal).trim() === ""
        ? goalFromUx
        : parseInt(participantGoal, 10);

    // Quitar footer viejo y reconstruir con las reglas actuales
    const baseDesc = description.trim();
    const footer = buildRulesFooter(
      Math.max(1, Number(minTicketsPerParticipant)),
      Boolean(minTicketsMandatory)
    );
    const finalDescription = `${baseDesc}${footer}`;

    setSaving(true);
    try {
      const finalImageUrl = await maybeUploadImage();

      const payload = {
        title: title.trim(),
        description: finalDescription,
        prizeValue: prizeFinal,
        ...(maxParticipants != null ? { participantLimit: maxParticipants } : {}),
        imageUrl: finalImageUrl ?? null,
        startsAt: startsAt || null,
        endsAt: endsAt || null,
        prizeCategory: category || null,
        isPrivate,
        youtubeUrl: youtubeUrl || null,
        freeShipping,
        // reglas persistentes
        minTicketsPerParticipant: Math.max(1, Number(minTicketsPerParticipant)),
        minTicketsIsMandatory: Boolean(minTicketsMandatory),
      };

      const res = await fetch(`/api/raffles/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || data?.message || "No se pudo guardar");

      // ✅ Ir al sorteo publicado (vista pública)
      router.push(`/sorteo/${id}`);
      return;
    } catch (err) {
      console.error("Error saving raffle:", err);
      setError(err.message || "No se pudo guardar el sorteo");
    } finally {
      setSaving(false);
    }
  };

  // -------- Eliminar sorteo
  const handleDelete = async () => {
    if (!confirm("¿Eliminar este sorteo? Esta acción no se puede deshacer.")) return;
    setDeleting(true);
    setError("");
    try {
      const res = await fetch(`/api/raffles/${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || data?.message || "No se pudo eliminar");
      router.push("/admin");
    } catch (err) {
      console.error("Error deleting raffle:", err);
      setError(err.message || "No se pudo eliminar el sorteo");
    } finally {
      setDeleting(false);
    }
  };

  const onChangePrize = (e) => setPrizeValueInput(onlyDigits(e.target.value));
  const onChangeGoal = (e) => setParticipantGoal(onlyDigits(e.target.value));

  const canSubmit =
    loaded &&
    !!title.trim() &&
    !!description.trim() &&
    !!normalizeThousandRule(prizeValueInput) &&
    !uploading &&
    !saving;

  const disabledReason = !loaded
    ? "Cargando sorteo…"
    : !normalizeThousandRule(prizeValueInput)
    ? "Ingresá un valor de premio válido"
    : !title.trim()
    ? "Completá el título"
    : !description.trim()
    ? "Completá la descripción"
    : uploading
    ? "Esperá a que termine la subida de imagen"
    : "";

  const DESC_MAX = 600;

  const minTicketsProb = useMemo(() => {
    if (!minTicketsPerParticipant || !totalParticipantsEstimado) return null;
    return probabilityPct(minTicketsPerParticipant, totalParticipantsEstimado);
  }, [minTicketsPerParticipant, totalParticipantsEstimado]);

  /* =======================
     CROP: helpers UI
     ======================= */

  const openCropWithFile = async (f) => {
    if (!f) return;
    if (!ALLOWED_TYPES.includes(f.type)) {
      setImageError("Formato de imagen no soportado (usa JPG/PNG/WebP/AVIF)");
      return;
    }
    if (f.size > MAX_FILE_BYTES) {
      setImageError("La imagen supera el tamaño máximo (10MB)");
      return;
    }
    setImageError("");
    if (cropSrc) URL.revokeObjectURL(cropSrc);
    const url = URL.createObjectURL(f);
    setCropSrc(url);
    setCropZoom(1.2);
    setCropX(0);
    setCropY(0);
    setCropOpen(true);
  };

  const openCropWithCurrent = async () => {
    try {
      if (!currentImageUrl) return;
      const f = await fileFromUrl(currentImageUrl, "actual.webp");
      await openCropWithFile(f);
    } catch (e) {
      setImageError("No se pudo abrir la imagen actual para recortar");
    }
  };

  const applyCrop = async () => {
    if (!cropImg) return;
    setCropWorking(true);
    try {
      // Canvas destino cuadrado
      const size = cropSizePx;
      const canvas = cropCanvasRef.current || document.createElement("canvas");
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext("2d");

      // Fondo negro transparente
      ctx.clearRect(0, 0, size, size);

      // Calcular escala y offsets
      const imgW = cropImg.naturalWidth || cropImg.width;
      const imgH = cropImg.naturalHeight || cropImg.height;

      // Queremos cubrir el square (cover) con zoom adicional
      const baseScale = Math.max(size / imgW, size / imgH);
      const scale = baseScale * cropZoom;

      const drawW = imgW * scale;
      const drawH = imgH * scale;

      // cropX/cropY en rango -1..1 -> desplazamiento máximo hasta 25% del lado
      const maxShift = 0.25; // más de esto suele cortar demasiado
      const shiftX = cropX * maxShift * drawW;
      const shiftY = cropY * maxShift * drawH;

      const dx = (size - drawW) / 2 + shiftX;
      const dy = (size - drawH) / 2 + shiftY;

      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(cropImg, dx, dy, drawW, drawH);

      const blob = await new Promise((r) =>
        canvas.toBlob(r, "image/webp", 0.9)
      );
      if (!blob) throw new Error("No se pudo generar el recorte");

      const outFile = new File([blob], "raffle-image.webp", { type: "image/webp" });
      setFile(outFile);
      // actualizamos preview local
      if (preview) URL.revokeObjectURL(preview);
      const purl = URL.createObjectURL(outFile);
      setPreview(purl);
      setCropOpen(false);
    } catch (e) {
      setImageError(e.message || "Error al recortar la imagen");
    } finally {
      setCropWorking(false);
    }
  };

  /* =======================
     UI
     ======================= */

  if (loadError) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 to-slate-800 text-slate-50 p-6">
        <div className="max-w-2xl mx-auto">
          <div className="bg-gradient-to-br from-rose-900/10 to-slate-800/50 border border-rose-900/20 rounded-2xl p-8 backdrop-blur-sm">
            <h1 className="text-xl font-semibold text-rose-300 mb-2">No se pudo cargar el sorteo</h1>
            <p className="text-slate-300">{loadError}</p>
          </div>
        </div>
      </div>
    );
  }

  if (!loaded) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 to-slate-800 text-slate-50 p-6">
        <div className="max-w-2xl mx-auto">
          <div className="animate-pulse space-y-6">
            <div className="h-10 bg-slate-800/40 rounded-xl border border-slate-700/30"></div>
            <div className="h-40 bg-slate-800/40 rounded-xl border border-slate-700/30"></div>
            <div className="h-12 bg-slate-800/40 rounded-xl border border-slate-700/30"></div>
          </div>
        </div>
      </div>
    );
  }

  // Flags de restricción en UI (no aplican al SUPERADMIN)
  const hasParticipants = !isSuperAdmin && participantsCount > 0;
  const cannotIncreaseMin = hasParticipants && minTicketsPerParticipant > prevMinTickets;
  const cannotEnableMandatory = hasParticipants && !prevMandatory && minTicketsMandatory;

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-950 to-gray-900 text-gray-100">
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
                <h1 className="text-2xl font-bold text-white">Editar Sorteo</h1>
              </div>
              <p className="text-gray-300">ID: <span className="font-mono text-orange-300">{id}</span></p>
            </div>
          </div>

          <div className="p-8">
            {/* Error */}
            {(error || cannotIncreaseMin || cannotEnableMandatory) && (
              <div className="mb-6 p-5 bg-red-900/30 border border-red-800 rounded-xl">
                <div className="flex items-start">
                  <svg className="h-5 w-5 text-red-400 mt-0.5 mr-3 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                    <path
                      fillRule="evenodd"
                      d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1H9z"
                      clipRule="evenodd"
                    />
                  </svg>
                  <div className="text-red-300">
                    {error && <p className="mb-1">{error}</p>}
                    {cannotEnableMandatory && (
                      <p className="mb-1">No podés activar la obligatoriedad de tickets porque ya hay participantes.</p>
                    )}
                    {cannotIncreaseMin && (
                      <p>No podés aumentar el mínimo de tickets por participante (actual: {prevMinTickets}).</p>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Aviso amarillo: solo si NO es super */}
            {hasParticipants && (
              <div className="mb-6 p-4 bg-amber-900/20 border border-amber-800 rounded-xl text-amber-200 text-sm">
                Este sorteo ya tiene participantes. Solo podés <b>mantener o reducir</b> el mínimo de tickets por participante y no podés <b>activar</b> la obligatoriedad si no lo estaba.
              </div>
            )}

            <form onSubmit={handleSave} className="space-y-7">
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
                  maxLength={100}
                  required
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
                  maxLength={DESC_MAX}
                  required
                />
              </div>

              {/* Video (YouTube) */}
              <div>
                <label className="block text-sm font-medium text-gray-200 mb-2">Video de YouTube (opcional)</label>
                <input
                  type="url"
                  placeholder="https://www.youtube.com/watch?v=..."
                  value={youtubeUrl}
                  onChange={(e) => setYoutubeUrl(e.target.value)}
                  className="w-full bg-gray-700/50 border border-gray-600 rounded-xl px-4 py-3.5 focus:ring-2 focus:ring-orange-500 focus:border-orange-500 text-white placeholder-gray-400"
                />
                <p className="text-xs text-gray-400 mt-1">Se valida y se muestra embebido en la página del sorteo.</p>
              </div>

              {/* Premio / objetivo / visibilidad */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div>
                  <label className="block text-sm font-medium text-gray-200 mb-2">
                    Valor del premio <span className="text-orange-400">*</span>
                  </label>
                  <input
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    className="w-full bg-gray-700/50 border border-gray-600 rounded-xl px-4 py-3.5 focus:ring-2 focus:ring-orange-500 focus:border-orange-500 text-white placeholder-gray-400"
                    placeholder="Ej: 500 (→ $500.000) o 1000 literal"
                    value={prizeValueInput}
                    onChange={onChangePrize}
                    required
                  />
                  <p className="text-xs text-gray-400 mt-1">
                    Se enviará: {moneyFmt.format(prizeValueNormalized || 0)}
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-200 mb-2">
                    Objetivo de participantes (opcional)
                  </label>
                  <input
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    className="w-full bg-gray-700/50 border border-gray-600 rounded-xl px-4 py-3.5 focus:ring-2 focus:ring-orange-500 focus:border-orange-500 text-white placeholder-gray-400"
                    placeholder={minParticipantsUX ? `≥ ${minParticipantsUX}` : "Ej: 100"}
                    value={participantGoal}
                    onChange={onChangeGoal}
                    title="Si lo dejás vacío, se usará automáticamente el mínimo requerido"
                  />
                  {minParticipantsUX && (
                    <p className="text-xs mt-1 text-gray-300">
                      Mínimo requerido para realizar el sorteo: <b className="text-orange-300">{minParticipantsUX}</b>
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
                    />
                    <label htmlFor="isPrivate" className="ml-3 text-sm text-gray-300">
                      Hacer sorteo privado
                    </label>
                  </div>
                </div>
              </div>

              {/* Entrega */}
              <div>
                <label className="block text-sm font-medium text-gray-200 mb-2">Entrega</label>
                <div className="flex items-center h-[52px] bg-gray-700/50 border border-gray-600 rounded-xl px-4">
                  <input
                    id="freeShipping"
                    type="checkbox"
                    checked={freeShipping}
                    onChange={(e) => setFreeShipping(e.target.checked)}
                    className="h-4 w-4 text-orange-600 rounded border-gray-600"
                  />
                  <label htmlFor="freeShipping" className="ml-3 text-sm text-gray-300">
                    Envío gratis (si no, se acuerda entrega)
                  </label>
                </div>
              </div>

              {/* Categoría + mínimo tickets (stepper + toggle obligatoriedad) */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-gray-200 mb-2">Categoría</label>
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    className="w-full bg-gray-700/50 border border-gray-600 rounded-xl px-4 py-3.5 text-white"
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
                        disabled={!isSuperAdmin && (hasParticipants && !prevMandatory)}
                        title={!isSuperAdmin && (hasParticipants && !prevMandatory) ? "No podés activar obligatoriedad con participantes existentes" : ""}
                      />
                    </div>
                  </div>

                  <div className="inline-flex items-center bg-gray-700/50 border border-gray-600 rounded-xl overflow-hidden">
                    <button
                      type="button"
                      onClick={() => setMinTickets((v) => Math.max(1, v - 1))}
                      aria-label="Disminuir"
                      className="px-4 py-3.5 hover:bg-gray-700 disabled:opacity-50"
                      disabled={minTicketsPerParticipant <= 1}
                    >
                      <svg viewBox="0 0 24 24" className="w-5 h-5" fill="currentColor"><path d="M5 12h14"></path></svg>
                    </button>

                    <div className="min-w-[64px] text-center px-3 py-3.5 font-semibold text-white select-none">
                      {minTicketsPerParticipant}
                    </div>

                    <button
                      type="button"
                      onClick={() => setMinTickets((v) => Math.min(maxMinTickets, v + 1))}
                      aria-label="Aumentar"
                      className="px-4 py-3.5 hover:bg-gray-700 disabled:opacity-50"
                      disabled={!isSuperAdmin && (minTicketsPerParticipant >= maxMinTickets || (hasParticipants && minTicketsPerParticipant >= prevMinTickets))}
                      title={!isSuperAdmin && (hasParticipants && minTicketsPerParticipant >= prevMinTickets) ? `No podés aumentar por encima de ${prevMinTickets} con participantes` : ""}
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
                    {!isSuperAdmin && hasParticipants && (
                      <div className="mt-1 text-amber-300">
                        Con participantes: solo podés mantener o disminuir el mínimo actual ({prevMinTickets}).
                      </div>
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

              {/* Fechas */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-gray-200 mb-2">Fecha de inicio (opcional)</label>
                  <input
                    type="datetime-local"
                    className="w-full bg-gray-700/50 border border-gray-600 rounded-xl px-4 py-3.5 focus:ring-2 focus:ring-orange-500 focus:border-orange-500 text-white"
                    value={startsAt}
                    onChange={(e) => setStartsAt(e.target.value)}
                    min={new Date().toISOString().slice(0, 16)}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-200 mb-2">Fecha de finalización</label>
                  <input
                    type="datetime-local"
                    className="w-full bg-gray-700/50 border border-gray-600 rounded-xl px-4 py-3.5 focus:ring-2 focus:ring-orange-500 focus:border-orange-500 text-white"
                    value={endsAt}
                    onChange={(e) => setEndsAt(e.target.value)}
                    min={new Date().toISOString().slice(0, 16)}
                  />
                </div>
              </div>

              {/* Imagen (actual + subir/tomar + RECORTAR) */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-gray-200 mb-2">Imagen actual / Preview</label>
                  <div className="relative w-full h-56 overflow-hidden rounded-lg border border-gray-700 bg-gray-800">
                    <NextImage
                      src={preview || currentImageUrl || "/avatar-default.png"}
                      alt="Imagen del sorteo"
                      fill
                      className="object-cover"
                      sizes="(max-width: 768px) 100vw, 700px"
                      // Para previews blob: evita optimización obligatoria
                      unoptimized={Boolean(preview)}
                    />
                  </div>
                  <div className="flex gap-3 mt-2">
                    {currentImageUrl && !preview && (
                      <button
                        type="button"
                        onClick={() => setCurrentImageUrl("")}
                        className="px-3 py-2 rounded-lg border border-gray-600 bg-gray-700/40 hover:bg-gray-700/60 transition text-sm"
                      >
                        Quitar imagen
                      </button>
                    )}
                    {(currentImageUrl || preview) && (
                      <button
                        type="button"
                        onClick={openCropWithCurrent}
                        className="px-3 py-2 rounded-lg border border-orange-600 bg-orange-600/10 hover:bg-orange-600/20 text-orange-200 transition text-sm"
                        title="Recortar imagen actual"
                      >
                        Recortar imagen actual
                      </button>
                    )}
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-200 mb-2">Subir / Tomar nueva imagen (con recorte)</label>
                  <input
                    type="file"
                    accept={ALLOWED_TYPES.join(",")}
                    capture="environment"
                    onChange={(e) => openCropWithFile(e.target.files?.[0] || null)}
                    className="block w-full text-sm text-gray-300
                      file:mr-4 file:py-2.5 file:px-4
                      file:rounded-lg file:border-0
                      file:text-sm file:font-semibold
                      file:bg-orange-600 file:text-white
                      hover:file:bg-orange-700"
                    title="Formatos permitidos: JPG, PNG, WebP, AVIF (máx. 10MB)"
                  />
                  {imageError && <p className="mt-2 text-sm text-red-300">{imageError}</p>}
                  {uploading && <p className="mt-2 text-xs text-gray-400">Subiendo y optimizando imagen…</p>}
                </div>
              </div>

              {/* Botones */}
              <div className="flex flex-col sm:flex-row gap-4 pt-6 border-t border-gray-700">
                <button
                  type="submit"
                  disabled={!canSubmit || (!isSuperAdmin && (cannotIncreaseMin || cannotEnableMandatory))}
                  className="group flex-1 px-6 py-3.5 bg-gradient-to-r from-orange-500 to-orange-600 text-white rounded-xl font-medium hover:from-orange-600 hover:to-orange-700 focus:ring-2 focus:ring-orange-500 focus:ring-offset-2 focus:ring-offset-gray-900 disabled:opacity-60 disabled:cursor-not-allowed transition-all"
                  title={
                    !canSubmit
                      ? disabledReason
                      : (!isSuperAdmin && cannotEnableMandatory)
                        ? "No podés activar obligatoriedad con participantes"
                        : (!isSuperAdmin && cannotIncreaseMin)
                          ? "No podés aumentar el mínimo con participantes"
                          : undefined
                  }
                >
                  {saving ? "Guardando..." : "Guardar cambios"}
                  {!canSubmit && (
                    <span className="ml-2 text-xs opacity-80 hidden sm:inline">— {disabledReason}</span>
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => router.push(`/sorteo/${id}`)}
                  className="px-6 py-3.5 border border-gray-600 text-gray-300 rounded-xl font-medium hover:bg-gray-700/50 transition-all"
                >
                  Cancelar
                </button>

                <button
                  type="button"
                  onClick={handleDelete}
                  disabled={deleting}
                  className="px-6 py-3.5 bg-gradient-to-r from-rose-600 to-rose-700 text-white rounded-xl hover:from-rose-700 hover:to-rose-800 disabled:opacity-70 disabled:cursor-not-allowed transition-all font-medium"
                >
                  {deleting ? "Eliminando..." : "Eliminar sorteo"}
                </button>
              </div>
            </form>
          </div>

          {/* Footer info */}
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
              <div className="ml-3 flex-1 text-sm text-gray-300">
                <p>Si dejás vacío el objetivo, se aplicará automáticamente el mínimo requerido para cubrir el premio.</p>
                <p>El mínimo de tickets por participante tiene tope dinámico para asegurar ≥2 participantes (mitad del total estimado).</p>
                {!isSuperAdmin && hasParticipants && (
                  <p className="mt-1 text-amber-200">
                    Con participantes: solo se permite reducir el mínimo o mantenerlo; no se puede volver obligatorio si no lo era.
                  </p>
                )}
              </div>
            </div>
          </div>
          {/* /Footer */}
        </div>
      </div>

      {/* ======= MODAL DE CROP ======= */}
      {cropOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-2xl bg-gray-900 border border-gray-700 rounded-2xl overflow-hidden shadow-2xl">
            <div className="px-5 py-3 border-b border-gray-700 flex items-center justify-between">
              <h3 className="text-gray-100 font-semibold">Recortar imagen (1:1)</h3>
              <button
                onClick={() => setCropOpen(false)}
                className="text-gray-300 hover:text-white px-2 py-1 rounded"
                aria-label="Cerrar"
              >
                ✕
              </button>
            </div>

            <div className="p-5 space-y-4">
              <div className="relative w-full aspect-square bg-gray-800 rounded-xl overflow-hidden border border-gray-700">
                {/* Área de “preview de recorte” */}
                <div className="absolute inset-0">
                  {/* Imagen con transform segun zoom y desplazamiento */}
                  {cropSrc && (
                    <NextImage
                      src={cropSrc}
                      alt="Crop source"
                      fill
                      unoptimized
                      className="absolute left-1/2 top-1/2 will-change-transform select-none pointer-events-none"
                      style={{
                        transform: `translate(-50%, -50%) translate(${cropX * 25}%, ${cropY * 25}%) scale(${cropZoom})`,
                        transformOrigin: "center center",
                        objectFit: "cover",
                        userSelect: "none",
                      }}
                      sizes="(max-width: 768px) 100vw, 512px"
                    />
                  )}
                </div>

                {/* Marco cuadrado (borde) */}
                <div className="absolute inset-0 border-2 border-white/30 pointer-events-none rounded-none"></div>
              </div>

              {/* Controles */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs text-gray-300 mb-1">Zoom</label>
                  <input
                    type="range"
                    min={1}
                    max={3}
                    step={0.01}
                    value={cropZoom}
                    onChange={(e) => setCropZoom(Number(e.target.value))}
                    className="w-full"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-300 mb-1">Desplazamiento X</label>
                  <input
                    type="range"
                    min={-1}
                    max={1}
                    step={0.01}
                    value={cropX}
                    onChange={(e) => setCropX(Number(e.target.value))}
                    className="w-full"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-300 mb-1">Desplazamiento Y</label>
                  <input
                    type="range"
                    min={-1}
                    max={1}
                    step={0.01}
                    value={cropY}
                    onChange={(e) => setCropY(Number(e.target.value))}
                    className="w-full"
                  />
                </div>
              </div>
            </div>

            <div className="px-5 py-4 border-t border-gray-700 flex items-center justify-end gap-3">
              <button
                onClick={() => {
                  setCropZoom(1.2);
                  setCropX(0);
                  setCropY(0);
                }}
                className="px-4 py-2 text-sm rounded-lg border border-gray-600 bg-gray-800 hover:bg-gray-700 text-gray-200"
              >
                Reiniciar
              </button>
              <button
                onClick={() => setCropOpen(false)}
                className="px-4 py-2 text-sm rounded-lg border border-gray-600 bg-gray-800 hover:bg-gray-700 text-gray-200"
              >
                Cancelar
              </button>
              <button
                onClick={applyCrop}
                disabled={!cropImg || cropWorking}
                className="px-5 py-2 text-sm rounded-lg bg-orange-600 hover:bg-orange-700 disabled:opacity-60 text-white font-medium"
              >
                {cropWorking ? "Aplicando..." : "Aplicar recorte"}
              </button>
            </div>

            {/* Canvas oculto para generar el recorte */}
            <canvas ref={cropCanvasRef} width={cropSizePx} height={cropSizePx} className="hidden" />
          </div>
        </div>
      )}
      {/* ======= /MODAL DE CROP ======= */}
    </div>
  );
}
