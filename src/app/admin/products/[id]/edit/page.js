"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import UploadField from "@/app/admin/products/_components/UploadField";

/* ===================== Helpers ===================== */

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

function safeArray(a) {
  return Array.isArray(a) ? a : [];
}

/* ===================== Page (client) ===================== */

export default function EditProductPage() {
  const router = useRouter();
  const { id: productId } = useParams();

  // datos
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // form
  const [type, setType] = useState("FILE"); // FILE | LINK | SERVICE
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priceCents, setPriceCents] = useState(0);
  const [coverImage, setCoverImage] = useState("");
  const [gallery, setGallery] = useState([]);
  const [isActive, setIsActive] = useState(true);
  const [status, setStatus] = useState("DRAFT"); // si usás enum ProductStatus

  // precio como texto (para input)
  const [priceText, setPriceText] = useState("0");

  // sincroniza texto ↔ centavos
  useEffect(() => {
    setPriceText(fromCentavos(priceCents));
  }, [priceCents]);

  // cargar producto
  useEffect(() => {
    let abort = false;
    async function load() {
      setError("");
      setSuccess("");
      setLoading(true);
      try {
        if (!isNonEmptyString(productId)) {
          throw new Error("ID de producto inválido");
        }

        const res = await fetch(`/api/admin/products/${productId}`, {
          method: "GET",
          cache: "no-store",
        });

        if (!res.ok) throw new Error("No se pudo cargar el producto");
        const data = await res.json();

        if (!abort) {
          setType(data?.type ?? "FILE");
          setTitle(data?.title ?? "");
          setDescription(data?.description ?? "");
          setPriceCents(Number(data?.priceCents ?? 0));
          setCoverImage(data?.coverImage ?? "");
          setGallery(safeArray(data?.gallery ?? []));
          setIsActive(Boolean(data?.isActive ?? true));
          setStatus(data?.status ?? "DRAFT");
          setLoading(false);
        }
      } catch (e) {
        if (!abort) {
          setError(e?.message || "Error al cargar el producto");
          setLoading(false);
        }
      }
    }
    load();
    return () => {
      abort = true;
    };
  }, [productId]);

  // guardar
  async function handleSave(e) {
    e?.preventDefault?.();
    setSaving(true);
    setError("");
    setSuccess("");

    try {
      if (!isNonEmptyString(title)) {
        throw new Error("El título es obligatorio");
      }

      const body = {
        type,
        title,
        description,
        priceCents: Number(priceCents || 0),
        coverImage,
        gallery,
        isActive,
        status,
      };

      const res = await fetch(`/api/admin/products/${productId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        let msg = "No se pudo guardar";
        try {
          const err = await res.json();
          if (err?.error) msg = err.error;
        } catch {}
        throw new Error(msg);
      }

      setSuccess("Cambios guardados correctamente");
      // router.refresh(); // opcional
    } catch (e) {
      setError(e?.message || "Error al guardar");
    } finally {
      setSaving(false);
    }
  }

  // eliminar imagen de galería
  function removeFromGallery(idx) {
    setGallery((g) => g.filter((_, i) => i !== idx));
  }

  // agregar imagen a la galería
  function handleUploadedToGallery(url) {
    if (!isNonEmptyString(url)) return;
    setGallery((g) => Array.from(new Set([...g, url])));
  }

  // subir portada
  function handleUploadedCover(url) {
    if (!isNonEmptyString(url)) return;
    setCoverImage(url);
  }

  // precio formateado (preview)
  const pricePreview = useMemo(() => {
    const n = Number(priceCents || 0) / 100;
    return new Intl.NumberFormat("es-AR", {
      style: "currency",
      currency: "ARS",
      maximumFractionDigits: 2,
    }).format(n);
  }, [priceCents]);

  if (loading) return <div className="p-6">Cargando producto…</div>;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Editar producto</h1>
        <button
          type="button"
          className="text-sm underline"
          onClick={() => router.push(`/admin/products/${productId}`)}
        >
          ← Ver detalle
        </button>
      </div>

      <p className="text-sm text-gray-500">ID: {productId}</p>

      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-red-700">
          {error}
        </div>
      )}

      {success && (
        <div className="rounded-lg bg-green-50 border border-green-200 p-3 text-green-700">
          {success}
        </div>
      )}

      <form onSubmit={handleSave} className="space-y-5">
        {/* Tipo */}
        <div className="space-y-1">
          <label className="block text-sm font-medium">Tipo</label>
          <select
            className="border rounded-lg px-3 py-2 w-full"
            value={type}
            onChange={(e) => setType(e.target.value)}
          >
            <option value="FILE">Archivo</option>
            <option value="LINK">Link</option>
            <option value="SERVICE">Servicio</option>
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
          />
        </div>

        {/* Descripción */}
        <div className="space-y-1">
          <label className="block text-sm font-medium">Descripción</label>
          <textarea
            className="border rounded-lg px-3 py-2 w-full min-h-[120px]"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Descripción del producto"
          />
        </div>

        {/* Precio */}
        <div className="space-y-1">
          <label className="block text-sm font-medium">Precio</label>
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
            <span className="text-sm text-gray-600 whitespace-nowrap">
              {pricePreview}
            </span>
          </div>
        </div>

        {/* Portada */}
        <div className="space-y-1">
          <label className="block text-sm font-medium">Portada</label>
          <div className="flex items-center gap-3">
            <input
              className="border rounded-lg px-3 py-2 w-full"
              value={coverImage}
              onChange={(e) => setCoverImage(e.target.value)}
              placeholder="/uploads/portada.jpg o https://..."
            />
            <UploadField onUpload={handleUploadedCover} />
          </div>
          {isNonEmptyString(coverImage) && (
            <div className="mt-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={coverImage}
                alt="Portada"
                className="w-48 h-32 object-cover rounded-lg border"
              />
            </div>
          )}
        </div>

        {/* Galería */}
        <div className="space-y-1">
          <label className="block text-sm font-medium">Galería</label>
          <div className="flex items-center gap-3">
            <UploadField onUpload={handleUploadedToGallery} />
            <span className="text-sm text-gray-500">
              Agregá imágenes a la galería (se listan abajo)
            </span>
          </div>

          {gallery.length > 0 ? (
            <div className="mt-3 grid grid-cols-2 md:grid-cols-4 gap-3">
              {gallery.map((url, idx) => (
                <div key={url + idx} className="relative group">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={url}
                    alt={`img-${idx}`}
                    className="w-full h-28 object-cover rounded-lg border"
                  />
                  <button
                    type="button"
                    onClick={() => removeFromGallery(idx)}
                    className="absolute top-2 right-2 px-2 py-1 text-xs rounded bg-black/70 text-white opacity-0 group-hover:opacity-100 transition"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-gray-500 mt-1">Sin imágenes en la galería.</p>
          )}
        </div>

        {/* Activo / Estado */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
            />
            <span>Activo</span>
          </label>

          <div className="space-y-1">
            <label className="block text-sm font-medium">Estado</label>
            <select
              className="border rounded-lg px-3 py-2 w-full"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
            >
              <option value="DRAFT">Borrador</option>
              <option value="PUBLISHED">Publicado</option>
              <option value="ARCHIVED">Archivado</option>
            </select>
          </div>
        </div>

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
            onClick={() => router.push(`/admin/products/${productId}`)}
            className="px-4 py-2 rounded-lg border"
          >
            Cancelar
          </button>
        </div>
      </form>
    </div>
  );
}
