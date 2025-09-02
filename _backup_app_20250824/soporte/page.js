// app/soporte/page.js
"use client";
import { useState } from "react";
import { useSession } from "next-auth/react";

export default function SoportePage() {
  const { data: session } = useSession();
  const [formData, setFormData] = useState({
    subject: '',
    category: 'general',
    message: '',
    priority: 'medium'
  });
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSending(true);

    try {
      const res = await fetch('/api/support', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formData,
          userEmail: session?.user?.email,
          userName: session?.user?.name
        })
      });

      if (res.ok) {
        setSent(true);
        setFormData({ subject: '', category: 'general', message: '', priority: 'medium' });
      } else {
        alert('Error al enviar el mensaje');
      }
    } catch (error) {
      alert('Error de conexión');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-gray-900 to-zinc-900 pt-20">
      <div className="container mx-auto px-4 py-8 max-w-4xl">
        
        <h1 className="text-4xl font-bold text-white mb-8">🛟 Centro de Soporte</h1>

        {sent && (
          <div className="bg-green-500/20 border border-green-500/50 rounded-2xl p-6 mb-8">
            <div className="flex items-center gap-3">
              <span className="text-2xl">✅</span>
              <div>
                <h3 className="text-green-300 font-bold">¡Mensaje enviado!</h3>
                <p className="text-green-200/80">Te responderemos pronto a tu email.</p>
              </div>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          
          {/* Formulario de Contacto */}
          <div className="lg:col-span-2">
            <div className="bg-white/10 backdrop-blur-lg rounded-3xl p-8 border border-white/20">
              <h2 className="text-2xl font-bold text-white mb-6">📝 Contacto</h2>
              
              <form onSubmit={handleSubmit} className="space-y-6">
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-white/70 text-sm mb-2">Categoría</label>
                    <select 
                      value={formData.category}
                      onChange={(e) => setFormData({...formData, category: e.target.value})}
                      className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="general">Consulta General</option>
                      <option value="technical">Problema Técnico</option>
                      <option value="payment">Pagos y Facturas</option>
                      <option value="account">Cuenta y Perfil</option>
                      <option value="abuse">Reportar Abuso</option>
                    </select>
                  </div>
                  
                  <div>
                    <label className="block text-white/70 text-sm mb-2">Prioridad</label>
                    <select 
                      value={formData.priority}
                      onChange={(e) => setFormData({...formData, priority: e.target.value})}
                      className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="low">Baja</option>
                      <option value="medium">Media</option>
                      <option value="high">Alta</option>
                      <option value="urgent">Urgente</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-white/70 text-sm mb-2">Asunto</label>
                  <input 
                    type="text"
                    value={formData.subject}
                    onChange={(e) => setFormData({...formData, subject: e.target.value})}
                    placeholder="Describe tu consulta brevemente..."
                    className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    required
                  />
                </div>

                <div>
                  <label className="block text-white/70 text-sm mb-2">Mensaje</label>
                  <textarea 
                    rows={6}
                    value={formData.message}
                    onChange={(e) => setFormData({...formData, message: e.target.value})}
                    placeholder="Cuéntanos más detalles sobre tu consulta..."
                    className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                    required
                  ></textarea>
                </div>

                <button 
                  type="submit"
                  disabled={sending}
                  className="w-full py-3 bg-gradient-to-r from-blue-500 to-purple-500 hover:from-blue-600 hover:to-purple-600 disabled:opacity-50 text-white font-bold rounded-xl shadow-lg hover:shadow-xl transform hover:scale-105 transition-all duration-200"
                >
                  {sending ? 'Enviando...' : '📨 Enviar Mensaje'}
                </button>
              </form>
            </div>
          </div>

          {/* Información y FAQ */}
          <div className="space-y-6">
            
            {/* Contacto Directo */}
            <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-6 border border-white/20">
              <h3 className="text-lg font-bold text-white mb-4">📞 Contacto Directo</h3>
              
              <div className="space-y-3 text-sm">
                <div className="flex items-center gap-3">
                  <span>📧</span>
                  <div>
                    <p className="text-white/90">Email</p>
                    <p className="text-blue-300">soporte@riftea.com</p>
                  </div>
                </div>
                
                <div className="flex items-center gap-3">
                  <span>💬</span>
                  <div>
                    <p className="text-white/90">WhatsApp</p>
                    <p className="text-green-300">+54 9 11 1234-5678</p>
                  </div>
                </div>
                
                <div className="flex items-center gap-3">
                  <span>🕰</span>
                  <div>
                    <p className="text-white/90">Horarios</p>
                    <p className="text-white/70">Lun-Vie 9:00-18:00</p>
                  </div>
                </div>
              </div>
            </div>

            {/* FAQ Rápido */}
            <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-6 border border-white/20">
              <h3 className="text-lg font-bold text-white mb-4">❓ Preguntas Frecuentes</h3>
              
              <div className="space-y-4">
                <details className="group">
                  <summary className="flex cursor-pointer items-center justify-between text-white/90 hover:text-white">
                    <span>¿Cómo crear un sorteo?</span>
                    <span className="transition group-open:rotate-180">↓</span>
                  </summary>
                  <p className="mt-2 text-white/70 text-sm">
                    Ve a &quot;Crear Sorteo&quot; en tu menú, completa los datos y publica cuando esté listo.
                  </p>
                </details>
                
                <details className="group">
                  <summary className="flex cursor-pointer items-center justify-between text-white/90 hover:text-white">
                    <span>¿Cómo comprar tickets?</span>
                    <span className="transition group-open:rotate-180">↓</span>
                  </summary>
                  <p className="mt-2 text-white/70 text-sm">
                    Entra al sorteo, selecciona cantidad y completa el pago.
                  </p>
                </details>
                
                <details className="group">
                  <summary className="flex cursor-pointer items-center justify-between text-white/90 hover:text-white">
                    <span>¿Cuándo se sortea?</span>
                    <span className="transition group-open:rotate-180">↓</span>
                  </summary>
                  <p className="mt-2 text-white/70 text-sm">
                    Cada sorteo tiene fecha límite. Se sortea automáticamente al completarse.
                  </p>
                </details>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}