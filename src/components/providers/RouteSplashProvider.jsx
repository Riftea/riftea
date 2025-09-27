"use client";
import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import CircleSplash from "@/components/ui/CircleSplash";

/**
 * Muestra CircleSplash cada vez que cambia la ruta.
 * - minShowMs evita parpadeos en rutas que cargan muy rápido.
 */
export default function RouteSplashProvider({
  children,
  minShowMs = 450,
  durationMs = 900,
}) {
  const pathname = usePathname();
  const lastPathRef = useRef(pathname);
  const [show, setShow] = useState(false);
  const hideTimer = useRef(null);

  useEffect(() => {
    if (lastPathRef.current !== pathname) {
      lastPathRef.current = pathname;
      // al entrar a una nueva ruta, disparar splash
      setShow(true);
      clearTimeout(hideTimer.current);
      hideTimer.current = setTimeout(() => setShow(false), minShowMs);
    }
  }, [pathname, minShowMs]);

  return (
    <>
      {children}
      <CircleSplash
        show={show}
        durationMs={durationMs}
        onFinish={() => setShow(false)}
      />
    </>
  );
}
