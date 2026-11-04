import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "michellpos — POS en la nube",
  description:
    "Sistema de ventas en la nube para tu negocio. Prueba 15 días gratis, sin tarjeta.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es">
      <body className="min-h-screen bg-slate-50 text-slate-900 antialiased">
        {children}
      </body>
    </html>
  );
}
