"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Renderiza un botón que:
 * 1) Llama al backend para crear la Preference (POST /api/checkout/preference)
 * 2) Monta el Wallet Brick (saldo MP + medios guardados)
 *
 * Props:
 * - cart: Array<{ id: string, quantity: number }>
 * - buyer?: { email?: string, dni?: string }
 * - onSuccess?: () => void  (se llama cuando se inicia el flujo ok; la confirmación real llega por webhook)
 */
export default function WalletPayButton({ cart = [], buyer, onSuccess }) {
  const [loading, setLoading] = useState(false);
  const [brickReady, setBrickReady] = useState(false);
  const containerRef = useRef(null);
  const mpInstanceRef = useRef(null);
  const brickControllerRef = useRef(null);

  // Carga dinámica del SDK de MP (solo cliente)
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.MercadoPago) return;

    const script = document.createElement("script");
    script.src = "https://sdk.mercadopago.com/js/v2";
    script.async = true;
    script.onload = () => {
      // nada más, se inicializa cuando el user hace click
    };
    document.head.appendChild(script);

    return () => {
      // opcional: limpiar script si desmonta
    };
  }, []);

  async function initWalletBrick(preferenceId) {
    if (typeof window === "undefined" || !window.MercadoPago) {
      throw new Error("SDK de Mercado Pago no disponible");
    }

    // Instancia MP (usa tu Public Key)
    if (!mpInstanceRef.current) {
      const pk = process.env.NEXT_PUBLIC_MP_PUBLIC_KEY;
      if (!pk) throw new Error("Falta NEXT_PUBLIC_MP_PUBLIC_KEY");
      mpInstanceRef.current = new window.MercadoPago(pk, { locale: "es-AR" });
    }

    // Limpia instancia previa del brick si existe
    if (brickControllerRef.current) {
      try { await brickControllerRef.current.unmount(); } catch {}
      brickControllerRef.current = null;
      setBrickReady(false);
    }

    // Crea el Wallet Brick
    const bricksBuilder = mpInstanceRef.current.bricks();
    const controller = await bricksBuilder.create("wallet", containerRef.current, {
      initialization: { preferenceId },
      customization: {
        visual: { buttonText: "Pagar con Mercado Pago" },
      },
      callbacks: {
        onReady: () => setBrickReady(true),
        onError: (error) => {
          console.error("Wallet Brick error:", error);
          alert("No se pudo iniciar el pago. Intentalo nuevamente.");
        },
      },
    });

    brickControllerRef.current = controller;
  }

  async function handleClick() {
    try {
      if (!Array.isArray(cart) || cart.length === 0) {
        alert("Tu carrito está vacío");
        return;
      }
      setLoading(true);

      // Armamos payload para preference
      const payload = {
        items: cart.map((c) => ({ productId: c.id, quantity: Number(c.quantity || 1) })),
        buyer: buyer || undefined,
      };

      const res = await fetch("/api/checkout/preference", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();

      if (!res.ok) throw new Error(data?.error || "No se pudo crear la preferencia");

      await initWalletBrick(data.preferenceId);
      onSuccess?.();
    } catch (e) {
      console.error(e);
      alert(e?.message || "Error iniciando el pago");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      {/* Botón que dispara la creación de Preference y el montaje del Wallet */}
      <button
        type="button"
        onClick={handleClick}
        disabled={loading}
        className="px-4 py-2 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 font-bold disabled:opacity-60"
      >
        {loading ? "Preparando pago…" : "Pagar con Mercado Pago"}
      </button>

      {/* Contenedor del Wallet Brick (se monta después de crear la preferencia) */}
      <div
        ref={containerRef}
        id="wallet_container"
        className={`transition-opacity ${brickReady ? "opacity-100" : "opacity-0"} `}
      />
    </div>
  );
}
