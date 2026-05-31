import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "JABA Ganancias - Liquidador de Impuesto a las Ganancias",
  description: "Sistema integral de liquidacion del Impuesto a las Ganancias para Personas Humanas y Sucesiones Indivisas. Automatizacion de DDJJ, papeles de trabajo y determinacion impositiva.",
  keywords: ["ganancias", "impuesto", "AFIP", "ARCA", "liquidacion", "declaracion jurada", "persona fisica"],
  authors: [{ name: "JABA Sistemas Contables" }],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
