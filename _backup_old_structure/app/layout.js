// src/app/layout.js
import './globals.css'
import { Providers } from './providers'
import Header from './components/header/Header.jsx'


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
