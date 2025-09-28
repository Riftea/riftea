"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

/**
 * Normaliza una fecha ISO a algo legible (AR).
 */
function fmtDate(d) {
  try {
    const date = new Date(d);
    if (Number.isNaN(date.getTime())) return "—";
    return new Intl.DateTimeFormat("es-AR", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(date);
  } catch {
    return "—";
  }
}

/**
 * Página de "Mis compras"
 * - Carga compras del usuario autenticado desde /api/purchases (ajustá si tu endpoint es otro).
 * - Muestra botón "Descargar" que golpea /api/me/purchases/:id/delivery y abre las URLs devueltas.
 */
export default function Page() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [purchases, setPurchases] = useState([]);
  const [downloading, setDownloading] = useState({}); // { [purchaseId]: boolean }

  useEffect(() => {
    let abort = false;
    async function load() {
      setLoading(true);
      setError("");
      try {
        // Si tu endpoint correcto es /api/me/purchases, cambiá acá:
        const res = await fetch("/api/purchases", { cache: "no-store" });
        if (!res.ok) {
          let msg = "No se pudieron cargar las compras";
          try {
            const err = await res.json();
            if (err?.error) msg = err.error;
          } catch {}
          throw new Error(msg);
        }
        const data = await res.json();
        if (!abort) setPurchases(Array.isArray(data?.items) ? data.items : data || []);
      } catch (e) {
        if (!abort) setError(e?.message || "Error al cargar tus compras");
      } finally {
        if (!abort) setLoading(false);
      }
    }
    load();
    return () => {
      abort = true;
    };
  }, []);

  async function handleDownload(p) {
    try {
      setDownloading((m) => ({ ...m, [p.id]: true }));
      const res = await fetch(`/api/me/purchases/${p.id}/delivery`, { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) {
        alert(data?.error || "No se pudo generar la entrega");
        return;
      }
      // Abre los enlaces de entrega
      if (data?.delivery?.mainUrl) window.open(data.delivery.mainUrl, "_blank");
      if (data?.delivery?.bonusUrl) window.open(data.delivery.bonusUrl, "_blank");
    } catch (e) {
      alert("Error al generar la entrega");
    } finally {
      setDownloading((m) => ({ ...m, [p.id]: false }));
    }
  }

  const hasPurchases = useMemo(() => purchases && purchases.length > 0, [purchases]);

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Mis compras</h1>
        <Link href="/marketplace" className="text-sm underline">
          ← Volver al marketplace
        </Link>
      </div>

      {loading && <div className="rounded-lg border p-4">Cargando tus compras…</div>}

      {!loading && error && (
        <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-red-700">
          {error}
        </div>
      )}

      {!loading && !error && !hasPurchases && (
        <div className="rounded-lg border p-4">
          <p className="text-gray-700">Todavía no tenés compras.</p>
        </div>
      )}

      {!loading && !error && hasPurchases && (
        <div className="grid gap-4">
          {purchases.map((p) => (
            <div key={p.id} className="rounded-lg border p-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div className="space-y-1">
                <div className="font-medium">
                  {p.product?.title || p.title || `Compra #${p.id}`}
                </div>
                <div className="text-sm text-gray-500">
                  {fmtDate(p.createdAt)} · {p.product?.type || p.type || "—"}
                </div>
                {p.product?.seller?.name && (
                  <div className="text-sm text-gray-500">Vendedor: {p.product.seller.name}</div>
                )}
              </div>

              <div className="flex items-center gap-2">
                {/* Monto (si viene en centavos) */}
                {"priceCents" in p ? (
                  <span className="text-sm text-gray-600">
                    {new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS" })
                      .format((Number(p.priceCents || 0)) / 100)}
                  </span>
                ) : null}

                <button
                  onClick={() => handleDownload(p)}
                  disabled={!!downloading[p.id]}
                  className="px-3 py-2 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-900 disabled:opacity-60"
                  title="Descargar entrega"
                >
                  {downloading[p.id] ? "Generando..." : "Descargar"}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
