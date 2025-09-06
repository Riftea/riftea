"use client";

import React from "react";
import { useSession, signIn } from "next-auth/react";
import Link from "next/link";

export default function HomePage() {
  const { data: session, status } = useSession();
  const role = session?.user?.role; // "USER" | "ADMIN" | "SUPERADMIN"

  if (status === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-indigo-50 to-white">
        <div className="animate-pulse w-96 h-44 bg-white/80 rounded-2xl shadow-lg" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900 antialiased pt-20">
      <main className="max-w-6xl mx-auto px-6 py-12">
        {/* HERO */}
        <section className="grid md:grid-cols-2 gap-8 items-center">
          <div>
            <h1 className="text-4xl md:text-5xl font-extrabold leading-tight">
              Premios con{" "}
              <span className="bg-gradient-to-r from-indigo-600 to-fuchsia-600 bg-clip-text text-transparent">
                transparencia real
              </span>{" "}
              y uso práctico de tickets — Riftea
            </h1>
            <p className="mt-4 text-lg text-gray-700">
              Comprás un producto digital, recibís <strong>tickets</strong> y participás. 
              Podés <strong>ver el progreso</strong> de cada sorteo, la recaudación y la lista de participantes. 
              Sin humo.
            </p>

            <div className="mt-6 flex flex-wrap gap-3">
              {!session ? (
                <>
                  <button
                    onClick={() => signIn("google")}
                    className="px-4 py-2 bg-orange-500 text-white font-semibold rounded-lg hover:bg-orange-600 transition"
                  >
                    Iniciar sesión con Google
                  </button>
                  <Link
                    href="/terminos"
                    className="px-4 py-2 bg-white border border-gray-200 text-gray-800 font-semibold rounded-lg hover:bg-gray-100 transition"
                  >
                    Cómo funciona
                  </Link>
                </>
              ) : (
                <>
                  <Link
                    href="/mis-tickets"
                    className="px-4 py-2 bg-orange-500 text-white font-semibold rounded-lg hover:bg-orange-600 transition"
                  >
                    Mis tickets
                  </Link>
                  <Link
                    href="/"
                    className="px-4 py-2 bg-white border border-gray-200 text-gray-800 font-semibold rounded-lg hover:bg-gray-100 transition"
                  >
                    Explorar sorteos
                  </Link>
                  {(role === "ADMIN" || role === "SUPERADMIN") && (
                    <Link
                      href="/admin"
                      className="px-4 py-2 bg-white border border-gray-200 text-gray-800 font-semibold rounded-lg hover:bg-gray-100 transition"
                    >
                      Panel Admin
                    </Link>
                  )}
                </>
              )}
            </div>
          </div>

          {/* Tablero de Transparencia (placeholder visual) */}
          <div className="bg-white rounded-2xl shadow-lg p-6 border border-gray-100">
            <div className="h-64 md:h-72 w-full bg-gradient-to-br from-indigo-50 to-fuchsia-50 rounded-lg flex items-center justify-center text-gray-600">
              <div className="text-center">
                <div className="text-2xl font-semibold">Tablero de transparencia</div>
                <div className="mt-2 text-sm">
                  Aquí vas a ver <strong>recaudación</strong>, <strong>progreso</strong> y <strong>participantes</strong> del último sorteo activo.
                </div>
              </div>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <div className="h-16 bg-gray-100 rounded-lg" />
              <div className="h-16 bg-gray-100 rounded-lg" />
              <div className="h-16 bg-gray-100 rounded-lg" />
              <div className="h-16 bg-gray-100 rounded-lg" />
            </div>
          </div>
        </section>

        {/* FEATURES */}
        <section className="mt-16">
          <h2 className="text-3xl font-bold text-center mb-10">Lo que nos hace simples y transparentes</h2>
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            {[
              {
                title: "Súper práctico",
                desc: "Comprás, recibís tickets y los aplicás en 2 clics."
              },
              {
                title: "Transparencia total",
                desc: "Progreso, recaudación y ranking visibles para todos."
              },
              {
                title: "Sin letra chica",
                desc: "Reglas claras y auditoría disponible en cada sorteo."
              },
              {
                title: "Rápido y seguro",
                desc: "Infra estable + autenticación con Google."
              }
            ].map((f) => (
              <article
                key={f.title}
                className="p-5 bg-white rounded-xl shadow-sm border border-gray-100"
              >
                <h3 className="font-semibold">{f.title}</h3>
                <p className="mt-2 text-sm text-gray-600">{f.desc}</p>
              </article>
            ))}
          </div>
        </section>

        {/* CÓMO FUNCIONA */}
        <section className="mt-16 bg-gradient-to-r from-white to-indigo-50 p-6 rounded-xl">
          <div className="grid md:grid-cols-3 gap-6">
            {[
              { step: "1", title: "Entrás", text: "Iniciás sesión con Google." },
              { step: "2", title: "Obtenés tickets", text: "Con tus compras digitales." },
              { step: "3", title: "Participás y ves todo", text: "Aplicás el ticket y seguís el progreso." }
            ].map((s) => (
              <div key={s.step} className="bg-white rounded-xl border border-gray-100 p-5">
                <div className="w-8 h-8 rounded-full bg-indigo-600 text-white flex items-center justify-center font-bold">
                  {s.step}
                </div>
                <h4 className="mt-3 font-semibold">{s.title}</h4>
                <p className="mt-1 text-sm text-gray-600">{s.text}</p>
              </div>
            ))}
          </div>

          <div className="mt-6 flex flex-wrap gap-3">
            {!session ? (
              <button
                onClick={() => signIn("google")}
                className="px-5 py-2.5 bg-orange-500 text-white font-semibold rounded-lg hover:bg-orange-600 transition"
              >
                Empezar ahora
              </button>
            ) : (
              <>
                <Link
                  href="/mis-tickets"
                  className="px-5 py-2.5 bg-orange-500 text-white font-semibold rounded-lg hover:bg-orange-600 transition"
                >
                  Ver mis tickets
                </Link>
                <Link
                  href="/mis-sorteos"
                  className="px-5 py-2.5 bg-white border border-gray-200 text-gray-800 font-semibold rounded-lg hover:bg-gray-100 transition"
                >
                  Mis sorteos
                </Link>
              </>
            )}
          </div>
        </section>

        {/* FOOTER */}
        <footer className="mt-12 text-sm text-gray-600">
          <div className="border-t pt-6 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>© {new Date().getFullYear()} Riftea — Hecho con ❤️</div>
            <div className="flex gap-4">
              <Link href="/privacidad">Privacidad</Link>
              <Link href="/terminos">Términos</Link>
              <Link href="/contacto">Contacto</Link>
            </div>
          </div>
        </footer>
      </main>
    </div>
  );
}
