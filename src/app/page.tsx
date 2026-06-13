'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { 
  Users, 
  AlertTriangle, 
  Plus, 
  Search, 
  ArrowUpRight, 
  CheckCircle,
  Clock,
  Settings,
  FolderOpen,
  Calendar,
  Sparkles,
  RefreshCw,
  FileSpreadsheet,
  Upload,
  Trash2,
  Edit2,
  LogOut
} from 'lucide-react';
import Link from 'next/link';

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

function isDecimalLike(value: Numberish): value is { toNumber: () => number } {
  return typeof value === 'object' && value !== null && typeof value.toNumber === 'function';
}

export default function Home() {
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState<'todos' | 'borrador' | 'revision' | 'cerrada'>('todos');
  const [activeView, setActiveView] = useState<'dashboard' | 'clientes' | 'parametros' | 'auditoria'>('dashboard');

  const [clients, setClients] = useState<ClientRow[]>([]);
  const [taxReturns, setTaxReturns] = useState<TaxReturnRow[]>([]);

  // States for live parameters
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
  const [dashboardError, setDashboardError] = useState<string | null>(null);

  const [showNewClientModal, setShowNewClientModal] = useState(false);
  const [newClientName, setNewClientName] = useState('');
  const [newClientCuit, setNewClientCuit] = useState('');
  const [newClientType, setNewClientType] = useState('Persona Humana');
  const [newClientFiscal, setNewClientFiscal] = useState('Responsable Inscripto');
  const [newClientActivity, setNewClientActivity] = useState('');

  // Edit client modal state
  const [showEditClientModal, setShowEditClientModal] = useState(false);
  const [editClientId, setEditClientId] = useState<string | null>(null);
  const [editClientName, setEditClientName] = useState('');
  const [editClientCuit, setEditClientCuit] = useState('');
  const [editClientType, setEditClientType] = useState('Persona Humana');
  const [editClientFiscal, setEditClientFiscal] = useState('Responsable Inscripto');
  const [editClientActivity, setEditClientActivity] = useState('');


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

  const loadParameters = useCallback((year: number, resolutionId?: string) => {
    setIsParamsLoading(true);
    const targetResId = resolutionId || selectedResolutionId;
    fetch(`/api/parametros?year=${year}&resolutionId=${targetResId}`)
      .then(res => res.json() as Promise<ApiResponse<TaxParametersView>>)
      .then(res => {
        if (res.success && res.data) {
          setParamsData(res.data);
        } else {
          setParamsData(null);
        }
      })
      .catch(err => {
        console.error("Error cargando parámetros:", err);
        setParamsData(null);
      })
      .finally(() => setIsParamsLoading(false));
  }, [selectedResolutionId]);

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
        console.error("Error cargando resoluciones:", err);
        setResolutions([]);
        setSelectedResolutionId('default');
        loadParameters(year, 'default');
      });
  }, [loadParameters]);

  useEffect(() => {
    queueMicrotask(() => {
      loadDashboardData();
      loadResolutions(2025);
    });
  }, [loadDashboardData, loadResolutions]);

  // Sync parameters when selectedYear or activeView changes
  useEffect(() => {
    if (activeView === 'parametros') {
      loadResolutions(selectedYear);
    }
  }, [activeView, selectedYear, loadResolutions]);

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
          loadParameters(selectedYear);
        } else {
          setNotification({
            message: `Error al cargar parámetros base: ${res.error}`,
            type: 'error'
          });
        }
      })
      .catch(err => {
        console.error("Error loading internal base parameters:", err);
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
      alert("Por favor seleccione un archivo Excel.");
      return;
    }
    if (!uploadParamsName.trim()) {
      alert("Por favor ingrese el nombre o número de la resolución.");
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
        console.error("Error importing params:", err);
        setNotification({
          message: `Error de red al importar: ${err.message}`,
          type: 'error'
        });
      })
      .finally(() => setIsUploadingParams(false));
  };

  const openEditModal = () => {
    if (!paramsData || !paramsData.parameterSet) {
      alert("No hay parámetros cargados para este año. Sincronice primero.");
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
          loadParameters(selectedYear);
        } else {
          setNotification({
            message: `Error al guardar parámetros: ${res.error}`,
            type: 'error'
          });
        }
      })
      .catch(err => {
        console.error("Error saving parameters:", err);
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

  const handleCreateClient = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newClientName || !newClientCuit) {
      alert('Por favor complete Nombre y CUIT.');
      return;
    }
    
    const newClientPayload = {
      cuit: newClientCuit,
      name: newClientName,
      type: newClientType,
      fiscalCondition: newClientFiscal,
      mainActivity: newClientActivity || 'Actividad Comercial General'
    };
    
    fetch('/api/clientes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newClientPayload)
    })
    .then(res => res.json())
    .then(res => {
      if (res.success) {
        setClients(prev => [...prev, res.data]);
        setNewClientName('');
        setNewClientCuit('');
        setNewClientActivity('');
        setShowNewClientModal(false);
      } else {
        alert(`Error al registrar contribuyente: ${res.error}`);
      }
    })
    .catch(err => {
      console.error("Error registering client:", err);
      alert(`Error de conexión: ${err.message}`);
    });
  };

  const openEditClientModal = (client: ClientRow) => {
    setEditClientId(client.id);
    setEditClientName(client.name);
    setEditClientCuit(client.cuit);
    setEditClientType(client.type);
    setEditClientFiscal(client.fiscalCondition);
    setEditClientActivity(client.mainActivity || '');
    setShowEditClientModal(true);
  };

  const handleEditClient = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editClientId || !editClientName) {
      alert('Por favor complete al menos el Nombre.');
      return;
    }

    fetch(`/api/clientes/${editClientId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: editClientName,
        type: editClientType,
        fiscalCondition: editClientFiscal,
        mainActivity: editClientActivity || 'Actividad Comercial General'
      })
    })
    .then(res => res.json())
    .then(res => {
      if (res.success) {
        setClients(prev => prev.map(c => c.id === editClientId ? { ...c, ...res.data } : c));
        setShowEditClientModal(false);
        setNotification({ message: `Contribuyente "${editClientName}" actualizado con éxito.`, type: 'success' });
      } else {
        setNotification({ message: `Error al actualizar: ${res.error}`, type: 'error' });
      }
    })
    .catch(err => {
      console.error("Error updating client:", err);
      setNotification({ message: `Error de red: ${err.message}`, type: 'error' });
    });
  };

  const handleDeleteClient = (clientId: string, clientName: string) => {
    const confirmDelete = window.confirm(`¿Está seguro que desea eliminar al contribuyente "${clientName}"? Esta acción eliminará permanentemente al contribuyente y todos sus borradores asociados.`);
    if (!confirmDelete) return;

    fetch(`/api/clientes/${clientId}`, {
      method: 'DELETE',
    })
    .then(res => res.json())
    .then(res => {
      if (res.success) {
        setClients(prev => prev.filter(c => c.id !== clientId));
        setNotification({ message: `Contribuyente "${clientName}" eliminado con éxito.`, type: 'success' });
      } else {
        setNotification({ message: `${res.error}`, type: 'error' });
      }
    })
    .catch(err => {
      console.error("Error deleting client:", err);
      setNotification({ message: `Error de red al eliminar: ${err.message}`, type: 'error' });
    });
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

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    window.location.href = '/login';
  };

  return (
    <div className="min-h-screen bg-[#09090b] text-[#f4f4f5] font-sans antialiased selection:bg-teal-500/25 selection:text-teal-200 font-sans">
      
      {/* HEADER DE LA PLATAFORMA (STITCH AESTHETIC) */}
      <header className="border-b border-[#1e1e24] bg-[#09090b]/80 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button 
              onClick={() => setActiveView('dashboard')}
              className="flex items-center gap-3 text-left focus:outline-none"
            >
              <div className="h-9 w-9 rounded-lg bg-gradient-to-br from-teal-400 to-emerald-600 flex items-center justify-center shadow-lg shadow-teal-500/10">
                <Sparkles className="h-5 w-5 text-[#09090b] stroke-[2.5]" />
              </div>
              <div>
                <span className="font-bold text-lg tracking-tight bg-gradient-to-r from-teal-200 to-zinc-100 bg-clip-text text-transparent block">JABA</span>
                <span className="text-[10px] uppercase tracking-wider block text-teal-400 font-semibold -mt-1">Ganancias Impositivas</span>
              </div>
            </button>
          </div>
          
          <nav className="hidden md:flex items-center gap-6 text-sm font-medium">
            <button 
              onClick={() => setActiveView('dashboard')}
              className={`py-1 transition-colors relative focus:outline-none ${activeView === 'dashboard' ? 'text-teal-400 border-b-2 border-teal-500/50 font-bold' : 'text-zinc-400 hover:text-zinc-200'}`}
            >
              Dashboard
            </button>
            <button 
              onClick={() => setActiveView('clientes')}
              className={`py-1 transition-colors relative focus:outline-none ${activeView === 'clientes' ? 'text-teal-400 border-b-2 border-teal-500/50 font-bold' : 'text-zinc-400 hover:text-zinc-200'}`}
            >
              Clientes
            </button>
            <button 
              onClick={() => setActiveView('parametros')}
              className={`py-1 transition-colors relative focus:outline-none ${activeView === 'parametros' ? 'text-teal-400 border-b-2 border-teal-500/50 font-bold' : 'text-zinc-400 hover:text-zinc-200'}`}
            >
              Parámetros
            </button>
            <button 
              onClick={() => setActiveView('auditoria')}
              className={`py-1 transition-colors relative focus:outline-none ${activeView === 'auditoria' ? 'text-teal-400 border-b-2 border-teal-500/50 font-bold' : 'text-zinc-400 hover:text-zinc-200'}`}
            >
              Auditoría
            </button>
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
      </header>

      {/* DASHBOARD PRINCIPAL */}
      <main className="max-w-7xl mx-auto px-6 py-10">
        
        {activeView === 'dashboard' && (
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
              <button 
                onClick={() => setActiveView('clientes')}
                className="text-left bg-[#121216] border border-zinc-800 hover:border-zinc-700 transition-all rounded-xl p-5 relative overflow-hidden group focus:outline-none w-full cursor-pointer"
              >
                <div className="absolute top-0 right-0 h-24 w-24 bg-teal-500/5 rounded-full blur-2xl group-hover:bg-teal-500/10 transition-all"></div>
                <div className="flex items-center justify-between mb-4">
                  <span className="text-xs uppercase tracking-wider text-zinc-500 font-semibold">Contribuyentes</span>
                  <div className="h-8 w-8 rounded-lg bg-teal-500/10 flex items-center justify-center text-teal-400">
                    <Users className="h-4 w-4" />
                  </div>
                </div>
                <h2 className="text-3xl font-bold text-white tracking-tight">{clients.length}</h2>
                <p className="text-zinc-500 text-xs mt-1">{clients.length} contribuyentes registrados</p>
              </button>

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
              <button 
                onClick={() => setActiveView('auditoria')}
                className="text-left bg-[#121216] border border-zinc-800 hover:border-zinc-700 transition-all rounded-xl p-5 relative overflow-hidden group focus:outline-none w-full cursor-pointer"
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
              </button>

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
                                onClick={() => handleDeleteReturn(ret.id, ret.clientName, ret.year ?? selectedYear)}
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
              <button 
                onClick={() => setActiveView('parametros')}
                className="text-left bg-[#121216] border border-zinc-800 rounded-xl p-6 hover:border-zinc-700 transition-all focus:outline-none w-full cursor-pointer animate-fadeIn"
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
              </button>
            </div>
          </>
        )}

        {activeView === 'clientes' && (
          <div className="space-y-8 animate-fadeIn">
            <div className="pb-6 border-b border-dashed border-zinc-800">
              <h1 className="text-3xl font-extrabold tracking-tight text-white">Padrón de Contribuyentes</h1>
              <p className="text-zinc-400 text-sm mt-1">Gestione el padrón de clientes y acceda a sus declaraciones históricas.</p>
            </div>

            <div className="bg-[#121216] border border-zinc-800 rounded-xl overflow-hidden shadow-2xl">
              <div className="p-6 border-b border-zinc-850 flex items-center justify-between">
                <span className="text-xs uppercase tracking-wider text-zinc-500 font-bold">Clientes Registrados ({clients.length})</span>
                <button 
                  onClick={() => setShowNewClientModal(true)}
                  className="flex items-center gap-1.5 px-4 h-9 rounded bg-teal-500 hover:bg-teal-400 text-[#09090b] font-bold text-xs transition-colors cursor-pointer"
                >
                  <Plus className="h-4 w-4 stroke-[3]" />
                  Nuevo Cliente
                </button>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-zinc-850 bg-zinc-900/10 text-zinc-400 text-[10px] uppercase font-bold tracking-wider">
                      <th className="px-6 py-4">Contribuyente</th>
                      <th className="px-6 py-4">CUIT</th>
                      <th className="px-6 py-4">Tipo</th>
                      <th className="px-6 py-4">Condición Fiscal</th>
                      <th className="px-6 py-4">Actividad Principal</th>
                      <th className="px-6 py-4 text-center">Estado</th>
                      <th className="px-6 py-4 text-right">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-850/50">
                    {clients.map((client) => (
                      <tr key={client.id} className="hover:bg-zinc-800/10 transition-colors">
                        <td className="px-6 py-4 font-semibold text-white text-sm">{client.name}</td>
                        <td className="px-6 py-4 text-xs font-mono text-zinc-400">{client.cuit}</td>
                        <td className="px-6 py-4 text-xs text-zinc-300">{client.type}</td>
                        <td className="px-6 py-4 text-xs text-zinc-400">{client.fiscalCondition}</td>
                        <td className="px-6 py-4 text-xs text-zinc-400">{client.mainActivity}</td>
                        <td className="px-6 py-4 text-center">
                          <span className={`inline-flex px-2.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider ${
                            client.status === 'Activo' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' :
                            client.status === 'Inactivo' ? 'bg-zinc-800 text-zinc-400 border border-zinc-700' :
                            'bg-red-500/10 text-red-400 border border-red-500/20'
                          }`}>
                            {client.status}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-right">
                          <div className="flex gap-2 justify-end">
                            <button 
                              onClick={() => { setActiveView('dashboard'); setSearchTerm(client.name); }}
                              className="px-3 py-1 text-xs font-bold text-teal-400 bg-zinc-800 border border-zinc-700 hover:border-teal-500/30 rounded transition-all cursor-pointer"
                            >
                              Ver Liquidaciones
                            </button>
                            <button
                              onClick={() => openEditClientModal(client)}
                              className="inline-flex items-center justify-center h-8 w-8 rounded bg-zinc-800 hover:bg-zinc-750 border border-zinc-700 hover:border-teal-500/30 text-teal-400 transition-all active:scale-[0.97] cursor-pointer"
                              title="Editar Contribuyente"
                            >
                              <Edit2 className="h-4 w-4" />
                            </button>
                            <button
                              onClick={() => handleDeleteClient(client.id, client.name)}
                              className="inline-flex items-center justify-center h-8 w-8 rounded bg-red-950/20 hover:bg-red-900/35 border border-red-500/25 hover:border-red-500/40 text-red-400 transition-all active:scale-[0.97] cursor-pointer"
                              title="Eliminar Contribuyente"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {activeView === 'parametros' && (
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
                      <span className="text-[10px] text-zinc-550 font-normal">Reexpresión impositiva de activos y AXI</span>
                    </h3>
                    <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-4">
                      {paramsData.indices.map((idx) => (
                        <div key={idx.monthIndex} className="p-3 rounded-lg bg-[#09090b] border border-zinc-850 text-center font-mono">
                          <span className="text-[9px] uppercase font-bold text-zinc-500 block mb-1">{idx.monthName}</span>
                          <span className="text-xs text-teal-400 font-extrabold">{Number(idx.ipcValue).toFixed(4)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

              </div>
            )}
          </div>
        )}

        {activeView === 'auditoria' && (
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
                    <tr className="hover:bg-zinc-800/10 transition-colors">
                      <td className="px-6 py-4 text-zinc-500">2026-05-28 01:10</td>
                      <td className="px-6 py-4 font-sans font-semibold text-white">Importador AFIP Optimizado</td>
                      <td className="px-6 py-4 font-sans text-zinc-400">Importación de AFIP compras y ventas ajustada con éxito para cabeceras truncadas de ARCA.</td>
                      <td className="px-6 py-4 font-sans text-zinc-400">SISTEMA (JABA)</td>
                      <td className="px-6 py-4 text-center font-sans">
                        <span className="px-2 py-0.5 rounded text-[9px] font-bold bg-teal-500/10 text-teal-400 border border-teal-500/20 uppercase">Éxito</span>
                      </td>
                    </tr>
                    <tr className="hover:bg-zinc-800/10 transition-colors">
                      <td className="px-6 py-4 text-zinc-500">2026-05-27 22:12</td>
                      <td className="px-6 py-4 font-sans font-semibold text-white">Parámetro &quot;Disponibilidades&quot;</td>
                      <td className="px-6 py-4 font-sans text-zinc-400">Modificación y adición interactiva de saldos en cuentas corrientes y de ahorro.</td>
                      <td className="px-6 py-4 font-sans text-zinc-400">Contador JABA</td>
                      <td className="px-6 py-4 text-center font-sans">
                        <span className="px-2 py-0.5 rounded text-[9px] font-bold bg-teal-500/10 text-teal-400 border border-teal-500/20 uppercase">Éxito</span>
                      </td>
                    </tr>
                    <tr className="hover:bg-zinc-800/10 transition-colors">
                      <td className="px-6 py-4 text-zinc-500">2026-05-27 19:45</td>
                      <td className="px-6 py-4 font-sans font-semibold text-white">Variación Patrimonial JVP</td>
                      <td className="px-6 py-4 font-sans text-zinc-400">
                        <span className="text-amber-400">Alerta:</span> Consumo alto proyectado en declaración 2025 de Lobato Francisco ($28.017.191).
                      </td>
                      <td className="px-6 py-4 font-sans text-zinc-400">SISTEMA (JABA)</td>
                      <td className="px-6 py-4 text-center font-sans">
                        <span className="px-2 py-0.5 rounded text-[9px] font-bold bg-red-500/10 text-red-400 border border-red-500/20 uppercase">Advertencia</span>
                      </td>
                    </tr>
                    <tr className="hover:bg-zinc-800/10 transition-colors">
                      <td className="px-6 py-4 text-zinc-500">2026-05-26 15:30</td>
                      <td className="px-6 py-4 font-sans font-semibold text-white">Actualización de Coeficientes IPC</td>
                      <td className="px-6 py-4 font-sans text-zinc-400">Tablas de inflación impositiva mensual cargadas y vinculadas al AXI dinámico y estático.</td>
                      <td className="px-6 py-4 font-sans text-zinc-400">Contador JABA</td>
                      <td className="px-6 py-4 text-center font-sans">
                        <span className="px-2 py-0.5 rounded text-[9px] font-bold bg-teal-500/10 text-teal-400 border border-teal-500/20 uppercase">Éxito</span>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* MODAL EDITAR PARÁMETROS MANUALES (STITCH GLASSMORPHIC MODAL) */}
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

      {/* MODAL NUEVO CLIENTE (STITCH GLASSMORPHIC MODAL) */}
      {showNewClientModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#09090b]/85 backdrop-blur-sm transition-all animate-fadeIn">
          <div className="bg-[#121216] border border-zinc-800 rounded-xl p-8 max-w-lg w-full text-left space-y-6 shadow-2xl relative overflow-hidden">
            <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-teal-500 to-emerald-500"></div>
            
            <div className="space-y-1">
              <h3 className="text-xl font-bold text-white tracking-tight flex items-center gap-2">
                <Sparkles className="h-5.5 w-5.5 text-teal-400" />
                Registrar Nuevo Contribuyente
              </h3>
              <p className="text-zinc-400 text-xs">Ingrese los datos oficiales para iniciar el padrón fiscal del contribuyente.</p>
            </div>

            <form onSubmit={handleCreateClient} className="space-y-5">
              <div className="space-y-2">
                <label className="text-xs uppercase font-bold text-zinc-500 tracking-wider">Nombre o Razón Social</label>
                <input 
                  type="text" 
                  required
                  value={newClientName}
                  onChange={(e) => setNewClientName(e.target.value)}
                  className="w-full h-11 px-4 rounded-lg bg-[#09090b] border border-zinc-800 text-sm text-white focus:outline-none focus:border-teal-500/50 transition-colors"
                  placeholder="Ej: Mauri Lopez"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-xs uppercase font-bold text-zinc-500 tracking-wider">CUIT (Formato Oficial)</label>
                  <input 
                    type="text" 
                    required
                    value={newClientCuit}
                    onChange={(e) => setNewClientCuit(e.target.value)}
                    className="w-full h-11 px-4 rounded-lg bg-[#09090b] border border-zinc-800 text-sm font-mono text-white focus:outline-none focus:border-teal-500/50 transition-colors"
                    placeholder="Ej: 20-34590216-4"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-xs uppercase font-bold text-zinc-500 tracking-wider">Tipo</label>
                  <select
                    value={newClientType}
                    onChange={(e) => setNewClientType(e.target.value)}
                    className="w-full h-11 px-4 rounded-lg bg-[#09090b] border border-zinc-800 text-sm text-zinc-300 focus:outline-none focus:border-teal-500/50 transition-colors"
                  >
                    <option value="Persona Humana">Persona Humana</option>
                    <option value="Sucesión Indivisa">Sucesión Indivisa</option>
                    <option value="Sociedad de Hecho">Sociedad de Hecho</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-xs uppercase font-bold text-zinc-500 tracking-wider">Condición Fiscal</label>
                  <select
                    value={newClientFiscal}
                    onChange={(e) => setNewClientFiscal(e.target.value)}
                    className="w-full h-11 px-4 rounded-lg bg-[#09090b] border border-zinc-800 text-sm text-zinc-300 focus:outline-none focus:border-teal-500/50 transition-colors"
                  >
                    <option value="Responsable Inscripto">Responsable Inscripto</option>
                    <option value="Responsable Inscripto / Monotributo">Monotributo / Inscripto</option>
                  </select>
                </div>

                <div className="space-y-2">
                  <label className="text-xs uppercase font-bold text-zinc-500 tracking-wider">Actividad Principal</label>
                  <input 
                    type="text" 
                    value={newClientActivity}
                    onChange={(e) => setNewClientActivity(e.target.value)}
                    className="w-full h-11 px-4 rounded-lg bg-[#09090b] border border-zinc-800 text-sm text-white focus:outline-none focus:border-teal-500/50 transition-colors"
                    placeholder="Ej: CABA - Servicios de Informática"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setShowNewClientModal(false)}
                  className="px-5 h-11 rounded-lg border border-zinc-700 hover:bg-zinc-800 text-zinc-300 font-semibold text-sm transition-colors cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 h-11 rounded-lg bg-teal-500 hover:bg-teal-400 text-[#09090b] font-bold text-sm transition-colors shadow-lg shadow-teal-500/10 active:scale-[0.98] cursor-pointer"
                >
                  Registrar Contribuyente
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL EDITAR CLIENTE */}
      {showEditClientModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#09090b]/85 backdrop-blur-sm transition-all animate-fadeIn">
          <div className="bg-[#121216] border border-zinc-800 rounded-xl p-8 max-w-lg w-full text-left space-y-6 shadow-2xl relative overflow-hidden">
            <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-teal-500 to-emerald-500"></div>
            
            <div className="space-y-1">
              <h3 className="text-xl font-bold text-white tracking-tight flex items-center gap-2">
                <Edit2 className="h-5 w-5 text-teal-400" />
                Editar Contribuyente
              </h3>
              <p className="text-zinc-400 text-xs">Modifique los datos del contribuyente. El CUIT no puede ser editado.</p>
            </div>

            <form onSubmit={handleEditClient} className="space-y-5">
              <div className="space-y-2">
                <label className="text-xs uppercase font-bold text-zinc-500 tracking-wider">Nombre o Razón Social</label>
                <input 
                  type="text" 
                  required
                  value={editClientName}
                  onChange={(e) => setEditClientName(e.target.value)}
                  className="w-full h-11 px-4 rounded-lg bg-[#09090b] border border-zinc-800 text-sm text-white focus:outline-none focus:border-teal-500/50 transition-colors"
                  placeholder="Ej: Mauri Lopez"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-xs uppercase font-bold text-zinc-500 tracking-wider">CUIT (No editable)</label>
                  <input 
                    type="text" 
                    disabled
                    value={editClientCuit}
                    className="w-full h-11 px-4 rounded-lg bg-[#09090b] border border-zinc-800 text-sm font-mono text-zinc-500 cursor-not-allowed"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-xs uppercase font-bold text-zinc-500 tracking-wider">Tipo</label>
                  <select
                    value={editClientType}
                    onChange={(e) => setEditClientType(e.target.value)}
                    className="w-full h-11 px-4 rounded-lg bg-[#09090b] border border-zinc-800 text-sm text-zinc-300 focus:outline-none focus:border-teal-500/50 transition-colors"
                  >
                    <option value="Persona Humana">Persona Humana</option>
                    <option value="Sucesión Indivisa">Sucesión Indivisa</option>
                    <option value="Sociedad de Hecho">Sociedad de Hecho</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-xs uppercase font-bold text-zinc-500 tracking-wider">Condición Fiscal</label>
                  <select
                    value={editClientFiscal}
                    onChange={(e) => setEditClientFiscal(e.target.value)}
                    className="w-full h-11 px-4 rounded-lg bg-[#09090b] border border-zinc-800 text-sm text-zinc-300 focus:outline-none focus:border-teal-500/50 transition-colors"
                  >
                    <option value="Responsable Inscripto">Responsable Inscripto</option>
                    <option value="Responsable Inscripto / Monotributo">Monotributo / Inscripto</option>
                  </select>
                </div>

                <div className="space-y-2">
                  <label className="text-xs uppercase font-bold text-zinc-500 tracking-wider">Actividad Principal</label>
                  <input 
                    type="text" 
                    value={editClientActivity}
                    onChange={(e) => setEditClientActivity(e.target.value)}
                    className="w-full h-11 px-4 rounded-lg bg-[#09090b] border border-zinc-800 text-sm text-white focus:outline-none focus:border-teal-500/50 transition-colors"
                    placeholder="Ej: CABA - Servicios de Informática"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setShowEditClientModal(false)}
                  className="px-5 h-11 rounded-lg border border-zinc-700 hover:bg-zinc-800 text-zinc-300 font-semibold text-sm transition-colors cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 h-11 rounded-lg bg-teal-500 hover:bg-teal-400 text-[#09090b] font-bold text-sm transition-colors shadow-lg shadow-teal-500/10 active:scale-[0.98] cursor-pointer"
                >
                  Guardar Cambios
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

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

