// app/api/auth/[...nextauth]/route.js - REEMPLAZA tu archivo actual
import NextAuth from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

const handler = NextAuth({
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    }),
  ],
  secret: process.env.NEXTAUTH_SECRET,
  
  callbacks: {
    async signIn({ user, account, profile }) {
      try {
        console.log('Usuario intentando loguearse:', user.email)
        
        // Verificar si el usuario ya existe en Supabase
        const existingUser = await prisma.user.findUnique({
          where: { email: user.email }
        })

        if (existingUser) {
          // Usuario existe, actualizar nombre si cambió
          await prisma.user.update({
            where: { email: user.email },
            data: {
              name: user.name || existingUser.name,
            }
          })
          console.log('Usuario existente actualizado:', user.email)
        } else {
          // Usuario nuevo, crearlo en Supabase
          await prisma.user.create({
            data: {
              name: user.name,
              email: user.email,
              password: 'NEXTAUTH_USER', // Placeholder para usuarios de NextAuth
            }
          })
          console.log('Usuario nuevo creado en Supabase:', user.email)
        }
        
        return true
      } catch (error) {
        console.error('Error en signIn callback:', error)
        return false // Rechazar login si hay error
      }
    },

    async session({ session, token }) {
      if (session?.user?.email) {
        try {
          // Buscar usuario en Supabase y agregar info adicional
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
              }
            }
          })
          
          if (dbUser) {
            // Agregar datos de Supabase a la sesión
            session.user.id = dbUser.id
            session.user.dbId = dbUser.id // Por compatibilidad
            session.user.availableTickets = dbUser.tickets.length
            session.user.totalPurchases = dbUser.purchases.length
            session.user.memberSince = dbUser.createdAt
          }
        } catch (error) {
          console.error('Error en session callback:', error)
        }
      }
      
      return session
    },

    async jwt({ token, user }) {
      // Agregar ID de usuario al token si es necesario
      if (user) {
        token.uid = user.id
      }
      return token
    }
  },

  events: {
    async signIn({ user, account, profile, isNewUser }) {
      console.log(`Usuario ${user.email} se logueó. Cuenta nueva en NextAuth: ${isNewUser}`)
    },
    
    async signOut({ token }) {
      console.log('Usuario cerró sesión')
    }
  },

  session: {
    strategy: 'jwt',
    maxAge: 30 * 24 * 60 * 60, // 30 días
  },
});

export { handler as GET, handler as POST };