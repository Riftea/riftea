// src/app/layout.js - REEMPLAZAR COMPLETO
import './globals.css'
import { Providers } from './providers'
import Header from '../components/header/Header.jsx'

// Inicialización de cron jobs solo en servidor
if (typeof window === 'undefined' && process.env.NODE_ENV === 'production') {
  // Solo importar en servidor para evitar errores de hidratación
  import('../lib/cron-jobs').then(({ initializeCronJobs }) => {
    if (!global.cronJobsInitialized) {
      console.log('🚀 Inicializando sistema de auto-sorteos...');
      initializeCronJobs();
      global.cronJobsInitialized = true;
    }
  }).catch(error => {
    console.error('❌ Error inicializando cron jobs:', error);
  });
}

export const metadata = {
  title: 'Riftea',
  description: 'Plataforma de sorteos y ventas digitales',
}

export default function RootLayout({ children }) {
  return (
    <html lang="es">
      <body>
        <Providers>
          <Header />
          <main className="pt-20">{children}</main>
        </Providers>
      </body>
    </html>
  )
}