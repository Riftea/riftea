export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabaseServer";

const BUCKET = process.env.SUPABASE_BUCKET || "private-products";

function slugify(name = "") {
  return String(name)
    .toLowerCase()
    .replace(/[^\w\-\.]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function uid() {
  // nombre único simple
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

/**
 * POST /api/admin/upload
 * Content-Type: multipart/form-data
 * Campos:
 *  - file: File (obligatorio)
 *  - prefix: string opcional (ej. "products" / "bonus")
 *
 * Devuelve:
 *  { ok: true, path, size, mime }
 */
export async function POST(req) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }

    const form = await req.formData();
    const file = form.get("file");
    const prefix = String(form.get("prefix") || "uploads");

    if (!file || typeof file === "string") {
      return NextResponse.json({ error: "Falta archivo 'file'" }, { status: 400 });
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const orig = slugify(file.name || "archivo.bin");
    const ext = orig.includes(".") ? orig.slice(orig.lastIndexOf(".")) : "";
    const name = `${uid()}${ext}`;
    const userFolder = session.user.id.slice(0, 8);
    const path = `${prefix}/${userFolder}/${name}`;

    const { error } = await supabaseAdmin.storage
      .from(BUCKET)
      .upload(path, buffer, {
        contentType: file.type || "application/octet-stream",
        upsert: false,
      });

    if (error) {
      console.error("Upload error:", error);
      return NextResponse.json({ error: "No se pudo subir el archivo" }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      path,                 // ← guardá esto en Product.filePath o bonusFilePath
      size: buffer.length,
      mime: file.type || null,
    });
  } catch (err) {
    console.error("POST /api/admin/upload error:", err);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
