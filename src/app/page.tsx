'use client';

import React, { useState, useEffect, useCallback, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  Users,
  AlertTriangle,
  Plus,
  Search,
  ArrowUpRight,
  CheckCircle,
  Clock,
  FolderOpen,
  Calendar,
  Trash2
} from 'lucide-react';
import Link from 'next/link';
import { AppHeader } from './AppHeader';
import {
  buildWizardLocalDraftKey,
  safeRemoveWizardLocalDraft,
} from '@/domain/ganancias/presentation/wizardDraftRecovery';

type Numberish = string | number | null | undefined | { toNumber: () => number };

type ApiResponse<T> = {
  success: boolean;
  data?: T;
  error?: string;
};

type ClientRow = {
  id: string;
  cuit: string;
  name: string;
  type: string;
  fiscalCondition: string;
  mainActivity?: string | null;
  status?: string | null;
};

type TaxReturnRow = {
  id: string;
  clientId?: string;
  clientName: string;
  cuit: string;
  year: number | null;
  status: string;
  consumoCalculado?: Numberish;
  impuestoAPagar?: Numberish;
  hasWarnings?: boolean;
};

type ResolutionOption = {
  id: string;
  resolution: string;
  version: number;
};

type TaxParameterSetView = {
  minimoNoImponible: Numberish;
  conyuge: Numberish;
  hijo: Numberish;
  hijoIncapacitado: Numberish;
  especialAutonomo: Numberish;
  especialEmprendedor: Numberish;
  especialDependiente: Numberish;
  topeServicioDomestico: Numberish;
  topeSeguroVida: Numberish;
  topeSeguroRetiro: Numberish;
  topeGastosSepelio: Numberish;
  topeInteresHipoteca: Numberish;
  topeGastosEducativos: Numberish;
};

type TaxBracketView = {
  id?: string;
  fromAmount: Numberish;
  toAmount: Numberish;
  fixedAmount: Numberish;
  percentage: Numberish;
  excessOf: Numberish;
};

type IpcIndexView = {
  monthIndex: number;
  monthName: string;
  ipcValue: Numberish;
};

type TaxParametersView = {
  parameterSet: TaxParameterSetView | null;
  brackets: TaxBracketView[];
  indices: IpcIndexView[];
};

function isDecimalLike(value: Numberish): value is { toNumber: () => number } {
  return typeof value === 'object' && value !== null && typeof value.toNumber === 'function';
}

export default function Page() {
  // useSearchParams exige un límite de Suspense para el prerender estático.
  return (
    <Suspense fallback={null}>
      <Home />
    </Suspense>
  );
}

