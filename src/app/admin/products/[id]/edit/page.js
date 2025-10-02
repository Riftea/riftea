"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import UploadField from "@/app/admin/products/_components/UploadField";

/* ========== Helpers precio ARS ========== */
function toCentavos(x) {
  const n = Number(String(x ?? "").replace(/[^\d.,]/g, "").replace(",", "."));
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.round(n * 100);
}
function fromCentavos(cents = 0) {
  const n = Number(cents || 0);
  if (!Number.isFinite(n)) return "0";
  return String(n / 100).replace(".", ",");
}
function isNonEmptyString(s) {
  return typeof s === "string" && s.trim().length > 0;
}

export default function EditProductPage() {
  const router = useRouter();
  const { id: productId } = useParams();

  // estado
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // form (solo campos que existen en tu schema)
  const [type, setType] = useState("FILE");               // STRING
  const [title, setTitle] = useState("");                 // STRING
  const [description, setDescription] = useState("");     // STRING?
  const [priceCents, setPriceCents] = useState(0);        // INT
  const [currency, setCurrency] = useState("ARS");        // STRING
  const [filePath, setFilePath] = useState("");           // STRING?
  const [bonusFilePath, setBonusFilePath] = useState(""); // STRING?
  const [isActive, setIsActive] = useState(true);         // BOOLEAN

  const [priceText, setPriceText] = useState("0");
  useEffect(() => { setPriceText(fromCentavos(priceCents)); }, [priceCents]);

  /* ====== Cargar producto ====== */
  useEffect(() => {
    let abort = false;
    (async () => {
      try {
        if (!isNonEmptyString(productId)) throw new Error("ID de producto inválido");
        setLoading(true);
        setError("");
        setSuccess("");

        // OJO: tu API existente está en /api/products/[id]
        const res = await fetch(`/api/products/${productId}`, { cache: "no-store" });
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error || "No se pudo cargar el producto");

        if (!abort) {
          setType(data?.type ?? "FILE");
          setTitle(data?.title ?? "");
          setDescription(data?.description ?? "");
          setPriceCents(Number(data?.priceCents ?? 0));
          setCurrency(data?.currency ?? "ARS");
          setFilePath(data?.filePath ?? "");
          setBonusFilePath(data?.bonusFilePath ?? "");
          setIsActive(Boolean(data?.isActive ?? true));
          setLoading(false);
        }
      } catch (e) {
        if (!abort) {
          setError(e?.message || "Error al cargar el producto");
          setLoading(false);
        }
      }
    })();
    return () => { abort = true; };
  }, [productId]);

  /* ====== Guardar ====== */
  async function handleSave(e) {
    e?.preventDefault?.();
    setSaving(true);
    setError("");
    setSuccess("");

    try {
      if (!isNonEmptyString(title)) throw new Error("El título es obligatorio");

      const body = {
        type,
        title,
        description,
        priceCents: Number(priceCents || 0),
        currency,
        filePath: isNonEmptyString(filePath) ? filePath : null,
        bonusFilePath: isNonEmptyString(bonusFilePath) ? bonusFilePath : null,
        isActive,
      };

      // Usa PATCH porque tu lista admin ya patchea /api/products/[id]
      const res = await fetch(`/api/products/${productId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "No se pudo guardar");

      setSuccess("Cambios guardados correctamente.");
      // router.refresh(); // opcional
    } catch (e) {
      setError(e?.message || "Error al guardar");
    } finally {
      setSaving(false);
    }
  }

  /* ====== Upload handlers ====== */
  const onUploadedFile = (url) => { if (isNonEmptyString(url)) setFilePath(url); };
  const onUploadedBonus = (url) => { if (isNonEmptyString(url)) setBonusFilePath(url); };

  const pricePreview = useMemo(() => {
    const n = Number(priceCents || 0) / 100;
    return new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS" }).format(n);
  }, [priceCents]);

  if (loading) return <div className="p-6">Cargando producto…</div>;

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-3xl mx-auto p-6 space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold">Editar producto</h1>
          <button
            type="button"
            className="text-sm underline"
            onClick={() => router.push(`/admin/products`)}
          >
            ← Volver a mis productos
          </button>
        </div>

        <p className="text-sm text-gray-500">ID: {productId}</p>

        {error && <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-red-700">{error}</div>}
        {success && <div className="rounded-lg bg-green-50 border border-green-200 p-3 text-green-700">{success}</div>}

        <form onSubmit={handleSave} className="space-y-5 bg-white rounded-xl border p-5">
          {/* Tipo */}
          <div className="space-y-1">
            <label className="block text-sm font-medium">Tipo</label>
            <select
              className="border rounded-lg px-3 py-2 w-full"
              value={type}
              onChange={(e) => setType(e.target.value)}
            >
              <option value="FILE">FILE</option>
              <option value="PHOTO">PHOTO</option>
              <option value="COURSE">COURSE</option>
              <option value="TICKET">TICKET</option>
              <option value="LINK">LINK</option>
              <option value="SERVICE">SERVICE</option>
            </select>
          </div>

          {/* Título */}
          <div className="space-y-1">
            <label className="block text-sm font-medium">Título</label>
            <input
              className="border rounded-lg px-3 py-2 w-full"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Nombre del producto"
              required
            />
          </div>

          {/* Descripción */}
          <div className="space-y-1">
            <label className="block text-sm font-medium">Descripción</label>
            <textarea
              className="border rounded-lg px-3 py-2 w-full min-h-[110px]"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Descripción del producto"
            />
          </div>

          {/* Precio */}
          <div className="space-y-1">
            <label className="block text-sm font-medium">Precio (ARS)</label>
            <div className="flex items-center gap-2">
              <input
                className="border rounded-lg px-3 py-2 w-full"
                value={priceText}
                onChange={(e) => {
                  const txt = e.target.value;
                  setPriceText(txt);
                  setPriceCents(toCentavos(txt));
                }}
                placeholder="0,00"
              />
              <span className="text-sm text-gray-600 whitespace-nowrap">{pricePreview}</span>
            </div>
          </div>

          {/* Moneda */}
          <div className="space-y-1">
            <label className="block text-sm font-medium">Moneda</label>
            <select
              className="border rounded-lg px-3 py-2 w-full"
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
            >
              <option value="ARS">ARS</option>
              {/* agrega otras si más adelante soportás multi-moneda */}
            </select>
          </div>

          {/* Archivo principal (filePath) */}
          <div className="space-y-1">
            <label className="block text-sm font-medium">Archivo principal (filePath)</label>
            <div className="flex items-center gap-3">
              <input
                className="border rounded-lg px-3 py-2 w-full"
                value={filePath}
                onChange={(e) => setFilePath(e.target.value)}
                placeholder="/uploads/archivo.webp o https://..."
              />
              <UploadField onUpload={onUploadedFile} />
            </div>
            {isNonEmptyString(filePath) && (
              <p className="text-xs text-gray-500 mt-1 break-all">{filePath}</p>
            )}
          </div>

          {/* Archivo bonus (bonusFilePath) */}
          <div className="space-y-1">
            <label className="block text-sm font-medium">Archivo bonus (bonusFilePath)</label>
            <div className="flex items-center gap-3">
              <input
                className="border rounded-lg px-3 py-2 w-full"
                value={bonusFilePath}
                onChange={(e) => setBonusFilePath(e.target.value)}
                placeholder="/uploads/bonus.zip o https://..."
              />
              <UploadField onUpload={onUploadedBonus} />
            </div>
            {isNonEmptyString(bonusFilePath) && (
              <p className="text-xs text-gray-500 mt-1 break-all">{bonusFilePath}</p>
            )}
          </div>

          {/* Activo */}
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
            />
            <span>Activo</span>
          </label>

          {/* Acciones */}
          <div className="flex gap-3 pt-2">
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 rounded-lg bg-black text-white disabled:opacity-60"
            >
              {saving ? "Guardando…" : "Guardar cambios"}
            </button>
            <button
              type="button"
              onClick={() => router.push(`/admin/products`)}
              className="px-4 py-2 rounded-lg border"
            >
              Cancelar
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
