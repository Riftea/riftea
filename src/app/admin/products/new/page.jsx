"use client";

// src/app/admin/products/new/page.jsx
import { useState } from "react";
import { useRouter } from "next/navigation";
import UploadField from "../_components/UploadField"; // ajustá la ruta si tu carpeta difiere

// util: pesos a centavos
function toCentavos(v) {
  const n = Number(String(v).replace(/[^\d.,]/g, "").replace(",", "."));
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

export default function NewProductPage() {
  const router = useRouter();
  const [form, setForm] = useState({
    title: "",
    description: "",
    type: "FILE", // PHOTO | FILE | COURSE | TICKET
    price: "",
    currency: "ARS",
    filePath: "",
    bonusFilePath: "",
    isActive: false,
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const onChange = (e) => {
    const { name, value, type, checked } = e.target;
    setForm((f) => ({ ...f, [name]: type === "checkbox" ? checked : value }));
  };

  const onSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      const payload = {
        title: form.title.trim(),
        description: form.description.trim() || null,
        type: form.type,
        priceCents: toCentavos(form.price),
        currency: form.currency || "ARS",
        filePath: form.filePath || null,
        bonusFilePath: form.bonusFilePath || null,
        isActive: !!form.isActive,
      };

      const res = await fetch("/api/products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "No se pudo crear el producto");

      // listo: redirigimos al listado de admin o al detalle público
      router.push("/admin/products");
    } catch (err) {
      setError(err.message || "Error desconocido");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <div className="max-w-3xl mx-auto p-6">
        <h1 className="text-2xl font-extrabold mb-4">Nueva publicación (producto digital)</h1>

        {error && (
          <div className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-red-200">
            {error}
          </div>
        )}

        <form onSubmit={onSubmit} className="space-y-5">
          <div>
            <label className="block text-sm mb-1">Título</label>
            <input
              name="title"
              value={form.title}
              onChange={onChange}
              required
              className="w-full rounded-md bg-white/5 border border-white/10 px-3 py-2"
              placeholder="Ej: Pack de presets Lightroom"
            />
          </div>

          <div>
            <label className="block text-sm mb-1">Descripción</label>
            <textarea
              name="description"
              value={form.description}
              onChange={onChange}
              rows={4}
              className="w-full rounded-md bg-white/5 border border-white/10 px-3 py-2"
              placeholder="Detalles del producto, qué incluye, instrucciones, etc."
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm mb-1">Tipo</label>
              <select
                name="type"
                value={form.type}
                onChange={onChange}
                className="w-full rounded-md bg-white/5 border border-white/10 px-3 py-2"
              >
                <option value="FILE">Archivo</option>
                <option value="PHOTO">Foto</option>
                <option value="COURSE">Curso</option>
                <option value="TICKET">Ticket</option>
              </select>
            </div>

            <div>
              <label className="block text-sm mb-1">Precio</label>
              <input
                name="price"
                value={form.price}
                onChange={onChange}
                inputMode="decimal"
                placeholder="Ej: 1999.99"
                className="w-full rounded-md bg-white/5 border border-white/10 px-3 py-2"
              />
            </div>

            <div>
              <label className="block text-sm mb-1">Moneda</label>
              <select
                name="currency"
                value={form.currency}
                onChange={onChange}
                className="w-full rounded-md bg-white/5 border border-white/10 px-3 py-2"
              >
                <option value="ARS">ARS</option>
                <option value="USD">USD</option>
              </select>
            </div>
          </div>

          {/* Upload principal (usa tu componente de subida a Supabase) */}
          <div>
            <label className="block text-sm mb-1">Archivo principal</label>
            <UploadField
              value={form.filePath}
              onChange={(path) => setForm((f) => ({ ...f, filePath: path }))}
              placeholder="Subí el archivo principal…"
            />
            <p className="text-xs text-white/60 mt-1">
              Se almacenará en tu bucket privado (p. ej. <code>private-products</code>).
            </p>
          </div>

          {/* Upload bonus (opcional) */}
          <div>
            <label className="block text-sm mb-1">Archivo bonus (opcional)</label>
            <UploadField
              value={form.bonusFilePath}
              onChange={(path) => setForm((f) => ({ ...f, bonusFilePath: path }))}
              placeholder="Subí material extra…"
            />
          </div>

          <div className="flex items-center gap-2">
            <input
              id="isActive"
              type="checkbox"
              name="isActive"
              checked={form.isActive}
              onChange={onChange}
              className="h-4 w-4"
            />
            <label htmlFor="isActive" className="text-sm">
              Publicar inmediatamente (si no, queda en borrador)
            </label>
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="submit"
              disabled={submitting}
              className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60"
            >
              {submitting ? "Creando…" : "Crear publicación"}
            </button>

            <button
              type="button"
              onClick={() => router.push("/admin/products")}
              className="px-4 py-2 rounded-lg bg-white/10 hover:bg-white/20"
            >
              Cancelar
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
