"use client";
import { useEffect, useState } from "react";

/**
 * FadeIn: wrapper con animación de entrada reutilizable
 * Props:
 * - delay (ms): retardo antes de aparecer (default 0)
 * - duration (ms): duración de la transición (default 300)
 * - className: clases extra para el contenedor
 * - as: tag a renderizar (div por defecto)
 */
export default function FadeIn({
  children,
  delay = 0,
  duration = 300,
  className = "",
  as: Tag = "div",
}) {
  const [show, setShow] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setShow(true), delay);
    return () => clearTimeout(t);
  }, [delay]);

  return (
    <Tag
      className={className}
      style={{
        opacity: show ? 1 : 0,
        transform: show ? "translateY(0px)" : "translateY(8px)",
        transition: `opacity ${duration}ms ease, transform ${duration}ms ease`,
        willChange: "opacity, transform",
      }}
    >
      {children}
    </Tag>
  );
}
