export const runtime = 'nodejs';
import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export async function GET() {
  const started = Date.now();
  try {
    // prueba mínima contra la DB
    await prisma.$queryRaw`SELECT 1`;
    const ms = Date.now() - started;
    return NextResponse.json({ ok: true, db: "up", latencyMs: ms });
  } catch (err) {
    const ms = Date.now() - started;
    // si esto falla, casi seguro es la conexión con Supabase
    return NextResponse.json(
      {
        ok: false,
        db: "down",
        latencyMs: ms,
        error: err?.message ?? String(err),
      },
      { status: 503 }
    );
  }
}

