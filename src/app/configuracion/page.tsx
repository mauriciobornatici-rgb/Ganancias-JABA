'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { AlertTriangle, CheckCircle, DatabaseBackup, Info } from 'lucide-react';
import { AppHeader } from '../AppHeader';

type ApiResponse<T> = {
  success: boolean;
  data?: T;
  error?: string;
};

type BackupConfigView = {
  enabled: boolean;
  destinationPath: string;
  frequency: 'DAILY' | 'WEEKLY';
  hour: number;
  weekday: number;
  retentionDays: number;
  lastRunAt: string | null;
  lastRunStatus: string | null;
  lastRunFile: string | null;
};

const WEEKDAYS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

/**
 * Configuración operativa del estudio (/configuracion).
 * Primera sección: backup automático de la base hacia una carpeta local
 * (típicamente la de Google Drive para Escritorio, que sincroniza sola).
 * La app guarda la configuración; el runner en la PC la ejecuta y reporta acá.
 */
export default function ConfiguracionPage() {
  const [config, setConfig] = useState<BackupConfigView | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [notification, setNotification] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const loadConfig = useCallback(() => {
    fetch('/api/backup-config')
      .then(res => res.json() as Promise<ApiResponse<BackupConfigView>>)
      .then(res => {
        if (res.success && res.data) {
          setConfig(res.data);
          setLoadError(null);
        } else {
          setLoadError(res.error || 'No se pudo leer la configuración.');
        }
      })
      .catch(err => {
        console.error('Error cargando configuración de backup:', err);
        setLoadError('No se pudo conectar con el servidor. Reintente.');
      });
  }, []);

  useEffect(() => {
    loadConfig();
  }, [loadConfig]);

  useEffect(() => {
    if (notification) {
      const timer = setTimeout(() => setNotification(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [notification]);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!config) return;
    setIsSaving(true);
    fetch('/api/backup-config', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        enabled: config.enabled,
        destinationPath: config.destinationPath,
        frequency: config.frequency,
        hour: config.hour,
        weekday: config.weekday,
        retentionDays: config.retentionDays,
      }),
    })
      .then(res => res.json())
      .then(res => {
        if (res.success) {
          setNotification({ message: 'Configuración de backup guardada. El runner la aplicará en la próxima corrida.', type: 'success' });
        } else {
          setNotification({ message: `${res.error}`, type: 'error' });
        }
      })
      .catch(err => {
        setNotification({ message: `Error de red al guardar: ${err.message}`, type: 'error' });
      })
      .finally(() => setIsSaving(false));
  };

  const lastRunOk = config?.lastRunStatus === 'OK';

  return (
    <div className="min-h-screen bg-[#09090b] text-[#f4f4f5] font-sans antialiased selection:bg-teal-500/25 selection:text-teal-200">
      <a href="#contenido-principal" className="skip-link">Saltar al contenido principal</a>

      <AppHeader active="configuracion" />

      <main id="contenido-principal" tabIndex={-1} className="max-w-7xl mx-auto px-4 sm:px-6 py-8 sm:py-10">
        <div className="space-y-8 animate-fadeIn">
          <div className="pb-6 border-b border-dashed border-zinc-800">
            <h1 className="text-3xl font-extrabold tracking-tight text-white">Configuración del Estudio</h1>
            <p className="text-zinc-400 text-sm mt-1">Ajustes operativos de la plataforma. Los cambios quedan registrados en la auditoría.</p>
          </div>

          {loadError && (
            <div className="p-4 rounded-lg bg-red-500/10 border border-red-500/30 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="text-sm text-red-300">
                <span className="font-bold block text-red-400">No se pudo cargar la configuración.</span>
                {loadError}
              </div>
              <button onClick={loadConfig} className="shrink-0 px-4 h-9 rounded-lg bg-red-500/20 hover:bg-red-500/30 border border-red-500/40 text-red-200 text-xs font-bold transition-colors cursor-pointer">
                Reintentar
              </button>
            </div>
          )}

          {config && (
            <div className="grid grid-cols-1 lg:grid-cols-[1.2fr_0.8fr] gap-8 items-start">
              {/* FORMULARIO DE BACKUP */}
              <form onSubmit={handleSave} className="bg-[#121216] border border-zinc-800 rounded-xl p-6 shadow-2xl space-y-6">
                <div className="flex items-center gap-3 border-b border-zinc-850 pb-4">
                  <div className="h-10 w-10 rounded-lg bg-teal-500/10 flex items-center justify-center text-teal-400">
                    <DatabaseBackup className="h-5 w-5" />
                  </div>
                  <div>
                    <h2 className="text-base font-bold text-white tracking-tight">Backup automático de la base</h2>
                    <p className="text-xs text-zinc-400 mt-0.5">Copia completa y restaurable de todos los datos fiscales.</p>
                  </div>
                </div>

                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={config.enabled}
                    onChange={(e) => setConfig({ ...config, enabled: e.target.checked })}
                    className="h-5 w-5 rounded bg-zinc-900 border-zinc-700 text-teal-500 focus:ring-teal-500/50 cursor-pointer"
                  />
                  <span className="text-sm font-bold text-white">Backup automático activado</span>
                </label>

                <div className="space-y-2">
                  <label htmlFor="backup-destino" className="text-xs uppercase font-bold text-zinc-400 tracking-wider block">Carpeta de destino</label>
                  <input
                    id="backup-destino"
                    type="text"
                    value={config.destinationPath}
                    onChange={(e) => setConfig({ ...config, destinationPath: e.target.value })}
                    placeholder="Ej: G:\Mi unidad\Backups JABA"
                    className="w-full h-11 px-4 rounded-lg bg-[#09090b] border border-zinc-800 text-sm font-mono text-white focus:outline-none focus:border-teal-500/50 transition-colors"
                  />
                  <p className="text-[11px] text-zinc-500">Usá la carpeta de Google Drive de tu PC y el backup se sube solo a la nube.</p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label htmlFor="backup-frecuencia" className="text-xs uppercase font-bold text-zinc-400 tracking-wider block">Frecuencia</label>
                    <select
                      id="backup-frecuencia"
                      value={config.frequency}
                      onChange={(e) => setConfig({ ...config, frequency: e.target.value === 'WEEKLY' ? 'WEEKLY' : 'DAILY' })}
                      className="w-full h-11 px-4 rounded-lg bg-[#09090b] border border-zinc-800 text-sm text-zinc-300 focus:outline-none focus:border-teal-500/50 transition-colors"
                    >
                      <option value="DAILY">Diaria</option>
                      <option value="WEEKLY">Semanal</option>
                    </select>
                  </div>

                  {config.frequency === 'WEEKLY' ? (
                    <div className="space-y-2">
                      <label htmlFor="backup-dia" className="text-xs uppercase font-bold text-zinc-400 tracking-wider block">Día de la semana</label>
                      <select
                        id="backup-dia"
                        value={config.weekday}
                        onChange={(e) => setConfig({ ...config, weekday: Number(e.target.value) })}
                        className="w-full h-11 px-4 rounded-lg bg-[#09090b] border border-zinc-800 text-sm text-zinc-300 focus:outline-none focus:border-teal-500/50 transition-colors"
                      >
                        {WEEKDAYS.map((name, index) => (
                          <option key={index} value={index}>{name}</option>
                        ))}
                      </select>
                    </div>
                  ) : <div className="hidden sm:block" />}

                  <div className="space-y-2">
                    <label htmlFor="backup-hora" className="text-xs uppercase font-bold text-zinc-400 tracking-wider block">Hora</label>
                    <select
                      id="backup-hora"
                      value={config.hour}
                      onChange={(e) => setConfig({ ...config, hour: Number(e.target.value) })}
                      className="w-full h-11 px-4 rounded-lg bg-[#09090b] border border-zinc-800 text-sm text-zinc-300 focus:outline-none focus:border-teal-500/50 transition-colors"
                    >
                      {Array.from({ length: 24 }, (_, h) => (
                        <option key={h} value={h}>{String(h).padStart(2, '0')}:00</option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-2">
                    <label htmlFor="backup-retencion" className="text-xs uppercase font-bold text-zinc-400 tracking-wider block">Retención (días)</label>
                    <input
                      id="backup-retencion"
                      type="number"
                      min={1}
                      max={365}
                      value={config.retentionDays}
                      onChange={(e) => setConfig({ ...config, retentionDays: Number(e.target.value) })}
                      className="w-full h-11 px-4 rounded-lg bg-[#09090b] border border-zinc-800 text-sm font-mono text-white focus:outline-none focus:border-teal-500/50 transition-colors"
                    />
                    <p className="text-[11px] text-zinc-500">Los backups más viejos que esto se borran solos de la carpeta.</p>
                  </div>
                </div>

                <div className="flex justify-end pt-2 border-t border-zinc-850">
                  <button
                    type="submit"
                    disabled={isSaving}
                    className="px-6 h-11 rounded-lg bg-teal-500 hover:bg-teal-400 text-[#09090b] font-bold text-sm transition-colors shadow-lg shadow-teal-500/10 active:scale-[0.98] disabled:opacity-50 cursor-pointer"
                  >
                    {isSaving ? 'Guardando…' : 'Guardar configuración'}
                  </button>
                </div>
              </form>

              {/* ESTADO Y AYUDA */}
              <div className="space-y-6">
                <div className="bg-[#121216] border border-zinc-800 rounded-xl p-6 shadow-2xl space-y-3">
                  <h3 className="text-xs uppercase font-extrabold text-teal-400 tracking-widest border-b border-zinc-850 pb-2">Último backup automático</h3>
                  {config.lastRunAt ? (
                    <div className="space-y-2 text-sm">
                      <div className="flex items-center gap-2">
                        {lastRunOk
                          ? <CheckCircle className="h-4 w-4 text-emerald-400" />
                          : <AlertTriangle className="h-4 w-4 text-red-400" />}
                        <span className={lastRunOk ? 'font-bold text-emerald-300' : 'font-bold text-red-300'}>
                          {config.lastRunStatus}
                        </span>
                      </div>
                      <p className="text-xs text-zinc-400">{new Date(config.lastRunAt).toLocaleString('es-AR')}</p>
                      {config.lastRunFile && <p className="text-xs font-mono text-zinc-500 break-all">{config.lastRunFile}</p>}
                    </div>
                  ) : (
                    <p className="text-xs text-zinc-500">Todavía no se ejecutó ningún backup automático.</p>
                  )}
                </div>

                <div className="bg-teal-500/5 border border-teal-500/20 rounded-xl p-5 space-y-2 text-xs leading-relaxed text-zinc-300">
                  <div className="flex items-center gap-2 font-bold text-teal-300 uppercase tracking-wider">
                    <Info className="h-4 w-4" />
                    Cómo funciona
                  </div>
                  <p>El backup lo ejecuta un proceso silencioso en la PC del estudio, que revisa esta configuración cada hora. Si la PC está apagada a la hora elegida, el backup corre automáticamente al próximo encendido.</p>
                  <p>Si la carpeta de destino es la de <strong className="text-white">Google Drive para Escritorio</strong>, la copia se sube sola a la nube: doble resguardo (PC + nube) sin hacer nada.</p>
                  <p>También podés generar un backup manual en cualquier momento con <code className="font-mono text-teal-300">npm run db:backup</code> en la carpeta del proyecto.</p>
                </div>
              </div>
            </div>
          )}
        </div>
      </main>

      {notification && (
        <div className={`fixed top-6 right-6 z-[100] flex items-center gap-3 px-5 py-3 rounded-xl shadow-2xl border backdrop-blur-lg transition-all duration-500 animate-fade-in-down ${
          notification.type === 'success'
            ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300'
            : 'bg-red-500/15 border-red-500/30 text-red-300'
        }`}>
          {notification.type === 'success' ? <CheckCircle className="h-5 w-5" /> : <AlertTriangle className="h-5 w-5" />}
          <span className="text-sm font-semibold">{notification.message}</span>
          <button onClick={() => setNotification(null)} className="ml-2 text-zinc-400 hover:text-white transition-colors cursor-pointer">&times;</button>
        </div>
      )}

      <footer className="border-t border-[#1e1e24] bg-[#09090b] mt-20 py-8 text-center text-xs text-zinc-500">
        <p>© 2026 JABA Ganancias Impositivas. Todos los derechos reservados. Diseñado bajo normativas AFIP/ARCA Buenos Aires, Argentina.</p>
      </footer>
    </div>
  );
}
