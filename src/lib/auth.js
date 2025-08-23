// src/lib/auth.js - Tu configuración que funcionaba, solo cambié la ruta del import
import GoogleProvider from "next-auth/providers/google";
import prisma from "./prisma.js"; // ✅ Ahora está en la misma carpeta src/lib/
import NextAuth from "next-auth";

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
      // Si no viene email, denegar
      if (!user?.email) {
        console.warn("signIn: no email provided");
        return false;
      }
      
      console.log("[SIGNIN] intentando signIn para:", user.email);
      console.log("[SIGNIN] DATABASE_URL (slice):", process.env.DATABASE_URL ? process.env.DATABASE_URL.slice(0,50) : "no env");
      
      try {
        // Verificar si el usuario ya existe
        const existingUser = await prisma.user.findUnique({
          where: { email: user.email }
        });

        if (existingUser) {
          // Usuario existe, actualizar datos si cambió
          await prisma.user.update({
            where: { email: user.email },
            data: {
              name: user.name || existingUser.name,
              image: user.image || existingUser.image,
            }
          });
          console.log("[SIGNIN] Usuario existente actualizado:", user.email);
        } else {
          // Usuario nuevo, crearlo en la base de datos
          const newUser = await prisma.user.create({
            data: {
              name: user.name || null,
              email: user.email,
              image: user.image || null,
              password: 'NEXTAUTH_USER', // Placeholder para usuarios de NextAuth
              // role no se especifica porque tiene default USER en el schema
            }
          });
          console.log("[SIGNIN] Usuario nuevo creado:", newUser.email, "ID:", newUser.id);

          // Crear notificación de bienvenida solo para usuarios nuevos
          try {
            await prisma.notification.create({
              data: {
                userId: newUser.id,
                title: "¡Bienvenido a Riftea!",
                message: `¡Bienvenido ${newUser.name ?? "a Riftea"}! Gracias por registrarte.`,
                type: "SYSTEM_ALERT", // Usando el enum NotificationType
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
        return false; // Rechazar login si hay error crítico
      }
    },
    
    async jwt({ token, user }) {
      // Cuando el usuario recién se loguea, buscar su ID en la DB
      if (user && user.email) {
        try {
          const dbUser = await prisma.user.findUnique({
            where: { email: user.email }
          });
          
          if (dbUser) {
            token.id = dbUser.id; // Asignar el ID real de la DB
            token.uid = dbUser.id; // Por compatibilidad
            console.log("[JWT] token actualizado con DB ID:", dbUser.id);
          }
        } catch (error) {
          console.error("[JWT] error al buscar usuario en DB:", error);
        }
      }
      
      // Asegurar que siempre haya un id en el token
      if (!token.id && token.sub) {
        token.id = token.sub;
      }
      
      return token;
    },
    
    async session({ session, token }) {
      // Asignar ID del token a la sesión
      if (token?.id) {
        session.user.id = token.id;
        session.user.dbId = token.id; // Por compatibilidad
      }
      
      if (!session?.user?.email) return session;
      
      try {
        // Buscar usuario con todos los datos relacionados
        const dbUser = await prisma.user.findUnique({
          where: { email: session.user.email },
          include: {
            tickets: {
              where: { isUsed: false }, // Solo tickets no usados
              include: { raffle: true }
            },
            purchases: {
              orderBy: { createdAt: 'desc' },
              take: 5 // Últimas 5 compras
            },
            wonRaffles: true, // Rifas ganadas
            notifications: {
              where: { read: false },
              orderBy: { createdAt: 'desc' }
            }
          }
        });
        
        if (dbUser) {
          // Asignar role y datos adicionales
          session.user.role = dbUser.role.toString().toLowerCase(); // Convertir enum a lowercase
          session.user.id = dbUser.id;
          session.user.dbId = dbUser.id; // Por compatibilidad
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
  
  // Eventos para logging adicional
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
};