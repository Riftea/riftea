export const runtime = 'nodejs';
// src/app/api/ping/route.js
import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({ ok: true, message: "pong" });
}

