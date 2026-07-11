'use client';

import React from 'react';
import { CheckCircle, AlertTriangle, FileClock, FileX, FileCheck, ShieldCheck } from 'lucide-react';

/**
 * Elementos comunes de presentación de los documentos fiscales emitidos
 * (papel de trabajo e informe cliente): sello con el estado REAL de la DDJJ,
 * marca de agua para estados no firmes y pie profesional con trazabilidad
 * normativa, fecha de emisión, aclaraciones legales y bloque de firma.
 */

export type FiscalDocumentParameterSet = {
  version?: number;
  sourceLaw?: string;
  status?: string;
};

type StatusVisual = {
  label: string;
  className: string;
  icon: React.ReactNode;
};

const STATUS_VISUALS: Record<string, StatusVisual> = {
  Cerrada: {
    label: 'Cerrada e Inmutable',
    className: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
    icon: <CheckCircle className="h-3.5 w-3.5" />,
  },
  Presentada: {
    label: 'Presentada ante ARCA',
    className: 'bg-sky-500/10 text-sky-400 border-sky-500/20',
    icon: <FileCheck className="h-3.5 w-3.5" />,
  },
  Borrador: {
    label: 'Borrador — Sujeto a revisión',
    className: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
    icon: <FileClock className="h-3.5 w-3.5" />,
  },
  Rectificada: {
    label: 'Rectificada',
    className: 'bg-violet-500/10 text-violet-400 border-violet-500/20',
    icon: <ShieldCheck className="h-3.5 w-3.5" />,
  },
  Anulada: {
    label: 'Anulada — Sin valor fiscal',
    className: 'bg-red-500/10 text-red-400 border-red-500/20',
    icon: <FileX className="h-3.5 w-3.5" />,
  },
};

const FALLBACK_VISUAL: StatusVisual = {
  label: 'Estado no informado',
  className: 'bg-zinc-500/10 text-zinc-400 border-zinc-500/20',
  icon: <AlertTriangle className="h-3.5 w-3.5" />,
};

export function TaxReturnStatusBadge({ status }: { status?: string }) {
  const visual = (status && STATUS_VISUALS[status]) || FALLBACK_VISUAL;
  return (
    <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold border uppercase tracking-widest print:border-black print:bg-white print:text-black ${visual.className}`}>
      {visual.icon}
      {visual.label}
    </span>
  );
}

/** Marca de agua diagonal para documentos que aún no son firmes (o quedaron sin valor). */
export function FiscalDocumentWatermark({ status }: { status?: string }) {
  const text = status === 'Borrador' ? 'BORRADOR' : status === 'Anulada' ? 'ANULADA' : null;
  if (!text) return null;
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 z-0 flex items-center justify-center overflow-hidden select-none">
      <span className="rotate-[-30deg] text-[7rem] md:text-[9rem] font-black tracking-[0.35em] text-zinc-100/[0.04] print:text-black/10 whitespace-nowrap">
        {text}
      </span>
    </div>
  );
}

function formatIssuedAt(date: Date): string {
  return `${date.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })} ${date.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })} hs`;
}

export function FiscalDocumentFooter({
  documentLabel,
  disclaimer,
  taxReturnVersion,
  parameterSet,
  showRecipientSignature = false,
}: {
  documentLabel: string;
  disclaimer: string;
  taxReturnVersion?: number;
  parameterSet?: FiscalDocumentParameterSet | null;
  showRecipientSignature?: boolean;
}) {
  // La fecha de emisión se fija al montar: es la del documento impreso, no un reloj vivo.
  const [issuedAt] = React.useState(() => new Date());

  const normativa = parameterSet?.sourceLaw
    ? `${parameterSet.sourceLaw}${parameterSet.version ? ` (set v${parameterSet.version}` : ''}${parameterSet.version && parameterSet.status ? `, ${parameterSet.status})` : parameterSet.version ? ')' : ''}`
    : 'Sin versión normativa informada';

  return (
    <footer className="relative z-10 mt-12 pt-6 border-t border-zinc-800 print:border-black space-y-6">
      {/* Trazabilidad del documento */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-[10px] font-mono text-zinc-500 print:text-black print:grid-cols-3">
        <div>
          <span className="block uppercase font-bold tracking-wider text-[9px] text-zinc-600 print:text-black">Documento</span>
          <span>{documentLabel}{typeof taxReturnVersion === 'number' ? ` — DDJJ v${taxReturnVersion}` : ''}</span>
        </div>
        <div>
          <span className="block uppercase font-bold tracking-wider text-[9px] text-zinc-600 print:text-black">Normativa aplicada</span>
          <span>{normativa}</span>
        </div>
        <div className="md:text-right print:text-right">
          <span className="block uppercase font-bold tracking-wider text-[9px] text-zinc-600 print:text-black">Emitido</span>
          <span>{formatIssuedAt(issuedAt)}</span>
        </div>
      </div>

      {/* Aclaración legal */}
      <p className="text-[10px] leading-relaxed text-zinc-600 print:text-black max-w-3xl">
        {disclaimer} Liquidación practicada conforme a la Ley de Impuesto a las Ganancias (t.o. 2019) y normas
        complementarias vigentes para el período fiscal declarado.
      </p>

      {/* Bloque de firmas (pensado para la copia impresa) */}
      <div className={`grid grid-cols-1 ${showRecipientSignature ? 'md:grid-cols-2 print:grid-cols-2' : 'md:grid-cols-2 print:grid-cols-2'} gap-12 pt-10`}>
        <div className="text-center">
          <div className="border-t border-zinc-600 print:border-black pt-2 mx-6">
            <span className="block text-[10px] uppercase tracking-wider font-bold text-zinc-500 print:text-black">Firma y sello del profesional interviniente</span>
            <span className="block text-[9px] text-zinc-600 print:text-black mt-0.5">JABA — Estudio Impositivo Contable</span>
          </div>
        </div>
        {showRecipientSignature ? (
          <div className="text-center">
            <div className="border-t border-zinc-600 print:border-black pt-2 mx-6">
              <span className="block text-[10px] uppercase tracking-wider font-bold text-zinc-500 print:text-black">Recepción y conformidad del contribuyente</span>
              <span className="block text-[9px] text-zinc-600 print:text-black mt-0.5">Aclaración y fecha</span>
            </div>
          </div>
        ) : (
          <div className="text-center">
            <div className="border-t border-zinc-600 print:border-black pt-2 mx-6">
              <span className="block text-[10px] uppercase tracking-wider font-bold text-zinc-500 print:text-black">Fecha y lugar de emisión</span>
              <span className="block text-[9px] text-zinc-600 print:text-black mt-0.5">&nbsp;</span>
            </div>
          </div>
        )}
      </div>
    </footer>
  );
}
