export const runtime = 'nodejs';
// src/app/api/auth/[...nextauth]/route.js
import NextAuth from "next-auth";
import { authOptions } from "@/lib/auth";

// ⚡️ Tips para Vercel + Supabase en São Paulo
// Prisma no funciona en Edge
export const preferredRegion = ["gru1"];    // gru1 = São Paulo

const handler = NextAuth(authOptions);

export { handler as GET, handler as POST };
