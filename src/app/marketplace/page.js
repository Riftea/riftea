"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { useSearchParams, useRouter } from "next/navigation";
import { formatARS } from "@/lib/commerce";

/**
 * La página en sí NO usa useSearchParams.
 * Solo pone el <Suspense> que exige Next para los hooks de navegación.
 */
export default function MarketplacePage() {
  return (
    <Suspense fallback={<div className="p-6">Cargando marketplace…</div>}>
      <MarketplaceContent />
    </Suspense>
  );
}

/**
 * Subcomponente cubierto por <Suspense>; acá sí usamos hooks de navegación
 * e integramos Mercado Pago Card Brick para tokenizar la tarjeta.
 */
function MarketplaceContent() {
  const { data: session, status } = useSession();
  const isAuthed = status === "authenticated";
  const router = useRouter();
  const searchParams = useSearchParams();

  // Controles de querystring
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

  // Carrito simple en memoria
  const [cart, setCart] = useState([]); // { id, title, unitPrice (cents), quantity }

  // ====== MP Bricks (Card Payment) ======
  const [showPay, setShowPay] = useState(false);
  const [payError, setPayError] = useState("");
  const [payLoading, setPayLoading] = useState(false);
  const cardBrickInstanceRef = useRef(null);
  const mpReadyRef = useRef(false);

  // Cargar productos desde /api/products/public
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
        const data = await res.json();
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
  // Preview de tickets: 1 ticket cada ARS 1000 (100000 centavos)
  const ticketsPreview = useMemo(() => Math.floor(totalCents / 100000), [totalCents]);

  // ========= Mercado Pago: cargar SDK =========
  useEffect(() => {
    if (mpReadyRef.current) return;
    const existing = document.getElementById("mp-sdk");
    if (existing) {
      mpReadyRef.current = true;
      return;
    }
    const script = document.createElement("script");
    script.id = "mp-sdk";
    script.src = "https://sdk.mercadopago.com/js/v2";
    script.async = true;
    script.onload = () => (mpReadyRef.current = true);
    script.onerror = () => console.error("No se pudo cargar el SDK de Mercado Pago");
    document.body.appendChild(script);
  }, []);

  // Render/unmount del Card Brick cuando abrimos/cerramos el modal
  useEffect(() => {
    (async () => {
      if (!showPay) {
        // cerrar / limpiar
        if (cardBrickInstanceRef.current) {
          try {
            await cardBrickInstanceRef.current.unmount();
          } catch {}
          cardBrickInstanceRef.current = null;
        }
        return;
      }

      if (!mpReadyRef.current || !window.MercadoPago) return;
      const PUBLIC_KEY = process.env.NEXT_PUBLIC_MP_PUBLIC_KEY;
      if (!PUBLIC_KEY) {
        setPayError("Falta NEXT_PUBLIC_MP_PUBLIC_KEY en variables de entorno");
        return;
      }

      // Tomamos el primer ítem del carrito (compat con backend actual)
      const first = cart[0];
      if (!first) {
        setPayError("Carrito vacío.");
        return;
      }

      // Inicializamos MP y bricks
      const mp = new window.MercadoPago(PUBLIC_KEY, { locale: "es-AR" });
      const bricksBuilder = mp.bricks();

      // Monto como número en ARS (el backend recalcula igual)
      const amountNumber = (first.unitPrice * first.quantity) / 100;

      try {
        // Unmount previo (defensivo)
        if (cardBrickInstanceRef.current) {
          await cardBrickInstanceRef.current.unmount();
          cardBrickInstanceRef.current = null;
        }

        // Render del Card Payment Brick
        cardBrickInstanceRef.current = await bricksBuilder.create(
          "cardPayment",
          "cardPaymentBrick_container",
          {
            initialization: {
              amount: amountNumber,
              payer: {
                email: session?.user?.email || "",
              },
            },
            customization: {
              paymentMethods: {
                creditCard: "all",
              },
            },
            callbacks: {
              onReady: () => setPayError(""),
              onSubmit: async (cardFormData) => {
                setPayLoading(true);
                setPayError("");
                try {
                  const res = await fetch("/api/chekout/orders", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      productId: first.id,
                      quantity: first.quantity,
                      buyer: {
                        email: session?.user?.email || undefined,
                        dni: undefined,
                      },
                      cardFormData: {
                        token: cardFormData.token,
                        payment_method_id: cardFormData.payment_method_id,
                        installments: Number(cardFormData.installments || 1),
                        issuer_id: cardFormData.issuer_id,
                      },
                    }),
                  });

                  // Defensivo: puede venir 502 con HTML si hay error de proxy
                  const text = await res.text();
                  let data = {};
                  try {
                    data = JSON.parse(text);
                  } catch {
                    throw new Error(`Respuesta inválida del servidor (${res.status}): ${text}`);
                  }

                  if (!res.ok) {
                    throw new Error(data?.error || `No se pudo crear la orden (${res.status})`);
                  }

                  // Éxito: el estado final lo confirmará el webhook
                  setCart([]);
                  alert(`Orden creada: ${data.orderId} (${data.status || "processing"})`);
                  setShowPay(false);
                } catch (err) {
                  console.error(err);
                  setPayError(err?.message || "No se pudo procesar el pago");
                } finally {
                  setPayLoading(false);
                }
              },
              onError: (error) => {
                console.error("Card Brick error:", error);
                setPayError("Error en el formulario de tarjeta. Revisá los datos.");
              },
            },
          }
        );
      } catch (e) {
        console.error("No se pudo inicializar el Card Brick:", e);
        setPayError("No se pudo inicializar el formulario de pago.");
      }
    })();

    // cleanup al desmontar el componente
    return () => {
      (async () => {
        if (cardBrickInstanceRef.current) {
          try {
            await cardBrickInstanceRef.current.unmount();
          } catch {}
          cardBrickInstanceRef.current = null;
        }
      })();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showPay, cart, status]);

  async function checkout() {
    try {
      if (!isAuthed) {
        alert("Iniciá sesión para comprar");
        return;
      }
      if (cart.length === 0) return;
      // Compat: procesamos solo el primer ítem
      setShowPay(true);
    } catch (e) {
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
            goTo({ q, page: 1 }); // reset page al buscar
          }}
        >
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar (título o descripción)…"
            className="flex-1 rounded-xl bg-white/10 px-3 py-2 outline-none focus:bg-white/15"
          />
          <button
            type="submit"
            className="px-4 py-2 rounded-xl bg-white/10 hover:bg-white/20 font-semibold"
          >
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
                  {p.description && (
                    <p className="text-sm opacity-80 mt-1 line-clamp-3">{p.description}</p>
                  )}
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
                  <div className="w-28 text-right font-mono">
                    {formatARS(it.unitPrice * it.quantity)}
                  </div>
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

      {/* ===== Modal de pago con Card Brick ===== */}
      {showPay && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="w-full max-w-lg rounded-2xl bg-slate-900 border border-white/10 p-4">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-lg font-bold">Pagar con tarjeta</h3>
              <button
                onClick={() => setShowPay(false)}
                className="px-2 py-1 text-sm rounded bg-white/10 hover:bg-white/20"
                disabled={payLoading}
              >
                Cerrar
              </button>
            </div>

            <div className="text-sm opacity-80 mb-2">
              Ingresá los datos de tu tarjeta para completar el pago.
            </div>

            <div id="cardPaymentBrick_container" className="rounded-xl bg-white/5 p-3" />

            {payError && <div className="mt-3 text-sm text-red-300">{payError}</div>}

            <div className="mt-3 text-right">
              <button
                className="px-3 py-2 rounded-xl bg-white/10 hover:bg-white/20 disabled:opacity-50"
                disabled={payLoading}
                onClick={() => setShowPay(false)}
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
