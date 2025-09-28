// Server Component (no "use client")

import Link from "next/link";

export default async function Page({ params }) {
  const id = params?.id ?? "";

  // Trae el producto del endpoint admin (ajustá si usás otro)
  let product = null;
  try {
    const res = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL || ""}/api/admin/products/${id}`, {
      // Evita cachear para ver cambios recientes
      cache: "no-store",
    });
    if (res.ok) {
      product = await res.json();
    }
  } catch {
    // ignoramos; mostramos fallback
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Producto #{id}</h1>
        <Link
          href={`/admin/products/${id}/edit`}
          className="px-4 py-2 rounded-lg bg-black text-white"
        >
          Editar
        </Link>
      </div>

      {!product ? (
        <div className="rounded-lg border p-4">
          <p className="text-gray-700">No se pudo cargar el producto o no existe.</p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          <div className="rounded-lg border p-4 space-y-2">
            <h2 className="text-lg font-medium">Información</h2>
            <p><span className="font-medium">Título:</span> {product.title || "—"}</p>
            <p><span className="font-medium">Tipo:</span> {product.type || "—"}</p>
            <p><span className="font-medium">Estado:</span> {product.status || "—"}</p>
            <p>
              <span className="font-medium">Precio:</span>{" "}
              {new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS" })
                .format((Number(product.priceCents || 0)) / 100)}
            </p>
            <p className="text-sm text-gray-600 whitespace-pre-wrap">
              {product.description || "Sin descripción."}
            </p>
          </div>

          <div className="rounded-lg border p-4 space-y-2">
            <h2 className="text-lg font-medium">Imágenes</h2>

            {/* Portada */}
            {product.coverImage ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={product.coverImage}
                alt="Portada"
                className="w-full h-48 object-cover rounded-lg border"
              />
            ) : (
              <p className="text-sm text-gray-500">Sin portada.</p>
            )}

            {/* Galería */}
            {Array.isArray(product.gallery) && product.gallery.length > 0 ? (
              <div className="grid grid-cols-2 gap-3">
                {product.gallery.map((u, i) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    key={u + i}
                    src={u}
                    alt={`img-${i}`}
                    className="w-full h-28 object-cover rounded-lg border"
                  />
                ))}
              </div>
            ) : (
              <p className="text-sm text-gray-500">Sin imágenes en la galería.</p>
            )}
          </div>
        </div>
      )}

      <div>
        <Link href="/admin/products" className="text-sm underline">
          ← Volver al listado
        </Link>
      </div>
    </div>
  );
}

export async function generateMetadata({ params }) {
  const id = params?.id ?? "";
  return { title: id ? `Producto ${id}` : "Producto" };
}
