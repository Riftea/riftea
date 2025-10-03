"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { useSearchParams, useRouter } from "next/navigation";
import { formatARS } from "@/lib/commerce";

/**
 * La página raíz envuelve con <Suspense> para poder usar useSearchParams.
 */
export default function MarketplacePage() {
  return (
    <Suspense fallback={<div className="p-6">Cargando marketplace…</div>}>
      <MarketplaceContent />
    </Suspense>
  );
}

function MarketplaceContent() {
  const { data: session, status } = useSession();
  const isAuthed = status === "authenticated";
  const router = useRouter();
  const searchParams = useSearchParams();

  // Querystring
  const qParam = searchParams.get("q") || "";
  const pageParam = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
  const limitParam = Math.min(50, Math.max(1, parseInt(searchParams.get("limit") || "12", 10)));

  // UI state
  const [q, setQ] = useState(qParam);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [items, setItems] = useState([]);
  const [pagination, setPagination] = useState({
    page: 1,
    limit: limitParam,
    total: 0,
    totalPages: 1,
  });

  // Carrito
  const [cart, setCart] = useState([]); // { id, title, unitPrice(cents), quantity }

  // Cargar productos desde /api/products/public (parseo defensivo)
  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        setError("");

        const url = new URL("/api/products/public", window.location.origin);
        if (qParam) url.searchParams.set("q", qParam);
        url.searchParams.set("page", String(pageParam));
        url.searchParams.set("limit", String(limitParam));

        const res = await fetch(url, { cache: "no-store" });
        const text = await res.text();
        let data = {};
        try {
          data = JSON.parse(text);
        } catch {
          throw new Error(`Respuesta inválida del servidor al listar productos (${res.status}).`);
        }
        if (!res.ok) throw new Error(data?.error || "No se pudieron cargar productos");

        setItems(Array.isArray(data?.items) ? data.items : []);
        setPagination(
          data?.pagination || {
            page: 1,
            limit: limitParam,
            total: 0,
            totalPages: 1,
            hasNext: false,
            hasPrev: false,
          }
        );
      } catch (e) {
        setError(e?.message || "Error al cargar");
      } finally {
        setLoading(false);
      }
    })();
  }, [qParam, pageParam, limitParam]);

  // Navegación manteniendo filtros
  function goTo(params) {
    const url = new URL(window.location.href);
    const sp = url.searchParams;
    Object.entries(params).forEach(([k, v]) => {
      if (v == null || v === "") sp.delete(k);
      else sp.set(k, String(v));
    });
    router.push(`${url.pathname}?${sp.toString()}`);
  }

  // Carrito helpers
  function addToCart(p) {
    setCart((prev) => {
      const idx = prev.findIndex((x) => x.id === p.id);
      if (idx >= 0) {
        const next = prev.slice();
        next[idx] = { ...next[idx], quantity: next[idx].quantity + 1 };
        return next;
      }
      return [...prev, { id: p.id, title: p.title, unitPrice: p.priceCents, quantity: 1 }];
    });
  }
  function updateQty(id, q) {
    setCart((prev) => prev.map((x) => (x.id === id ? { ...x, quantity: Math.max(1, q) } : x)));
  }
  function removeFromCart(id) {
    setCart((prev) => prev.filter((x) => x.id !== id));
  }

  const totalCents = useMemo(
    () => cart.reduce((acc, it) => acc + it.unitPrice * it.quantity, 0),
    [cart]
  );
  const ticketsPreview = useMemo(() => Math.floor(totalCents / 100000), [totalCents]);

  // Checkout: redirige al flujo de MP Wallet / Checkout Pro
  async function checkout() {
    try {
      if (!isAuthed) {
        alert("Iniciá sesión para comprar");
        return;
      }
      if (cart.length === 0) {
        alert("Tu carrito está vacío.");
        return;
      }

      // Por compatibilidad con el backend actual: un solo ítem
      const first = cart[0];

      // 🚨 OJO: la ruta correcta es /api/checkout/preference (con “ck”)
      const res = await fetch("/api/checkout/preference", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productId: first.id,
          quantity: first.quantity,
          buyer: { email: session?.user?.email || undefined },
        }),
      });

      // Parse defensivo
      const text = await res.text();
      let data = {};
      try {
        data = JSON.parse(text);
      } catch {
        throw new Error(`Respuesta inválida del servidor al iniciar pago (${res.status}).`);
      }
      if (!res.ok) throw new Error(data?.error || "No se pudo iniciar el pago");

      if (data.init_point) {
        window.location.href = data.init_point;
        return;
      }
      if (data.preferenceId) {
        window.location.href =
          `https://www.mercadopago.com/checkout/v1/redirect?pref_id=` +
          encodeURIComponent(data.preferenceId);
        return;
      }
      throw new Error("El servidor no devolvió datos de redirección de pago.");
    } catch (e) {
      console.error(e);
      alert(e?.message || "Error en el checkout");
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-indigo-950 to-purple-950 text-white">
      <div className="max-w-6xl mx-auto px-4 py-8 space-y-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <h1 className="text-3xl font-extrabold">Marketplace de digitales</h1>
          <Link href="/sorteos" className="text-sm px-3 py-2 rounded-lg bg-white/10 hover:bg-white/20">
            ↩ Volver a sorteos
          </Link>
        </div>

        {/* Búsqueda */}
        <form
          className="flex items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            goTo({ q, page: 1 });
          }}
        >
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar (título o descripción)…"
            className="flex-1 rounded-xl bg-white/10 px-3 py-2 outline-none focus:bg-white/15"
          />
          <button type="submit" className="px-4 py-2 rounded-xl bg-white/10 hover:bg-white/20 font-semibold">
            Buscar
          </button>
        </form>

        {/* Grid de productos */}
        <section className="space-y-3">
          {loading ? (
            <p className="opacity-80">Cargando productos…</p>
          ) : error ? (
            <p className="text-red-300">{error}</p>
          ) : items.length === 0 ? (
            <p>No hay productos para mostrar.</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {items.map((p) => (
                <div key={p.id} className="rounded-2xl border border-white/10 bg-white/5 p-4 flex flex-col">
                  <div className="text-[10px] uppercase opacity-70 mb-1">{p.type}</div>
                  <Link href={`/marketplace/${p.id}`} className="group">
                    <h3 className="text-lg font-bold group-hover:underline">{p.title}</h3>
                  </Link>
                  {p.description && <p className="text-sm opacity-80 mt-1 line-clamp-3">{p.description}</p>}
                  <div className="mt-auto pt-4 flex items-center justify-between">
                    <div className="font-mono font-semibold">{formatARS(p.priceCents)}</div>
                    <button
                      onClick={() => addToCart(p)}
                      className="px-3 py-1.5 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-100 text-sm"
                    >
                      Agregar
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Paginación */}
          {pagination?.totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 pt-2">
              <button
                disabled={pagination.page <= 1}
                onClick={() => goTo({ page: pagination.page - 1 })}
                className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 disabled:opacity-40"
              >
                ← Anterior
              </button>
              <span className="text-sm opacity-80">
                Página {pagination.page} de {pagination.totalPages}
              </span>
              <button
                disabled={pagination.page >= pagination.totalPages}
                onClick={() => goTo({ page: pagination.page + 1 })}
                className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 disabled:opacity-40"
              >
                Siguiente →
              </button>
            </div>
          )}
        </section>

        {/* Carrito */}
        <section className="rounded-2xl border border-white/10 bg-white/5 p-4">
          <h2 className="text-xl font-bold mb-3">Carrito</h2>
          {cart.length === 0 ? (
            <p className="opacity-80">Tu carrito está vacío.</p>
          ) : (
            <div className="space-y-3">
              {cart.map((it) => (
                <div key={it.id} className="flex items-center justify-between gap-4">
                  <div className="flex-1">
                    <div className="font-semibold">{it.title}</div>
                    <div className="text-sm opacity-80">{formatARS(it.unitPrice)} c/u</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min={1}
                      value={it.quantity}
                      onChange={(e) => updateQty(it.id, parseInt(e.target.value || "1", 10))}
                      className="w-16 rounded bg-white/10 px-2 py-1"
                    />
                    <button
                      onClick={() => removeFromCart(it.id)}
                      className="text-xs px-2 py-1 rounded bg-white/10 hover:bg-white/20"
                    >
                      Quitar
                    </button>
                  </div>
                  <div className="w-28 text-right font-mono">{formatARS(it.unitPrice * it.quantity)}</div>
                </div>
              ))}
              <hr className="border-white/10" />
              <div className="flex items-center justify-between">
                <div className="text-sm opacity-90">
                  Con esta compra vas a recibir <b>{ticketsPreview}</b>{" "}
                  {ticketsPreview === 1 ? "ticket" : "tickets"} para usar en sorteos.
                </div>
                <div className="text-lg font-extrabold">Total: {formatARS(totalCents)}</div>
              </div>
              <div className="flex items-center justify-end gap-3">
                <button
                  onClick={checkout}
                  className="px-4 py-2 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 font-bold"
                >
                  Comprar ahora
                </button>
              </div>
            </div>
          )}
        </section>

        <p className="text-sm opacity-80">
          Tip: este marketplace emite tickets genéricos al completar la compra. Usalos en cualquier rifa.
        </p>
      </div>
    </div>
  );
}
