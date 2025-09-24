export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import path from "path";
import { mkdir, writeFile, stat } from "fs/promises";
import sharp from "sharp";
import { v4 as uuidv4 } from "uuid";
import { createClient } from "@supabase/supabase-js";

/* ======================
   Config
   ====================== */
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
// Si AVIF te trae problemas, quitá "image/avif"
const ALLOWED_MIME = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/jpg",
  "image/avif",
]);

// Si estás en Vercel o seteás USE_SUPABASE_STORAGE, usa Storage (recomendado)
const USE_SUPABASE =
  !!(process.env.USE_SUPABASE_STORAGE || process.env.VERCEL);
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE;
const BUCKET = process.env.UPLOADS_BUCKET || "raffles";

/* ======================
   Helpers
   ====================== */
async function ensureUploadsDir(dir) {
  try { await stat(dir); } catch { await mkdir(dir, { recursive: true }); }
}

function fail(status, error, extra = {}) {
  return NextResponse.json({ ok: false, error, ...extra }, { status });
}

function parseDataUrlToBuffer(dataUrl) {
  // data:image/*;base64,<...>
  const m = /^data:(image\/[a-z0-9.+-]+);base64,(.+)$/i.exec(String(dataUrl || ""));
  if (!m) return { error: "DATA_URL_INVALID", mime: null, buffer: null };
  const mime = m[1].toLowerCase();
  if (!ALLOWED_MIME.has(mime)) {
    return { error: "MIME_NOT_ALLOWED", mime, buffer: null };
  }
  try {
    const buffer = Buffer.from(m[2], "base64");
    return { error: null, mime, buffer };
  } catch {
    return { error: "BASE64_DECODE_FAILED", mime, buffer: null };
  }
}

/* ======================
   Handler
   ====================== */
export async function POST(request) {
  try {
    const ct = request.headers.get("content-type") || "";
    if (!ct.toLowerCase().includes("multipart/form-data")) {
      return fail(400, "Debe ser multipart/form-data con 'file' o 'dataUrl'.");
    }

    const formData = await request.formData();
    const file = formData.get("file");
    const dataUrl = formData.get("dataUrl");

    let inputBuffer = null;
    let detectedMime = null;

    if (file && typeof file !== "string") {
      const { type, size } = file;
      if (!ALLOWED_MIME.has(type)) {
        return fail(415, "Formato no permitido. Usa JPG, PNG o WebP.");
      }
      if (!size || size <= 0) return fail(400, "Archivo vacío o corrupto.");
      if (size > MAX_FILE_SIZE) {
        return fail(413, `El archivo supera ${Math.round(MAX_FILE_SIZE / (1024 * 1024))}MB.`);
      }
      inputBuffer = Buffer.from(await file.arrayBuffer());
      detectedMime = type;
    } else if (dataUrl && typeof dataUrl === "string") {
      const { error, mime, buffer } = parseDataUrlToBuffer(dataUrl);
      if (error) {
        const map = {
          DATA_URL_INVALID: "El campo 'dataUrl' no tiene un formato válido.",
          MIME_NOT_ALLOWED: "Formato no permitido. Usa JPG, PNG o WebP.",
          BASE64_DECODE_FAILED: "No se pudo decodificar la imagen.",
        };
        return fail(400, map[error] || "dataUrl inválida.");
      }
      if (buffer.length > MAX_FILE_SIZE) {
        return fail(413, `La imagen embebida supera ${Math.round(MAX_FILE_SIZE / (1024 * 1024))}MB.`);
      }
      inputBuffer = buffer;
      detectedMime = mime;
    } else {
      return fail(400, "No se recibió archivo. Enviá 'file' o 'dataUrl'.");
    }

    // ==== Procesamiento con sharp (a WebP + thumb) ====
    let mainBuffer, thumbBuffer;
    try {
      mainBuffer = await sharp(inputBuffer)
        .rotate()
        .resize({ width: 1600, height: 1600, fit: "inside", withoutEnlargement: true })
        .webp({ quality: 82 })
        .toBuffer();

      // Miniatura cuadrada 600x600
      thumbBuffer = await sharp(inputBuffer)
        .rotate()
        .resize({ width: 600, height: 600, fit: "cover", withoutEnlargement: true })
        .webp({ quality: 78 })
        .toBuffer();
    } catch (e) {
      console.error("[UPLOADS] sharp error:", e);
      // Si esto aparece solo con AVIF, quitá AVIF de ALLOWED_MIME
      return fail(500, "Error interno procesando la imagen.");
    }

    const baseId = uuidv4().replace(/-/g, "");
    const mainFilename = `${baseId}.webp`;
    const thumbFilename = `${baseId}_thumb.webp`;

    // ==== Producción: Supabase Storage ====
    if (USE_SUPABASE) {
      if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE) {
        return fail(500, "Faltan variables de entorno de Supabase (URL / SERVICE_ROLE).");
      }
      const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE);
      const basePath = `uploads/${baseId}`;
      const mainPath = `${basePath}/${mainFilename}`;
      const thumbPath = `${basePath}/${thumbFilename}`;

      const up1 = await supabase.storage.from(BUCKET).upload(mainPath, mainBuffer, {
        contentType: "image/webp",
        upsert: false,
      });
      if (up1.error) {
        console.error("[UPLOADS] upload main error:", up1.error);
        return fail(500, "No se pudo subir la imagen principal.");
      }

      const up2 = await supabase.storage.from(BUCKET).upload(thumbPath, thumbBuffer, {
        contentType: "image/webp",
        upsert: false,
      });
      if (up2.error) {
        console.error("[UPLOADS] upload thumb error:", up2.error);
        await supabase.storage.from(BUCKET).remove([mainPath]).catch(() => {});
        return fail(500, "No se pudo subir la miniatura.");
      }

      const { data: pub1 } = supabase.storage.from(BUCKET).getPublicUrl(mainPath);
      const { data: pub2 } = supabase.storage.from(BUCKET).getPublicUrl(thumbPath);

      return NextResponse.json({
        ok: true,
        url: pub1.publicUrl,
        thumbUrl: pub2.publicUrl,
        from: file ? "file" : "dataUrl",
        mime: detectedMime,
        size: mainBuffer.length,
        message: "Imagen subida y optimizada correctamente (Supabase).",
      }, { status: 201 });
    }

    // ==== Dev/local: escribir a /public/uploads ====
    try {
      const uploadsDir = path.join(process.cwd(), "public", "uploads");
      await ensureUploadsDir(uploadsDir);
      await writeFile(path.join(uploadsDir, mainFilename), mainBuffer);
      await writeFile(path.join(uploadsDir, thumbFilename), thumbBuffer);

      return NextResponse.json({
        ok: true,
        url: `/uploads/${mainFilename}`,
        thumbUrl: `/uploads/${thumbFilename}`,
        from: file ? "file" : "dataUrl",
        mime: detectedMime,
        size: mainBuffer.length,
        message: "Imagen subida y optimizada correctamente (local).",
      }, { status: 201 });
    } catch (fsErr) {
      console.error("[UPLOADS] fs error:", fsErr);
      return fail(500, "El entorno no permite escribir en disco. Activá Supabase o un storage externo.");
    }
  } catch (err) {
    console.error("[UPLOADS] fatal:", err);
    return fail(500, "Error interno procesando la imagen.", {
      details: process.env.NODE_ENV === "development" ? String(err?.message || err) : undefined,
    });
  }
}
