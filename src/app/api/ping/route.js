// src/app/api/ping/route.js
export const runtime = "nodejs";
import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({ ok: true, message: "pong" });
}
