import { NextResponse } from "next/server";
import path from "path";
import { mkdir, writeFile, stat } from "fs/promises";
import sharp from "sharp";
import { v4 as uuidv4 } from "uuid";

export const runtime = "nodejs";

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const ALLOWED_MIME = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/jpg",
  "image/avif",
]);

const ensureUploadsDir = async (dir) => {
  try {
    await stat(dir);
  } catch {
    await mkdir(dir, { recursive: true });
  }
};

function parseDataUrlToBuffer(dataUrl) {
  // data:[<mediatype>][;base64],<data>
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

export async function POST(request) {
  try {
    const formData = await request.formData();
    const file = formData.get("file");
    const dataUrl = formData.get("dataUrl");

    let inputBuffer = null;
    let detectedMime = null;

    if (file && typeof file !== "string") {
      // ---- vía <input type="file">
      const { type, size } = file; // Blob
      if (!ALLOWED_MIME.has(type)) {
        return NextResponse.json(
          { error: "Formato no permitido. Usa JPG, PNG, WEBP o AVIF." },
          { status: 415 }
        );
      }
      if (size > MAX_FILE_SIZE) {
        return NextResponse.json(
          { error: `El archivo supera el máximo de ${Math.round(MAX_FILE_SIZE / (1024 * 1024))}MB.` },
          { status: 413 }
        );
      }
      const arrayBuffer = await file.arrayBuffer();
      inputBuffer = Buffer.from(arrayBuffer);
      detectedMime = type;
    } else if (dataUrl && typeof dataUrl === "string") {
      // ---- vía data URL (base64)
      const { error, mime, buffer } = parseDataUrlToBuffer(dataUrl);
      if (error) {
        const map = {
          DATA_URL_INVALID: "El campo 'dataUrl' no tiene un formato válido.",
          MIME_NOT_ALLOWED: "Formato no permitido. Usa JPG, PNG, WEBP o AVIF.",
          BASE64_DECODE_FAILED: "No se pudo decodificar la imagen.",
        };
        return NextResponse.json({ error: map[error] || "dataUrl inválida." }, { status: 400 });
      }
      if (buffer.length > MAX_FILE_SIZE) {
        return NextResponse.json(
          { error: `La imagen embebida supera el máximo de ${Math.round(MAX_FILE_SIZE / (1024 * 1024))}MB.` },
          { status: 413 }
        );
      }
      inputBuffer = buffer;
      detectedMime = mime;
    } else {
      return NextResponse.json(
        { error: "No se recibió archivo. Enviá 'file' o 'dataUrl'." },
        { status: 400 }
      );
    }

    const uploadsDir = path.join(process.cwd(), "public", "uploads");
    await ensureUploadsDir(uploadsDir);

    // Nombre base
    const baseId = uuidv4().replace(/-/g, "");
    const mainFilename = `${baseId}.webp`;
    const thumbFilename = `${baseId}_thumb.webp`;

    // Procesado principal -> .webp (máx 1600px, rotación EXIF, calidad 82)
    const mainBuffer = await sharp(inputBuffer)
      .rotate()
      .resize({ width: 1600, height: 1600, fit: "inside", withoutEnlargement: true })
      .webp({ quality: 82 })
      .toBuffer();

    await writeFile(path.join(uploadsDir, mainFilename), mainBuffer);

    // Thumbnail -> .webp (400px, calidad 78)
    const thumbBuffer = await sharp(inputBuffer)
      .rotate()
      .resize({ width: 400, height: 400, fit: "inside", withoutEnlargement: true })
      .webp({ quality: 78 })
      .toBuffer();

    await writeFile(path.join(uploadsDir, thumbFilename), thumbBuffer);

    // URLs públicas
    const url = `/uploads/${mainFilename}`;
    const thumbUrl = `/uploads/${thumbFilename}`;

    return NextResponse.json(
      {
        success: true,
        url,
        thumbUrl,
        from: file ? "file" : "dataUrl",
        mime: detectedMime,
        size: mainBuffer.length,
        message: "Imagen subida y optimizada correctamente.",
      },
      { status: 201 }
    );
  } catch (err) {
    console.error("[UPLOADS] error:", err);
    return NextResponse.json(
      {
        error: "Error interno procesando la imagen.",
        details: process.env.NODE_ENV === "development" ? String(err?.message || err) : undefined,
      },
      { status: 500 }
    );
  }
}
