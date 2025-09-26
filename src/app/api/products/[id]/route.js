export const runtime = 'nodejs';
// src/app/api/products/[id]/route.js
import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export async function GET(_req, { params }) {
  try {
    const { id } = params || {};
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
        seller: { select: { id: true, name: true } },
        createdAt: true,
      },
    });

    if (!product || !product.isActive) {
      return NextResponse.json({ error: "Producto no encontrado" }, { status: 404 });
    }

    return NextResponse.json(product);
  } catch (err) {
    console.error("GET /api/products/[id] error:", err);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
