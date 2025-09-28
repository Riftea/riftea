"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

// Si ya tenés formatARS en "@/lib/commerce", descomentá la import y borra la función local.
// import { formatARS } from "@/lib/commerce";
function formatARS(cents = 0) {
  try {
    return new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS" }).format((cents || 0) / 100);
  } catch {
    return `$ ${(cents || 0) / 100}`;
  }
}

export default function AdminProductsPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [items, setItems] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, limit: 20, total: 0, totalPages: 1 });

  async function load(page = 1) {
    try {
      setLoading(true);
      setError("");
      const url = new URL("/api/products", window.location.origin);
      url.searchParams.set("page", String(page));
      url.searchParams.set("limit", "20");
      const res = await fetch(url, { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "No se pudo cargar");
      setItems(Array.isArray(data.items) ? data.items : []);
      setPagination(data.pagination || { page: 1, limit: 20, total: 0, totalPages: 1 });
    } catch (e) {
      setError(e?.message || "Error");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load(1);
  }, []);

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <div className="max-w-5xl mx-auto p-6 space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <h1 className="text-2xl font-extrabold">Mis productos</h1>
          <div className="flex gap-2">
            <Link
              href="/marketplace"
              className="px-3 py-2 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-100 transition-colors"
            >
              🌐 Marketplace
            </Link>
            <Link
              href="/admin/products/new"
              className="px-3 py-2 rounded-lg bg-white/10 hover:bg-white/20"
            >
              + Nuevo producto
            </Link>
          </div>
        </div>

        {/* Contenido */}
        {loading ? (
          <p className="opacity-80">Cargando…</p>
        ) : error ? (
          <p className="text-red-300">{error}</p>
        ) : items.length === 0 ? (
          <div className="rounded-2xl border border-white/10 p-6 bg-white/5">
            <p className="mb-3">No tenés productos aún.</p>
            <Link href="/admin/products/new" className="inline-block px-3 py-2 rounded-lg bg-white/10 hover:bg-white/20">
              Crear el primero →
            </Link>
          </div>
        ) : (
          <div className="rounded-2xl border border-white/10 bg-white/5 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-white/10">
                <tr>
                  <th className="text-left px-3 py-2">Título</th>
                  <th className="text-left px-3 py-2">Tipo</th>
                  <th className="text-left px-3 py-2">Precio</th>
                  <th className="text-left px-3 py-2">Estado</th>
                  <th className="text-right px-3 py-2">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {items.map((it) => (
                  <tr key={it.id} className="border-t border-white/10">
                    <td className="px-3 py-2 font-medium">{it.title}</td>
                    <td className="px-3 py-2">{it.type}</td>
                    <td className="px-3 py-2 font-mono">{formatARS(it.priceCents)}</td>
                    <td className="px-3 py-2">{it.isActive ? "Publicado" : "Borrador"}</td>
                    <td className="px-3 py-2 text-right">
                      <div className="inline-flex gap-2">
                        <Link
                          href={`/marketplace/${it.id}`}
                          className="px-2 py-1 rounded bg-white/10 hover:bg-white/20"
                        >
                          Ver
                        </Link>
                        <Link
                          href={`/admin/products/${it.id}/edit`}
                          className="px-2 py-1 rounded bg-blue-500/20 hover:bg-blue-500/30 text-blue-100"
                        >
                          Editar
                        </Link>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Paginación */}
        {pagination.totalPages > 1 && (
          <div className="flex items-center justify-center gap-2">
            <button
              disabled={pagination.page <= 1}
              onClick={() => load(pagination.page - 1)}
              className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 disabled:opacity-40"
            >
              ← Anterior
            </button>
            <span className="opacity-80">
              {pagination.page} / {pagination.totalPages}
            </span>
            <button
              disabled={pagination.page >= pagination.totalPages}
              onClick={() => load(pagination.page + 1)}
              className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 disabled:opacity-40"
            >
              Siguiente →
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
