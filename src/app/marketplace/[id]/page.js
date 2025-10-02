"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";

function formatARS(cents = 0) {
  try {
    return new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS" })
      .format((Number(cents || 0) / 100));
  } catch {
    return `$ ${(Number(cents || 0) / 100).toFixed(2)}`;
  }
}

export default function MarketplaceProductDetailPage() {
  const { id } = useParams();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [p, setP] = useState(null);

  useEffect(() => {
    let abort = false;
    (async () => {
      try {
        setLoading(true);
        setErr("");
        const res = await fetch(`/api/products/${id}`, { cache: "no-store" });
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error || "No se pudo cargar el producto");
        if (!abort) setP(data);
      } catch (e) {
        if (!abort) setErr(e?.message || "Error");
      } finally {
        if (!abort) setLoading(false);
      }
    })();
    return () => { abort = true; };
  }, [id]);

  function addToCart() {
    try {
      const raw = localStorage.getItem("cart") || "[]";
      const arr = JSON.parse(raw);
      const idx = arr.findIndex((x) => x.id === p.id);
      if (idx >= 0) {
        arr[idx] = { ...arr[idx], quantity: arr[idx].quantity + 1 };
      } else {
        arr.push({ id: p.id, title: p.title, unitPrice: p.priceCents, quantity: 1 });
      }
      localStorage.setItem("cart", JSON.stringify(arr));
      alert("Agregado al carrito.");
      router.push("/marketplace");
    } catch {
      alert("No se pudo agregar al carrito");
    }
  }

  if (loading) return <div className="p-6 text-white">Cargando…</div>;
  if (err) return <div className="p-6 text-red-200">{err}</div>;
  if (!p) return <div className="p-6 text-white">No encontrado</div>;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-indigo-950 to-purple-950 text-white">
      <div className="max-w-3xl mx-auto p-6 space-y-6">
        <Link href="/marketplace" className="text-sm px-3 py-2 rounded-lg bg-white/10 hover:bg-white/20">
          ← Volver
        </Link>

        <div className="rounded-2xl border border-white/10 bg-white/5 p-5 space-y-4">
          <div className="text-[10px] uppercase opacity-70">{p.type}</div>
          <h1 className="text-2xl font-extrabold">{p.title}</h1>
          {p.description && <p className="opacity-90">{p.description}</p>}

          <div className="flex items-center justify-between pt-2">
            <div className="text-xl font-mono">{formatARS(p.priceCents)}</div>
            <button
              onClick={addToCart}
              className="px-4 py-2 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-100"
            >
              Agregar
            </button>
          </div>

          {/* Metadatos útiles */}
          <div className="text-xs opacity-70 pt-3">
            Currency: {p.currency} · Activo: {p.isActive ? "sí" : "no"}
          </div>
        </div>
      </div>
    </div>
  );
}
