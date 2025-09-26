// src/app/api/uploads/route.js
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import path from 'path';
import { mkdir, writeFile, stat } from 'fs/promises';
import sharp from 'sharp';
import { v4 as uuidv4 } from 'uuid';
import { put } from '@vercel/blob';

/* ======================
   Config
   ====================== */
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const ALLOWED_MIME = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/jpg',
  'image/avif',
]);

// Usa Vercel Blob en prod (o si tenés el token en dev). Sino, escribe en /public/uploads
const USE_BLOB = !!(process.env.VERCEL || process.env.BLOB_READ_WRITE_TOKEN);

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
  const m = /^data:(image\/[a-z0-9.+-]+);base64,(.+)$/i.exec(String(dataUrl || ''));
  if (!m) return { error: 'DATA_URL_INVALID', mime: null, buffer: null };
  const mime = m[1].toLowerCase();
  if (!ALLOWED_MIME.has(mime)) return { error: 'MIME_NOT_ALLOWED', mime, buffer: null };
  try {
    const buffer = Buffer.from(m[2], 'base64');
    return { error: null, mime, buffer };
  } catch {
    return { error: 'BASE64_DECODE_FAILED', mime, buffer: null };
  }
}

/* ======================
   Handler
   ====================== */
export async function POST(request) {
  try {
    const ct = request.headers.get('content-type') || '';
    if (!ct.toLowerCase().includes('multipart/form-data')) {
      return fail(400, "Debe ser multipart/form-data con 'file' o 'dataUrl'.");
    }

    const formData = await request.formData();
    const file = formData.get('file');
    const dataUrl = formData.get('dataUrl');

    let inputBuffer = null;
    let detectedMime = null;

    if (file && typeof file !== 'string') {
      const { type, size } = file;
      if (!ALLOWED_MIME.has(type)) return fail(415, 'Formato no permitido. Usa JPG, PNG o WebP.');
      if (!size || size <= 0) return fail(400, 'Archivo vacío o corrupto.');
      if (size > MAX_FILE_SIZE) return fail(413, `El archivo supera ${Math.round(MAX_FILE_SIZE / (1024 * 1024))}MB.`);
      inputBuffer = Buffer.from(await file.arrayBuffer());
      detectedMime = type;
    } else if (dataUrl && typeof dataUrl === 'string') {
      const { error, mime, buffer } = parseDataUrlToBuffer(dataUrl);
      if (error) {
        const map = {
          DATA_URL_INVALID: "El campo 'dataUrl' no tiene un formato válido.",
          MIME_NOT_ALLOWED: 'Formato no permitido. Usa JPG, PNG o WebP.',
          BASE64_DECODE_FAILED: 'No se pudo decodificar la imagen.',
        };
        return fail(400, map[error] || 'dataUrl inválida.');
      }
      if (buffer.length > MAX_FILE_SIZE) return fail(413, `La imagen embebida supera ${Math.round(MAX_FILE_SIZE / (1024 * 1024))}MB.`);
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
        .resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true })
        .webp({ quality: 82 })
        .toBuffer();

      thumbBuffer = await sharp(inputBuffer)
        .rotate()
        .resize({ width: 600, height: 600, fit: 'cover', withoutEnlargement: true })
        .webp({ quality: 78 })
        .toBuffer();
    } catch (e) {
      console.error('[UPLOADS] sharp error:', e);
      return fail(500, 'Error interno procesando la imagen.');
    }

    const baseId = uuidv4().replace(/-/g, '');
    const mainFilename = `${baseId}.webp`;
    const thumbFilename = `${baseId}_thumb.webp`;

    // ==== Producción (o dev con token): Vercel Blob ====
    if (USE_BLOB) {
      try {
        const basePath = `uploads/${baseId}`;
        const token = process.env.BLOB_READ_WRITE_TOKEN; // innecesario en Vercel, útil en dev

        const mainPut = await put(`${basePath}/${mainFilename}`, mainBuffer, {
          access: 'public',
          contentType: 'image/webp',
          token,
        });

        const thumbPut = await put(`${basePath}/${thumbFilename}`, thumbBuffer, {
          access: 'public',
          contentType: 'image/webp',
          token,
        });

        return NextResponse.json({
          ok: true,
          url: mainPut.url,
          thumbUrl: thumbPut.url,
          from: file ? 'file' : 'dataUrl',
          mime: detectedMime,
          size: mainBuffer.length,
          message: 'Imagen subida y optimizada correctamente (Vercel Blob).',
        }, { status: 201 });
      } catch (blobErr) {
        console.error('[UPLOADS] blob error:', blobErr);
        return fail(500, 'No se pudo subir a Vercel Blob.');
      }
    }

    // ==== Dev/local: escribir a /public/uploads ====
    try {
      const uploadsDir = path.join(process.cwd(), 'public', 'uploads');
      await ensureUploadsDir(uploadsDir);
      await writeFile(path.join(uploadsDir, mainFilename), mainBuffer);
      await writeFile(path.join(uploadsDir, thumbFilename), thumbBuffer);

      return NextResponse.json({
        ok: true,
        url: `/uploads/${mainFilename}`,
        thumbUrl: `/uploads/${thumbFilename}`,
        from: file ? 'file' : 'dataUrl',
        mime: detectedMime,
        size: mainBuffer.length,
        message: 'Imagen subida y optimizada correctamente (local).',
      }, { status: 201 });
    } catch (fsErr) {
      console.error('[UPLOADS] fs error:', fsErr);
      return fail(500, 'El entorno no permite escribir en disco. Activá Blob o un storage externo.');
    }
  } catch (err) {
    console.error('[UPLOADS] fatal:', err);
    return fail(500, 'Error interno procesando la imagen.', {
      details: process.env.NODE_ENV === 'development' ? String(err?.message || err) : undefined,
    });
  }
}
