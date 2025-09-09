// src/lib/auth.js
import GoogleProvider from "next-auth/providers/google";
import { getServerSession } from "next-auth/next";
import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

// Aviso útil si faltan envs críticas
const missing = ["NEXTAUTH_SECRET", "GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"].filter(
  (k) => !process.env[k]
);
if (missing.length) {
  console.warn("[AUTH] Faltan variables .env:", missing.join(", "));
}

export const authOptions = {
  trustHost: true,
  secret: process.env.NEXTAUTH_SECRET,

  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID ?? "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
    }),
  ],

  // ⚠️ Hotfix: JAMÁS bloquear el login por fallas de DB
  callbacks: {
    async signIn({ user, account }) {
      if (!user?.email) {
        console.warn("[SIGNIN] sin email -> permitir igual para no romper flujo");
        return true; // nunca cortar
      }
      console.log("[SIGNIN] intento:", user.email, "provider:", account?.provider);
      return true; // ✅ permitimos siempre; la persistencia va en events.signIn
    },

    async jwt({ token, user }) {
      // si se logueó recién, podemos cargar id luego en session()
      if (!token.id && token.sub) token.id = token.sub;
      return token;
    },

    async session({ session, token }) {
      // Propagar id si existe
      if (token?.id) {
        session.user.id = token.id;
        session.user.dbId = token.id;
      }

      // Enriquecer sesión desde tu DB, pero sin romper si falla
      if (!session?.user?.email) return session;

      try {
        const dbUser = await prisma.user.findUnique({
          where: { email: session.user.email },
          include: {
            tickets: {
              where: { isUsed: false },
              include: {
                raffle: {
                  select: { id: true, title: true, status: true, endsAt: true, drawnAt: true, isPrivate: true },
                },
              },
            },
            purchases: {
              orderBy: { createdAt: "desc" },
              take: 5,
              include: { tickets: { select: { id: true, code: true, status: true } } },
            },
            wonRaffles: {
              select: { id: true, title: true, drawnAt: true, isPrivate: true },
            },
            notifications: {
              where: { read: false },
              orderBy: { createdAt: "desc" },
              select: { id: true, title: true, message: true, type: true, createdAt: true },
            },
          },
        });

        if (dbUser) {
          session.user.role = (dbUser.role ?? "USER").toString().toLowerCase();
          session.user.id = dbUser.id;
          session.user.dbId = dbUser.id;
          session.user.isActive = dbUser.isActive;
          session.user.memberSince = dbUser.createdAt;

          session.user.availableTickets = dbUser.tickets?.length || 0;
          session.user.totalPurchases = dbUser.purchases?.length || 0;
          session.user.wonRaffles = dbUser.wonRaffles?.length || 0;
          session.user.unreadNotifications = dbUser.notifications?.length || 0;
          session.user.activeTicketsInRaffles =
            dbUser.tickets?.filter((t) => t.raffle && t.raffle.status === "ACTIVE").length || 0;

          console.log("[SESSION] OK para:", dbUser.email, "role:", session.user.role);
        } else {
          session.user.role = "user";
          session.user.availableTickets = 0;
          session.user.totalPurchases = 0;
          session.user.wonRaffles = 0;
          session.user.unreadNotifications = 0;
          session.user.activeTicketsInRaffles = 0;
          console.log("[SESSION] user no existe en DB aún:", session.user.email);
        }
      } catch (err) {
        session.user.role = "user";
        session.user.availableTickets = 0;
        session.user.totalPurchases = 0;
        session.user.wonRaffles = 0;
        session.user.unreadNotifications = 0;
        session.user.activeTicketsInRaffles = 0;
        console.error("[SESSION] error DB (ignorado):", err?.message);
      }

      return session;
    },
  },

  // Persistencia de usuario en DB ➜ best-effort y NO bloqueante
  events: {
    async signIn({ user }) {
      if (!user?.email) return;
      try {
        // Usamos upsert para evitar duplicados
        const up = await prisma.user.upsert({
          where: { email: user.email },
          update: {
            name: user.name ?? undefined,
            image: user.image ?? undefined,
          },
          create: {
            name: user.name ?? null,
            email: user.email,
            image: user.image ?? null,
            // quitá el campo password si tu modelo ya no lo necesita
            password: "NEXTAUTH_USER",
          },
        });
        console.log("[EVENT signIn] upsert OK:", up.email);

        // Notificación de bienvenida (best-effort)
        try {
          await prisma.notification.create({
            data: {
              userId: up.id,
              title: "¡Bienvenido a Riftea!",
              message: `¡Bienvenido ${up.name ?? "a Riftea"}! Gracias por registrarte.`,
              type: "SYSTEM_ALERT",
            },
          });
        } catch (e) {
          // no bloquear
        }
      } catch (e) {
        console.error("[EVENT signIn] fallo upsert (ignorado):", e?.message);
      }
    },
    async signOut() {
      console.log("[EVENT] signOut");
    },
  },

  session: {
    strategy: "jwt",
    maxAge: 30 * 24 * 60 * 60,
  },

  pages: {
    signIn: "/auth/signin",
    error: "/auth/error",
  },
};

// Helpers
export async function getServerAuth() {
  try {
    return await getServerSession(authOptions);
  } catch (error) {
    console.error("[AUTH] Error getting server session:", error);
    return null;
  }
}

export async function requireAdmin() {
  const session = await getServerAuth();
  if (!session?.user) throw new Error("Authentication required");
  if (!["admin", "superadmin"].includes(session.user.role)) throw new Error("Admin access required");
  return session;
}

export async function getCurrentUser() {
  try {
    const session = await getServerSession(authOptions);
    return session?.user || null;
  } catch (error) {
    console.error("[AUTH] Error getting current user:", error);
    return null;
  }
}

export async function requireAuth() {
  const user = await getCurrentUser();
  if (!user) throw new Error("Authentication required");
  return user;
}

export function createErrorResponse(message, status = 400) {
  return NextResponse.json({ success: false, error: message }, { status });
}
export function createSuccessResponse(data, message = "Success") {
  return NextResponse.json({ success: true, message, data });
}
export function createUnauthorizedResponse(message = "Unauthorized") {
  return NextResponse.json({ success: false, error: message }, { status: 401 });
}
export const verifyAuth = getCurrentUser;
