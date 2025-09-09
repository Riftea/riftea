"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import Image from "next/image";

/* =======================
   Helpers en scope de módulo
   ======================= */

// Solo dígitos
function onlyDigits(s = "") {
  return String(s).replace(/[^\d]/g, "");
}

// parseInt seguro → null si no es entero válido
function parseIntOrNull(v) {
  if (v === "" || v === null || v === undefined) return null;
  const n = parseInt(String(v), 10);
  return Number.isFinite(n) ? n : null;
}

// Normaliza string numérico a entero ARS **sin toggle** (regla en miles):
// - Si < 1000 => interpreta en miles (1 -> 1000, 10 -> 10000, ...)
// - Si >= 1000 => toma literal
function normalizeThousandRule(raw) {
  const clean = onlyDigits(raw);
  if (!clean) return null;
  const n = parseInt(clean, 10);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n < 1000 ? n * 1000 : n;
}

// Aporte al pozo por ticket (UX). El backend usa su constante real.
const POT_CONTRIBUTION_CLIENT = 500;

export default function CrearSorteoPage() {
  const router = useRouter();
  const { data: session, status } = useSession();

  // ----- estado formulario
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");

  // Entradas crudas (strings)
  const [prizeValueInput, setPrizeValueInput] = useState("");
  const [participantGoal, setParticipantGoal] = useState(""); // opcional

  const [startsAt, setStartsAt] = useState(""); // opcional
  const [endsAt, setEndsAt] = useState("");     // condicional

  // Imagen: URL directa o archivo a subir
  const [imageUrl, setImageUrl] = useState("");
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState("");

  // Extras
  const [isPrivate, setIsPrivate] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(false);

  // ----- estado UI
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // ---- helpers
  const moneyFmt = useMemo(
    () =>
      new Intl.NumberFormat("es-AR", {
        style: "currency",
        currency: "ARS",
        maximumFractionDigits: 0,
      }),
    []
  );

  // ✅ Derivados SIEMPRE antes de cualquier return (evita cambiar el orden de hooks)
  // Mínimo requerido (UX) = ceil(premio_normalizado / 500)
  const prizeValueNormalized = useMemo(
    () => normalizeThousandRule(prizeValueInput),
    [prizeValueInput]
  );

  const minParticipantsUX = useMemo(() => {
    if (!prizeValueNormalized) return null;
    return Math.ceil(prizeValueNormalized / POT_CONTRIBUTION_CLIENT);
  }, [prizeValueNormalized]);

  const isAuthLoading = status === "loading";

  // preview de imagen local
  useEffect(() => {
    if (!file) {
      setPreview("");
      return;
    }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  // ----- auth
  useEffect(() => {
    if (status === "unauthenticated") router.push("/login");
  }, [status, router]);

  // -------- validaciones espejo del backend (ACTUALIZADAS)
  const validate = () => {
    // Título/desc requeridos
    if (!title.trim()) return "El título es requerido";
    if (!description.trim()) return "La descripción no puede estar vacía";

    // Aceptar términos
    if (!termsAccepted) return "Debes aceptar los términos y condiciones";

    // Premio requerido con normalización en miles
    const prizeFinal = normalizeThousandRule(prizeValueInput);
    if (!prizeFinal || prizeFinal < 1000) {
      return "El valor del premio es obligatorio y debe ser un entero ≥ 1000";
    }

    // participantGoal opcional, si viene debe ser ≥ mínimo
    if (String(participantGoal).trim() !== "") {
      const goalInt = parseIntOrNull(participantGoal);
      if (!goalInt || goalInt <= 0) return "El objetivo de participantes debe ser un entero mayor a 0";
      const minNeeded = Math.ceil(prizeFinal / POT_CONTRIBUTION_CLIENT);
      if (goalInt < minNeeded) {
        return `El objetivo de participantes debe ser ≥ ${minNeeded}`;
      }
    } else {
      // Si NO hay objetivo, endsAt es obligatorio
      if (!endsAt) return "Si no defines un objetivo de participantes, debes indicar una fecha de finalización";
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

    return null;
  };

  // -------- subir imagen si corresponde
  const maybeUploadImage = async () => {
    if (!file) return imageUrl?.trim() || null;
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/uploads", { method: "POST", body: fd });
      if (!res.ok) {
        return imageUrl?.trim() || null;
      }
      const data = await res.json();
      return data?.url || imageUrl?.trim() || null;
    } catch {
      return imageUrl?.trim() || null;
    }
  };

  // -------- submit (ACTUALIZADO)
  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    // Validar sesión
    if (!session?.user?.id) {
      setError("Sesión no válida. Por favor, inicia sesión nuevamente.");
      router.push("/login");
      return;
    }

    const v = validate();
    if (v) {
      setError(v);
      return;
    }

    const prizeFinal = normalizeThousandRule(prizeValueInput);
    const goalInt = String(participantGoal).trim() === "" ? null : parseInt(participantGoal, 10);

    setLoading(true);
    try {
      const finalImageUrl = await maybeUploadImage();

      const payload = {
        title: title.trim(),
        description: description.trim(),
        prizeValue: prizeFinal, // ✔️ normalizado con regla de miles
        ...(goalInt !== null ? { participantGoal: goalInt } : {}),
        ...(finalImageUrl && { imageUrl: finalImageUrl }),
        ...(startsAt && { startsAt }),
        ...(endsAt && { endsAt }),
        isPrivate,
        termsAccepted: true,
      };

      // Debug opcional
      console.log({
        prizeInputRaw: prizeValueInput,
        prizeFinal,
        minParticipantsUX,
        payload,
      });

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

  // -------- handlers de inputs numéricos
  const onChangePrize = (e) => setPrizeValueInput(onlyDigits(e.target.value));
  const onChangeGoal = (e) => setParticipantGoal(onlyDigits(e.target.value));

  const canSubmit =
    !!title.trim() &&
    !!description.trim() &&
    termsAccepted &&
    !!normalizeThousandRule(prizeValueInput);

  // -------- UI (sin returns tempranos: ternario para loading)
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
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="bg-gray-800/50 backdrop-blur-sm border border-gray-700 rounded-2xl overflow-hidden shadow-2xl">
          {/* Header */}
          <div className="relative p-8 bg-gradient-to-r from-gray-800 to-gray-800/90 border-b border-gray-700">
            <div className="absolute inset-0 bg-gradient-to-r from-orange-500/5 to-transparent pointer-events-none"></div>
            <div className="relative">
              <div className="flex items-center mb-4">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-orange-500 to-orange-600 flex items-center justify-center mr-4">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="h-5 w-5 text-white"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                  </svg>
                </div>
                <h1 className="text-2xl font-bold text-white">Crear Nuevo Sorteo</h1>
              </div>
              <p className="text-gray-300 mb-4 max-w-2xl">
                Completá los datos. El sistema calcula automáticamente el mínimo de participantes necesario para realizar el sorteo.
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
                      d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z"
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
                />
              </div>

              {/* Descripción */}
              <div>
                <div className="flex justify-between items-center mb-2">
                  <label className="block text-sm font-medium text-gray-200">
                    Descripción <span className="text-orange-400">*</span>
                  </label>
                  <span className="text-xs text-gray-400">{description.length}/500</span>
                </div>
                <textarea
                  className="w-full bg-gray-700/50 border border-gray-600 rounded-xl px-4 py-3.5 focus:ring-2 focus:ring-orange-500 focus:border-orange-500 text-white placeholder-gray-400 min-h-[140px]"
                  placeholder="Describe el premio y las condiciones del sorteo..."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  disabled={loading}
                  maxLength={500}
                  required
                />
              </div>

              {/* Premio y objetivo */}
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
                    placeholder="Ej: 500 (se interpreta como $500.000) o 1000 literal"
                    value={prizeValueInput}
                    onChange={onChangePrize}
                    disabled={loading}
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
                    disabled={loading}
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
                      disabled={loading}
                    />
                    <label htmlFor="isPrivate" className="ml-3 text-sm text-gray-300">
                      Hacer sorteo privado
                    </label>
                  </div>
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
                    disabled={loading}
                    min={new Date().toISOString().slice(0, 16)}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-200 mb-2">
                    Fecha de finalización {String(participantGoal).trim() === "" && <span className="text-orange-400">*</span>}
                  </label>
                  <input
                    type="datetime-local"
                    className="w-full bg-gray-700/50 border border-gray-600 rounded-xl px-4 py-3.5 focus:ring-2 focus:ring-orange-500 focus:border-orange-500 text-white"
                    value={endsAt}
                    onChange={(e) => setEndsAt(e.target.value)}
                    disabled={loading}
                    min={new Date().toISOString().slice(0, 16)}
                  />
                </div>
              </div>

              {/* Imagen */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-gray-200 mb-2">URL de imagen (opcional)</label>
                  <input
                    type="url"
                    className="w-full bg-gray-700/50 border border-gray-600 rounded-xl px-4 py-3.5 focus:ring-2 focus:ring-orange-500 focus:border-orange-500 text-white placeholder-gray-400"
                    placeholder="https://..."
                    value={imageUrl}
                    onChange={(e) => setImageUrl(e.target.value)}
                    disabled={loading}
                  />
                  <p className="text-xs text-gray-400 mt-1">Si subís archivo, se usará el archivo en lugar de esta URL.</p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-200 mb-2">Subir / Sacar foto (opcional)</label>
                  <input
                    type="file"
                    accept="image/*"
                    capture="environment"
                    onChange={(e) => setFile(e.target.files?.[0] || null)}
                    disabled={loading}
                    className="block w-full text-sm text-gray-300
                      file:mr-4 file:py-2.5 file:px-4
                      file:rounded-lg file:border-0
                      file:text-sm file:font-semibold
                      file:bg-orange-600 file:text-white
                      hover:file:bg-orange-700"
                  />
                  {(preview || imageUrl) && (
                    <div className="mt-3">
                      <p className="text-xs text-gray-400 mb-2">Previsualización:</p>
                      <div className="relative w-full h-56">
                        <Image
                          src={preview || imageUrl}
                          alt="Preview"
                          fill
                          sizes="(max-width: 768px) 100vw, 50vw"
                          className="object-cover rounded-lg border border-gray-700"
                          unoptimized
                        />
                      </div>
                    </div>
                  )}
                </div>
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
                  <a
                    className="text-orange-400 hover:underline"
                    href="#"
                    onClick={(e) => e.preventDefault()}
                  >
                    términos y condiciones
                  </a>{" "}
                  del sorteo.
                </label>
              </div>

              {/* Botones */}
              <div className="flex flex-col sm:flex-row gap-4 pt-6 border-t border-gray-700">
                <button
                  type="submit"
                  disabled={loading || !canSubmit}
                  className="flex-1 px-6 py-3.5 bg-gradient-to-r from-orange-500 to-orange-600 text-white rounded-xl font-medium hover:from-orange-600 hover:to-orange-700 focus:ring-2 focus:ring-orange-500 focus:ring-offset-2 focus:ring-offset-gray-900 disabled:opacity-60 disabled:cursor-not-allowed transition-all"
                >
                  {loading ? "Creando sorteo..." : "Crear Sorteo"}
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
                    setStartsAt("");
                    setEndsAt("");
                    setImageUrl("");
                    setFile(null);
                    setPreview("");
                    setError("");
                    setIsPrivate(false);
                    setTermsAccepted(false);
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
                    <span>Usá títulos claros y una buena imagen del premio.</span>
                  </li>
                  <li className="flex items-start">
                    <span className="h-1.5 w-1.5 bg-orange-400 rounded-full mt-1.5 mr-2 flex-shrink-0"></span>
                    <span>Definí un premio realista: podés escribir 1 y se interpreta $1.000; 10 → $10.000, etc.</span>
                  </li>
                  <li className="flex items-start">
                    <span className="h-1.5 w-1.5 bg-orange-400 rounded-full mt-1.5 mr-2 flex-shrink-0"></span>
                    <span>El sistema te muestra el mínimo de participantes requerido para poder realizar el sorteo.</span>
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