function Home() {
  const searchParams = useSearchParams();
  // ?buscar= permite llegar desde /clientes con el filtro de liquidaciones precargado.
  const [searchTerm, setSearchTerm] = useState(() => searchParams.get('buscar') ?? '');
  const [activeTab, setActiveTab] = useState<'todos' | 'borrador' | 'revision' | 'cerrada'>('todos');
  const router = useRouter();

  // Compatibilidad con URLs viejas: /?view=parametros|auditoria hoy son rutas propias.
  const legacyView = searchParams.get('view');
  useEffect(() => {
    if (legacyView === 'parametros' || legacyView === 'auditoria') {
      router.replace(`/${legacyView}`);
    }
  }, [legacyView, router]);

  const [clients, setClients] = useState<ClientRow[]>([]);
  const [taxReturns, setTaxReturns] = useState<TaxReturnRow[]>([]);

  // Parámetros vigentes solo para la tarjeta "Período Activo" del dashboard
  // (la gestión completa vive en /parametros).
  const [paramsData, setParamsData] = useState<TaxParametersView | null>(null);
  const [notification, setNotification] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [dashboardError, setDashboardError] = useState<string | null>(null);


  // P31.1: la carga del dashboard ya no traga errores. Si una API falla o devuelve
  // success:false (p.ej. sesion vencida -> 401), se muestra un aviso con reintento
  // en lugar de renderizar ceros como si la base estuviera vacia.
  const loadDashboardData = useCallback(() => {
    setDashboardError(null);
    Promise.all([
      fetch('/api/clientes').then(res => res.json() as Promise<ApiResponse<ClientRow[]>>),
      fetch('/api/declaraciones').then(res => res.json() as Promise<ApiResponse<TaxReturnRow[]>>)
    ])
    .then(([clientsRes, returnsRes]) => {
      const errors: string[] = [];
      if (clientsRes.success && Array.isArray(clientsRes.data)) {
        setClients(clientsRes.data);
      } else {
        errors.push(clientsRes.error || 'No se pudieron obtener los contribuyentes.');
      }
      if (returnsRes.success && Array.isArray(returnsRes.data)) {
        setTaxReturns(returnsRes.data);
      } else {
        errors.push(returnsRes.error || 'No se pudieron obtener las declaraciones.');
      }
      if (errors.length > 0) {
        setDashboardError(errors.join(' '));
      }
    })
    .catch(err => {
      console.error("Error loading dashboard data:", err);
      setDashboardError('No se pudo conectar con el servidor. Los totales en cero pueden no reflejar la base real.');
    });
  }, []);

  // Auto-dismiss notification after 5s
  useEffect(() => {
    if (notification) {
      const timer = setTimeout(() => setNotification(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [notification]);

  // Carga los parámetros de la última resolución 2025 para la tarjeta del dashboard.
  const loadActivePeriodParameters = useCallback(() => {
    fetch('/api/parametros?year=2025&listResolutions=true')
      .then(res => res.json() as Promise<ApiResponse<ResolutionOption[]>>)
      .then(res => {
        const resolutionId = (res.success && Array.isArray(res.data) && res.data[0]?.id) || 'default';
        return fetch(`/api/parametros?year=2025&resolutionId=${resolutionId}`);
      })
      .then(res => res.json() as Promise<ApiResponse<TaxParametersView>>)
      .then(res => setParamsData(res.success && res.data ? res.data : null))
      .catch(err => {
        console.error('Error cargando parámetros del período activo:', err);
        setParamsData(null);
      });
  }, []);

  useEffect(() => {
    queueMicrotask(() => {
      loadDashboardData();
      loadActivePeriodParameters();
    });
  }, [loadDashboardData, loadActivePeriodParameters]);

  const formatCurrency = (val: Numberish) => {
    const num = Number(val);
    if (Number.isNaN(num)) return '$0,00';
    return '$' + num.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  const getNumber = (val: Numberish) => {
    if (val === null || val === undefined) return 0;
    if (isDecimalLike(val)) {
      return val.toNumber();
    }
    const parsed = Number(val);
    return Number.isNaN(parsed) ? 0 : parsed;
  };

  const isDashboardImmutableReturn = (status: string) => (
    status === 'Cerrada' ||
    status === 'Presentada' ||
    status === 'Rectificada'
  );

  const removeLocalWizardDraft = (returnId: string) => {
    if (typeof window === 'undefined') return;
    safeRemoveWizardLocalDraft(localStorage, buildWizardLocalDraftKey(returnId));
  };

  const handleDeleteReturn = (returnId: string, clientName: string, year: number) => {
    const confirmDelete = window.confirm(`¿Está seguro que desea anular la declaración jurada del año ${year} para el contribuyente "${clientName}"? La DDJJ no se borrará de la base de datos; quedará archivada como anulada para auditoría.`);
    if (!confirmDelete) return;

    const reason = window.prompt('Indique el motivo de la anulación. Ejemplo: DDJJ duplicada por error de carga.');
    if (!reason || reason.trim().length === 0) {
      setNotification({ message: 'La anulación fue cancelada: el motivo es obligatorio.', type: 'error' });
      return;
    }

    fetch(`/api/declaraciones/${returnId}?reason=${encodeURIComponent(reason.trim())}`, {
      method: 'DELETE',
    })
      .then(res => res.json())
      .then(res => {
        if (res.success) {
          setNotification({
            message: `Declaración jurada de ${clientName} (${year}) anulada con éxito. No fue borrada de la base.`,
            type: 'success'
          });
          removeLocalWizardDraft(returnId);
          setTaxReturns(prev => prev.filter(r => r.id !== returnId));
        } else {
          setNotification({
            message: `Error al eliminar: ${res.error}`,
            type: 'error'
          });
        }
      })
      .catch(err => {
        console.error("Error deleting return:", err);
        setNotification({
          message: `Error de red al eliminar: ${err.message}`,
          type: 'error'
        });
      });
  };

  // Filtrar declaraciones juradas según búsqueda y pestañas
  const filteredReturns = taxReturns.filter(ret => {
    const matchesSearch = ret.clientName.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          ret.cuit.includes(searchTerm);
    
    if (activeTab === 'todos') return matchesSearch;
    if (activeTab === 'borrador') return matchesSearch && ret.status === 'Borrador';
    if (activeTab === 'revision') return matchesSearch && ret.status === 'En Revisión';
    if (activeTab === 'cerrada') return matchesSearch && isDashboardImmutableReturn(ret.status);
    return matchesSearch;
  });

  const activeClients = clients.filter(client => client.status !== 'Inactivo');
  const inactiveClients = clients.filter(client => client.status === 'Inactivo');

  return (
    <div className="min-h-screen bg-[#09090b] text-[#f4f4f5] font-sans antialiased selection:bg-teal-500/25 selection:text-teal-200 font-sans">
      <a href="#contenido-principal" className="skip-link">Saltar al contenido principal</a>

      <AppHeader active="dashboard" />

      {/* DASHBOARD PRINCIPAL */}
      <main id="contenido-principal" tabIndex={-1} className="max-w-7xl mx-auto px-4 sm:px-6 py-8 sm:py-10">
        
        <>
            {/* P31.1: AVISO VISIBLE SI LA CARGA DE DATOS FALLO (evita "base vacia" enganosa) */}
            {dashboardError && (
              <div className="mb-8 p-4 rounded-lg bg-red-500/10 border border-red-500/30 flex flex-col sm:flex-row sm:items-center justify-between gap-3 animate-fadeIn">
                <div className="text-sm text-red-300">
                  <span className="font-bold block text-red-400">No se pudieron cargar los datos del estudio.</span>
                  <span className="text-red-300/80">{dashboardError}</span>
                </div>
                <button
                  onClick={loadDashboardData}
                  className="shrink-0 px-4 h-9 rounded-lg bg-red-500/20 hover:bg-red-500/30 border border-red-500/40 text-red-200 text-xs font-bold transition-colors cursor-pointer"
                >
                  Reintentar
                </button>
              </div>
            )}

            {/* ENCABEZADO DE BIENVENIDA */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-10 pb-6 border-b border-dashed border-zinc-800">
              <div>
                <h1 className="text-3xl font-extrabold tracking-tight text-white animate-fadeIn">Consola de Liquidación</h1>
                <p className="text-zinc-400 text-sm mt-1">Gestione las declaraciones juradas del Impuesto a las Ganancias de Tercera Categoría.</p>
              </div>
              
              {/* BOTÓN PARA INICIAR ASISTENTE DE Carga (10 Pasos) */}
              <Link 
                href="/declaraciones/crear/wizard"
                className="flex items-center justify-center gap-2 px-5 h-11 rounded-lg bg-teal-500 hover:bg-teal-400 text-[#09090b] font-semibold text-sm transition-all shadow-lg hover:shadow-teal-500/20 active:scale-[0.98]"
              >
                <Plus className="h-5 w-5 stroke-[2.5]" />
                Nueva Liquidación
              </Link>
            </div>

            {/* CONTENEDOR DE TARJETAS DE MÉTRICAS (STITCH AESTHETIC - GLASSMORPHISM) */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-10">
              
              {/* Tarjeta 1: Clientes */}
              <Link
                href="/clientes"
                className="text-left bg-[#121216] border border-zinc-800 hover:border-zinc-700 transition-all rounded-xl p-5 relative overflow-hidden group focus:outline-none w-full cursor-pointer block"
              >
                <div className="absolute top-0 right-0 h-24 w-24 bg-teal-500/5 rounded-full blur-2xl group-hover:bg-teal-500/10 transition-all"></div>
                <div className="flex items-center justify-between mb-4">
                  <span className="text-xs uppercase tracking-wider text-zinc-500 font-semibold">Contribuyentes</span>
                  <div className="h-8 w-8 rounded-lg bg-teal-500/10 flex items-center justify-center text-teal-400">
                    <Users className="h-4 w-4" />
                  </div>
                </div>
                <h2 className="text-3xl font-bold text-white tracking-tight">{activeClients.length}</h2>
                <p className="text-zinc-500 text-xs mt-1">
                  {activeClients.length} activos · {inactiveClients.length} dados de baja
                </p>
              </Link>

              {/* Tarjeta 2: DDJJ en Proceso */}
              <div className="bg-[#121216] border border-zinc-800 hover:border-zinc-700 transition-all rounded-xl p-5 relative overflow-hidden group">
                <div className="absolute top-0 right-0 h-24 w-24 bg-amber-500/5 rounded-full blur-2xl group-hover:bg-amber-500/10 transition-all"></div>
                <div className="flex items-center justify-between mb-4">
                  <span className="text-xs uppercase tracking-wider text-zinc-500 font-semibold">En Proceso (2025)</span>
                  <div className="h-8 w-8 rounded-lg bg-amber-500/10 flex items-center justify-center text-amber-400">
                    <Clock className="h-4 w-4" />
                  </div>
                </div>
                <h2 className="text-3xl font-bold text-white tracking-tight">
                  {taxReturns.filter(r => r.year === 2025 && !isDashboardImmutableReturn(r.status)).length}
                </h2>
                <p className="text-zinc-500 text-xs mt-1">En proceso de liquidación</p>
              </div>

              {/* Tarjeta 3: Inconsistencias Alertadas */}
              <Link
                href="/?view=auditoria"
                className="text-left bg-[#121216] border border-zinc-800 hover:border-zinc-700 transition-all rounded-xl p-5 relative overflow-hidden group focus:outline-none w-full cursor-pointer block"
              >
                <div className="absolute top-0 right-0 h-24 w-24 bg-red-500/5 rounded-full blur-2xl group-hover:bg-red-500/10 transition-all"></div>
                <div className="flex items-center justify-between mb-4">
                  <span className="text-xs uppercase tracking-wider text-zinc-500 font-semibold">Alertas Críticas</span>
                  <div className="h-8 w-8 rounded-lg bg-red-500/10 flex items-center justify-center text-red-400">
                    <AlertTriangle className="h-4 w-4" />
                  </div>
                </div>
                <h2 className="text-3xl font-bold text-white tracking-tight">
                  {taxReturns.filter(r => r.hasWarnings).length}
                </h2>
                <p className="text-zinc-500 text-xs mt-1">Inconsistencia patrimonial (Consumo)</p>
              </Link>

              {/* Tarjeta 4: Completadas */}
              <div className="bg-[#121216] border border-zinc-800 hover:border-zinc-700 transition-all rounded-xl p-5 relative overflow-hidden group">
                <div className="absolute top-0 right-0 h-24 w-24 bg-emerald-500/5 rounded-full blur-2xl group-hover:bg-emerald-500/10 transition-all"></div>
                <div className="flex items-center justify-between mb-4">
                  <span className="text-xs uppercase tracking-wider text-zinc-500 font-semibold">Cerradas e Inmutables</span>
                  <div className="h-8 w-8 rounded-lg bg-emerald-500/10 flex items-center justify-center text-emerald-400">
                    <CheckCircle className="h-4 w-4" />
                  </div>
                </div>
                <h2 className="text-3xl font-bold text-white tracking-tight">
                  {taxReturns.filter(r => isDashboardImmutableReturn(r.status)).length}
                </h2>
                <p className="text-zinc-500 text-xs mt-1">Períodos cerrados</p>
              </div>
            </div>

            {/* SECCIÓN INTERACTIVA DE DECLARACIONES JURADAS */}
            <div className="bg-[#121216] border border-zinc-800 rounded-xl overflow-hidden shadow-2xl">
              
              {/* TAB BAR Y BUSCADOR */}
              <div className="p-6 border-b border-zinc-850 flex flex-col sm:flex-row items-center justify-between gap-4">
                
                {/* Pestañas de Filtro (Stitch Tab Style) */}
                <div className="flex bg-[#09090b] p-1 rounded-lg border border-zinc-800 w-full sm:w-auto">
                  <button 
                    onClick={() => setActiveTab('todos')}
                    className={`flex-1 sm:flex-none px-4 py-1.5 text-xs font-semibold rounded-md transition-all ${activeTab === 'todos' ? 'bg-zinc-800 text-white shadow-sm' : 'text-zinc-400 hover:text-zinc-200'}`}
                  >
                    Todos
                  </button>
                  <button 
                    onClick={() => setActiveTab('borrador')}
                    className={`flex-1 sm:flex-none px-4 py-1.5 text-xs font-semibold rounded-md transition-all ${activeTab === 'borrador' ? 'bg-zinc-800 text-white shadow-sm' : 'text-zinc-400 hover:text-zinc-200'}`}
                  >
                    Borradores
                  </button>
                  <button 
                    onClick={() => setActiveTab('revision')}
                    className={`flex-1 sm:flex-none px-4 py-1.5 text-xs font-semibold rounded-md transition-all ${activeTab === 'revision' ? 'bg-zinc-800 text-white shadow-sm' : 'text-zinc-400 hover:text-zinc-200'}`}
                  >
                    En Revisión
                  </button>
                  <button 
                    onClick={() => setActiveTab('cerrada')}
                    className={`flex-1 sm:flex-none px-4 py-1.5 text-xs font-semibold rounded-md transition-all ${activeTab === 'cerrada' ? 'bg-zinc-800 text-white shadow-sm' : 'text-zinc-400 hover:text-zinc-200'}`}
                  >
                    Cerrados
                  </button>
                </div>

                {/* Caja de Búsqueda */}
                <div className="relative w-full sm:w-72">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
                  <input 
                    type="text" 
                    placeholder="Buscar contribuyente o CUIT..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full h-9 pl-9 pr-4 rounded-lg bg-[#09090b] border border-zinc-800 text-sm placeholder-zinc-500 text-white focus:outline-none focus:border-teal-500/50 transition-colors"
                  />
                </div>
              </div>

              {/* LISTA DE DECLARACIONES EN TABLA */}
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-zinc-850 bg-zinc-900/10 text-zinc-400 text-[10px] uppercase font-bold tracking-wider">
                      <th className="px-6 py-4">Contribuyente</th>
                      <th className="px-6 py-4">CUIT</th>
                      <th className="px-6 py-4">Período</th>
                      <th className="px-6 py-4 text-center">Estado</th>
                      <th className="px-6 py-4 text-right">Consumo Proyectado</th>
                      <th className="px-6 py-4 text-right">Impuesto Determinado</th>
                      <th className="px-6 py-4 text-center">Control / Alertas</th>
                      <th className="px-6 py-4 text-right">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-850/50">
                    {filteredReturns.length > 0 ? (
                      filteredReturns.map((ret) => (
                        <tr key={ret.id} className="hover:bg-zinc-800/10 transition-colors group">
                          <td className="px-6 py-4 font-semibold text-white text-sm">
                            {ret.clientName}
                          </td>
                          <td className="px-6 py-4 text-xs font-mono text-zinc-400">
                            {ret.cuit}
                          </td>
                          <td className="px-6 py-4 text-sm font-semibold text-teal-400">
                            {ret.year}
                          </td>
                          <td className="px-6 py-4 text-center">
                            <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                              ret.status === 'Borrador' ? 'bg-zinc-800 text-zinc-300 border border-zinc-700' :
                              ret.status === 'En Revisión' ? 'bg-amber-500/10 text-amber-300 border border-amber-500/20' :
                              'bg-emerald-500/10 text-emerald-300 border border-emerald-500/20'
                            }`}>
                              {ret.status}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-right text-sm font-mono font-semibold text-zinc-300">
                            ${getNumber(ret.consumoCalculado).toLocaleString('es-AR')}
                          </td>
                          <td className="px-6 py-4 text-right text-sm font-mono font-bold text-white">
                            ${getNumber(ret.impuestoAPagar).toLocaleString('es-AR')}
                          </td>
                          <td className="px-6 py-4 text-center">
                            {ret.hasWarnings ? (
                              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-red-500/10 text-red-400 border border-red-500/20">
                                <AlertTriangle className="h-3.5 w-3.5" />
                                Consumo Negativo / Descuadre JVP
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                                <CheckCircle className="h-3.5 w-3.5" />
                                Consistencia Aprobada
                              </span>
                            )}
                          </td>
                          <td className="px-6 py-4 text-right">
                            <div className="flex gap-2 justify-end">
                              <Link 
                                href={isDashboardImmutableReturn(ret.status) ? `/declaraciones/${ret.id}/papel-de-trabajo` : `/declaraciones/${ret.id}/wizard`}
                                className="inline-flex items-center justify-center h-8 px-3 rounded bg-zinc-800 hover:bg-zinc-750 border border-zinc-700 text-xs font-bold text-teal-400 group-hover:border-teal-500/30 transition-all active:scale-[0.97]"
                              >
                                {isDashboardImmutableReturn(ret.status) ? 'Papel Trabajo' : 'Continuar'}
                                <ArrowUpRight className="ml-1 h-3.5 w-3.5" />
                              </Link>
                              {isDashboardImmutableReturn(ret.status) && (
                                <Link 
                                  href={`/declaraciones/${ret.id}/informe-cliente`}
                                  className="inline-flex items-center justify-center h-8 px-3 rounded bg-teal-950/20 hover:bg-teal-900/35 border border-teal-500/25 text-xs font-bold text-teal-300 hover:border-teal-500/40 transition-all active:scale-[0.97]"
                                >
                                  Informe Cliente
                                </Link>
                              )}
                              <button
                                onClick={() => handleDeleteReturn(ret.id, ret.clientName, ret.year ?? 2025)}
                                className="inline-flex items-center justify-center h-8 w-8 rounded bg-red-950/20 hover:bg-red-900/35 border border-red-500/25 hover:border-red-500/40 text-red-400 transition-all active:scale-[0.97] cursor-pointer"
                                title="Anular declaración jurada"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={8} className="px-6 py-12 text-center text-zinc-500 text-sm">
                          No se encontraron declaraciones juradas que coincidan con los filtros aplicados.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* NOTIFICACIONES Y PROCEDIMIENTO TÉCNICO IMPOSTIVO (STITCH BOX) */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mt-10">
              
              {/* Col 1 & 2: Procedimiento AFIP */}
              <div className="lg:col-span-2 bg-[#121216] border border-zinc-800 rounded-xl p-6 relative animate-fadeIn">
                <h3 className="text-base font-bold text-white mb-4 flex items-center gap-2">
                  <FolderOpen className="h-5 w-5 text-teal-400" />
                  Procedimiento Impositivo Híbrido AFIP/ARCA
                </h3>
                
                <div className="space-y-4 text-sm text-zinc-400">
                  <p>
                    Para evitar fallos por inestabilidades y captchas en el portal impositivo, la aplicación utiliza una 
                    <strong> Carga Híbrida Segura y Manual</strong>, totalmente libre de mantenimiento y scrapers inestables:
                  </p>
                  
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-2">
                    <div className="p-4 rounded-lg bg-[#09090b] border border-zinc-805">
                      <span className="text-[10px] font-bold text-teal-400 uppercase tracking-widest block mb-1">Paso 1: AFIP</span>
                      <p className="text-xs text-zinc-400 leading-normal">Descargue localmente los excels oficiales de ARCA (Libro IVA Ventas/Compras y Retenciones).</p>
                    </div>
                    <div className="p-4 rounded-lg bg-[#09090b] border border-zinc-805">
                      <span className="text-[10px] font-bold text-teal-400 uppercase tracking-widest block mb-1">Paso 2: Subida</span>
                      <p className="text-xs text-zinc-400 leading-normal">Suba el archivo en el paso correspondiente. El sistema detecta y mapea la estructura de AFIP.</p>
                    </div>
                    <div className="p-4 rounded-lg bg-[#09090b] border border-zinc-805">
                      <span className="text-[10px] font-bold text-teal-400 uppercase tracking-widest block mb-1">Paso 3: Control</span>
                      <p className="text-xs text-zinc-400 leading-normal">Revise, edite, agregue o elimine filas en la grilla interactiva antes de confirmar a la base de datos.</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Col 3: Parámetros del Período Activo */}
              <Link
                href="/?view=parametros"
                className="text-left bg-[#121216] border border-zinc-800 rounded-xl p-6 hover:border-zinc-700 transition-all focus:outline-none w-full cursor-pointer animate-fadeIn block"
              >
                <h3 className="text-base font-bold text-white mb-4 flex items-center gap-2">
                  <Calendar className="h-5 w-5 text-teal-400" />
                  Período Activo 2025
                </h3>
                
                <div className="space-y-3.5 text-xs">
                  <div className="flex justify-between pb-2 border-b border-zinc-850">
                    <span className="text-zinc-500">Mínimo No Imponible:</span>
                    <span className="font-mono text-zinc-300 font-bold">
                      {paramsData?.parameterSet ? formatCurrency(paramsData.parameterSet.minimoNoImponible) : '$4.507.505,52'}
                    </span>
                  </div>
                  <div className="flex justify-between pb-2 border-b border-zinc-850">
                    <span className="text-zinc-500">Cónyuge a cargo:</span>
                    <span className="font-mono text-zinc-300 font-bold">
                      {paramsData?.parameterSet ? formatCurrency(paramsData.parameterSet.conyuge) : '$4.245.166,13'}
                    </span>
                  </div>
                  <div className="flex justify-between pb-2 border-b border-zinc-850">
                    <span className="text-zinc-500">Hijo a cargo:</span>
                    <span className="font-mono text-zinc-300 font-bold">
                      {paramsData?.parameterSet ? formatCurrency(paramsData.parameterSet.hijo) : '$2.140.852,77'}
                    </span>
                  </div>
                  <div className="flex justify-between pb-2 border-b border-zinc-850">
                    <span className="text-zinc-500">Deducción Especial Autónoma:</span>
                    <span className="font-mono text-zinc-300 font-bold">
                      {paramsData?.parameterSet ? formatCurrency(paramsData.parameterSet.especialAutonomo) : '$15.776.269,32'}
                    </span>
                  </div>
                  <div className="flex justify-between pt-1">
                    <span className="text-zinc-500">Tope Serv. Doméstico:</span>
                    <span className="font-mono text-teal-400 font-bold">
                      {paramsData?.parameterSet ? formatCurrency(paramsData.parameterSet.topeServicioDomestico) : '$4.507.505,52'}
                    </span>
                  </div>
                </div>
              </Link>
            </div>
        </>

      </main>

      {/* TOAST NOTIFICATION (TOP-RIGHT GLASSMORPHIC) */}
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

      {/* FOOTER */}
      <footer className="border-t border-[#1e1e24] bg-[#09090b] mt-20 py-8 text-center text-xs text-zinc-500">
        <p>© 2026 JABA Ganancias Impositivas. Todos los derechos reservados. Diseñado bajo normativas AFIP/ARCA Buenos Aires, Argentina.</p>
      </footer>
      
    </div>
  );
}

