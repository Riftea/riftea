"use client";
import { useSession, signIn, signOut } from "next-auth/react";
import Image from "next/image";

export default function Header() {
  const { data: session } = useSession();

  return (
    <header className="fixed top-0 left-0 w-full bg-orange-500 text-white shadow-md z-50">
      <div className="max-w-6xl mx-auto flex justify-between items-center px-4 py-3">
        {/* Logo */}
        <Image
          src="/logo.png"
          alt="Logo"
          width={120}
          height={40}
          className="cursor-pointer"
        />

        {/* Controles */}
        {!session ? (
          <button
            onClick={() => signIn("google")}
            className="px-4 py-2 bg-white text-orange-500 font-semibold rounded-lg hover:bg-gray-200 transition"
          >
            Iniciar sesión
          </button>
        ) : (
          <div className="flex items-center gap-4">
            <Image
              src={session.user.image || "/avatar.png"}
              alt="Avatar"
              width={40}
              height={40}
              className="rounded-full border-2 border-white"
            />
            <span className="hidden sm:block">{session.user.name}</span>
            <button
              onClick={() => signOut()}
              className="px-3 py-1 bg-white text-orange-500 rounded-lg hover:bg-gray-200 transition"
            >
              Cerrar sesión
            </button>
          </div>
        )}
      </div>
    </header>
  );
}
