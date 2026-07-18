'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  BookOpen,
  CheckCircle,
  Edit2,
  Plus,
  RefreshCw,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { AppHeader } from '../AppHeader';

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

/**
 * Padrón de contribuyentes con URL propia (/clientes), primera vista migrada
 * fuera del dashboard monolítico. Mantiene el diseño y el comportamiento de la
 * pestaña original: solapas Activos / Dados de baja, alta, edición, baja lógica
 * y reactivación.
 */
export default function ClientesPage() {
  const [clients, setClients] = useState<ClientRow[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [clientStatusTab, setClientStatusTab] = useState<'activos' | 'inactivos'>('activos');
  const [notification, setNotification] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const [showNewClientModal, setShowNewClientModal] = useState(false);
  const [newClientName, setNewClientName] = useState('');
  const [newClientCuit, setNewClientCuit] = useState('');
  const [newClientType, setNewClientType] = useState('Persona Humana');
  const [newClientFiscal, setNewClientFiscal] = useState('Responsable Inscripto');
  const [newClientActivity, setNewClientActivity] = useState('');

  const [showEditClientModal, setShowEditClientModal] = useState(false);
  const [editClientId, setEditClientId] = useState<string | null>(null);
  const [editClientName, setEditClientName] = useState('');
  const [editClientCuit, setEditClientCuit] = useState('');
  const [editClientType, setEditClientType] = useState('Persona Humana');
  const [editClientFiscal, setEditClientFiscal] = useState('Responsable Inscripto');
  const [editClientActivity, setEditClientActivity] = useState('');

  const loadClients = useCallback(() => {
    fetch('/api/clientes')
      .then(res => res.json() as Promise<ApiResponse<ClientRow[]>>)
      .then(res => {
        if (res.success && Array.isArray(res.data)) {
          setClients(res.data);
          setLoadError(null);
        } else {
          setLoadError(res.error || 'No se pudieron obtener los contribuyentes.');
        }
      })
      .catch(err => {
        console.error('Error cargando contribuyentes:', err);
        setLoadError('No se pudo conectar con el servidor. Reintente.');
      });
  }, []);

  useEffect(() => {
    loadClients();
  }, [loadClients]);

  useEffect(() => {
    if (notification) {
      const timer = setTimeout(() => setNotification(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [notification]);

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
        setClientStatusTab('activos');
        setNewClientName('');
        setNewClientCuit('');
        setNewClientActivity('');
        setShowNewClientModal(false);
      } else {
        alert(`Error al registrar contribuyente: ${res.error}`);
      }
    })
    .catch(err => {
      console.error('Error registering client:', err);
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
      console.error('Error updating client:', err);
      setNotification({ message: `Error de red: ${err.message}`, type: 'error' });
    });
  };

  const handleDeleteClient = (clientId: string, clientName: string) => {
    const confirmDelete = window.confirm(`¿Desea dar de baja al contribuyente "${clientName}"? Quedará inactivo, pero se conservará todo su historial fiscal y sus declaraciones juradas.`);
    if (!confirmDelete) return;

    fetch(`/api/clientes/${clientId}`, {
      method: 'DELETE',
    })
    .then(res => res.json())
    .then(res => {
      if (res.success) {
        setClients(prev => prev.map(client => (
          client.id === clientId ? { ...client, status: 'Inactivo' } : client
        )));
        setNotification({
          message: `Contribuyente "${clientName}" dado de baja. Puede restaurarlo desde la solapa "Dados de baja".`,
          type: 'success'
        });
      } else {
        setNotification({ message: `${res.error}`, type: 'error' });
      }
    })
    .catch(err => {
      console.error('Error deactivating client:', err);
      setNotification({ message: `Error de red al dar de baja: ${err.message}`, type: 'error' });
    });
  };

  const handleReactivateClient = (clientId: string, clientName: string) => {
    const confirmReactivation = window.confirm(
      `¿Desea reactivar al contribuyente "${clientName}"? Recuperará el acceso operativo conservando todos sus datos e historial fiscal.`
    );
    if (!confirmReactivation) return;

    fetch(`/api/clientes/${clientId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'reactivate' }),
    })
      .then(res => res.json())
      .then(res => {
        if (res.success) {
          setClients(prev => prev.map(client => (
            client.id === clientId ? { ...client, ...res.data } : client
          )));
          setClientStatusTab('activos');
          setNotification({
            message: `Contribuyente "${clientName}" reactivado con éxito. Todos sus datos continúan disponibles.`,
            type: 'success'
          });
        } else {
          setNotification({ message: `${res.error}`, type: 'error' });
        }
      })
      .catch(err => {
        console.error('Error reactivating client:', err);
        setNotification({ message: `Error de red al reactivar: ${err.message}`, type: 'error' });
      });
  };

  const activeClients = clients.filter(client => client.status !== 'Inactivo');
  const inactiveClients = clients.filter(client => client.status === 'Inactivo');
  const visibleClients = clientStatusTab === 'activos' ? activeClients : inactiveClients;

  return (
    <div className="min-h-screen bg-[#09090b] text-[#f4f4f5] font-sans antialiased selection:bg-teal-500/25 selection:text-teal-200">
      <a href="#contenido-principal" className="skip-link">Saltar al contenido principal</a>

      <AppHeader active="clientes" />

      <main id="contenido-principal" tabIndex={-1} className="max-w-7xl mx-auto px-4 sm:px-6 py-8 sm:py-10">
        <div className="space-y-8 animate-fadeIn">
          <div className="pb-6 border-b border-dashed border-zinc-800">
            <h1 className="text-3xl font-extrabold tracking-tight text-white">Padrón de Contribuyentes</h1>
            <p className="text-zinc-400 text-sm mt-1">Gestione el padrón de clientes y acceda a sus declaraciones históricas.</p>
          </div>

          {loadError && (
            <div className="p-4 rounded-lg bg-red-500/10 border border-red-500/30 flex flex-col sm:flex-row sm:items-center justify-between gap-3 animate-fadeIn">
              <div className="text-sm text-red-300">
                <span className="font-bold block text-red-400">No se pudo cargar el padrón.</span>
                {loadError}
              </div>
              <button
                onClick={loadClients}
                className="shrink-0 px-4 h-9 rounded-lg bg-red-500/20 hover:bg-red-500/30 border border-red-500/40 text-red-200 text-xs font-bold transition-colors cursor-pointer"
              >
                Reintentar
              </button>
            </div>
          )}

          <div className="bg-[#121216] border border-zinc-800 rounded-xl overflow-hidden shadow-2xl">
            <div className="p-6 border-b border-zinc-850 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <span className="text-xs uppercase tracking-wider text-zinc-500 font-bold">Clientes registrados ({clients.length})</span>
                <p className="text-xs text-zinc-500 mt-1">La baja es reversible y conserva el historial fiscal completo.</p>
              </div>
              <button
                onClick={() => setShowNewClientModal(true)}
                className="flex items-center gap-1.5 px-4 h-9 rounded bg-teal-500 hover:bg-teal-400 text-[#09090b] font-bold text-xs transition-colors cursor-pointer"
              >
                <Plus className="h-4 w-4 stroke-[3]" />
                Nuevo Cliente
              </button>
            </div>

            <div className="px-6 py-4 border-b border-zinc-850 bg-zinc-950/20" role="group" aria-label="Filtrar clientes por estado">
              <div className="inline-flex rounded-lg border border-zinc-800 bg-[#09090b] p-1">
                <button
                  type="button"
                  aria-pressed={clientStatusTab === 'activos'}
                  onClick={() => setClientStatusTab('activos')}
                  className={`px-4 py-2 rounded-md text-xs font-bold transition-colors ${
                    clientStatusTab === 'activos'
                      ? 'bg-teal-500 text-[#09090b]'
                      : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  Activos ({activeClients.length})
                </button>
                <button
                  type="button"
                  aria-pressed={clientStatusTab === 'inactivos'}
                  onClick={() => setClientStatusTab('inactivos')}
                  className={`px-4 py-2 rounded-md text-xs font-bold transition-colors ${
                    clientStatusTab === 'inactivos'
                      ? 'bg-zinc-700 text-white'
                      : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  Dados de baja ({inactiveClients.length})
                </button>
              </div>
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
                  {visibleClients.map((client) => (
                    <tr key={client.id} className="hover:bg-zinc-800/10 transition-colors">
                      <td className="px-6 py-4 font-semibold text-white text-sm">{client.name}</td>
                      <td className="px-6 py-4 text-xs font-mono text-zinc-400">{client.cuit}</td>
                      <td className="px-6 py-4 text-xs text-zinc-300">{client.type}</td>
                      <td className="px-6 py-4 text-xs text-zinc-400">{client.fiscalCondition}</td>
                      <td className="px-6 py-4 text-xs text-zinc-400">{client.mainActivity}</td>
                      <td className="px-6 py-4 text-center">
                        <span className={`inline-flex px-2.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                          client.status === 'Activo' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' :
                          client.status === 'Inactivo' ? 'bg-zinc-800 text-zinc-400 border border-zinc-700' :
                          'bg-red-500/10 text-red-400 border border-red-500/20'
                        }`}>
                          {client.status}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex gap-2 justify-end">
                          {clientStatusTab === 'activos' && (
                            <Link
                              href={`/clientes/${client.id}/periodos-fiscales`}
                              className="inline-flex items-center justify-center h-8 w-8 rounded bg-zinc-800 hover:bg-zinc-750 border border-zinc-700 hover:border-teal-500/30 text-teal-400 transition-all active:scale-[0.97] cursor-pointer"
                              title="Libro fiscal mensual IVA e IIBB"
                              aria-label={`Abrir libro fiscal de ${client.name}`}
                            >
                              <BookOpen className="h-4 w-4" />
                            </Link>
                          )}
                          <Link
                            href={`/?buscar=${encodeURIComponent(client.name)}`}
                            className="px-3 py-1 text-xs font-bold text-teal-400 bg-zinc-800 border border-zinc-700 hover:border-teal-500/30 rounded transition-all cursor-pointer inline-flex items-center"
                          >
                            Ver Liquidaciones
                          </Link>
                          {clientStatusTab === 'activos' ? (
                            <>
                              <button
                                onClick={() => openEditClientModal(client)}
                                className="inline-flex items-center justify-center h-8 w-8 rounded bg-zinc-800 hover:bg-zinc-750 border border-zinc-700 hover:border-teal-500/30 text-teal-400 transition-all active:scale-[0.97] cursor-pointer"
                                title="Editar contribuyente"
                                aria-label={`Editar a ${client.name}`}
                              >
                                <Edit2 className="h-4 w-4" />
                              </button>
                              <button
                                onClick={() => handleDeleteClient(client.id, client.name)}
                                className="inline-flex items-center justify-center h-8 w-8 rounded bg-red-950/20 hover:bg-red-900/35 border border-red-500/25 hover:border-red-500/40 text-red-400 transition-all active:scale-[0.97] cursor-pointer"
                                title="Dar de baja"
                                aria-label={`Dar de baja a ${client.name}`}
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </>
                          ) : (
                            <button
                              onClick={() => handleReactivateClient(client.id, client.name)}
                              className="inline-flex items-center gap-1.5 px-3 h-8 rounded bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/25 hover:border-emerald-500/40 text-emerald-400 text-xs font-bold transition-all active:scale-[0.97] cursor-pointer"
                              title="Reactivar contribuyente"
                            >
                              <RefreshCw className="h-3.5 w-3.5" />
                              Reactivar
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                  {visibleClients.length === 0 && (
                    <tr>
                      <td colSpan={7} className="px-6 py-12 text-center">
                        <p className="text-sm font-semibold text-zinc-300">
                          {clientStatusTab === 'activos'
                            ? 'No hay clientes activos.'
                            : 'No hay clientes dados de baja.'}
                        </p>
                        <p className="text-xs text-zinc-500 mt-1">
                          {clientStatusTab === 'activos'
                            ? 'Puede registrar uno nuevo desde el botón superior.'
                            : 'Los clientes inactivos aparecerán aquí y podrán reactivarse.'}
                        </p>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </main>

      {/* MODAL NUEVO CLIENTE */}
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
