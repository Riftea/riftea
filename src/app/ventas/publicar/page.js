// src/app/ventas/publicar/page.js
"use client";

import { useMemo, useState } from "react";

function onlyDigits(s = "") { return String(s).replace(/[^\d]/g, ""); }

export default function PublicarProductoPage() {
  const [sellerId, setSellerId] = useState(""); // MVP: manual; luego desde sesión (/api/whoami)
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priceARS, setPriceARS] = useState(""); // en pesos (ej: 1000)
  const [filePath, setFilePath] = useState(""); // ruta en bucket privado (después: uploader)
  const [bonusFilePath, setBonusFilePath] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState("");

  const precio = useMemo(() => {
    const n = parseInt(onlyDigits(priceARS) || "0", 10);
    return Number.isFinite(n) ? n : 0;
  }, [priceARS]);

  // Estimador (bloques/tasa/neto/tickets)
  const bloques = Math.floor(precio / 3000);
  const tasa = bloques * 1000;
  const neto = Math.max(0, precio - tasa);
  const ticketsRegalo = bloques;

  const money = new Intl.NumberFormat("es-AR", {
    style: "currency", currency: "ARS", maximumFractionDigits: 0,
  });

  async function handleSubmit(e) {
    e.preventDefault();
    setMsg("");
    if (!sellerId) { setMsg("Cargá tu sellerId (MVP)."); return; }
    if (!title.trim()) { setMsg("El título es obligatorio."); return; }

    const cents = precio * 100; // a centavos
    if (cents <= 0) { setMsg("Ingresá un precio válido."); return; }

    try {
      setLoading(true);
      const res = await fetch("/api/products/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sellerId,
          title: title.trim(),
          description: description?.trim() || "",
          priceCents: cents,
          currency: "ARS",
          filePath: filePath || null,
          bonusFilePath: bonusFilePath || null,
          isActive,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "No se pudo crear el producto");

      setMsg(`Listo: producto creado (${data.product?.id}).`);
      // TODO: router.push(`/ventas/${data.product.id}`)
    } catch (err) {
      setMsg(err.message || "Error creando producto");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-950 to-gray-900 text-gray-100">
      <div className="max-w-3xl mx-auto p-6">
        <h1 className="text-2xl font-bold mb-4">Publicar producto digital</h1>
        <p className="text-gray-300 mb-6">
          Cargá tu contenido y definí el precio. Por cada <b>$3.000</b>, el comprador recibe <b>1 ticket de regalo</b> y la
          tasa es de <b>$1.000</b> por bloque de $3.000 (el resto es tuyo).
        </p>

        {msg && (
          <div className="mb-4 rounded-lg border border-gray-700 bg-gray-800 px-4 py-3 text-sm">
            {msg}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">
          {/* MVP: sellerId manual */}
          <div>
            <label className="block text-sm text-gray-300 mb-1">Tu sellerId (MVP)</label>
            <input
              value={sellerId}
              onChange={(e) => setSellerId(e.target.value)}
              placeholder="copiá tu id de usuario (Prisma Studio)"
              className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2"
            />
            <p className="text-xs text-gray-400 mt-1">
              Luego esto se toma de tu sesión automáticamente.
            </p>
          </div>

          <div>
            <label className="block text-sm text-gray-300 mb-1">Título *</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={120}
              placeholder="Ej: Pack de fotos HD"
              className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2"
              required
            />
          </div>

          <div>
            <label className="block text-sm text-gray-300 mb-1">Descripción</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={600}
              className="w-full min-h-[100px] rounded-lg border border-gray-700 bg-gray-800 px-3 py-2"
              placeholder="¿Qué incluye el archivo? ¿Formato/tamaño?"
            />
          </div>

          <div>
            <label className="block text-sm text-gray-300 mb-1">Precio (ARS) *</label>
            <input
              inputMode="numeric"
              pattern="[0-9]*"
              value={priceARS}
              onChange={(e) => setPriceARS(onlyDigits(e.target.value))}
              placeholder="Ej: 3000"
              className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2"
              required
            />
            <div className="text-xs text-gray-400 mt-1">
              {precio > 0 ? (
                <>
                  <b>Total:</b> {money.format(precio)} · <b>Neto:</b> {money.format(neto)} ·{" "}
                  <b>Tasa:</b> {money.format(tasa)} · <b>Tickets regalo:</b> {ticketsRegalo}
                </>
              ) : "Ingresá un monto en pesos (entero)."}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div>
              <label className="block text-sm text-gray-300 mb-1">Ruta archivo (privado)</label>
              <input
                value={filePath}
                onChange={(e) => setFilePath(e.target.value)}
                placeholder="p.ej. private://bucket/uuid/main.zip"
                className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-300 mb-1">Bonus (opcional)</label>
              <input
                value={bonusFilePath}
                onChange={(e) => setBonusFilePath(e.target.value)}
                placeholder="p.ej. private://bucket/uuid/bonus.pdf"
                className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2"
              />
            </div>
          </div>

          <div className="flex items-center gap-3">
            <input
              id="active"
              type="checkbox"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
              className="h-4 w-4"
            />
            <label htmlFor="active" className="text-sm text-gray-300">Listado público</label>
          </div>

          <div className="pt-2">
            <button
              type="submit"
              disabled={loading}
              className="rounded-lg bg-orange-600 px-4 py-2 font-medium hover:bg-orange-700 disabled:opacity-60"
            >
              {loading ? "Publicando..." : "Publicar producto"}
            </button>
          </div>
        </form>

        <div className="mt-8 text-xs text-gray-400">
          Por cada $3.000 del precio, el comprador recibe 1 ticket de regalo (si la función está activa) y la
          tasa es $1.000 por bloque de $3.000. El resto es tuyo.
        </div>
      </div>
    </div>
  );
}
