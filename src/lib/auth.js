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

    /**
     * JWT: almacena datos mínimos y soporta session.update({...})
     */
    async jwt({ token, user, trigger, session }) {
      // 1) Primer login o cuando NextAuth inyecta "user" desde el provider/DB:
      if (user) {
        if (!token.id && user.id) token.id = user.id;         // id si viene del adapter
        if (user.name != null) token.name = user.name;
        if (user.email != null) token.email = user.email;
        if (user.image != null) token.image = user.image;
        if (user.whatsapp != null) token.whatsapp = user.whatsapp;
        if (user.role != null) token.role = String(user.role).toLowerCase();
      }

      // 2) Soportar session.update({ ... }) desde el cliente (Opción 2)
      if (trigger === "update" && session) {
        if (session.name != null) token.name = session.name;
        if (session.whatsapp != null) token.whatsapp = session.whatsapp;
        if (session.image != null) token.image = session.image;
        if (session.role != null) token.role = String(session.role).toLowerCase();
      }

      // Propagar id si faltaba (común cuando no hay adapter)
      if (!token.id && token.sub) token.id = token.sub;

      return token;
    },

    /**
     * SESSION: prioriza token (rápido) y minimiza acceso a DB.
     * Si hay que enriquecer, usa UNA consulta liviana con _count (no incluye listas).
     */
    async session({ session, token }) {
      // Asegurar objeto user
      session.user ??= {};

      // 1) Copiar desde el token (estado global rápido)
      if (token?.id) {
        session.user.id = token.id;
        session.user.dbId = token.id;
      }
      if (token?.email) session.user.email = token.email;
      if (token?.name != null) session.user.name = token.name;
      if (token?.image != null) session.user.image = token.image;
      if (token?.whatsapp != null) session.user.whatsapp = token.whatsapp;
      if (token?.role != null) session.user.role = String(token.role).toLowerCase();

      // 2) Intentar enriquecer con una sola query liviana (si hay email)
      if (!session?.user?.email) return session;

      try {
        // Consulta liviana: NO traemos listas; usamos _count
        const dbUser = await prisma.user.findUnique({
          where: { email: session.user.email },
          select: {
            id: true,
            name: true,
            email: true,
            image: true,
            whatsapp: true,
            role: true,
            isActive: true,
            createdAt: true,
            // Contadores sin traer arrays completos
            _count: {
              select: {
                tickets: {
                  where: { isUsed: false },
                },
                purchases: true,
                wonRaffles: true,
                notifications: {
                  where: { read: false },
                },
              },
            },
          },
        });

        if (dbUser) {
          // Campos base
          session.user.id = dbUser.id;
          session.user.dbId = dbUser.id;
          session.user.name = dbUser.name ?? session.user.name ?? null;
          session.user.image = dbUser.image ?? session.user.image ?? null;
          session.user.whatsapp = dbUser.whatsapp ?? session.user.whatsapp ?? null;
          session.user.role = String(dbUser.role ?? session.user.role ?? "user").toLowerCase();
          session.user.isActive = dbUser.isActive;
          session.user.memberSince = dbUser.createdAt;

          // Contadores
          session.user.availableTickets = dbUser._count?.tickets ?? 0;
          session.user.totalPurchases = dbUser._count?.purchases ?? 0;
          session.user.wonRaffles = dbUser._count?.wonRaffles ?? 0;
          session.user.unreadNotifications = dbUser._count?.notifications ?? 0;

          console.log("[SESSION] OK:", dbUser.email, "role:", session.user.role);
        } else {
          // Usuario no existe aún en DB
          session.user.role = "user";
          session.user.availableTickets = 0;
          session.user.totalPurchases = 0;
          session.user.wonRaffles = 0;
          session.user.unreadNotifications = 0;
          console.log("[SESSION] user no existe en DB aún:", session.user.email);
        }
      } catch (err) {
        // Si falla la DB, no rompemos la sesión
        session.user.role = session.user.role ?? "user";
        session.user.availableTickets = session.user.availableTickets ?? 0;
        session.user.totalPurchases = session.user.totalPurchases ?? 0;
        session.user.wonRaffles = session.user.wonRaffles ?? 0;
        session.user.unreadNotifications = session.user.unreadNotifications ?? 0;
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
        // ✅ SOLUCIÓN OPTIMIZADA: Verificar existencia primero con una sola consulta
        const existingUser = await prisma.user.findUnique({
          where: { email: user.email },
          select: { id: true, name: true, firstLogin: true }
        });

        // 🔍 DEBUG LOGS - AGREGAR TEMPORALMENTE
        console.log("🔍 DEBUG - Usuario:", user.email);
        console.log("🔍 DEBUG - existingUser:", existingUser ? "SÍ EXISTE" : "NO EXISTE");
        console.log("🔍 DEBUG - existingUser data:", existingUser);

        const isNewUser = !existingUser;
        console.log("🔍 DEBUG - isNewUser:", isNewUser);

        let userId;
        let userName;

        if (isNewUser) {
          // Usuario NUEVO - Crear en DB
          const newUser = await prisma.user.create({
            data: {
              name: user.name ?? null,
              email: user.email,
              image: user.image ?? null,
              password: "NEXTAUTH_USER",
              firstLogin: true, // Marcar como primer login
            },
            select: { id: true, name: true }
          });
          
          userId = newUser.id;
          userName = newUser.name;
          console.log("[EVENT signIn] NUEVO usuario creado:", user.email);
          
        } else {
          // Usuario EXISTENTE - Solo actualizar datos
          const updatedUser = await prisma.user.update({
            where: { email: user.email },
            data: {
              name: user.name ?? undefined,
              image: user.image ?? undefined,
            },
            select: { id: true, name: true }
          });
          
          userId = updatedUser.id;
          userName = updatedUser.name;
          console.log("[EVENT signIn] Usuario existente actualizado:", user.email);
        }

        // ⭐ CREAR NOTIFICACIÓN BASADA EN SI ES NUEVO O EXISTENTE
        try {
          let notificationTitle;
          let notificationMessage;

          if (isNewUser) {
            // PRIMERA VEZ - Mensaje de registro
            notificationTitle = "¡Bienvenido a Riftea!";
            notificationMessage = `¡Hola ${userName ?? ""}! Gracias por registrarte. ¡Esperamos que disfrutes de los sorteos!`;
            
            // Marcar como ya no es primer login para próximas sesiones
            await prisma.user.update({
              where: { id: userId },
              data: { firstLogin: false }
            });
            
          } else {
            // LOGIN POSTERIOR - Mensaje de bienvenida de vuelta
            notificationTitle = "¡Hola de nuevo!";
            notificationMessage = `¡Bienvenido de vuelta, ${userName ?? ""}! ¡Que tengas suerte en los sorteos!`;
          }

          // 🔍 DEBUG LOGS - VER QUÉ MENSAJE SE ESTÁ ENVIANDO
          console.log("🔍 DEBUG - Tipo de mensaje:", isNewUser ? "REGISTRO (NUEVO)" : "LOGIN (EXISTENTE)");
          console.log("🔍 DEBUG - Título:", notificationTitle);
          console.log("🔍 DEBUG - Mensaje:", notificationMessage);

          // Crear la notificación correspondiente
          await prisma.notification.create({
            data: {
              userId: userId,
              title: notificationTitle,
              message: notificationMessage,
              type: "SYSTEM_ALERT",
            },
          });

          console.log(`[NOTIFICATION] ${isNewUser ? 'REGISTRO' : 'LOGIN'} notification created for:`, user.email);
          
        } catch (notificationError) {
          console.error("[NOTIFICATION] Error creating notification (ignored):", notificationError?.message);
          // No bloquear el login por errores de notificación
        }

      } catch (mainError) {
        console.error("[EVENT signIn] Error principal (ignorado):", mainError?.message);
        // No bloquear el login por errores de DB
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
  if (!["admin", "superadmin"].includes(String(session.user.role).toLowerCase())) {
    throw new Error("Admin access required");
  }
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
