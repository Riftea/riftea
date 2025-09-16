"use client";
import Image from "next/image";

/**
 * SmartImage: usa <Image> cuando es seguro (local o host permitido)
 * y <img> como fallback para data: URLs o hosts externos no configurados.
 */
const ALLOWED_HOSTS = new Set([
  "lh3.googleusercontent.com",
  "www.oscarbarbieri.com",
  "oscarbarbieri.com",
]);

function isDataUrl(src) {
  return typeof src === "string" && src.startsWith("data:");
}

function isLocal(src) {
  if (typeof src !== "string") return false;
  // imágenes servidas desde /public o rutas internas
  return src.startsWith("/") && !src.startsWith("//");
}

function isAllowedRemote(src) {
  try {
    const u = new URL(src);
    return u.protocol.startsWith("http") && ALLOWED_HOSTS.has(u.hostname);
  } catch {
    return false;
  }
}

export default function SmartImage({
  src,
  alt,
  width,
  height,
  fill = false,
  className = "",
  ...rest
}) {
  if (!src) return null;

  const useFallback = isDataUrl(src) || (!isLocal(src) && !isAllowedRemote(src));

  if (useFallback) {
    // Evita el error de next/image para data: y hosts no registrados
    return (
      <img
        src={src}
        alt={alt || ""}
        className={className}
        {...rest}
        // Evita arrastre de imagen en UI
        draggable={false}
      />
    );
  }

  // Seguro usar next/image
  return fill ? (
    <Image
      src={src}
      alt={alt || ""}
      fill
      className={className}
      {...rest}
    />
  ) : (
    <Image
      src={src}
      alt={alt || ""}
      width={width || 1200}
      height={height || 800}
      className={className}
      {...rest}
    />
  );
}
