// src/app/page.js — versión sin emojis, con íconos elegantes y copy breve
"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useSession, signIn } from "next-auth/react";
import Link from "next/link";
import CountdownTimer from "@/components/ui/CountdownTimer";

/**
 * Íconos elegantes (inline SVG) para evitar dependencias externas.
 * Mantiene un trazo uniforme (stroke) y coherencia visual a lo largo del sitio.
 */
function Icon({ name, className = "w-5 h-5", strokeWidth = 1.75 }) {
  const common = {
    xmlns: "http://www.w3.org/2000/svg",
    fill: "none",
    viewBox: "0 0 24 24",
    stroke: "currentColor",
    className,
    strokeWidth,
    strokeLinecap: "round",
    strokeLinejoin: "round",
    'aria-hidden': true,
  };

  switch (name) {
    case "rocket":
      return (
        <svg {...common}><path d="M5 15c1.5-1.5 4.5-2.5 7-2 0-2.5.5-5.5 2-7 2-2 6-3 6-3s-1 4-3 6c-1.5 1.5-4.5 2-7 2 .5 2.5-.5 5.5-2 7-2 2-6 3-6 3s1-4 3-6Z"/><path d="M15 9l-6 6"/></svg>
      );
    case "search":
      return (
        <svg {...common}><circle cx="11" cy="11" r="7"/><path d="M21 21l-3.6-3.6"/></svg>
      );
    case "ticket":
      return (
        <svg {...common}><path d="M3 9a2 2 0 0 0 2-2h14a2 2 0 0 0 2 2v6a2 2 0 0 0-2 2H5a2 2 0 0 0-2-2V9Z"/><path d="M12 6v12" strokeDasharray="2 3"/></svg>
      );
    case "sparkles":
      return (
        <svg {...common}><path d="M12 3l1.8 3.6L18 8.2l-3.6 1.8L12 14l-1.8-4L6 8.2l4.2-1.6L12 3Z"/><path d="M19 3l1 2 2 1-2 1-1 2-1-2-2-1 2-1 1-2Z"/><path d="M5 16l.8 1.6L7 19l-1.2.4L5 21l-.8-1.6L3 19l1.2-.4L5 16Z"/></svg>
      );
    case "tools":
      return (
        <svg {...common}><path d="M10 10l-7 7 2 2 7-7"/><path d="M15 6l3 3"/><path d="M14 3a4 4 0 0 1 4 4l-7 7a4 4 0 0 1-4-4l7-7Z"/></svg>
      );
    case "users":
      return (
        <svg {...common}><path d="M16 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="3"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
      );
    case "hourglass":
      return (
        <svg {...common}><path d="M6 2h12M6 22h12"/><path d="M6 2a6 6 0 0 0 6 6 6 6 0 0 0 6-6"/><path d="M6 22a6 6 0 0 1 6-6 6 6 0 0 1 6 6"/></svg>
      );
    case "target":
      return (
        <svg {...common}><circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2"/></svg>
      );
    case "user":
      return (
        <svg {...common}><circle cx="12" cy="8" r="4"/><path d="M6 20a6 6 0 0 1 12 0"/></svg>
      );
    case "cart":
      return (
        <svg {...common}><path d="M6 6h15l-1.5 9H8.5L7 6Z"/><circle cx="9" cy="20" r="1.5"/><circle cx="18" cy="20" r="1.5"/></svg>
      );
    case "eye":
      return (
        <svg {...common}><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/></svg>
      );
    case "shield":
      return (
        <svg {...common}><path d="M12 2l7 4v6c0 5-3.5 8-7 10-3.5-2-7-5-7-10V6l7-4Z"/></svg>
      );
    default:
      return null;
  }
}

