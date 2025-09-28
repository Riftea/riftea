export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { supabaseAdmin } from "@/lib/supabaseServer";

const BUCKET = process.env.SUPABASE_BUCKET || "private-products";
const EXPIRES = Math.max(60, parseInt(process.env.DELIVERY_URL_EXPIRES || "3600", 10));

async function signIfPath(path) {
  if (!path) return null;
  const { data, error } = await supabaseAdmin
    .storage
    .from(BUCKET)
    .createSignedUrl(path, EXPIRES);
  if (error) throw new Error("No se pudo firmar la URL");
  return data?.signedUrl || null;
}

/**
 * POST /api/admin/deliveries/generate
 * body: { purchaseId: string }
 * Permite re-generar URLs firmadas (no incrementa descargas).
 * Regla simple: sólo el dueño de la compra (o podés ampliar a ADMIN).
 */
export async function POST(req) {
  try {
    const session = await getServerSession(authOptions);
    const userId = session?.user?.id || null;
    if (!userId) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const purchaseId = String(body?.purchaseId || "");
    if (!purchaseId) return NextResponse.json({ error: "Falta purchaseId" }, { status: 400 });

    const purchase = await prisma.purchase.findUnique({
      where: { id: purchaseId },
      include: {
        items: { include: { product: { select: { filePath: true, bonusFilePath: true } } } },
      },
    });

    if (!purchase || purchase.userId !== userId) {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }
    if (purchase.status !== "paid") {
      return NextResponse.json({ error: "La compra no está pagada" }, { status: 400 });
    }

    const firstWithFile = purchase.items.find((it) => it?.product?.filePath);
    const firstWithBonus = purchase.items.find((it) => it?.product?.bonusFilePath);
    if (!firstWithFile) {
      return NextResponse.json({ error: "No hay archivos para entregar" }, { status: 400 });
    }

    let delivery = await prisma.deliveryDigital.findUnique({
      where: { purchaseId: purchase.id },
    });
    if (!delivery) {
      delivery = await prisma.deliveryDigital.create({
        data: { purchaseId: purchase.id, downloads: 0, maxDownloads: 5 },
      });
    }

    const mainSignedUrl = await signIfPath(firstWithFile.product.filePath);
    const bonusSignedUrl = firstWithBonus ? await signIfPath(firstWithBonus.product.bonusFilePath) : null;

    const updated = await prisma.deliveryDigital.update({
      where: { id: delivery.id },
      data: { mainSignedUrl, bonusSignedUrl },
      select: {
        id: true,
        downloads: true,
        maxDownloads: true,
        mainSignedUrl: true,
        bonusSignedUrl: true,
        updatedAt: true,
      },
    });

    return NextResponse.json({
      ok: true,
      delivery: {
        mainUrl: updated.mainSignedUrl,
        bonusUrl: updated.bonusSignedUrl,
        downloads: updated.downloads,
        remaining: Math.max(0, updated.maxDownloads - updated.downloads),
        expiresIn: EXPIRES,
        updatedAt: updated.updatedAt,
      },
    });
  } catch (err) {
    console.error("POST /api/admin/deliveries/generate error:", err);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
