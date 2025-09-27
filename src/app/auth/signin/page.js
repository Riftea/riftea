// src/app/auth/signin/page.js
"use client";

import { signIn } from "next-auth/react";

export default function SignInPage() {
  return (
    <main className="min-h-dvh flex items-center justify-center p-6 bg-gradient-to-br from-slate-900 to-slate-800">
      <div className="w-full max-w-sm rounded-2xl shadow border border-slate-700 bg-slate-900/60 p-6 space-y-5">
        <header className="text-center space-y-1">
          <h1 className="text-2xl font-semibold text-white">Ingresar</h1>
          <p className="text-sm text-slate-300">
            Elegí un método para continuar.
          </p>
        </header>

        <div className="space-y-3">
          <button
            onClick={() => signIn("google")}
            className="w-full rounded-xl border border-slate-600 bg-slate-800 hover:bg-slate-700 text-white px-4 py-2.5 transition"
          >
            Continuar con Google
          </button>

          {/* Agregá otros providers si los tenés configurados */}
          {/* <button
            onClick={() => signIn("github")}
            className="w-full rounded-xl border border-slate-600 bg-slate-800 hover:bg-slate-700 text-white px-4 py-2.5 transition"
          >
            Continuar con GitHub
          </button> */}
        </div>

        <p className="text-center text-xs text-slate-400">
          Al continuar aceptás nuestros términos y políticas.
        </p>
      </div>
    </main>
  );
}
