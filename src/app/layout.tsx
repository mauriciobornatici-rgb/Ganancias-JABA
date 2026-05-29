import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "JABA Ganancias — Liquidador de Impuesto a las Ganancias",
  description: "Sistema integral de liquidación del Impuesto a las Ganancias para Personas Humanas y Sucesiones Indivisas. Automatización de DDJJ, papeles de trabajo y determinación impositiva.",
  keywords: ["ganancias", "impuesto", "AFIP", "ARCA", "liquidación", "declaración jurada", "persona física"],
  authors: [{ name: "JABA Sistemas Contables" }],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="es"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
