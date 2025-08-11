"use client";

import { useSession, signIn, signOut } from "next-auth/react";
import Image from "next/image";
import Header from "./components/header/Header.jsx";
export default function Home() {
  const { data: session } = useSession();

  if (!session) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen gap-4 bg-gradient-to-br from-orange-50 to-orange-100">
        <div className="text-center space-y-4 bg-white p-8 rounded-2xl shadow-lg max-w-md w-full mx-4">
          <h1 className="text-3xl font-bold text-gray-800">Bienvenido a Riftea</h1>
          <p className="text-gray-500 text-lg">Inicia sesión para continuar</p>
          
          <div className="space-y-3 pt-4">
            <button
              onClick={() => signIn("google")}
              className="w-full px-6 py-3 bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition-colors font-medium text-lg shadow-md"
            >
              Iniciar sesión con Google
            </button>
            
            <button
              onClick={() => signIn("facebook")}
              className="w-full px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium text-lg shadow-md"
            >
              Iniciar sesión con Facebook
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <Header />
      <main className="pt-20 flex flex-col items-center gap-6 min-h-screen bg-gradient-to-br from-orange-50 to-orange-100">
        <div className="text-center space-y-6 bg-white p-8 rounded-2xl shadow-lg max-w-2xl w-full mx-4 mt-8">
          <h2 className="text-3xl font-bold text-gray-800">Bienvenido a Riftea</h2>
          <p className="text-gray-600 text-center max-w-md mx-auto text-lg">
            Tu plataforma de sorteos y ventas digitales con transparencia.
          </p>
          
          <div className="flex items-center gap-4 justify-center pt-4">
            <Image
              src={session.user.image || "/avatar.png"}
              alt="Avatar"
              width={50}
              height={50}
              className="rounded-full shadow-md"
            />
            <div className="text-left">
              <h3 className="text-lg font-semibold text-gray-800">¡Hola, {session.user.name}!</h3>
              <p className="text-gray-600 text-sm">{session.user.email}</p>
            </div>
          </div>
        </div>
        
        <div className="bg-white p-6 rounded-2xl shadow-lg max-w-2xl w-full mx-4">
          <h3 className="text-xl font-semibold text-gray-800 mb-4">Panel de Control</h3>
          <p className="text-gray-600 mb-6">Desde aquí puedes gestionar tus sorteos y ventas digitales.</p>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <button className="p-4 bg-orange-100 rounded-lg hover:bg-orange-200 transition-colors text-left">
              <h4 className="font-medium text-gray-800">Crear Sorteo</h4>
              <p className="text-sm text-gray-600">Organiza un nuevo sorteo</p>
            </button>
            
            <button className="p-4 bg-blue-100 rounded-lg hover:bg-blue-200 transition-colors text-left">
              <h4 className="font-medium text-gray-800">Mis Sorteos</h4>
              <p className="text-sm text-gray-600">Ver sorteos activos</p>
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}