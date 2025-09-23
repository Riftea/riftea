// src/app/admin/raffles/[id]/page.js
"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import Image from "next/image";

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

// Resize en el browser → WebP
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/jpg"];
const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10MB
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

// Aporte al pozo por ticket (UX); el server usa su propia constante
const POT_CONTRIBUTION_CLIENT = 500;

export default function AdminRaffleEditPage() {
  const router = useRouter();
  const { id } = useParams();

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

  // Imagen
  const [currentImageUrl, setCurrentImageUrl] = useState("");
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState("");
  const [uploading, setUploading] = useState(false);
  const [imageError, setImageError] = useState("");

  // Mínimo tickets (stepper)
  const [minTicketsPerParticipant, setMinTickets] = useState(1);

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

  const minParticipantsUX = useMemo(() => {
    if (!prizeValueNormalized) return null;
    return Math.ceil(prizeValueNormalized / POT_CONTRIBUTION_CLIENT);
  }, [prizeValueNormalized]);

  // Estimación de total de tickets en juego: objetivo si lo hay, si no el mínimo requerido
  const totalTicketsEstimado = useMemo(() => {
    const explicit = parseIntOrNull(participantGoal);
    if (explicit && explicit > 0) return explicit;
    return minParticipantsUX || null;
  }, [participantGoal, minParticipantsUX]);

  // Tope del stepper: floor(totalEstimado / 2) para que siempre haya ≥2 participantes
  const maxMinTickets = useMemo(() => {
    if (!totalTicketsEstimado) return 1;
    return Math.max(1, Math.floor(totalTicketsEstimado / 2));
  }, [totalTicketsEstimado]);

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

  // -------- Carga inicial
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

        setTitle(r.title || "");
        // limpiar posible footer de reglas antes de editar
        setDescription((r.description || "").replace(/\n—\nℹ️ Reglas sugeridas:[\s\S]*$/m, "").trim());
        setCategory(r.prizeCategory || "");
        setIsPrivate(!!r.isPrivate);

        setPrizeValueInput(String(r.prizeValue ?? ""));
        setParticipantGoal(String(r.maxParticipants ?? ""));

        setStartsAt(toLocalDateTimeInputValue(r.startsAt));
        setEndsAt(toLocalDateTimeInputValue(r.endsAt));

        setCurrentImageUrl(r.imageUrl || "");
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
      const minNeeded = Math.ceil(prizeFinal / POT_CONTRIBUTION_CLIENT);
      if (goalInt < minNeeded) {
        return `El objetivo de participantes debe ser ≥ ${minNeeded}`;
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
        return "Formato de imagen no soportado (usa JPG/PNG/WebP)";
      if (file.size > MAX_FILE_BYTES) return "La imagen supera el tamaño máximo (10MB)";
    }

    if (minTicketsPerParticipant < 1)
      return "El mínimo de tickets por participante debe ser al menos 1";
    if (minTicketsPerParticipant > maxMinTickets)
      return `El mínimo de tickets por participante no puede superar ${maxMinTickets} (asegura que haya al menos 2 participantes).`;

    return null;
  };

  // -------- Subida de imagen (si se cambió)
  const maybeUploadImage = async () => {
    if (!file) return currentImageUrl || null; // mantener la actual
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

  // -------- Guardar cambios (PUT /api/raffles)
  const handleSave = async (e) => {
    e.preventDefault();
    setError("");

    const v = validate();
    if (v) {
      setError(v);
      return;
    }

    const prizeFinal = normalizeThousandRule(prizeValueInput);

    // Si se deja vacío el objetivo, aplicamos el mínimo requerido automáticamente
    const goalFromUx =
      String(participantGoal).trim() === "" && prizeFinal
        ? Math.ceil(prizeFinal / POT_CONTRIBUTION_CLIENT)
        : null;

    const maxParticipants =
      String(participantGoal).trim() === ""
        ? goalFromUx
        : parseInt(participantGoal, 10);

    // Footer informativo opcional
    const baseDesc = description.trim().replace(/\n—\nℹ️ Reglas sugeridas:[\s\S]*$/m, "");
    const footer =
      minTicketsPerParticipant > 1
        ? `\n\n—\nℹ️ Reglas sugeridas:\n• Mínimo de tickets por participante: ${minTicketsPerParticipant}`
        : "";
    const finalDescription = `${baseDesc}${footer}`;

    setSaving(true);
    try {
      const finalImageUrl = await maybeUploadImage();

      const payload = {
        id: String(id),
        title: title.trim(),
        description: finalDescription,
        prizeValue: prizeFinal,
        ...(maxParticipants != null ? { maxParticipants } : {}),
        ...(finalImageUrl ? { imageUrl: finalImageUrl } : { imageUrl: null }),
        ...(startsAt ? { startsAt } : { startsAt: null }),
        ...(endsAt ? { endsAt } : { endsAt: null }),
        ...(category ? { category } : { category: null }),
        isPrivate,
      };

      const res = await fetch("/api/raffles", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || data?.message || "No se pudo guardar");

      // Volvemos a la misma página (refresca datos)
      router.refresh?.();
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
      const res = await fetch(`/api/raffles?id=${id}`, { method: "DELETE", credentials: "include" });
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
    if (!minTicketsPerParticipant || !totalTicketsEstimado) return null;
    return probabilityPct(minTicketsPerParticipant, totalTicketsEstimado);
  }, [minTicketsPerParticipant, totalTicketsEstimado]);

  // -------- UI
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
            {error && (
              <div className="mb-6 p-5 bg-red-900/30 border border-red-800 rounded-xl">
                <div className="flex items-start">
                  <svg className="h-5 w-5 text-red-400 mt-0.5 mr-3 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                    <path
                      fillRule="evenodd"
                      d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z"
                      clipRule="evenodd"
                    />
                  </svg>
                  <div>
                    <h3 className="text-lg font-medium text-red-200">No se pudo guardar</h3>
                    <div className="mt-2 text-red-300">
                      <p>{error}</p>
                    </div>
                  </div>
                </div>
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

              {/* Categoría + mínimo tickets (stepper) */}
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
                  <div className="flex items-center justify-between mb-2">
                    <label className="block text-sm font-medium text-gray-200">
                      Mínimo de tickets por participante
                    </label>
                    <span className="text-xs text-gray-400">
                      Máx: {maxMinTickets} {maxMinTickets <= 1 ? "" : "(asegura ≥2 participantes)"}
                    </span>
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
                      disabled={minTicketsPerParticipant >= maxMinTickets}
                    >
                      <svg viewBox="0 0 24 24" className="w-5 h-5" fill="currentColor"><path d="M12 5v14M5 12h14"></path></svg>
                    </button>
                  </div>

                  {minTicketsProb != null && totalTicketsEstimado != null && (
                    <p className="text-xs text-gray-400 mt-2">
                      Con <b>{minTicketsPerParticipant} ticket(s)</b> y ~<b>{totalTicketsEstimado}</b> en juego, tu prob. ≈{" "}
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

              {/* Imagen (solo subir/tomar) */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-gray-200 mb-2">Imagen actual</label>
                  <div className="relative w-full h-56 overflow-hidden rounded-lg border border-gray-700 bg-gray-800">
                    <Image
                      src={preview || currentImageUrl || "/avatar-default.png"}
                      alt="Imagen del sorteo"
                      fill
                      className="object-cover"
                      sizes="(max-width: 768px) 100vw, 700px"
                      // Para previews blob: evita optimización obligatoria
                      unoptimized={Boolean(preview)}
                    />
                  </div>
                  {currentImageUrl && !preview && (
                    <button
                      type="button"
                      onClick={() => setCurrentImageUrl("")}
                      className="mt-2 px-3 py-2 rounded-lg border border-gray-600 bg-gray-700/40 hover:bg-gray-700/60 transition text-sm"
                    >
                      Quitar imagen
                    </button>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-200 mb-2">Subir / Tomar nueva imagen</label>
                  <input
                    type="file"
                    accept={ALLOWED_TYPES.join(",")}
                    capture="environment"
                    onChange={(e) => setFile(e.target.files?.[0] || null)}
                    className="block w-full text-sm text-gray-300
                      file:mr-4 file:py-2.5 file:px-4
                      file:rounded-lg file:border-0
                      file:text-sm file:font-semibold
                      file:bg-orange-600 file:text-white
                      hover:file:bg-orange-700"
                    title="Formatos permitidos: JPG, PNG, WebP (máx. 10MB)"
                  />
                  {imageError && <p className="mt-2 text-sm text-red-300">{imageError}</p>}
                  {uploading && <p className="mt-2 text-xs text-gray-400">Subiendo y optimizando imagen…</p>}
                </div>
              </div>

              {/* Botones */}
              <div className="flex flex-col sm:flex-row gap-4 pt-6 border-t border-gray-700">
                <button
                  type="submit"
                  disabled={!canSubmit}
                  className="group flex-1 px-6 py-3.5 bg-gradient-to-r from-orange-500 to-orange-600 text-white rounded-xl font-medium hover:from-orange-600 hover:to-orange-700 focus:ring-2 focus:ring-orange-500 focus:ring-offset-2 focus:ring-offset-gray-900 disabled:opacity-60 disabled:cursor-not-allowed transition-all"
                  title={!canSubmit ? disabledReason : undefined}
                >
                  {saving ? "Guardando..." : "Guardar cambios"}
                  {!canSubmit && (
                    <span className="ml-2 text-xs opacity-80 hidden sm:inline">— {disabledReason}</span>
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => router.push(`/admin/raffles/${id}`)}
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
              </div>
            </div>
          </div>
          {/* /Footer */}
        </div>
      </div>
    </div>
  );
}
