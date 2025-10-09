// src/app/layout.js
import "./globals.css";
import { Providers } from "./providers";
import Header from "../components/header/Header.jsx";
import RouteSplashProvider from "@/components/providers/RouteSplashProvider";

export const metadata = {
  title: "Riftea",
  description: "Plataforma de sorteos y ventas digitales",
};

export default function RootLayout({ children }) {
  return (
    <html lang="es">
      <body>
        <RouteSplashProvider durationMs={900} minShowMs={450}>
          <Providers>
            <Header />
            <main className="pt-20">{children}</main>
          </Providers>
        </RouteSplashProvider>
      </body>
    </html>
  );
}
