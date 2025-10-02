// src/app/api/products/[id]/route.js
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";

// Helpers
function str(v, max = 1000) {
  return String(v ?? '').trim().slice(0, max);
}
function toInt(v, def = 0) {
  const n = parseInt(String(v ?? ''), 10);
  return Number.isFinite(n) ? n : def;
}

/* ===================== GET ===================== */
// GET /api/products/:id → devuelve un producto
export async function GET(_req, { params }) {
  try {
    const id = String(params?.id || "");
    if (!id) return NextResponse.json({ error: "Falta id" }, { status: 400 });

    const product = await prisma.product.findUnique({
      where: { id },
      select: {
        id: true,
        type: true,
        title: true,
        description: true,
        priceCents: true,
        currency: true,
        isActive: true,
        filePath: true,
        bonusFilePath: true,
        sellerId: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!product) {
      return NextResponse.json({ error: "Producto no encontrado" }, { status: 404 });
    }

    return NextResponse.json(product, { status: 200 });
  } catch (err) {
    console.error("GET /api/products/[id] error:", err);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}

/* ===================== PATCH ===================== */
// PATCH /api/products/:id → actualizar campos
export async function PATCH(req, { params }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id)
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });

    const id = String(params?.id || "");
    if (!id) return NextResponse.json({ error: "Falta id" }, { status: 400 });

    // Verificamos ownership
    const existing = await prisma.product.findUnique({
      where: { id },
      select: { sellerId: true },
    });
    if (!existing || existing.sellerId !== session.user.id) {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const data = {};
    if (typeof body.isActive === "boolean") data.isActive = body.isActive;
    if (body.title != null) data.title = str(body.title, 160);
    if (body.description != null) data.description = str(body.description, 4000) || null;
    if (body.type != null) data.type = str(body.type, 32);
    if (body.priceCents != null) data.priceCents = toInt(body.priceCents);
    if (body.currency != null) data.currency = str(body.currency, 8) || "ARS";
    if (body.filePath !== undefined) data.filePath = str(body.filePath, 512) || null;
    if (body.bonusFilePath !== undefined) data.bonusFilePath = str(body.bonusFilePath, 512) || null;

    const updated = await prisma.product.update({
      where: { id },
      data,
      select: { id: true, isActive: true },
    });

    return NextResponse.json({ ok: true, product: updated });
  } catch (err) {
    console.error("PATCH /api/products/[id] error:", err);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}

/* ===================== DELETE ===================== */
// DELETE /api/products/:id → borrar producto
export async function DELETE(_req, { params }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id)
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });

    const id = String(params?.id || "");
    if (!id) return NextResponse.json({ error: "Falta id" }, { status: 400 });

    const existing = await prisma.product.findUnique({
      where: { id },
      select: { sellerId: true, items: { select: { id: true }, take: 1 } },
    });
    if (!existing || existing.sellerId !== session.user.id) {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }
    if (existing.items?.length) {
      return NextResponse.json(
        { error: "No se puede eliminar: tiene compras asociadas" },
        { status: 409 }
      );
    }

    await prisma.product.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("DELETE /api/products/[id] error:", err);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
