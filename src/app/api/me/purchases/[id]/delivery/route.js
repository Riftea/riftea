export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { supabaseAdmin } from "@/lib/supabaseServer";

const BUCKET = process.env.SUPABASE_BUCKET || "private-products";
const EXPIRES = Math.max(60, parseInt(process.env.DELIVERY_URL_EXPIRES || "3600", 10)); // >= 60s

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
 * GET /api/me/purchases/:id/delivery
 * - Requiere sesión y ser dueño de la compra
 * - La compra debe estar 'paid'
 * - Genera/actualiza DeliveryDigital con URLs firmadas
 * - Respeta límite de descargas (downloads < maxDownloads)
 */
export async function GET(_req, { params }) {
  try {
    const session = await getServerSession(authOptions);
    const userId = session?.user?.id || null;
    if (!userId) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }

    const id = String(params?.id || "");
    if (!id) return NextResponse.json({ error: "Falta id" }, { status: 400 });

    // Traemos la compra + items + productos (para acceder a filePath/bonusFilePath)
    const purchase = await prisma.purchase.findUnique({
      where: { id },
      include: {
        items: {
          include: {
            product: { select: { id: true, title: true, filePath: true, bonusFilePath: true } },
          },
        },
      },
    });

    if (!purchase || purchase.userId !== userId) {
      return NextResponse.json({ error: "No encontrado" }, { status: 404 });
    }

    if (purchase.status !== "paid") {
      return NextResponse.json({ error: "La compra aún no está pagada" }, { status: 400 });
    }

    // Elegimos el primer item con filePath válido como entrega principal
    const firstWithFile = purchase.items.find((it) => it?.product?.filePath);
    const firstWithBonus = purchase.items.find((it) => it?.product?.bonusFilePath);

    if (!firstWithFile) {
      return NextResponse.json({ error: "Esta compra no tiene archivos asociados" }, { status: 400 });
    }

    // Creamos o buscamos delivery
    let delivery = await prisma.deliveryDigital.findUnique({
      where: { purchaseId: purchase.id },
    });

    if (!delivery) {
      delivery = await prisma.deliveryDigital.create({
        data: {
          purchaseId: purchase.id,
          downloads: 0,
          maxDownloads: 5,
        },
      });
    }

    if (delivery.downloads >= delivery.maxDownloads) {
      return NextResponse.json({ error: "Se alcanzó el límite de descargas" }, { status: 429 });
    }

    // Firmamos URLs
    const mainSignedUrl = await signIfPath(firstWithFile.product.filePath);
    const bonusSignedUrl = firstWithBonus ? await signIfPath(firstWithBonus.product.bonusFilePath) : null;

    // Actualizamos delivery (guardamos la última generación)
    const updated = await prisma.deliveryDigital.update({
      where: { id: delivery.id },
      data: {
        mainSignedUrl,
        bonusSignedUrl,
        downloads: { increment: 1 },
      },
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
    console.error("GET /api/me/purchases/[id]/delivery error:", err);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
