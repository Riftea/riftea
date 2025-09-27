"use client";
import { useState, useEffect } from "react";
import CircleSplash from "@/components/ui/CircleSplash";

export default function LoadingSorteos() {
  const [show, setShow] = useState(true);
  useEffect(() => {
    // seguridad: si la ruta resuelve muy rápido, ocultar igual
    const t = setTimeout(() => setShow(false), 1600);
    return () => clearTimeout(t);
  }, []);
  return <CircleSplash show={show} onFinish={() => setShow(false)} />;
}
