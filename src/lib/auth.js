// src/lib/auth.js - Configuración completa corregida
import GoogleProvider from "next-auth/providers/google";
import { getServerSession } from 'next-auth/next'; // ✅ Import correcto
import { NextResponse } from 'next/server'; // ✅ NextResponse en lugar de Response
import prisma from "./prisma.js";

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
        // ✅ CORREGIDO: Query completa con todas las relaciones necesarias para estadísticas
        const dbUser = await prisma.user.findUnique({
          where: { email: session.user.email },
          include: {
            tickets: {
              where: { isUsed: false },
              include: { 
                raffle: {
                  select: {
                    id: true,
                    title: true,
                    status: true,
                    endsAt: true,
                    drawnAt: true
                  }
                }
              }
            },
            purchases: {
              orderBy: { createdAt: 'desc' },
              take: 5,
              include: {
                tickets: {
                  select: {
                    id: true,
                    code: true,
                    status: true
                  }
                }
              }
            },
            wonRaffles: {
              select: {
                id: true,
                title: true,
                drawnAt: true,
                ticketPrice: true
              }
            },
            notifications: {
              where: { read: false },
              orderBy: { createdAt: 'desc' },
              select: {
                id: true,
                title: true,
                message: true,
                type: true,
                createdAt: true
              }
            }
          }
        });
        
        if (dbUser) {
          session.user.role = dbUser.role.toString().toLowerCase();
          session.user.id = dbUser.id;
          session.user.dbId = dbUser.id;
          session.user.isActive = dbUser.isActive;
          session.user.memberSince = dbUser.createdAt;
          
          // ✅ CORREGIDO: Validación de campos nulos antes de acceder a propiedades
          session.user.availableTickets = dbUser.tickets?.length || 0;
          session.user.totalPurchases = dbUser.purchases?.length || 0;
          session.user.wonRaffles = dbUser.wonRaffles?.length || 0;
          session.user.unreadNotifications = dbUser.notifications?.length || 0;
          
          // ✅ MEJORA: Estadísticas adicionales calculadas
          const activeTicketsInRaffles = dbUser.tickets?.filter(ticket => 
            ticket.raffle && ticket.raffle.status === 'ACTIVE'
          ).length || 0;
          
          const totalWinnings = dbUser.wonRaffles?.reduce((sum, raffle) => 
            sum + (raffle.ticketPrice || 0), 0
          ) || 0;
          
          session.user.activeTicketsInRaffles = activeTicketsInRaffles;
          session.user.totalWinnings = totalWinnings;
          
          console.log("[SESSION] usuario encontrado en DB:", dbUser.email, "role:", session.user.role);
        } else {
          session.user.role = "user";
          // ✅ Valores por defecto para evitar undefined
          session.user.availableTickets = 0;
          session.user.totalPurchases = 0;
          session.user.wonRaffles = 0;
          session.user.unreadNotifications = 0;
          session.user.activeTicketsInRaffles = 0;
          session.user.totalWinnings = 0;
          console.log("[SESSION] usuario NO encontrado en DB:", session.user.email, "asignando valores por defecto");
        }
      } catch (err) {
        session.user.role = "user";
        // ✅ Valores por defecto en caso de error
        session.user.availableTickets = 0;
        session.user.totalPurchases = 0;
        session.user.wonRaffles = 0;
        session.user.unreadNotifications = 0;
        session.user.activeTicketsInRaffles = 0;
        session.user.totalWinnings = 0;
        console.error("[SESSION] callback error:", err, "- asignando valores por defecto");
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
    maxAge: 30 * 24 * 60 * 60, // 30 días
  },
  
  pages: {
    signIn: '/auth/signin',
    error: '/auth/error',
  },
};

// ✅ Funciones helper mejoradas
export async function getServerAuth() {
  try {
    const session = await getServerSession(authOptions);
    return session;
  } catch (error) {
    console.error('[AUTH] Error getting server session:', error);
    return null;
  }
}

export async function requireAdmin() {
  const session = await getServerAuth();
  
  if (!session || !session.user) {
    throw new Error('Authentication required');
  }
  
  if (session.user.role !== 'admin' && session.user.role !== 'superadmin') {
    throw new Error('Admin access required');
  }
  
  return session;
}

export async function getCurrentUser() {
  try {
    const session = await getServerSession(authOptions);
    return session?.user || null;
  } catch (error) {
    console.error('[AUTH] Error getting current user:', error);
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

// ✅ CORREGIDO: Usar NextResponse en lugar de Response
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

// ✅ Función adicional para manejar errores de autenticación
export function createUnauthorizedResponse(message = 'Unauthorized') {
  return NextResponse.json(
    { success: false, error: message },
    { status: 401 }
  );
}

// ✅ Para compatibilidad con imports antiguos
export const verifyAuth = getCurrentUser;