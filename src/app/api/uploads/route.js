// src/app/api/uploads/route.js
import { NextResponse } from "next/server";
import path from "path";
import { mkdir, writeFile, stat } from "fs/promises";
import sharp from "sharp";
import { v4 as uuidv4 } from "uuid";

export const runtime = "nodejs";

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const ALLOWED_MIME = new Set(["image/jpeg", "image/png", "image/webp", "image/jpg"]);

const ensureUploadsDir = async (dir) => {
  try {
    await stat(dir);
  } catch {
    await mkdir(dir, { recursive: true });
  }
};

export async function POST(request) {
  try {
    const formData = await request.formData();
    const file = formData.get("file");

    if (!file) {
      return NextResponse.json({ error: "No se recibió archivo (campo 'file')." }, { status: 400 });
    }
    if (typeof file === "string") {
      return NextResponse.json({ error: "El campo 'file' es inválido." }, { status: 400 });
    }

    const { type, name, size } = file; // Blob
    if (!ALLOWED_MIME.has(type)) {
      return NextResponse.json(
        { error: "Formato no permitido. Usa JPG, PNG o WEBP." },
        { status: 415 }
      );
    }

    if (size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: `El archivo supera el máximo de ${Math.round(MAX_FILE_SIZE / (1024 * 1024))}MB.` },
        { status: 413 }
      );
    }

    const uploadsDir = path.join(process.cwd(), "public", "uploads");
    await ensureUploadsDir(uploadsDir);

    // Leemos el blob a buffer
    const arrayBuffer = await file.arrayBuffer();
    const inputBuffer = Buffer.from(arrayBuffer);

    // Nombre base
    const baseId = uuidv4();
    const baseName = baseId.replace(/-/g, "");

    // Procesado principal -> .webp (máx 1600px, rotación EXIF, calidad 82)
    const mainBuffer = await sharp(inputBuffer)
      .rotate() // respeta orientación
      .resize({ width: 1600, height: 1600, fit: "inside", withoutEnlargement: true })
      .webp({ quality: 82 })
      .toBuffer();

    const mainFilename = `${baseName}.webp`;
    const mainPath = path.join(uploadsDir, mainFilename);
    await writeFile(mainPath, mainBuffer);

    // Thumbnail -> .webp (400px, calidad 78)
    const thumbBuffer = await sharp(inputBuffer)
      .rotate()
      .resize({ width: 400, height: 400, fit: "inside", withoutEnlargement: true })
      .webp({ quality: 78 })
      .toBuffer();

    const thumbFilename = `${baseName}_thumb.webp`;
    const thumbPath = path.join(uploadsDir, thumbFilename);
    await writeFile(thumbPath, thumbBuffer);

    // URLs públicas
    const url = `/uploads/${mainFilename}`;
    const thumbUrl = `/uploads/${thumbFilename}`;

    return NextResponse.json(
      {
        success: true,
        url,
        thumbUrl,
        originalName: name || null,
        mime: type,
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
