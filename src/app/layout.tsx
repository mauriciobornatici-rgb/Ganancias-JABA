import type { Metadata } from 'next';
import { getRuntimeEnvironmentNotice } from '@/domain/ganancias/environment/runtimeEnvironment';
import './globals.css';

export const metadata: Metadata = {
  title: 'JABA Ganancias - Liquidador de Impuesto a las Ganancias',
  description: 'Sistema integral de liquidacion del Impuesto a las Ganancias para Personas Humanas y Sucesiones Indivisas. Automatizacion de DDJJ, papeles de trabajo y determinacion impositiva.',
  keywords: ['ganancias', 'impuesto', 'AFIP', 'ARCA', 'liquidacion', 'declaracion jurada', 'persona fisica'],
  authors: [{ name: 'JABA Sistemas Contables' }],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const environmentNotice = getRuntimeEnvironmentNotice();

  return (
    <html lang="es" className="h-full antialiased">
      <body className="min-h-full flex flex-col">
        {children}
        {environmentNotice ? (
          <aside
            aria-label="Entorno de ejecuciÃ³n"
            className="fixed inset-x-0 bottom-0 z-[100] border-t border-amber-300/70 bg-amber-300 px-4 py-2 text-center text-xs font-black tracking-wide text-black shadow-[0_-8px_30px_rgba(0,0,0,0.45)] print:hidden"
            data-testid="environment-banner"
          >
            <span>{environmentNotice.label}</span>
            <span className="mx-2" aria-hidden="true">â€”</span>
            <span className="font-bold normal-case tracking-normal">{environmentNotice.detail}</span>
          </aside>
        ) : null}
      </body>
    </html>
  );
}
