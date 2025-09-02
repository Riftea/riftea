// app/api/auth/[...nextauth]/route.js
import NextAuth from "next-auth";
import { authOptions } from "../../../../lib/auth.js";

// 🔧 MEJORA: Handler con mejor manejo de errores
const handler = async (req, context) => {
  try {
    return await NextAuth(req, context, authOptions);
  } catch (error) {
    console.error("[NEXTAUTH HANDLER] Error:", error);
    
    // 🔧 MEJORA: Respuesta de error más específica
    return new Response(
      JSON.stringify({
        error: "Authentication Error",
        message: process.env.NODE_ENV === 'development' ? error.message : "Internal Server Error"
      }),
      {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
        },
      }
    );
  }
};

// Exportar para ambos métodos HTTP
export { handler as GET, handler as POST };

// 🔧 MEJORA: Metadata para la API
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';