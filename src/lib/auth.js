// src/lib/auth.js - Configuración completa corregida
import GoogleProvider from "next-auth/providers/google";
import { getServerSession } from 'next-auth/next';
import prisma from "./prisma.js";
import NextAuth from "next-auth";
import { NextResponse } from 'next/server';

export const authOptions = {
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    }),
  ],
  secret: process.env.NEXTAUTH_SECRET,
  
  callbacks: {
    async signIn({ user, account, profile }) {
      if (!user?.email) {
        console.warn("signIn: no email provided");
        return false;
      }
      
      console.log("[SIGNIN] intentando signIn para:", user.email);
      console.log("[SIGNIN] DATABASE_URL (slice):", process.env.DATABASE_URL ? process.env.DATABASE_URL.slice(0,50) : "no env");
      
      try {
        const existingUser = await prisma.user.findUnique({
          where: { email: user.email }
        });

        if (existingUser) {
          await prisma.user.update({
            where: { email: user.email },
            data: {
              name: user.name || existingUser.name,
              image: user.image || existingUser.image,
            }
          });
          console.log("[SIGNIN] Usuario existente actualizado:", user.email);
        } else {
          const newUser = await prisma.user.create({
            data: {
              name: user.name || null,
              email: user.email,
              image: user.image || null,
              password: 'NEXTAUTH_USER',
            }
          });
          console.log("[SIGNIN] Usuario nuevo creado:", newUser.email, "ID:", newUser.id);

          try {
            await prisma.notification.create({
              data: {
                userId: newUser.id,
                title: "¡Bienvenido a Riftea!",
                message: `¡Bienvenido ${newUser.name ?? "a Riftea"}! Gracias por registrarte.`,
                type: "SYSTEM_ALERT",
              },
            });
            console.log("[SIGNIN] notificación de bienvenida creada para:", newUser.email);
          } catch (e) {
            console.error("[SIGNIN] No se pudo crear notificación de bienvenida:", e);
          }
        }
        
        return true;
      } catch (err) {
        console.error("[SIGNIN] error al guardar usuario en DB:", err);
        return false;
      }
    },
    
    async jwt({ token, user }) {
      if (user && user.email) {
        try {
          const dbUser = await prisma.user.findUnique({
            where: { email: user.email }
          });
          
          if (dbUser) {
            token.id = dbUser.id;
            token.uid = dbUser.id;
            console.log("[JWT] token actualizado con DB ID:", dbUser.id);
          }
        } catch (error) {
          console.error("[JWT] error al buscar usuario en DB:", error);
        }
      }
      
      if (!token.id && token.sub) {
        token.id = token.sub;
      }
      
      return token;
    },
    
    async session({ session, token }) {
      if (token?.id) {
        session.user.id = token.id;
        session.user.dbId = token.id;
      }
      
      if (!session?.user?.email) return session;
      
      try {
        const dbUser = await prisma.user.findUnique({
          where: { email: session.user.email },
          include: {
            tickets: {
              where: { isUsed: false },
              include: { raffle: true }
            },
            purchases: {
              orderBy: { createdAt: 'desc' },
              take: 5
            },
            wonRaffles: true,
            notifications: {
              where: { read: false },
              orderBy: { createdAt: 'desc' }
            }
          }
        });
        
        if (dbUser) {
          session.user.role = dbUser.role.toString().toLowerCase();
          session.user.id = dbUser.id;
          session.user.dbId = dbUser.id;
          session.user.availableTickets = dbUser.tickets.length;
          session.user.totalPurchases = dbUser.purchases.length;
          session.user.memberSince = dbUser.createdAt;
          session.user.wonRaffles = dbUser.wonRaffles.length;
          session.user.unreadNotifications = dbUser.notifications.length;
          session.user.isActive = dbUser.isActive;
          
          console.log("[SESSION] usuario encontrado en DB:", dbUser.email, "role:", session.user.role);
        } else {
          session.user.role = "user";
          console.log("[SESSION] usuario NO encontrado en DB:", session.user.email, "asignando role por defecto: user");
        }
      } catch (err) {
        session.user.role = "user";
        console.error("[SESSION] callback error:", err, "- asignando role por defecto: user");
      }
      
      return session;
    },
  },
  
  events: {
    async signIn({ user, account, profile, isNewUser }) {
      console.log(`[EVENT] Usuario ${user.email} se logueó. Cuenta nueva en NextAuth: ${isNewUser}`);
    },
    
    async signOut({ token }) {
      console.log('[EVENT] Usuario cerró sesión');
    }
  },
  
  session: {
    strategy: "jwt",
    maxAge: 30 * 24 * 60 * 60,
  },
};

// ✅ Funciones helper agregadas
export async function getServerAuth() {
  const session = await getServerSession(authOptions);
  return session;
}

export async function requireAdmin(req) {
  const session = await getServerAuth();
  
  if (!session || session.user?.role !== 'admin') {
    throw new Error('Acceso denegado');
  }
  
  return session;
}

// ✅ Nuevas funciones para compatibilidad con las rutas API
export async function getCurrentUser() {
  try {
    const session = await getServerSession(authOptions);
    return session?.user || null;
  } catch (error) {
    console.error('Error getting current user:', error);
    return null;
  }
}

export async function requireAuth() {
  const user = await getCurrentUser();
  
  if (!user) {
    throw new Error('Authentication required');
  }
  
  return user;
}

export function createErrorResponse(message, status = 400) {
  return NextResponse.json(
    { success: false, error: message },
    { status }
  );
}

export function createSuccessResponse(data, message = 'Success') {
  return NextResponse.json({
    success: true,
    message,
    data
  });
}

// ✅ Para compatibilidad con imports antiguos si los hubiera
export const verifyAuth = getCurrentUser;