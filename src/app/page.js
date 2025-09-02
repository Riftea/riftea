// app/page.js
"use client";

import React from "react";
import { useSession, signIn } from "next-auth/react";
import Link from "next/link";

export default function ImprovedHomePage() {
  const {  session, status } = useSession();

  if (status === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-indigo-50 to-white">
        <div className="animate-pulse w-96 h-44 bg-white rounded-2xl shadow" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900 antialiased pt-20">
      <main className="max-w-6xl mx-auto px-6 py-12">
        <section className="grid md:grid-cols-2 gap-8 items-center">
          <div>
            <h1 className="text-4xl md:text-5xl font-extrabold leading-tight">
              Tu Plataforma que combina Productos digitales + Premios con transparencia — Riftea
            </h1>
            <p className="mt-4 text-lg text-gray-600">
              Participa en sorteos emocionantes y gana premios increíbles. ¡Todo con total transparencia!
            </p>
            <div className="mt-6 flex gap-4">
              {!session ? (
                <button
                  onClick={() => signIn("google")}
                  className="px-4 py-2 bg-orange-500 text-white font-semibold rounded-lg hover:bg-orange-600 transition"
                >
                  Iniciar sesión con Google
                </button>
              ) : (
                <Link 
                  href="/admin" 
                  className="px-4 py-2 bg-orange-500 text-white font-semibold rounded-lg hover:bg-orange-600 transition"
                >
                  Ir al Panel Admin
                </Link>
              )}
            </div>
          </div>
          <div className="bg-white rounded-2xl shadow-lg p-6 border border-gray-100">
            <div className="h-64 md:h-72 w-full bg-gradient-to-br from-indigo-50 to-fuchsia-50 rounded-lg flex items-center justify-center text-gray-400">
              <div className="text-center">
                <div className="text-2xl font-semibold">Preview</div>
                <div className="mt-2 text-sm">Sube screenshots o un mockup aquí</div>
              </div>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <div className="h-16 bg-gray-100 rounded-lg"></div>
              <div className="h-16 bg-gray-100 rounded-lg"></div>
              <div className="h-16 bg-gray-100 rounded-lg"></div>
              <div className="h-16 bg-gray-100 rounded-lg"></div>
            </div>
          </div>
        </section>

        <section className="mt-16">
          <h2 className="text-3xl font-bold text-center mb-10">Características principales</h2>
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            {[
              { title: "Fácil de usar", desc: "Con tus compras recibís tickets de regalo que te permite participar." },
              { title: "Premios", desc: "Utiliza tus tickets de regalo para participar." },
              { title: "Transparencia", desc: "Se muestra la posición de todos los participantes." },
              { title: "Sorteos", desc: "Documentación y ayuda rápida." },
            ].map((f) => (
              <article key={f.title} className="p-5 bg-white rounded-xl shadow-sm border">
                <h3 className="font-semibold">{f.title}</h3>
                <p className="mt-2 text-sm text-gray-600">{f.desc}</p>
              </article>
            ))}
          </div>
        </section>

        <section id="about" className="mt-12 bg-gradient-to-r from-white to-indigo-50 p-6 rounded-xl">
          <div className="md:flex md:items-center md:justify-between">
            <div>
              <h3 className="text-xl font-semibold">Primera plataforma de sorteos con transparencia.</h3>
              <p className="mt-2 text-gray-600">Recibí tickets por tus compras digitales y participá por premios alucinantes.</p>
            </div>
            <div className="mt-4 md:mt-0">
              <Link
                href="/contacto"
                className="inline-block px-6 py-3 rounded-lg bg-fuchsia-600 text-white font-medium shadow"
              >
                Solicitar diseño
              </Link>
            </div>
          </div>
        </section>

        <footer id="contact" className="mt-12 text-sm text-gray-600">
          <div className="border-t pt-6 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>© {new Date().getFullYear()} Riftea — Hecho con ❤️</div>
            <div className="flex gap-4">
              <Link href="/privacidad" className="">Privacidad</Link>
              <Link href="/terminos" className="">Términos</Link>
              <Link href="/contacto" className="">Contacto</Link>
            </div>
          </div>
        </footer>
      </main>
    </div>
  );
}