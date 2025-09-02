// app/terminos/page.js
export default function TerminosPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
      <div className="container mx-auto px-4 py-12">
        <div className="max-w-4xl mx-auto bg-white/10 backdrop-blur-lg rounded-3xl border border-white/20 shadow-2xl p-8 md:p-12">
          
          {/* Header */}
          <div className="text-center mb-12">
            <h1 className="text-4xl md:text-5xl font-bold text-white mb-4">
              📋 Términos y Condiciones
            </h1>
            <p className="text-xl text-white/80">
              Participación en Sorteos - Riftea
            </p>
            <div className="w-24 h-1 bg-gradient-to-r from-purple-500 to-pink-500 mx-auto mt-6"></div>
          </div>

          {/* Disclaimer Principal */}
          <div className="bg-gradient-to-r from-green-500/20 to-emerald-500/20 border border-green-400/30 rounded-2xl p-6 mb-8">
            <div className="flex items-start space-x-4">
              <div className="text-3xl">🎁</div>
              <div>
                <h2 className="text-2xl font-bold text-white mb-3">
                  ⚡ Importante: Los Tickets son SIEMPRE un Regalo
                </h2>
                <p className="text-lg text-white/90 leading-relaxed">
                  <strong>Todos los tickets de participación son completamente GRATUITOS</strong> y se otorgan como 
                  muestra de agradecimiento por tu compra en nuestra plataforma. No estás obligado/a a participar 
                  en ningún sorteo. Los tickets son un regalo adicional por confiar en nosotros.
                </p>
              </div>
            </div>
          </div>

          {/* Secciones de Términos */}
          <div className="space-y-8 text-white/90">
            
            {/* 1. Participación Voluntaria */}
            <section className="bg-white/5 rounded-2xl p-6 backdrop-blur-sm">
              <h3 className="text-2xl font-bold text-white mb-4 flex items-center">
                <span className="text-blue-400 mr-3">🤝</span>
                1. Participación Voluntaria
              </h3>
              <div className="space-y-3 text-lg leading-relaxed">
                <p>
                  • La participación en todos los sorteos es <strong>completamente voluntaria</strong>.
                </p>
                <p>
                  • Los tickets se otorgan automáticamente como <strong>regalo por tu compra</strong>, pero puedes elegir no usarlos.
                </p>
                <p>
                  • Puedes solicitar la <strong>devolución de tickets no utilizados</strong> antes del sorteo.
                </p>
                <p>
                  • No existe ninguna obligación de participar para recibir tu producto/servicio.
                </p>
              </div>
            </section>

            {/* 2. Sistema de Financiamiento */}
            <section className="bg-white/5 rounded-2xl p-6 backdrop-blur-sm">
              <h3 className="text-2xl font-bold text-white mb-4 flex items-center">
                <span className="text-green-400 mr-3">💰</span>
                2. Sistema de Financiamiento Transparente
              </h3>
              <div className="space-y-3 text-lg leading-relaxed">
                <p>
                  • <strong>50% del valor</strong> de tu compra se destina exclusivamente al fondo de premios.
                </p>
                <p>
                  • <strong>50% restante</strong> cubre costos operativos de la plataforma.
                </p>
                <p>
                  • El sorteo se activa automáticamente al alcanzar el <strong>100% del financiamiento</strong>.
                </p>
                <p>
                  • Todos los fondos destinados a premios son <strong>auditables y transparentes</strong>.
                </p>
              </div>
            </section>

            {/* 3. Proceso del Sorteo */}
            <section className="bg-white/5 rounded-2xl p-6 backdrop-blur-sm">
              <h3 className="text-2xl font-bold text-white mb-4 flex items-center">
                <span className="text-purple-400 mr-3">🎲</span>
                3. Proceso del Sorteo
              </h3>
              <div className="space-y-3 text-lg leading-relaxed">
                <p>
                  • Los sorteos utilizan <strong>algoritmos criptográficamente seguros</strong> para garantizar equidad.
                </p>
                <p>
                  • Cada ticket tiene un <strong>identificador único UUID + hash SHA256</strong> para prevenir fraudes.
                </p>
                <p>
                  • El ganador se selecciona de forma <strong>completamente aleatoria</strong> entre todos los tickets activos.
                </p>
                <p>
                  • Los resultados son <strong>inmutables y verificables</strong> una vez publicados.
                </p>
              </div>
            </section>

            {/* 4. Devoluciones y Cancelaciones */}
            <section className="bg-white/5 rounded-2xl p-6 backdrop-blur-sm">
              <h3 className="text-2xl font-bold text-white mb-4 flex items-center">
                <span className="text-orange-400 mr-3">🔄</span>
                4. Devoluciones y Cancelaciones
              </h3>
              <div className="space-y-3 text-lg leading-relaxed">
                <p>
                  • Puedes solicitar la <strong>devolución de tickets no utilizados</strong> hasta 24h antes del sorteo.
                </p>
                <p>
                  • Si un sorteo <strong>no alcanza el 100% de financiamiento</strong> en 30 días, se cancela automáticamente.
                </p>
                <p>
                  • En caso de cancelación, todos los fondos se <strong>devuelven proporcionalmente</strong> a los participantes.
                </p>
                <p>
                  • Las devoluciones se procesan en <strong>5-7 días hábiles</strong> al método de pago original.
                </p>
              </div>
            </section>

            {/* 5. Responsabilidades y Limitaciones */}
            <section className="bg-white/5 rounded-2xl p-6 backdrop-blur-sm">
              <h3 className="text-2xl font-bold text-white mb-4 flex items-center">
                <span className="text-red-400 mr-3">⚖️</span>
                5. Responsabilidades y Limitaciones
              </h3>
              <div className="space-y-3 text-lg leading-relaxed">
                <p>
                  • Riftea actúa únicamente como <strong>plataforma facilitadora</strong> de sorteos.
                </p>
                <p>
                  • Los premios son financiados <strong>exclusivamente por las contribuciones</strong> de las compras.
                </p>
                <p>
                  • No garantizamos que todos los sorteos alcancen el <strong>100% de financiamiento</strong>.
                </p>
                <p>
                  • La plataforma se reserva el derecho de <strong>suspender sorteos</strong> por causas técnicas o legales.
                </p>
              </div>
            </section>

            {/* 6. Privacidad y Datos */}
            <section className="bg-white/5 rounded-2xl p-6 backdrop-blur-sm">
              <h3 className="text-2xl font-bold text-white mb-4 flex items-center">
                <span className="text-cyan-400 mr-3">🔐</span>
                6. Privacidad y Protección de Datos
              </h3>
              <div className="space-y-3 text-lg leading-relaxed">
                <p>
                  • Todos los datos personales se manejan conforme a la <strong>Ley de Protección de Datos Personales (Argentina)</strong>.
                </p>
                <p>
                  • Los tickets utilizan <strong>identificadores anónimos</strong> para proteger tu privacidad.
                </p>
                <p>
                  • Solo compartimos información del ganador con su <strong>consentimiento explícito</strong>.
                </p>
                <p>
                  • Puedes solicitar la <strong>eliminación de tus datos</strong> en cualquier momento.
                </p>
              </div>
            </section>

          </div>

          {/* Contacto y Soporte */}
          <div className="mt-12 bg-gradient-to-r from-blue-500/20 to-purple-500/20 border border-blue-400/30 rounded-2xl p-6">
            <h3 className="text-2xl font-bold text-white mb-4 flex items-center">
              <span className="text-blue-400 mr-3">📧</span>
              Contacto y Soporte
            </h3>
            <p className="text-lg text-white/90 mb-4">
              Si tienes dudas sobre estos términos o necesitas soporte:
            </p>
            <div className="grid md:grid-cols-2 gap-4 text-white/80">
              <div>
                <strong>Email:</strong> soporte@riftea.com
              </div>
              <div>
                <strong>Horario:</strong> Lun-Vie 9:00-18:00 (GMT-3)
              </div>
            </div>
          </div>

          {/* Footer Legal */}
          <div className="mt-8 pt-6 border-t border-white/20 text-center text-white/60">
            <p className="text-sm">
              Última actualización: {new Date().toLocaleDateString('es-AR')}<br/>
              Estos términos están sujetos a la legislación argentina y cualquier disputa 
              será resuelta en los tribunales de la Ciudad Autónoma de Buenos Aires.
            </p>
          </div>

        </div>
      </div>
    </div>
  );
}