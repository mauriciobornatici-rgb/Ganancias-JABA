'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  AlertTriangle,
  CheckCircle,
  FileSpreadsheet,
  RefreshCw,
  Settings,
  Upload,
} from 'lucide-react';
import { AppHeader } from '../AppHeader';

type Numberish = string | number | null | undefined | { toNumber: () => number };

type ApiResponse<T> = {
  success: boolean;
  data?: T;
  error?: string;
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

type EditParametersForm = {
  minimoNoImponible: string;
  conyuge: string;
  hijo: string;
  hijoIncapacitado: string;
  especialAutonomo: string;
  especialEmprendedor: string;
  especialDependiente: string;
  topeServicioDomestico: string;
  topeSeguroVida: string;
  topeSeguroRetiro: string;
  topeGastosSepelio: string;
  topeInteresHipoteca: string;
  topeGastosEducativos: string;
  brackets: TaxBracketView[];
};

/**
 * Parámetros normativos con URL propia (/parametros), migrados desde la vista
 * interna del dashboard monolítico. Misma UI y comportamiento: selector de año
 * y resolución, carga de base interna, importador Excel y edición manual
 * (que versiona: crea un set nuevo, nunca reescribe normativa histórica).
 */
export default function ParametrosPage() {
  const [selectedYear, setSelectedYear] = useState<number>(2025);
  const [paramsData, setParamsData] = useState<TaxParametersView | null>(null);
  const [resolutions, setResolutions] = useState<ResolutionOption[]>([]);
  const [selectedResolutionId, setSelectedResolutionId] = useState<string>('default');
  const [isUploadingParams, setIsUploadingParams] = useState(false);
  const [uploadParamsName, setUploadParamsName] = useState('');
  const [uploadParamsYear, setUploadParamsYear] = useState<number>(2025);
  const [selectedParamsFile, setSelectedParamsFile] = useState<File | null>(null);
  const [isParamsLoading, setIsParamsLoading] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [showEditParamsModal, setShowEditParamsModal] = useState(false);
  const [editForm, setEditForm] = useState<EditParametersForm | null>(null);
  const [notification, setNotification] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  useEffect(() => {
    if (notification) {
      const timer = setTimeout(() => setNotification(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [notification]);

  const loadParameters = useCallback((year: number, resolutionId?: string) => {
    setIsParamsLoading(true);
    fetch(`/api/parametros?year=${year}&resolutionId=${resolutionId || 'default'}`)
      .then(res => res.json() as Promise<ApiResponse<TaxParametersView>>)
      .then(res => {
        if (res.success && res.data) {
          setParamsData(res.data);
        } else {
          setParamsData(null);
        }
      })
      .catch(err => {
        console.error('Error cargando parámetros:', err);
        setParamsData(null);
      })
      .finally(() => setIsParamsLoading(false));
  }, []);

  const loadResolutions = useCallback((year: number, defaultResId?: string) => {
    fetch(`/api/parametros?year=${year}&listResolutions=true`)
      .then(res => res.json() as Promise<ApiResponse<ResolutionOption[]>>)
      .then(res => {
        if (res.success && Array.isArray(res.data)) {
          setResolutions(res.data);
          if (res.data.length > 0) {
            const targetId = defaultResId || res.data[0].id;
            setSelectedResolutionId(targetId);
            loadParameters(year, targetId);
          } else {
            setSelectedResolutionId('default');
            loadParameters(year, 'default');
          }
        } else {
          setResolutions([]);
          setSelectedResolutionId('default');
          loadParameters(year, 'default');
        }
      })
      .catch(err => {
        console.error('Error cargando resoluciones:', err);
        setResolutions([]);
        setSelectedResolutionId('default');
        loadParameters(year, 'default');
      });
  }, [loadParameters]);

  useEffect(() => {
    loadResolutions(selectedYear);
  }, [selectedYear, loadResolutions]);

  const handleLoadInternalBaseParameters = () => {
    setIsSyncing(true);
    fetch('/api/parametros', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ year: selectedYear })
    })
      .then(res => res.json())
      .then(res => {
        if (res.success) {
          setNotification({
            message: `Parámetros base internos del Período Fiscal ${selectedYear} cargados. Verificá/importá normativa oficial antes de presentar.`,
            type: 'success'
          });
          loadParameters(selectedYear, selectedResolutionId);
        } else {
          setNotification({
            message: `Error al cargar parámetros base: ${res.error}`,
            type: 'error'
          });
        }
      })
      .catch(err => {
        console.error('Error loading internal base parameters:', err);
        setNotification({
          message: `Error de red al cargar parámetros base: ${err.message}`,
          type: 'error'
        });
      })
      .finally(() => setIsSyncing(false));
  };

  const handleParamsUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedParamsFile(file);
      setNotification({
        message: `Archivo seleccionado con éxito: ${file.name}`,
        type: 'success'
      });
    }
  };

  const submitParamsImport = () => {
    if (!selectedParamsFile) {
      alert('Por favor seleccione un archivo Excel.');
      return;
    }
    if (!uploadParamsName.trim()) {
      alert('Por favor ingrese el nombre o número de la resolución.');
      return;
    }

    setIsUploadingParams(true);
    const formData = new FormData();
    formData.append('file', selectedParamsFile);
    formData.append('year', uploadParamsYear.toString());
    formData.append('resolutionName', uploadParamsName);

    fetch('/api/parametros/import', {
      method: 'POST',
      body: formData
    })
      .then(res => res.json())
      .then(res => {
        if (res.success) {
          setNotification({
            message: res.message || '¡Parámetros impositivos importados con éxito!',
            type: 'success'
          });
          setUploadParamsName('');
          setSelectedParamsFile(null);
          // Reinicializar el input de archivo
          const fileInput = document.getElementById('excel-params-file') as HTMLInputElement;
          if (fileInput) fileInput.value = '';

          // Recargar resoluciones del año seleccionado e ir a ella
          setSelectedYear(uploadParamsYear);
          loadResolutions(uploadParamsYear, res.data?.id);
        } else {
          setNotification({
            message: `Error al importar: ${res.error}`,
            type: 'error'
          });
        }
      })
      .catch(err => {
        console.error('Error importing params:', err);
        setNotification({
          message: `Error de red al importar: ${err.message}`,
          type: 'error'
        });
      })
      .finally(() => setIsUploadingParams(false));
  };

  const openEditModal = () => {
    if (!paramsData || !paramsData.parameterSet) {
      alert('No hay parámetros cargados para este año. Sincronice primero.');
      return;
    }
    const ps = paramsData.parameterSet;
    setEditForm({
      minimoNoImponible: String(ps.minimoNoImponible ?? ''),
      conyuge: String(ps.conyuge ?? ''),
      hijo: String(ps.hijo ?? ''),
      hijoIncapacitado: String(ps.hijoIncapacitado ?? ''),
      especialAutonomo: String(ps.especialAutonomo ?? ''),
      especialEmprendedor: String(ps.especialEmprendedor ?? ''),
      especialDependiente: String(ps.especialDependiente ?? ''),
      topeServicioDomestico: String(ps.topeServicioDomestico ?? ''),
      topeSeguroVida: String(ps.topeSeguroVida ?? ''),
      topeSeguroRetiro: String(ps.topeSeguroRetiro ?? ''),
      topeGastosSepelio: String(ps.topeGastosSepelio ?? ''),
      topeInteresHipoteca: String(ps.topeInteresHipoteca ?? ''),
      topeGastosEducativos: String(ps.topeGastosEducativos ?? ''),
      brackets: [...paramsData.brackets]
    });
    setShowEditParamsModal(true);
  };

  const handleSaveParams = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editForm) return;

    fetch('/api/parametros', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        year: selectedYear,
        parameterSet: {
          minimoNoImponible: parseFloat(editForm.minimoNoImponible),
          conyuge: parseFloat(editForm.conyuge),
          hijo: parseFloat(editForm.hijo),
          hijoIncapacitado: parseFloat(editForm.hijoIncapacitado),
          especialAutonomo: parseFloat(editForm.especialAutonomo),
          especialEmprendedor: parseFloat(editForm.especialEmprendedor),
          especialDependiente: parseFloat(editForm.especialDependiente),
          topeServicioDomestico: parseFloat(editForm.topeServicioDomestico),
          topeSeguroVida: parseFloat(editForm.topeSeguroVida),
          topeSeguroRetiro: parseFloat(editForm.topeSeguroRetiro),
          topeGastosSepelio: parseFloat(editForm.topeGastosSepelio),
          topeInteresHipoteca: parseFloat(editForm.topeInteresHipoteca),
          topeGastosEducativos: parseFloat(editForm.topeGastosEducativos)
        },
        brackets: editForm.brackets
      })
    })
      .then(res => res.json())
      .then(res => {
        if (res.success) {
          setNotification({
            message: '¡Parámetros impositivos actualizados y guardados con éxito en la base de datos!',
            type: 'success'
          });
          setShowEditParamsModal(false);
          loadResolutions(selectedYear);
        } else {
          setNotification({
            message: `Error al guardar parámetros: ${res.error}`,
            type: 'error'
          });
        }
      })
      .catch(err => {
        console.error('Error saving parameters:', err);
        setNotification({
          message: `Error de red al guardar: ${err.message}`,
          type: 'error'
        });
      });
  };

  const formatCurrency = (val: Numberish) => {
    const num = Number(val);
    if (Number.isNaN(num)) return '$0,00';
    return '$' + num.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  const formatPercent = (val: Numberish) => {
    const num = Number(val);
    if (Number.isNaN(num)) return '0%';
    // Si viene como decimal (e.g. 0.05) multiplicamos por 100
    const pct = num <= 1 ? num * 100 : num;
    return `${pct.toFixed(0)}%`;
  };

  return (
    <div className="min-h-screen bg-[#09090b] text-[#f4f4f5] font-sans antialiased selection:bg-teal-500/25 selection:text-teal-200">
      <a href="#contenido-principal" className="skip-link">Saltar al contenido principal</a>

      <AppHeader active="parametros" />

      <main id="contenido-principal" tabIndex={-1} className="max-w-7xl mx-auto px-4 sm:px-6 py-8 sm:py-10">
        <div className="space-y-8 animate-fadeIn">
          {/* Header con controles dinámicos */}
          <div className="pb-6 border-b border-dashed border-zinc-800 flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div>
              <h1 className="text-3xl font-extrabold tracking-tight text-white">Parámetros Normativos y Coeficientes</h1>
              <p className="text-zinc-400 text-sm mt-1">Consulte y actualice los mínimos, deducciones aplicables (Art. 30 y 94) y los índices de reexpresión (IPC).</p>
            </div>

            {/* Año fiscal y acciones */}
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2 bg-[#121216] border border-zinc-800 px-3 py-1.5 rounded-lg">
                <span className="text-xs text-zinc-400 font-bold uppercase tracking-wider">Año Fiscal:</span>
                <select
                  value={selectedYear}
                  onChange={(e) => setSelectedYear(parseInt(e.target.value, 10))}
                  className="bg-transparent text-sm font-bold text-teal-400 focus:outline-none cursor-pointer"
                >
                  <option value="2024" className="bg-[#121216] text-[#f4f4f5]">2024</option>
                  <option value="2025" className="bg-[#121216] text-[#f4f4f5]">2025</option>
                  <option value="2026" className="bg-[#121216] text-[#f4f4f5]">2026</option>
                </select>
              </div>

              <div className="flex items-center gap-2 bg-[#121216] border border-zinc-800 px-3 py-1.5 rounded-lg">
                <span className="text-xs text-zinc-400 font-bold uppercase tracking-wider">Resolución:</span>
                <select
                  value={selectedResolutionId}
                  onChange={(e) => {
                    const resId = e.target.value;
                    setSelectedResolutionId(resId);
                    loadParameters(selectedYear, resId);
                  }}
                  className="bg-transparent text-sm font-bold text-teal-400 focus:outline-none cursor-pointer max-w-[200px]"
                >
                  {resolutions.length > 0 ? (
                    resolutions.map((res) => (
                      <option key={res.id} value={res.id} className="bg-[#121216] text-[#f4f4f5]">
                        {res.resolution} (v{res.version})
                      </option>
                    ))
                  ) : (
                    <option value="default" className="bg-[#121216] text-[#f4f4f5]">Predeterminada (v1)</option>
                  )}
                </select>
              </div>

              <button
                onClick={handleLoadInternalBaseParameters}
                disabled={isSyncing}
                className="flex items-center gap-2 px-4 h-10 rounded-lg bg-zinc-800 hover:bg-zinc-750 border border-zinc-700 hover:border-teal-500/30 text-xs font-bold text-teal-400 transition-colors disabled:opacity-50 cursor-pointer"
              >
                <RefreshCw className={`h-4 w-4 ${isSyncing ? 'animate-spin' : ''}`} />
                {isSyncing ? 'Cargando...' : 'Cargar base interna'}
              </button>

              <button
                onClick={openEditModal}
                disabled={!paramsData || !paramsData.parameterSet}
                className="flex items-center gap-2 px-4 h-10 rounded-lg bg-teal-500 hover:bg-teal-400 text-[#09090b] text-xs font-bold transition-colors disabled:opacity-50 disabled:hover:bg-teal-500 disabled:cursor-not-allowed cursor-pointer"
              >
                <Settings className="h-4 w-4" />
                Editar Manual
              </button>
            </div>
          </div>

          {/* CARD DE IMPORTACIÓN DE PARÁMETROS EXCEL (.XLSX) */}
          <div className="bg-gradient-to-br from-[#181820] to-[#121216] border border-zinc-800 rounded-xl p-6 shadow-2xl relative overflow-hidden group">
            <div className="absolute top-0 right-0 h-32 w-32 bg-teal-500/5 rounded-full blur-3xl group-hover:bg-teal-500/10 transition-all"></div>

            <div className="flex items-center gap-3 mb-4">
              <div className="h-9 w-9 rounded-lg bg-teal-500/10 flex items-center justify-center text-teal-400">
                <FileSpreadsheet className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white tracking-tight">Importador Oficial de Parámetros Impositivos (.xlsx)</h3>
                <p className="text-zinc-400 text-xs mt-0.5">Suba una planilla Excel parametrizada para cargar deducciones, brackets y tablas IPC.</p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-6 items-end pt-2">
              <div className="space-y-1.5">
                <label className="text-[10px] uppercase font-bold text-zinc-400 tracking-wider block">Nombre de la Resolución / Norma</label>
                <input
                  type="text"
                  value={uploadParamsName}
                  onChange={(e) => setUploadParamsName(e.target.value)}
                  className="w-full h-10 px-3 rounded-lg bg-[#09090b] border border-zinc-800 text-xs text-white focus:outline-none focus:border-teal-500/50 transition-colors"
                  placeholder="Ej: RG 5507/2024"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] uppercase font-bold text-zinc-400 tracking-wider block">Año Fiscal Aplicable</label>
                <select
                  value={uploadParamsYear}
                  onChange={(e) => setUploadParamsYear(Number(e.target.value))}
                  className="w-full h-10 px-3 rounded-lg bg-[#09090b] border border-zinc-800 text-xs text-zinc-300 focus:outline-none focus:border-teal-500/50 transition-colors"
                >
                  <option value={2026}>2026</option>
                  <option value={2025}>2025</option>
                  <option value={2024}>2024</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] uppercase font-bold text-zinc-400 tracking-wider block">Archivo Excel Parametrizado</label>
                <input
                  type="file"
                  accept=".xlsx,.xls"
                  id="excel-params-file"
                  className="hidden"
                  onChange={handleParamsUpload}
                />
                <label
                  htmlFor="excel-params-file"
                  className="flex items-center justify-center gap-2 w-full h-10 rounded-lg bg-[#09090b] border border-zinc-800 text-xs text-zinc-300 hover:text-white hover:border-zinc-750 transition-colors cursor-pointer"
                >
                  <Upload className="h-4 w-4 text-zinc-500" />
                  {selectedParamsFile ? 'Cambiar Excel' : 'Seleccionar Archivo'}
                </label>
              </div>

              <div>
                <button
                  onClick={submitParamsImport}
                  disabled={isUploadingParams || !uploadParamsName || !selectedParamsFile}
                  className="w-full h-10 rounded-lg bg-teal-500 hover:bg-teal-400 text-[#09090b] text-xs font-bold transition-all shadow-md shadow-teal-500/5 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                >
                  {isUploadingParams ? 'Importando...' : 'Importar Resolución'}
                </button>
              </div>
            </div>
          </div>

          {/* Renderizado Condicional de Estados */}
          {isParamsLoading ? (
            <div className="py-20 flex flex-col items-center justify-center space-y-4">
              <RefreshCw className="h-10 w-10 text-teal-400 animate-spin" />
              <span className="text-zinc-400 text-sm font-semibold">Cargando parámetros de base de datos...</span>
            </div>
          ) : !paramsData || !paramsData.parameterSet ? (
            <div className="border border-dashed border-zinc-800 rounded-xl p-12 text-center max-w-2xl mx-auto space-y-6 bg-[#121216]/50">
              <div className="h-14 w-14 rounded-full bg-amber-500/10 flex items-center justify-center text-amber-400 mx-auto">
                <AlertTriangle className="h-7 w-7" />
              </div>
              <div className="space-y-2">
                <h3 className="text-lg font-bold text-white">Año Fiscal {selectedYear} No Inicializado</h3>
                <p className="text-zinc-400 text-sm leading-relaxed">
                  No se encontraron parámetros impositivos registrados para el año {selectedYear} en la base de datos local.
                  Sincronice ahora con el servidor legal oficial para importar de forma automática todas las escalas del Art. 94 y límites de deducción.
                </p>
              </div>
              <button
                onClick={handleLoadInternalBaseParameters}
                disabled={isSyncing}
                className="inline-flex items-center gap-2 px-6 h-11 rounded-lg bg-teal-500 hover:bg-teal-400 text-[#09090b] text-sm font-bold transition-colors disabled:opacity-50 cursor-pointer"
              >
                <RefreshCw className={`h-4 w-4 ${isSyncing ? 'animate-spin' : ''}`} />
                {isSyncing ? 'Cargando...' : `Cargar base ${selectedYear}`}
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">

              {/* Bloque 1: Deducciones del Art. 30 */}
              <div className="bg-[#121216] border border-zinc-800 rounded-xl p-6 shadow-2xl">
                <h3 className="text-base font-bold text-teal-400 mb-4 uppercase tracking-wider border-b border-zinc-850 pb-2">
                  Deducciones Personales (Art. 30 - {selectedYear})
                </h3>
                <div className="space-y-3 font-mono text-xs">
                  <div className="flex justify-between py-1.5 border-b border-zinc-850/50">
                    <span className="text-zinc-400 font-sans">Mínimo No Imponible (MNI)</span>
                    <span className="text-zinc-200 font-bold">{formatCurrency(paramsData.parameterSet.minimoNoImponible)}</span>
                  </div>
                  <div className="flex justify-between py-1.5 border-b border-zinc-850/50">
                    <span className="text-zinc-400 font-sans">Cónyuge o Conviviente a cargo</span>
                    <span className="text-zinc-200 font-bold">{formatCurrency(paramsData.parameterSet.conyuge)}</span>
                  </div>
                  <div className="flex justify-between py-1.5 border-b border-zinc-850/50">
                    <span className="text-zinc-400 font-sans">Hijo a cargo</span>
                    <span className="text-zinc-200 font-bold">{formatCurrency(paramsData.parameterSet.hijo)}</span>
                  </div>
                  <div className="flex justify-between py-1.5 border-b border-zinc-850/50">
                    <span className="text-zinc-400 font-sans">Hijo Incapacitado para el trabajo</span>
                    <span className="text-zinc-200 font-bold">{formatCurrency(paramsData.parameterSet.hijoIncapacitado)}</span>
                  </div>
                  <div className="flex justify-between py-1.5 border-b border-zinc-850/50">
                    <span className="text-zinc-400 font-sans">Deducción Especial Autónomo (1.5x MNI)</span>
                    <span className="text-zinc-200 font-bold">{formatCurrency(paramsData.parameterSet.especialAutonomo)}</span>
                  </div>
                  <div className="flex justify-between py-1.5 border-b border-zinc-850/50">
                    <span className="text-zinc-400 font-sans">Deducción Especial Emprendedor (2x MNI)</span>
                    <span className="text-zinc-200 font-bold">{formatCurrency(paramsData.parameterSet.especialEmprendedor)}</span>
                  </div>
                  <div className="flex justify-between py-1.5">
                    <span className="text-zinc-400 font-sans">Deducción Especial Empleado/Jubilado (3.8x)</span>
                    <span className="text-teal-400 font-bold">{formatCurrency(paramsData.parameterSet.especialDependiente)}</span>
                  </div>
                </div>
              </div>

              {/* Bloque 2: Topes de Deducciones Generales */}
              <div className="bg-[#121216] border border-zinc-800 rounded-xl p-6 shadow-2xl">
                <h3 className="text-base font-bold text-teal-400 mb-4 uppercase tracking-wider border-b border-zinc-850 pb-2">
                  Topes Anuales de Deducciones Generales
                </h3>
                <div className="space-y-3 font-mono text-xs">
                  <div className="flex justify-between py-1.5 border-b border-zinc-850/50">
                    <span className="text-zinc-400 font-sans">Servicio Doméstico (Tope MNI)</span>
                    <span className="text-zinc-200 font-bold">{formatCurrency(paramsData.parameterSet.topeServicioDomestico)}</span>
                  </div>
                  <div className="flex justify-between py-1.5 border-b border-zinc-850/50">
                    <span className="text-zinc-400 font-sans">Seguro de Vida</span>
                    <span className="text-zinc-200 font-bold">{formatCurrency(paramsData.parameterSet.topeSeguroVida)}</span>
                  </div>
                  <div className="flex justify-between py-1.5 border-b border-zinc-850/50">
                    <span className="text-zinc-400 font-sans">Seguro de Retiro</span>
                    <span className="text-zinc-200 font-bold">{formatCurrency(paramsData.parameterSet.topeSeguroRetiro)}</span>
                  </div>
                  <div className="flex justify-between py-1.5 border-b border-zinc-850/50">
                    <span className="text-zinc-400 font-sans">Gastos de Sepelio</span>
                    <span className="text-zinc-200 font-bold">{formatCurrency(paramsData.parameterSet.topeGastosSepelio)}</span>
                  </div>
                  <div className="flex justify-between py-1.5 border-b border-zinc-850/50">
                    <span className="text-zinc-400 font-sans">Intereses de Crédito Hipotecario</span>
                    <span className="text-zinc-200 font-bold">{formatCurrency(paramsData.parameterSet.topeInteresHipoteca)}</span>
                  </div>
                  <div className="flex justify-between py-1.5">
                    <span className="text-zinc-400 font-sans">Gastos Educativos (Tope 40% MNI)</span>
                    <span className="text-teal-400 font-bold">{formatCurrency(paramsData.parameterSet.topeGastosEducativos)}</span>
                  </div>
                </div>
              </div>

              {/* Bloque 3: Escala del Artículo 94 */}
              <div className="bg-[#121216] border border-zinc-800 rounded-xl p-6 shadow-2xl lg:col-span-2">
                <h3 className="text-base font-bold text-teal-400 mb-4 uppercase tracking-wider border-b border-zinc-850 pb-2">
                  Escala Progresiva de Alícuotas (Art. 94 - Período Fiscal {selectedYear})
                </h3>
                <div className="overflow-x-auto text-xs">
                  <table className="w-full text-left border-collapse font-mono">
                    <thead>
                      <tr className="border-b border-zinc-800 bg-[#09090b] text-zinc-450 font-bold">
                        <th className="px-4 py-3 font-sans">Ganancia Neta Imponible ($ Desde)</th>
                        <th className="px-4 py-3 font-sans">Ganancia Neta Imponible ($ Hasta)</th>
                        <th className="px-4 py-3 text-right font-sans">Monto Fijo ($)</th>
                        <th className="px-4 py-3 text-right font-sans">Alícuota %</th>
                        <th className="px-4 py-3 text-right font-sans">Sobre el excedente de ($)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-850/50 text-zinc-300">
                      {paramsData.brackets && paramsData.brackets.length > 0 ? (
                        paramsData.brackets.map((b, index) => (
                          <tr key={b.id || index} className="hover:bg-zinc-800/10 transition-colors">
                            <td className="px-4 py-2.5">{formatCurrency(b.fromAmount)}</td>
                            <td className="px-4 py-2.5">{b.toAmount ? formatCurrency(b.toAmount) : 'Y más'}</td>
                            <td className="px-4 py-2.5 text-right">{formatCurrency(b.fixedAmount)}</td>
                            <td className="px-4 py-2.5 text-right text-teal-400 font-bold">{formatPercent(b.percentage)}</td>
                            <td className="px-4 py-2.5 text-right">{formatCurrency(b.excessOf)}</td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan={5} className="px-4 py-6 text-center text-zinc-500">No hay escala registrada para este año.</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Bloque 4: Índices de Actualización Mensual (IPC) */}
              {paramsData.indices && paramsData.indices.length > 0 && (
                <div className="bg-[#121216] border border-zinc-800 rounded-xl p-6 shadow-2xl lg:col-span-2 animate-fadeIn">
                  <h3 className="text-base font-bold text-teal-400 mb-4 uppercase tracking-wider border-b border-zinc-850 pb-2 flex items-center justify-between">
                    <span>Índices de Actualización Mensual (IPC - {selectedYear})</span>
                    <span className="text-[10px] text-zinc-400 font-normal">Reexpresión impositiva de activos y AXI</span>
                  </h3>
                  <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-4">
                    {paramsData.indices.map((idx) => (
                      <div key={idx.monthIndex} className="p-3 rounded-lg bg-[#09090b] border border-zinc-850 text-center font-mono">
                        <span className="text-[10px] uppercase font-bold text-zinc-500 block mb-1">{idx.monthName}</span>
                        <span className="text-xs text-teal-400 font-extrabold">{Number(idx.ipcValue).toFixed(4)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

            </div>
          )}
        </div>
      </main>

      {/* MODAL EDITAR PARÁMETROS MANUALES */}
      {showEditParamsModal && editForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#09090b]/85 backdrop-blur-sm transition-all animate-fadeIn">
          <div className="bg-[#121216] border border-zinc-800 rounded-xl p-8 max-w-4xl w-full text-left space-y-6 shadow-2xl relative overflow-hidden max-h-[90vh] overflow-y-auto">
            <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-teal-500 to-emerald-500"></div>

            <div className="space-y-1">
              <h3 className="text-xl font-bold text-white tracking-tight flex items-center gap-2">
                <Settings className="h-5.5 w-5.5 text-teal-400" />
                Editar Parámetros Manuales - Período {selectedYear}
              </h3>
              <p className="text-zinc-400 text-xs">Modifique los importes vigentes de las deducciones y topes anuales en la base de datos.</p>
            </div>

            <form onSubmit={handleSaveParams} className="space-y-6">

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

                {/* Col 1: Deducciones Art. 30 */}
                <div className="space-y-4">
                  <h4 className="text-xs uppercase font-bold text-teal-400 tracking-wider border-b border-zinc-850 pb-1.5 font-sans">
                    Deducciones Personales (Art. 30)
                  </h4>

                  <div className="space-y-3">
                    <div className="space-y-1">
                      <label className="text-[10px] uppercase font-bold text-zinc-500 tracking-wider block">Mínimo No Imponible (MNI)</label>
                      <input
                        type="number"
                        step="0.01"
                        required
                        value={editForm.minimoNoImponible}
                        onChange={(e) => setEditForm({ ...editForm, minimoNoImponible: e.target.value })}
                        className="w-full h-9 px-3 rounded-lg bg-[#09090b] border border-zinc-800 text-xs text-white focus:outline-none focus:border-teal-500/50 transition-colors font-mono"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-[10px] uppercase font-bold text-zinc-500 tracking-wider block">Cónyuge o Conviviente</label>
                      <input
                        type="number"
                        step="0.01"
                        required
                        value={editForm.conyuge}
                        onChange={(e) => setEditForm({ ...editForm, conyuge: e.target.value })}
                        className="w-full h-9 px-3 rounded-lg bg-[#09090b] border border-zinc-800 text-xs text-white focus:outline-none focus:border-teal-500/50 transition-colors font-mono"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-[10px] uppercase font-bold text-zinc-500 tracking-wider block">Hijo a cargo</label>
                      <input
                        type="number"
                        step="0.01"
                        required
                        value={editForm.hijo}
                        onChange={(e) => setEditForm({ ...editForm, hijo: e.target.value })}
                        className="w-full h-9 px-3 rounded-lg bg-[#09090b] border border-zinc-800 text-xs text-white focus:outline-none focus:border-teal-500/50 transition-colors font-mono"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-[10px] uppercase font-bold text-zinc-500 tracking-wider block">Hijo Incapacitado</label>
                      <input
                        type="number"
                        step="0.01"
                        required
                        value={editForm.hijoIncapacitado}
                        onChange={(e) => setEditForm({ ...editForm, hijoIncapacitado: e.target.value })}
                        className="w-full h-9 px-3 rounded-lg bg-[#09090b] border border-zinc-800 text-xs text-white focus:outline-none focus:border-teal-500/50 transition-colors font-mono"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-[10px] uppercase font-bold text-zinc-500 tracking-wider block">Especial Autónomo</label>
                      <input
                        type="number"
                        step="0.01"
                        required
                        value={editForm.especialAutonomo}
                        onChange={(e) => setEditForm({ ...editForm, especialAutonomo: e.target.value })}
                        className="w-full h-9 px-3 rounded-lg bg-[#09090b] border border-zinc-800 text-xs text-white focus:outline-none focus:border-teal-500/50 transition-colors font-mono"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-[10px] uppercase font-bold text-zinc-500 tracking-wider block">Especial Emprendedor</label>
                      <input
                        type="number"
                        step="0.01"
                        required
                        value={editForm.especialEmprendedor}
                        onChange={(e) => setEditForm({ ...editForm, especialEmprendedor: e.target.value })}
                        className="w-full h-9 px-3 rounded-lg bg-[#09090b] border border-zinc-800 text-xs text-white focus:outline-none focus:border-teal-500/50 transition-colors font-mono"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-[10px] uppercase font-bold text-zinc-500 tracking-wider block">Especial Empleado / Dependiente</label>
                      <input
                        type="number"
                        step="0.01"
                        required
                        value={editForm.especialDependiente}
                        onChange={(e) => setEditForm({ ...editForm, especialDependiente: e.target.value })}
                        className="w-full h-9 px-3 rounded-lg bg-[#09090b] border border-zinc-800 text-xs text-white focus:outline-none focus:border-teal-500/50 transition-colors font-mono"
                      />
                    </div>
                  </div>

                </div>

                {/* Col 2: Topes Deducciones Generales */}
                <div className="space-y-4">
                  <h4 className="text-xs uppercase font-bold text-teal-400 tracking-wider border-b border-zinc-850 pb-1.5 font-sans">
                    Topes Anuales de Deducciones Generales
                  </h4>

                  <div className="space-y-3">
                    <div className="space-y-1">
                      <label className="text-[10px] uppercase font-bold text-zinc-500 tracking-wider block">Servicio Doméstico (Tope MNI)</label>
                      <input
                        type="number"
                        step="0.01"
                        required
                        value={editForm.topeServicioDomestico}
                        onChange={(e) => setEditForm({ ...editForm, topeServicioDomestico: e.target.value })}
                        className="w-full h-9 px-3 rounded-lg bg-[#09090b] border border-zinc-800 text-xs text-white focus:outline-none focus:border-teal-500/50 transition-colors font-mono"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-[10px] uppercase font-bold text-zinc-500 tracking-wider block">Seguro de Vida</label>
                      <input
                        type="number"
                        step="0.01"
                        required
                        value={editForm.topeSeguroVida}
                        onChange={(e) => setEditForm({ ...editForm, topeSeguroVida: e.target.value })}
                        className="w-full h-9 px-3 rounded-lg bg-[#09090b] border border-zinc-800 text-xs text-white focus:outline-none focus:border-teal-500/50 transition-colors font-mono"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-[10px] uppercase font-bold text-zinc-500 tracking-wider block">Seguro de Retiro</label>
                      <input
                        type="number"
                        step="0.01"
                        required
                        value={editForm.topeSeguroRetiro}
                        onChange={(e) => setEditForm({ ...editForm, topeSeguroRetiro: e.target.value })}
                        className="w-full h-9 px-3 rounded-lg bg-[#09090b] border border-zinc-800 text-xs text-white focus:outline-none focus:border-teal-500/50 transition-colors font-mono"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-[10px] uppercase font-bold text-zinc-500 tracking-wider block">Gastos de Sepelio</label>
                      <input
                        type="number"
                        step="0.01"
                        required
                        value={editForm.topeGastosSepelio}
                        onChange={(e) => setEditForm({ ...editForm, topeGastosSepelio: e.target.value })}
                        className="w-full h-9 px-3 rounded-lg bg-[#09090b] border border-zinc-800 text-xs text-white focus:outline-none focus:border-teal-500/50 transition-colors font-mono"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-[10px] uppercase font-bold text-zinc-500 tracking-wider block">Intereses Crédito Hipotecario</label>
                      <input
                        type="number"
                        step="0.01"
                        required
                        value={editForm.topeInteresHipoteca}
                        onChange={(e) => setEditForm({ ...editForm, topeInteresHipoteca: e.target.value })}
                        className="w-full h-9 px-3 rounded-lg bg-[#09090b] border border-zinc-800 text-xs text-white focus:outline-none focus:border-teal-500/50 transition-colors font-mono"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-[10px] uppercase font-bold text-zinc-500 tracking-wider block">Gastos Educativos (Tope 40% MNI)</label>
                      <input
                        type="number"
                        step="0.01"
                        required
                        value={editForm.topeGastosEducativos}
                        onChange={(e) => setEditForm({ ...editForm, topeGastosEducativos: e.target.value })}
                        className="w-full h-9 px-3 rounded-lg bg-[#09090b] border border-zinc-800 text-xs text-white focus:outline-none focus:border-teal-500/50 transition-colors font-mono"
                      />
                    </div>
                  </div>
                </div>

              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-zinc-800">
                <button
                  type="button"
                  onClick={() => setShowEditParamsModal(false)}
                  className="px-5 h-11 rounded-lg border border-zinc-700 hover:bg-zinc-800 text-zinc-300 font-semibold text-sm transition-colors cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 h-11 rounded-lg bg-teal-500 hover:bg-teal-400 text-[#09090b] font-bold text-sm transition-colors shadow-lg shadow-teal-500/10 active:scale-[0.98] cursor-pointer"
                >
                  Guardar Cambios Manuales
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* TOAST NOTIFICATION */}
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
