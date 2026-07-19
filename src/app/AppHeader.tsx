'use client';

import Link from 'next/link';
import Image from 'next/image';
import { LogOut } from 'lucide-react';

export type AppSection = 'dashboard' | 'clientes' | 'parametros' | 'auditoria' | 'configuracion';

/** Navegación principal por URLs: cada sección es una ruta propia. */
const NAV_ITEMS: ReadonlyArray<{ key: AppSection; label: string; href: string }> = [
  { key: 'dashboard', label: 'Dashboard', href: '/' },
  { key: 'clientes', label: 'Clientes', href: '/clientes' },
  { key: 'parametros', label: 'Parámetros', href: '/parametros' },
  { key: 'auditoria', label: 'Auditoría', href: '/auditoria' },
  { key: 'configuracion', label: 'Configuración', href: '/configuracion' },
];

async function handleLogout() {
  await fetch('/api/auth/logout', { method: 'POST' });
  window.location.href = '/login';
}

export function AppHeader({ active }: { active: AppSection }) {
  return (
    <header className="border-b border-[#1e1e24] bg-[#09090b]/80 backdrop-blur-md sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/" className="flex items-center gap-3 text-left focus:outline-none">
            <div className="h-9 w-9 rounded-lg bg-white flex items-center justify-center p-0.5 shadow-lg shadow-teal-500/10 overflow-hidden">
              <Image src="/logo-jaba-color.jpg" alt="JABA Dirección y Gestión" width={1064} height={946} className="h-full w-full object-contain" priority />
            </div>
            <div>
              <span className="font-bold text-lg tracking-tight bg-gradient-to-r from-teal-200 to-zinc-100 bg-clip-text text-transparent block">JABA</span>
              <span className="text-[10px] uppercase tracking-wider block text-teal-400 font-semibold -mt-1">Ganancias Impositivas</span>
            </div>
          </Link>
        </div>

        <nav className="hidden md:flex items-center gap-6 text-sm font-medium">
          {NAV_ITEMS.map(item => (
            <Link
              key={item.key}
              href={item.href}
              aria-current={active === item.key ? 'page' : undefined}
              className={`py-1 transition-colors relative focus:outline-none ${active === item.key ? 'text-teal-400 border-b-2 border-teal-500/50 font-bold' : 'text-zinc-400 hover:text-zinc-200'}`}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center text-xs font-semibold text-teal-300">
            JB
          </div>
          <span className="text-sm font-medium hidden md:inline text-zinc-300">JABA Contabilidad</span>
          <button
            onClick={handleLogout}
            className="ml-2 flex h-8 items-center gap-1.5 rounded-lg border border-zinc-800 px-3 text-[10px] font-bold uppercase tracking-wider text-zinc-400 transition-colors hover:border-red-500/30 hover:text-red-300"
            title="Cerrar sesion"
          >
            <LogOut className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Salir</span>
          </button>
        </div>
      </div>
      <nav aria-label="Navegación principal móvil" className="md:hidden flex overflow-x-auto border-t border-zinc-900 px-4 py-2 gap-2">
        {NAV_ITEMS.map(item => (
          <Link
            key={item.key}
            href={item.href}
            aria-current={active === item.key ? 'page' : undefined}
            className={`shrink-0 rounded-lg px-3 py-2 text-xs font-semibold ${active === item.key ? 'bg-teal-500/15 text-teal-300' : 'text-zinc-400'}`}
          >
            {item.label}
          </Link>
        ))}
      </nav>
    </header>
  );
}
