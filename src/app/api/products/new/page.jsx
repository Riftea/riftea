"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

function toCentavos(x) {
  const n = Number(String(x).replace(/[^\d.,]/g, "").replace(",", "."));
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.round(n * 100);
}

export default function NewProductPage() {
  const router = useRouter();
  const [type, setType] = useState("FILE");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priceStr, setPriceStr] = useState("0");
  const [currency, setCurrency] = useState("ARS");
  const [filePath, setFilePath] = useState("");
  const [bonusFilePath, setBonusFilePath] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function onSubmit(e) {
    e.preventDefault();
    try {
      setSubmitting(true);
      setError("");
      const priceCents = toCentavos(priceStr);
      const res = await fetch("/api/products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type,
          title,
          description,
          priceCents,
          currency,
          filePath: filePath || null,
          bonusFilePath: bonusFilePath || null,
          isActive,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "No se pudo crear");
      router.push("/admin/products");
    } catch (err) {
      setError(err?.message || "Error");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <div className="max-w-3xl mx-auto p-6 space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-extrabold">Nuevo producto digital</h1>
          <button
            onClick={() => router.push("/admin/products")}
            className="px-3 py-2 rounded-lg bg-white/10 hover:bg-white/20"
          >
            Volver
          </button>
        </div>

        <form onSubmit={onSubmit} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm opacity-80 mb-1">Tipo</label>
              <select
                value={type}
                onChange={(e) => setType(e.target.value)}
                className="w-full rounded-lg bg-white/10 px-3 py-2"
              >
                <option value="FILE">FILE</option>
                <option value="PHOTO">PHOTO</option>
                <option value="COURSE">COURSE</option>
                <option value="TICKET">TICKET</option>
              </select>
            </div>
            <div>
              <label className="block text-sm opacity-80 mb-1">Precio (ARS)</label>
              <input
                value={priceStr}
                onChange={(e) => setPriceStr(e.target.value)}
                placeholder="0,00"
                className="w-full rounded-lg bg-white/10 px-3 py-2"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm opacity-80 mb-1">Título</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full rounded-lg bg-white/10 px-3 py-2"
              required
            />
          </div>

          <div>
            <label className="block text-sm opacity-80 mb-1">Descripción</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={4}
              className="w-full rounded-lg bg-white/10 px-3 py-2"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm opacity-80 mb-1">Ruta de archivo</label>
              <input
                value={filePath}
                onChange={(e) => setFilePath(e.target.value)}
                placeholder="private/products/archivo.zip"
                className="w-full rounded-lg bg-white/10 px-3 py-2"
              />
            </div>
            <div>
              <label className="block text-sm opacity-80 mb-1">Bonus (opcional)</label>
              <input
                value={bonusFilePath}
                onChange={(e) => setBonusFilePath(e.target.value)}
                placeholder="private/products/bonus.pdf"
                className="w-full rounded-lg bg-white/10 px-3 py-2"
              />
            </div>
          </div>

          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={isActive}
                onChange={(e) => setIsActive(e.target.checked)}
              />
              Publicar (isActive)
            </label>
            <div className="text-xs opacity-70">Moneda: {currency}</div>
          </div>

          {error && (
            <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-red-200 text-sm">
              {error}
            </div>
          )}

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={submitting}
              className="px-5 py-2 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 font-bold disabled:opacity-60"
            >
              {submitting ? "Creando…" : "Crear producto"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
