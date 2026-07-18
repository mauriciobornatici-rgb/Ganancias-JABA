'use client';

import { useEffect, useState } from 'react';
import { AppHeader } from '../AppHeader';

type AuditLogRow = {
  id: string;
  createdAt: string;
  action: string;
  entityType: string;
  details?: string | null;
  clientName?: string | null;
  clientCuit?: string | null;
  userId?: string | null;
};

/**
 * Log de auditoría con URL propia (/auditoria), migrado desde la vista interna
 * del dashboard monolítico. Misma UI y datos (API real /api/auditoria).
 */
export default function AuditoriaPage() {
  const [auditLogs, setAuditLogs] = useState<AuditLogRow[]>([]);
  const [auditLoading, setAuditLoading] = useState(true);
  const [auditError, setAuditError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/auditoria?limit=100', { signal: controller.signal })
      .then(async response => {
        const payload = await response.json();
        if (!response.ok || !payload.success) throw new Error(payload.error || 'No se pudo cargar la auditoría.');
        setAuditLogs(Array.isArray(payload.data) ? payload.data : []);
        setAuditError(null);
      })
      .catch(error => {
        if (!controller.signal.aborted) setAuditError(error instanceof Error ? error.message : 'No se pudo cargar la auditoría.');
      })
      .finally(() => {
        if (!controller.signal.aborted) setAuditLoading(false);
      });
    return () => controller.abort();
  }, []);

  return (
    <div className="min-h-screen bg-[#09090b] text-[#f4f4f5] font-sans antialiased selection:bg-teal-500/25 selection:text-teal-200">
      <a href="#contenido-principal" className="skip-link">Saltar al contenido principal</a>

      <AppHeader active="auditoria" />

      <main id="contenido-principal" tabIndex={-1} className="max-w-7xl mx-auto px-4 sm:px-6 py-8 sm:py-10">
        <div className="space-y-8 animate-fadeIn">
          <div className="pb-6 border-b border-dashed border-zinc-800">
            <h1 className="text-3xl font-extrabold tracking-tight text-white">Log de Auditoría y Control Contable</h1>
            <p className="text-zinc-400 text-sm mt-1">Bitácora en tiempo real de transacciones impositivas, cargas de AFIP y variaciones de justificación patrimonial.</p>
          </div>

          <div className="bg-[#121216] border border-zinc-800 rounded-xl overflow-hidden shadow-2xl">
            <div className="p-6 border-b border-zinc-850 bg-zinc-900/10 flex items-center justify-between">
              <span className="text-xs uppercase tracking-wider text-zinc-500 font-bold">Historial de Operaciones</span>
              <span className="text-xs text-zinc-500 font-semibold">Mostrando últimas transacciones</span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-zinc-850 bg-zinc-900/5 text-zinc-450 text-[10px] uppercase font-bold tracking-wider">
                    <th className="px-6 py-4">Fecha / Hora</th>
                    <th className="px-6 py-4">Operación / Evento</th>
                    <th className="px-6 py-4 font-sans">Detalle Técnico Impositivo</th>
                    <th className="px-6 py-4">Responsable</th>
                    <th className="px-6 py-4 text-center">Severidad</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-850/50 text-xs font-mono text-zinc-300">
                  {auditLoading && (
                    <tr><td colSpan={5} className="px-6 py-8 text-center text-zinc-400">Cargando eventos reales de auditoría…</td></tr>
                  )}
                  {auditError && (
                    <tr><td colSpan={5} role="alert" className="px-6 py-8 text-center text-red-300">{auditError}</td></tr>
                  )}
                  {!auditLoading && !auditError && auditLogs.length === 0 && (
                    <tr><td colSpan={5} className="px-6 py-8 text-center text-zinc-500">Todavía no hay eventos registrados.</td></tr>
                  )}
                  {!auditLoading && !auditError && auditLogs.map(log => (
                    <tr key={log.id} className="hover:bg-zinc-800/10 transition-colors">
                      <td className="px-6 py-4 text-zinc-500">{new Date(log.createdAt).toLocaleString('es-AR')}</td>
                      <td className="px-6 py-4 font-sans font-semibold text-white">{log.action} · {log.entityType}</td>
                      <td className="px-6 py-4 font-sans text-zinc-400 whitespace-pre-wrap break-words max-w-xl">{log.details || 'Sin detalle adicional'}</td>
                      <td className="px-6 py-4 font-sans text-zinc-400">{log.userId || log.clientName || log.clientCuit || 'SISTEMA (JABA)'}</td>
                      <td className="px-6 py-4 text-center font-sans">
                        <span className="px-2 py-0.5 rounded text-[9px] font-bold bg-teal-500/10 text-teal-400 border border-teal-500/20 uppercase">Registrado</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </main>

      <footer className="border-t border-[#1e1e24] bg-[#09090b] mt-20 py-8 text-center text-xs text-zinc-500">
        <p>© 2026 JABA Ganancias Impositivas. Todos los derechos reservados. Diseñado bajo normativas AFIP/ARCA Buenos Aires, Argentina.</p>
      </footer>
    </div>
  );
}
