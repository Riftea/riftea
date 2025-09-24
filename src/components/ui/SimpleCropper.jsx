"use client";
import { useEffect, useMemo, useRef, useState } from "react";

/**
 * SimpleCropper con zoom/drag + selector de aspecto (1:1, 4:3, 16:9)
 *
 * Props:
 *  - file: File | {src:string} | null
 *  - open: boolean
 *  - onClose: () => void
 *  - onCropped: (dataUrl: string) => void
 *  - outputWidth?: number (px) -> default 1200
 *  - rememberAspectKey?: string (localStorage key para recordar la relación)
 *  - minOutputWidth?: number (px) -> si el recorte efectivo es menor, se deshabilita “Aplicar”
 */
export default function SimpleCropper({
  file,
  open,
  onClose,
  onCropped,
  outputWidth = 1200,
  rememberAspectKey,
  minOutputWidth = 700,
}) {
  // relación activa
  const [ratioKey, setRatioKey] = useState("1:1"); // "1:1" | "4:3" | "16:9"
  // imagen fuente
  const [img, setImg] = useState(null);

  // estado de interacción
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [drag, setDrag] = useState({ active: false, startX: 0, startY: 0, baseX: 0, baseY: 0 });

  // preview canvas
  const canvasRef = useRef(null);

  // recordar relación en localStorage
  useEffect(() => {
    if (!rememberAspectKey) return;
    try {
      const saved = localStorage.getItem(rememberAspectKey);
      if (saved === "1:1" || saved === "4:3" || saved === "16:9") setRatioKey(saved);
    } catch {}
  }, [rememberAspectKey]);

  useEffect(() => {
    if (!rememberAspectKey) return;
    try {
      localStorage.setItem(rememberAspectKey, ratioKey);
    } catch {}
  }, [rememberAspectKey, ratioKey]);

  // ratio numérico
  const ratio = useMemo(() => {
    if (ratioKey === "4:3") return 4 / 3;
    if (ratioKey === "16:9") return 16 / 9;
    return 1;
  }, [ratioKey]);

  // tamaño del visor (preview)
  const viewW = 360;
  const viewH = useMemo(() => {
    return ratioKey === "16:9"
      ? Math.round((viewW * 9) / 16)
      : ratioKey === "4:3"
      ? Math.round((viewW * 3) / 4)
      : viewW; // 1:1
  }, [ratioKey]);

  // tamaño de salida
  const outW = outputWidth;
  const outH = useMemo(() => {
    return ratioKey === "16:9"
      ? Math.round((outW * 9) / 16)
      : ratioKey === "4:3"
      ? Math.round((outW * 3) / 4)
      : outW; // 1:1
  }, [ratioKey, outW]);

  // cargar imagen
  useEffect(() => {
    if (!open || !file) { setImg(null); return; }
    let revoke = null;
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => setImg(image);
    image.onerror = () => setImg(null);

    if (file instanceof File) {
      const url = URL.createObjectURL(file);
      revoke = () => URL.revokeObjectURL(url);
      image.src = url;
    } else if (file?.src) {
      image.src = file.src;
    }

    // reset al abrir / cambiar imagen
    setZoom(1);
    setOffset({ x: 0, y: 0 });

    return () => { if (revoke) revoke(); };
  }, [file, open]);

  // redibujo del preview
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !img) return;

    canvas.width = viewW;
    canvas.height = viewH;

    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, viewW, viewH);
    ctx.fillStyle = "#111";
    ctx.fillRect(0, 0, viewW, viewH);

    // cover: que cubra todo el rectángulo del visor
    const scaleToCover = Math.max(viewW / img.width, viewH / img.height);
    const scale = scaleToCover * zoom;

    const drawW = img.width * scale;
    const drawH = img.height * scale;

    const cx = viewW / 2 + offset.x;
    const cy = viewH / 2 + offset.y;

    ctx.save();
    ctx.imageSmoothingQuality = "high";
    ctx.translate(cx, cy);
    ctx.drawImage(img, -drawW / 2, -drawH / 2, drawW, drawH);
    ctx.restore();

    // marco
    ctx.strokeStyle = "rgba(255,255,255,0.85)";
    ctx.lineWidth = 2;
    ctx.strokeRect(1, 1, viewW - 2, viewH - 2);
  }, [img, zoom, offset, viewW, viewH]);

  // drag handlers
  const onMouseDown = (e) => {
    setDrag({ active: true, startX: e.clientX, startY: e.clientY, baseX: offset.x, baseY: offset.y });
  };
  const onMouseMove = (e) => {
    if (!drag.active) return;
    const dx = e.clientX - drag.startX;
    const dy = e.clientY - drag.startY;
    setOffset({ x: drag.baseX + dx, y: drag.baseY + dy });
  };
  const onMouseUp = () => setDrag((d) => ({ ...d, active: false }));

  const onTouchStart = (e) => {
    const t = e.touches[0];
    setDrag({ active: true, startX: t.clientX, startY: t.clientY, baseX: offset.x, baseY: offset.y });
  };
  const onTouchMove = (e) => {
    if (!drag.active) return;
    const t = e.touches[0];
    const dx = t.clientX - drag.startX;
    const dy = t.clientY - drag.startY;
    setOffset({ x: drag.baseX + dx, y: drag.baseY + dy });
  };
  const onTouchEnd = () => setDrag((d) => ({ ...d, active: false }));

  // validación de tamaño mínimo del recorte efectivo
  // (si el ancho que efectivamente se rasteriza en el output, antes de escalar, es < minOutputWidth -> deshabilitamos)
  const canApply = useMemo(() => {
    if (!img) return false;

    // cuánto “contenido real” cae dentro del output sin considerar escalado visual del usuario
    // calculamos el tamaño del contenido fuente proyectado sobre el output:
    const scaleToCoverOut = Math.max(outW / img.width, outH / img.height);
    const sourceToOutputScale = scaleToCoverOut * zoom; // cuánto se escala la imagen fuente para llenar el output
    // Entonces, ¿qué ancho del *source* corresponde al ancho del output?
    // output width (outW) = source width (effective) * sourceToOutputScale
    // => effective source width = outW / sourceToOutputScale
    const effectiveSourceWidth = outW / sourceToOutputScale;

    return effectiveSourceWidth >= minOutputWidth;
  }, [img, outW, outH, zoom, minOutputWidth]);

  const handleConfirm = () => {
    if (!img) return;

    const out = document.createElement("canvas");
    out.width = outW;
    out.height = outH;
    const ctx = out.getContext("2d");

    const scaleToCover = Math.max(outW / img.width, outH / img.height);
    const scale = scaleToCover * zoom;

    const drawW = img.width * scale;
    const drawH = img.height * scale;

    // mapear offset del preview al output (escala proporcional)
    const sx = outW / viewW;
    const sy = outH / viewH;

    const cx = outW / 2 + offset.x * sx;
    const cy = outH / 2 + offset.y * sy;

    ctx.fillStyle = "#111";
    ctx.fillRect(0, 0, outW, outH);
    ctx.save();
    ctx.imageSmoothingQuality = "high";
    ctx.translate(cx, cy);
    ctx.drawImage(img, -drawW / 2, -drawH / 2, drawW, drawH);
    ctx.restore();

    const dataUrl = out.toDataURL("image/webp", 0.9);
    onCropped?.(dataUrl);
    onClose?.();
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] bg-black/70 backdrop-blur-sm grid place-items-center p-4">
      <div className="w-full max-w-xl bg-gray-900 border border-gray-700 rounded-2xl overflow-hidden">
        {/* Header */}
        <div className="px-4 py-3 border-b border-gray-800 flex items-center justify-between">
          <h3 className="text-gray-100 font-semibold">Recortar imagen</h3>
          <button onClick={onClose} className="px-3 py-1 bg-gray-800 rounded-lg hover:bg-gray-700">
            Cerrar
          </button>
        </div>

        {/* Selector de aspecto */}
        <div className="px-4 py-3 border-b border-gray-800 flex items-center gap-2">
          <span className="text-sm text-gray-300 mr-2">Relación:</span>
          {["1:1", "4:3", "16:9"].map((r) => (
            <button
              key={r}
              onClick={() => {
                setRatioKey(r);
                setZoom(1);
                setOffset({ x: 0, y: 0 });
              }}
              className={`px-3 py-1.5 rounded-lg text-sm border ${
                ratioKey === r
                  ? "bg-orange-600 text-white border-orange-600"
                  : "bg-gray-800 text-gray-200 border-gray-700 hover:bg-gray-700"
              }`}
            >
              {r}
            </button>
          ))}
          <div className="ml-auto text-xs text-gray-400">
            Salida: {outW}×{Math.round(outH)} px
          </div>
        </div>

        {/* Lienzo */}
        <div className="p-4">
          <div
            className="mx-auto"
            style={{ width: viewW, height: viewH, touchAction: "none", cursor: drag.active ? "grabbing" : "grab" }}
            onMouseDown={onMouseDown}
            onMouseMove={onMouseMove}
            onMouseUp={onMouseUp}
            onMouseLeave={onMouseUp}
            onTouchStart={onTouchStart}
            onTouchMove={onTouchMove}
            onTouchEnd={onTouchEnd}
          >
            <canvas ref={canvasRef} className="bg-black rounded-xl w-full h-full block" />
          </div>

          {/* Zoom */}
          <div className="mt-4 flex items-center gap-3">
            <span className="text-sm text-gray-300 w-16">Zoom</span>
            <input
              type="range"
              min={1}
              max={3}
              step={0.01}
              value={zoom}
              onChange={(e) => setZoom(parseFloat(e.target.value))}
              className="flex-1"
            />
            <span className="text-sm text-gray-400 w-10 text-right">{zoom.toFixed(2)}x</span>
          </div>

          {/* Aviso de tamaño insuficiente */}
          {!canApply && (
            <div className="mt-3 p-3 rounded-lg border border-amber-700 bg-amber-900/30 text-amber-200 text-sm">
              El recorte resultante es muy chico para esta relación. Probá bajar el zoom o usar otra imagen.
              (Mínimo recomendado: {minOutputWidth}px de ancho efectivo)
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-3 border-t border-gray-800 flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 rounded-lg border border-gray-700 text-gray-300 hover:bg-gray-800">
            Cancelar
          </button>
          <button
            onClick={handleConfirm}
            disabled={!canApply}
            className={`px-4 py-2 rounded-lg ${canApply ? "bg-orange-600 hover:bg-orange-700 text-white" : "bg-gray-700 text-gray-300 cursor-not-allowed"}`}
          >
            Aplicar recorte
          </button>
        </div>
      </div>
    </div>
  );
}
