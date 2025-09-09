// src/app/page.js
"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useSession, signIn } from "next-auth/react";
import Link from "next/link";
import CountdownTimer from "@/components/ui/CountdownTimer";

export default function HomePage() {
  const { data: session, status } = useSession();
  const role = session?.user?.role;
  const [isAnimated, setIsAnimated] = useState(false);

  // ⏳ Demo de tiempo restante del “panel de transparencia” (48 hs desde ahora)
  const demoEndsAt = useMemo(() => new Date(Date.now() + 48 * 60 * 60 * 1000), []);
  const demoStartAt = useMemo(() => new Date(Date.now() - 6 * 60 * 60 * 1000), []); // empezó hace 6 hs
  const demoProgressPct = 65; // progreso visual de la barrita del panel (solo demo)

  useEffect(() => {
    setIsAnimated(true);
  }, []);

  if (status === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-indigo-50 via-purple-50 to-fuchsia-50">
        <div className="relative w-48 h-48">
          <div className="absolute inset-0 rounded-full bg-gradient-to-r from-indigo-500 to-fuchsia-500 animate-spin-slow" />
          <div className="absolute inset-4 rounded-full bg-gray-50 flex items-center justify-center">
            <div className="w-12 h-12 border-4 border-orange-400 border-t-transparent rounded-full animate-spin" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-indigo-50 text-gray-900 antialiased overflow-hidden">
      <style jsx global>{`
        @keyframes shimmer {
          0% { background-position: -200% 0; }
          100% { background-position: 200% 0; }
        }
        @keyframes float {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-10px); }
        }
        @keyframes gradient-shift {
          0% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
          100% { background-position: 0% 50%; }
        }
        .animate-shimmer {
          background: linear-gradient(90deg, #4f46e5, #ec4899, #f59e0b, #ec4899, #4f46e5);
          background-size: 300% auto;
          -webkit-background-clip: text;
          background-clip: text;
          animation: shimmer 8s infinite;
        }
        .animate-float {
          animation: float 6s ease-in-out infinite;
        }
        .transparency-board {
          background: linear-gradient(135deg, #f0f9ff 0%, #f5f3ff 50%, #fff7ed 100%);
          background-size: 200% 200%;
          animation: gradient-shift 15s ease infinite;
        }
        .feature-card:hover {
          transform: translateY(-8px) rotate3d(1, 1, 0, 2deg);
          box-shadow: 0 25px 50px -12px rgba(79, 70, 229, 0.25),
                      0 0 0 1px rgba(167, 139, 250, 0.2);
        }
        .step-circle {
          background: linear-gradient(135deg, #8b5cf6 0%, #ec4899 100%);
          box-shadow: 0 10px 25px -5px rgba(147, 51, 234, 0.25);
        }
        .btn-gradient {
          background: linear-gradient(90deg, #f97316 0%, #ea580c 100%);
          background-size: 200% auto;
          transition: background-position 0.4s ease;
        }
        .btn-gradient:hover {
          background-position: right center;
        }
        @keyframes fadeInUp {
          from { opacity: 0; transform: translateY(20px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>

      <main className="max-w-6xl mx-auto px-6 py-12 relative">
        {/* HERO con efecto de profundidad */}
        <div className="absolute inset-0 -z-10">
          <div className="absolute top-1/4 left-1/4 w-72 h-72 bg-fuchsia-200 rounded-full mix-blend-multiply filter blur-3xl opacity-70 animate-blob" />
          <div className="absolute top-1/3 right-1/4 w-80 h-80 bg-indigo-200 rounded-full mix-blend-multiply filter blur-3xl opacity-70 animate-blob animation-delay-2000" />
          <div className="absolute bottom-1/4 left-1/3 w-96 h-96 bg-orange-200 rounded-full mix-blend-multiply filter blur-3xl opacity-70 animate-blob animation-delay-4000" />
        </div>

        <section className="grid md:grid-cols-2 gap-12 items-center pt-8">
          <div className="relative">
            <div className="absolute -inset-1 bg-gradient-to-r from-indigo-600 to-fuchsia-600 rounded-2xl opacity-20 blur-lg" />
            <div className="relative bg-white rounded-2xl p-1 shadow-xl border border-gray-100">
              <div className="p-8 rounded-2xl bg-gradient-to-br from-white to-indigo-50/50">
                <h1 className="text-4xl md:text-5xl font-extrabold leading-tight">
                  Premios con{" "}
                  <span className="animate-shimmer bg-clip-text text-transparent">
                    transparencia real
                  </span>{" "}
                  y uso práctico de tickets — Riftea
                </h1>
                <p className="mt-4 text-lg text-gray-700">
                  Comprás un producto digital, recibís <strong>tickets</strong> y participás.{" "}
                  Seguís el <strong>progreso</strong> de cada sorteo y la lista de participantes.{" "}
                  Todo claro y visible.
                </p>

                <div className="mt-8 flex flex-wrap gap-4">
                  {!session ? (
                    <>
                      <button
                        onClick={() => signIn("google")}
                        className="px-6 py-3 btn-gradient text-white font-bold rounded-xl shadow-lg hover:shadow-xl transition-all duration-300 transform hover:scale-[1.03] flex items-center gap-2"
                      >
                        <span>🚀</span> Iniciar sesión con Google
                      </button>
                      <Link
                        href="/sorteos"
                        className="px-6 py-3 bg-white border-2 border-gray-200 text-gray-800 font-bold rounded-xl hover:border-indigo-300 hover:shadow-md transition-all duration-300 flex items-center gap-2"
                      >
                        <span>🔍</span> Explorar sorteos
                      </Link>
                    </>
                  ) : (
                    <>
                      <Link
                        href="/mis-tickets"
                        className="px-6 py-3 btn-gradient text-white font-bold rounded-xl shadow-lg hover:shadow-xl transition-all duration-300 transform hover:scale-[1.03] flex items-center gap-2"
                      >
                        <span>🎟️</span> Mis tickets
                      </Link>
                      <Link
                        href="/sorteos"
                        className="px-6 py-3 bg-white border-2 border-gray-200 text-gray-800 font-bold rounded-xl hover:border-indigo-300 hover:shadow-md transition-all duration-300 flex items-center gap-2"
                      >
                        <span>✨</span> Explorar sorteos
                      </Link>
                      {(role === "ADMIN" || role === "SUPERADMIN") && (
                        <Link
                          href="/admin"
                          className="px-6 py-3 bg-white border-2 border-gray-200 text-gray-800 font-bold rounded-xl hover:border-indigo-300 hover:shadow-md transition-all duration-300 flex items-center gap-2"
                        >
                          <span>🛠️</span> Panel Admin
                        </Link>
                      )}
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Tablero de Transparencia (con countdown real y progreso visual) */}
          <div className="relative group">
            <div className="absolute -inset-1 bg-gradient-to-r from-indigo-600/20 to-fuchsia-600/20 rounded-2xl blur opacity-0 group-hover:opacity-100 transition duration-500" />
            <div className="relative bg-white rounded-2xl p-1 shadow-xl border border-gray-100">
              <div className="p-6 rounded-2xl transparency-board">
                <div className="h-64 md:h-72 w-full rounded-xl overflow-hidden relative">
                  <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_30%,rgba(167,139,250,0.15),transparent_50%)]" />
                  <div className="absolute inset-0 bg-[radial-gradient(circle_at_70%_70%,rgba(99,102,241,0.1),transparent_50%)]" />

                  <div className="h-full w-full flex flex-col items-center justify-center text-gray-700 relative z-10">
                    <div className="text-2xl font-bold bg-gradient-to-r from-indigo-700 to-fuchsia-700 bg-clip-text text-transparent mb-2">
                      Sorteo en tiempo real
                    </div>

                    {/* Barra de progreso (demo visual) */}
                    <div className="w-full max-w-md px-4">
                      <div className="h-3 bg-white/60 rounded-full overflow-hidden mb-4 border border-white/70">
                        <div
                          className="h-full bg-gradient-to-r from-indigo-500 to-fuchsia-500 transition-all duration-700"
                          style={{ width: `${demoProgressPct}%` }}
                        />
                      </div>
                    </div>

                    {/* Info compacta + countdown en panel translúcido */}
                    <div className="flex flex-col items-center gap-2">
                      <p className="text-sm font-medium text-gray-800">
                        <span className="text-indigo-600 font-bold">iPhone 15 Pro</span>
                      </p>
                      <div className="mt-1 grid grid-cols-3 gap-4 text-center">
                        <div>
                          <div className="text-xl font-bold text-indigo-600">368</div>
                          <div className="text-xs text-gray-600">Tickets</div>
                        </div>
                        <div>
                          <div className="text-xl font-bold text-fuchsia-600">287</div>
                          <div className="text-xs text-gray-600">Participantes</div>
                        </div>
                        <div className="flex flex-col items-center">
                          <CountdownTimer
                            endsAt={demoEndsAt}
                            startAt={demoStartAt}
                            compact
                          />
                          <div className="text-xs text-gray-600 -mt-1">Restante</div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Stats inferiores */}
                <div className="mt-5 grid grid-cols-2 gap-4">
                  {[
                    { icon: "🎟️", title: "Tickets participando", value: "368", color: "from-indigo-500 to-violet-500" },
                    { icon: "👥", title: "Participantes", value: "287", color: "from-fuchsia-500 to-rose-500" },
                    { icon: "⏳", title: "Tiempo restante", value: "2d 14h", color: "from-orange-500 to-amber-500" },
                    { icon: "🎯", title: "Objetivo", value: "500 tickets", color: "from-blue-500 to-cyan-500" }
                  ].map((stat, i) => (
                    <div
                      key={i}
                      className="relative group/card p-4 bg-white rounded-xl shadow-sm border border-gray-100 hover:border-gray-200 transition-all duration-300 cursor-pointer"
                    >
                      <div className="absolute inset-0 bg-gradient-to-r opacity-0 group-hover/card:opacity-5 transition-opacity duration-300 rounded-xl" />
                      <div className="flex items-center gap-3">
                        <div className={`p-2 rounded-lg bg-gradient-to-br ${stat.color} text-white`}>
                          {stat.icon}
                        </div>
                        <div>
                          <p className="text-xs text-gray-500">{stat.title}</p>
                          <p className="font-bold text-gray-800">{stat.value}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* FEATURES */}
        <section className="mt-20">
          <h2 className="text-3xl font-bold text-center mb-12 bg-clip-text text-transparent bg-gradient-to-r from-indigo-600 to-fuchsia-600">
            Lo que nos hace simples y transparentes
          </h2>
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            {[
              { title: "Súper práctico", desc: "Comprás, recibís tickets y los aplicás en 2 clics.", icon: "⚡", color: "from-amber-500 to-orange-500" },
              { title: "Transparencia total", desc: "Progreso y ranking visibles para todos.", icon: "🔍", color: "from-indigo-500 to-violet-500" },
              { title: "Sin letra chica", desc: "Reglas claras y auditoría disponible en cada sorteo.", icon: "📄", color: "from-fuchsia-500 to-rose-500" },
              { title: "Rápido y seguro", desc: "Infra estable + autenticación con Google.", icon: "🔒", color: "from-blue-500 to-cyan-500" }
            ].map((f, index) => (
              <article
                key={f.title}
                className={`p-6 bg-white rounded-2xl shadow-sm border border-gray-100 feature-card transition-all duration-500 cursor-pointer ${
                  isAnimated ? "opacity-0 translate-y-4" : ""
                }`}
                style={{
                  transitionDelay: `${index * 100}ms`,
                  animation: isAnimated ? "fadeInUp 0.5s ease forwards" : "none"
                }}
              >
                <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${f.color} flex items-center justify-center text-white mb-4`}>
                  <span className="text-xl">{f.icon}</span>
                </div>
                <h3 className="font-bold text-lg">{f.title}</h3>
                <p className="mt-2 text-sm text-gray-600">{f.desc}</p>
                <div
                  className="mt-4 h-1 w-12 bg-gradient-to-r rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-300"
                  style={{ backgroundImage: `linear-gradient(to right, ${f.color.split(" ")[1]}, ${f.color.split(" ")[3]})` }}
                />
              </article>
            ))}
          </div>
        </section>

        {/* CÓMO FUNCIONA */}
        <section className="mt-20 relative overflow-hidden rounded-3xl">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_30%,rgba(139,92,246,0.05),transparent)]" />
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_80%_70%,rgba(236,72,153,0.05),transparent)]" />

          <div className="relative bg-gradient-to-r from-white to-indigo-50/50 p-8 rounded-3xl border border-gray-100 shadow-inner">
            <h2 className="text-3xl font-bold text-center mb-10 bg-clip-text text-transparent bg-gradient-to-r from-indigo-600 to-fuchsia-600">
              ¿Cómo funciona?
            </h2>
            <div className="grid md:grid-cols-3 gap-6">
              {[
                { step: "1", title: "Entrás", text: "Iniciás sesión con Google.", icon: "👤" },
                { step: "2", title: "Obtenés tickets", text: "Con tus compras digitales.", icon: "🛒" },
                { step: "3", title: "Participás y ves todo", text: "Aplicás el ticket y seguís el progreso.", icon: "👀" }
              ].map((s) => (
                <div
                  key={s.step}
                  className="relative group bg-white rounded-2xl border border-gray-100 p-6 transition-all duration-300 hover:shadow-xl"
                >
                  <div className="absolute -top-4 -left-4 w-12 h-12 step-circle rounded-full flex items-center justify-center text-white font-bold text-xl transform -rotate-6 group-hover:rotate-0 transition-transform duration-300">
                    {s.step}
                  </div>
                  <div className="pt-6">
                    <div className="text-4xl mb-4 group-hover:scale-110 transition-transform duration-300">{s.icon}</div>
                    <h4 className="font-bold text-xl bg-gradient-to-r from-gray-800 to-gray-600 bg-clip-text text-transparent">
                      {s.title}
                    </h4>
                    <p className="mt-2 text-gray-600">{s.text}</p>
                  </div>
                  <div className="mt-4 h-1 w-0 bg-gradient-to-r from-indigo-500 to-fuchsia-500 group-hover:w-full transition-all duration-300" />
                </div>
              ))}
            </div>

            <div className="mt-10 flex flex-wrap justify-center gap-4">
              {!session ? (
                <button
                  onClick={() => signIn("google")}
                  className="px-8 py-4 btn-gradient text-white font-bold rounded-2xl shadow-xl hover:shadow-2xl transition-all duration-300 transform hover:scale-105 flex items-center gap-2 group"
                >
                  <span className="inline-block transition-transform group-hover:translate-x-1">🚀</span>
                  Empezar ahora
                </button>
              ) : (
                <>
                  <Link
                    href="/mis-tickets"
                    className="px-8 py-4 btn-gradient text-white font-bold rounded-2xl shadow-xl hover:shadow-2xl transition-all duration-300 transform hover:scale-105 flex items-center gap-2"
                  >
                    <span>🎟️</span> Ver mis tickets
                  </Link>
                  <Link
                    href="/sorteos"
                    className="px-8 py-4 bg-white border-2 border-gray-200 text-gray-800 font-bold rounded-2xl hover:border-indigo-300 hover:shadow-md transition-all duration-300 flex items-center gap-2"
                  >
                    <span>✨</span> Explorar sorteos
                  </Link>
                </>
              )}
            </div>
          </div>
        </section>

        {/* FOOTER */}
        <footer className="mt-20 text-sm text-gray-600 relative">
          <div className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-transparent via-indigo-200 to-transparent" />
          <div className="border-t pt-8 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-gradient-to-r from-indigo-500 to-fuchsia-500 animate-pulse" />
              <span>© {new Date().getFullYear()} Riftea — Hecho con ❤️.</span>
            </div>
            <div className="flex gap-6">
              {["Privacidad", "Términos", "Contacto"].map((item) => (
                <Link
                  key={item}
                  href={`/${item.toLowerCase()}`}
                  className="relative group hover:text-gray-900 transition-colors"
                >
                  {item}
                  <span className="absolute -bottom-1 left-0 w-0 h-0.5 bg-gradient-to-r from-indigo-500 to-fuchsia-500 transition-all group-hover:w-full" />
                </Link>
              ))}
            </div>
          </div>
        </footer>
      </main>
    </div>
  );
}