export default function HomePage() {
  const { data: session, status } = useSession();
  const role = session?.user?.role;
  const [isAnimated, setIsAnimated] = useState(false);

  // ⏳ Demo de tiempo restante del “sorteo destacado” (48 hs desde ahora)
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
        @keyframes shimmer { 0% { background-position: -200% 0; } 100% { background-position: 200% 0; } }
        @keyframes float { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-10px); } }
        @keyframes gradient-shift { 0% { background-position: 0% 50%; } 50% { background-position: 100% 50%; } 100% { background-position: 0% 50%; } }
        .animate-shimmer { background: linear-gradient(90deg, #4f46e5, #ec4899, #f59e0b, #ec4899, #4f46e5); background-size: 300% auto; -webkit-background-clip: text; background-clip: text; animation: shimmer 8s infinite; }
        .animate-float { animation: float 6s ease-in-out infinite; }
        .transparency-board { background: linear-gradient(135deg, #f0f9ff 0%, #f5f3ff 50%, #fff7ed 100%); background-size: 200% 200%; animation: gradient-shift 15s ease infinite; }
        .feature-card:hover { transform: translateY(-8px) rotate3d(1, 1, 0, 2deg); box-shadow: 0 25px 50px -12px rgba(79, 70, 229, 0.25), 0 0 0 1px rgba(167, 139, 250, 0.2); }
        .step-circle { background: linear-gradient(135deg, #8b5cf6 0%, #ec4899 100%); box-shadow: 0 10px 25px -5px rgba(147, 51, 234, 0.25); }
        .btn-gradient { background: linear-gradient(90deg, #f97316 0%, #ea580c 100%); background-size: 200% auto; transition: background-position 0.4s ease; }
        .btn-gradient:hover { background-position: right center; }
        @keyframes fadeInUp { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
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
                  Comprá digital. <span className="animate-shimmer bg-clip-text text-transparent">Ganá premios con tus tickets.</span>
                </h1>
                <p className="mt-4 text-lg text-gray-700">
                  Fotos, cursos, beats, juegos y más. Cada compra te da tickets para sorteos transparentes.
                </p>

                <div className="mt-8 flex flex-wrap gap-4">
                  {!session ? (
                    <>
                      <button
                        onClick={() => signIn("google")}
                        className="px-6 py-3 btn-gradient text-white font-bold rounded-xl shadow-lg hover:shadow-xl transition-all duration-300 transform hover:scale-[1.03] flex items-center gap-2"
                      >
                        <Icon name="rocket" className="w-5 h-5" /> Iniciar sesión con Google
                      </button>
                      <Link
                        href="/sorteos"
                        className="px-6 py-3 bg-white border-2 border-gray-200 text-gray-800 font-bold rounded-xl hover:border-indigo-300 hover:shadow-md transition-all duration-300 flex items-center gap-2"
                      >
                        <Icon name="search" className="w-5 h-5" /> Explorar sorteos
                      </Link>
                    </>
                  ) : (
                    <>
                      <Link
                        href="/mis-tickets"
                        className="px-6 py-3 btn-gradient text-white font-bold rounded-xl shadow-lg hover:shadow-xl transition-all duration-300 transform hover:scale-[1.03] flex items-center gap-2"
                      >
                        <Icon name="ticket" className="w-5 h-5" /> Mis tickets
                      </Link>
                      <Link
                        href="/sorteos"
                        className="px-6 py-3 bg-white border-2 border-gray-200 text-gray-800 font-bold rounded-xl hover:border-indigo-300 hover:shadow-md transition-all duration-300 flex items-center gap-2"
                      >
                        <Icon name="sparkles" className="w-5 h-5" /> Explorar sorteos
                      </Link>
                      {(role === "ADMIN" || role === "SUPERADMIN") && (
                        <Link
                          href="/admin"
                          className="px-6 py-3 bg-white border-2 border-gray-200 text-gray-800 font-bold rounded-xl hover:border-indigo-300 hover:shadow-md transition-all duration-300 flex items-center gap-2"
                        >
                          <Icon name="tools" className="w-5 h-5" /> Panel Admin
                        </Link>
                      )}
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Sorteo destacado (con countdown demo y progreso visual). TODO: enlazar a datos reales. */}
          <div className="relative group">
            <div className="absolute -inset-1 bg-gradient-to-r from-indigo-600/20 to-fuchsia-600/20 rounded-2xl blur opacity-0 group-hover:opacity-100 transition duration-500" />
            <div className="relative bg-white rounded-2xl p-1 shadow-xl border border-gray-100">
              <div className="p-6 rounded-2xl transparency-board">
                <div className="h-64 md:h-72 w-full rounded-xl overflow-hidden relative">
                  <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_30%,rgba(167,139,250,0.15),transparent_50%)]" />
                  <div className="absolute inset-0 bg-[radial-gradient(circle_at_70%_70%,rgba(99,102,241,0.1),transparent_50%)]" />

                  <div className="h-full w-full flex flex-col items-center justify-center text-gray-700 relative z-10">
                    <div className="text-2xl font-bold bg-gradient-to-r from-indigo-700 to-fuchsia-700 bg-clip-text text-transparent mb-2">
                      Sorteo destacado ahora
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
                          <div className="flex items-center justify-center gap-1 text-xl font-bold text-indigo-600">
                            <Icon name="ticket" className="w-5 h-5" /> 368
                          </div>
                          <div className="text-xs text-gray-600">Tickets</div>
                        </div>
                        <div>
                          <div className="flex items-center justify-center gap-1 text-xl font-bold text-fuchsia-600">
                            <Icon name="users" className="w-5 h-5" /> 287
                          </div>
                          <div className="text-xs text-gray-600">Participantes</div>
                        </div>
                        <div className="flex flex-col items-center">
                          <div className="flex items-center gap-1">
                            <CountdownTimer endsAt={demoEndsAt} startAt={demoStartAt} compact />
                          </div>
                          <div className="text-xs text-gray-600 -mt-1">Restante</div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Stats inferiores */}
                <div className="mt-5 grid grid-cols-2 gap-4">
                  {[
                    { icon: "ticket", title: "Tickets participando", value: "368", color: "from-indigo-500 to-violet-500" },
                    { icon: "users", title: "Participantes", value: "287", color: "from-fuchsia-500 to-rose-500" },
                    { icon: "hourglass", title: "Tiempo restante", value: "2d 14h", color: "from-orange-500 to-amber-500" },
                    { icon: "target", title: "Objetivo", value: "500 tickets", color: "from-blue-500 to-cyan-500" }
                  ].map((stat, i) => (
                    <div
                      key={i}
                      className="relative group/card p-4 bg-white rounded-xl shadow-sm border border-gray-100 hover:border-gray-200 transition-all duration-300 cursor-pointer"
                    >
                      <div className="absolute inset-0 bg-gradient-to-r opacity-0 group-hover/card:opacity-5 transition-opacity duration-300 rounded-xl" />
                      <div className="flex items-center gap-3">
                        <div className={`p-2 rounded-lg bg-gradient-to-br ${stat.color} text-white`}> 
                          <Icon name={stat.icon} className="w-5 h-5" strokeWidth={2} />
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
              { title: "Súper práctico", desc: "Comprás, recibís tickets y los aplicás en 2 clics.", icon: "sparkles", color: "from-amber-500 to-orange-500" },
              { title: "Transparencia total", desc: "Progreso y ranking visibles para todos.", icon: "search", color: "from-indigo-500 to-violet-500" },
              { title: "Sin letra chica", desc: "Reglas claras y auditoría disponible en cada sorteo.", icon: "shield", color: "from-fuchsia-500 to-rose-500" },
              { title: "Rápido y seguro", desc: "Infra estable + autenticación con Google.", icon: "shield", color: "from-blue-500 to-cyan-500" }
            ].map((f, index) => (
              <article
                key={f.title}
                className={`p-6 bg-white rounded-2xl shadow-sm border border-gray-100 feature-card transition-all duration-500 cursor-pointer ${
                  isAnimated ? "opacity-0 translate-y-4" : ""
                }`}
                style={{ transitionDelay: `${index * 100}ms`, animation: isAnimated ? "fadeInUp 0.5s ease forwards" : "none" }}
              >
                <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${f.color} flex items-center justify-center text-white mb-4`}>
                  <Icon name={f.icon} className="w-6 h-6" strokeWidth={2} />
                </div>
                <h3 className="font-bold text-lg">{f.title}</h3>
                <p className="mt-2 text-sm text-gray-600">{f.desc}</p>
                <div className="mt-4 h-1 w-12 bg-gradient-to-r rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-300" style={{ backgroundImage: `linear-gradient(to right, ${f.color.split(" ")[1]}, ${f.color.split(" ")[3]})` }} />
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
                { step: "1", title: "Entrás", text: "Iniciás sesión con Google.", icon: "user" },
                { step: "2", title: "Obtenés tickets", text: "Con tus compras digitales.", icon: "cart" },
                { step: "3", title: "Participás y ves todo", text: "Aplicás el ticket y seguís el progreso.", icon: "eye" }
              ].map((s) => (
                <div key={s.step} className="relative group bg-white rounded-2xl border border-gray-100 p-6 transition-all duration-300 hover:shadow-xl">
                  <div className="absolute -top-4 -left-4 w-12 h-12 step-circle rounded-full flex items-center justify-center text-white font-bold text-xl transform -rotate-6 group-hover:rotate-0 transition-transform duration-300">
                    {s.step}
                  </div>
                  <div className="pt-6">
                    <div className="mb-4 group-hover:scale-110 transition-transform duration-300">
                      <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-fuchsia-500 text-white flex items-center justify-center">
                        <Icon name={s.icon} className="w-6 h-6" strokeWidth={2} />
                      </div>
                    </div>
                    <h4 className="font-bold text-xl bg-gradient-to-r from-gray-800 to-gray-600 bg-clip-text text-transparent">{s.title}</h4>
                    <p className="mt-2 text-gray-600">{s.text}</p>
                  </div>
                  <div className="mt-4 h-1 w-0 bg-gradient-to-r from-indigo-500 to-fuchsia-500 group-hover:w-full transition-all duration-300" />
                </div>
              ))}
            </div>

            <div className="mt-10 flex flex-wrap justify-center gap-4">
              {!session ? (
                <button onClick={() => signIn("google")} className="px-8 py-4 btn-gradient text-white font-bold rounded-2xl shadow-xl hover:shadow-2xl transition-all duration-300 transform hover:scale-105 flex items-center gap-2 group">
                  <Icon name="rocket" className="w-5 h-5" /> Empezar ahora
                </button>
              ) : (
                <>
                  <Link href="/mis-tickets" className="px-8 py-4 btn-gradient text-white font-bold rounded-2xl shadow-xl hover:shadow-2xl transition-all duration-300 transform hover:scale-105 flex items-center gap-2">
                    <Icon name="ticket" className="w-5 h-5" /> Ver mis tickets
                  </Link>
                  <Link href="/sorteos" className="px-8 py-4 bg-white border-2 border-gray-200 text-gray-800 font-bold rounded-2xl hover:border-indigo-300 hover:shadow-md transition-all duration-300 flex items-center gap-2">
                    <Icon name="sparkles" className="w-5 h-5" /> Explorar sorteos
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
                <Link key={item} href={`/${item.toLowerCase()}`} className="relative group hover:text-gray-900 transition-colors">
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
