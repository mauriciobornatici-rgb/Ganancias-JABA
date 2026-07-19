'use client';

import React, { FormEvent, Suspense, useState } from 'react';
import Image from 'next/image';
import { ShieldCheck } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import { sanitizeSimpleAuthRedirectPath } from '@/domain/ganancias/auth/redirect';

export default function LoginPage() {
  return (
    <Suspense fallback={<LoginShell />}>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const searchParams = useSearchParams();
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const requestedNextPath = searchParams.get('next');
  const nextPath = sanitizeSimpleAuthRedirectPath(requestedNextPath);
  const requiresSetup = searchParams.get('setup') === '1';

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      const result = await response.json();
      if (!response.ok || !result.success) {
        setError(result.error || 'No se pudo iniciar sesion.');
        return;
      }
      window.location.href = nextPath;
    } catch {
      setError('No se pudo conectar con el servidor de autenticacion.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <LoginShell
      error={error}
      isLoading={isLoading}
      password={password}
      requiresSetup={requiresSetup}
      onPasswordChange={setPassword}
      onSubmit={handleSubmit}
    />
  );
}

type LoginShellProps = {
  error?: string;
  isLoading?: boolean;
  password?: string;
  requiresSetup?: boolean;
  onPasswordChange?: (value: string) => void;
  onSubmit?: (event: FormEvent<HTMLFormElement>) => void;
};

function LoginShell({
  error = '',
  isLoading = false,
  password = '',
  requiresSetup = false,
  onPasswordChange,
  onSubmit,
}: LoginShellProps = {}) {
  return (
    <main className="min-h-screen overflow-hidden bg-[#050506] text-zinc-100">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(20,184,166,0.18),transparent_32%),radial-gradient(circle_at_80%_0%,rgba(16,185,129,0.12),transparent_28%),linear-gradient(135deg,#050506_0%,#111116_48%,#07110f_100%)]" />
      <div className="relative mx-auto flex min-h-screen w-full max-w-6xl items-center px-6 py-12">
        <section className="grid w-full grid-cols-1 gap-8 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
          <div className="space-y-6">
            <div className="inline-flex items-center gap-2 rounded-full border border-teal-400/20 bg-teal-400/10 px-4 py-2 text-xs font-black uppercase tracking-[0.22em] text-teal-200">
              <ShieldCheck className="h-4 w-4" />
              Acceso protegido
            </div>
            <div className="space-y-4">
              <h1 className="max-w-2xl text-4xl font-black tracking-tight text-white md:text-6xl">
                JABA Ganancias queda bajo llave.
              </h1>
              <p className="max-w-xl text-sm leading-7 text-zinc-400 md:text-base">
                Ingresa la clave del estudio para acceder al dashboard, declaraciones, parametros y APIs internas.
              </p>
            </div>
            <div className="grid max-w-xl grid-cols-1 gap-3 sm:grid-cols-3">
              {['Dashboard', 'Clientes', 'DDJJ'].map(label => (
                <div key={label} className="rounded-2xl border border-zinc-800 bg-black/25 px-4 py-3">
                  <span className="block text-[10px] font-black uppercase tracking-[0.18em] text-zinc-500">Protegido</span>
                  <span className="mt-1 block text-sm font-bold text-zinc-100">{label}</span>
                </div>
              ))}
            </div>
          </div>

          <form onSubmit={onSubmit} className="rounded-3xl border border-zinc-800 bg-[#0b0b0f]/85 p-6 shadow-2xl shadow-black/40 backdrop-blur-xl md:p-8">
            <div className="mb-6 flex items-center gap-3">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white p-1 overflow-hidden">
                <Image src="/logo-jaba-color.jpg" alt="JABA Dirección y Gestión" width={1064} height={946} className="h-full w-full object-contain" priority />
              </div>
              <div>
                <h2 className="text-lg font-black text-white">Ingreso al sistema</h2>
                <p className="text-xs text-zinc-500">JABA Dirección &amp; Gestión — sesión de uso interno.</p>
              </div>
            </div>

            {requiresSetup && (
              <div className="mb-5 rounded-2xl border border-amber-400/30 bg-amber-400/10 px-4 py-3 text-xs leading-6 text-amber-100">
                Falta configurar AUTH_PASSWORD y AUTH_SECRET en el entorno de produccion.
              </div>
            )}

            <label className="mb-2 block text-[10px] font-black uppercase tracking-[0.2em] text-zinc-500">
              Clave del estudio
            </label>
            <input
              type="password"
              value={password}
              onChange={event => onPasswordChange?.(event.target.value)}
              autoFocus
              className="h-12 w-full rounded-2xl border border-zinc-800 bg-[#050506] px-4 text-sm font-bold text-white outline-none transition focus:border-teal-400/70"
              placeholder="Ingresa la clave"
            />

            {error && (
              <div className="mt-4 rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-xs font-semibold text-red-200">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={isLoading || !onSubmit}
              className="mt-6 h-12 w-full rounded-2xl bg-teal-400 text-sm font-black uppercase tracking-[0.16em] text-[#050506] transition hover:bg-teal-300 disabled:cursor-not-allowed disabled:bg-zinc-700 disabled:text-zinc-400"
            >
              {isLoading ? 'Validando...' : 'Entrar'}
            </button>

            <p className="mt-4 text-center text-[11px] leading-5 text-zinc-500">
              En desarrollo local, si no configuraste clave, la clave temporal es JabaDev2026!.
            </p>
          </form>
        </section>
      </div>
    </main>
  );
}
