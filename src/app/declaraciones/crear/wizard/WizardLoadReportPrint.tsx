import type { WizardLoadReport } from '@/domain/ganancias/presentation/wizardLoadReport';

type WizardLoadReportPrintProps = {
  report: WizardLoadReport;
};

function metricToneClass(tone: WizardLoadReport['metrics'][number]['tone']): string {
  if (tone === 'ok') return 'border-emerald-700 bg-emerald-50';
  if (tone === 'warning') return 'border-amber-700 bg-amber-50';
  return 'border-zinc-300 bg-white';
}

export function WizardLoadReportPrint({ report }: WizardLoadReportPrintProps) {
  return (
    <section className="hidden print:block bg-white text-black font-sans">
      <style jsx global>{`
        @media print {
          @page {
            size: A4;
            margin: 14mm 12mm;
          }

          body {
            background: white !important;
          }

          .jaba-print-page {
            break-after: page;
          }

          .jaba-print-page:last-child {
            break-after: auto;
          }
        }
      `}</style>

      <article className="jaba-print-page min-h-[260mm] text-[11px] leading-relaxed">
        <header className="border-b-2 border-black pb-5 mb-6">
          <div className="flex items-start justify-between gap-6">
            <div>
              <p className="text-[10px] uppercase tracking-[0.28em] font-black text-zinc-600">JABA - Estudio Impositivo Contable</p>
              <h1 className="mt-2 text-2xl font-black tracking-tight">{report.metadata.title}</h1>
              <p className="mt-2 text-xs text-zinc-700">Soporte profesional de los datos cargados en el asistente de liquidacion.</p>
            </div>
            <div className="border border-black px-4 py-3 text-right min-w-44">
              <p className="text-[9px] uppercase tracking-widest font-black text-zinc-600">Periodo Fiscal</p>
              <p className="text-2xl font-black">{report.metadata.fiscalYear}</p>
              <p className="mt-1 text-[10px] font-bold">{report.metadata.status}</p>
            </div>
          </div>

          <div className="mt-5 grid grid-cols-3 gap-3">
            <div className="border border-zinc-300 p-3">
              <p className="text-[9px] uppercase tracking-widest font-black text-zinc-600">Contribuyente</p>
              <p className="mt-1 font-bold">{report.metadata.clientName}</p>
            </div>
            <div className="border border-zinc-300 p-3">
              <p className="text-[9px] uppercase tracking-widest font-black text-zinc-600">CUIT</p>
              <p className="mt-1 font-mono font-bold">{report.metadata.cuit}</p>
            </div>
            <div className="border border-zinc-300 p-3">
              <p className="text-[9px] uppercase tracking-widest font-black text-zinc-600">Emitido</p>
              <p className="mt-1 font-bold">{report.metadata.emittedAt}</p>
            </div>
          </div>
        </header>

        <section className="mb-6">
          <h2 className="text-[11px] uppercase tracking-[0.18em] font-black border-b border-black pb-1 mb-3">
            Resumen de carga
          </h2>
          <div className="grid grid-cols-4 gap-3">
            {report.metrics.map(metric => (
              <div key={metric.label} className={`border p-3 ${metricToneClass(metric.tone)}`}>
                <p className="text-[9px] uppercase tracking-widest font-black text-zinc-600">{metric.label}</p>
                <p className="mt-1 text-lg font-black">{metric.value}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="mb-6">
          <h2 className="text-[11px] uppercase tracking-[0.18em] font-black border-b border-black pb-1 mb-3">
            Controles y advertencias
          </h2>
          <ul className="space-y-1.5">
            {report.validationNotices.map(notice => (
              <li key={notice} className="border border-zinc-300 px-3 py-2">
                {notice}
              </li>
            ))}
          </ul>
        </section>

        <section className="grid grid-cols-2 gap-4">
          {report.sections.map(section => (
            <div key={section.title} className="break-inside-avoid border border-zinc-300 p-3">
              <h3 className="text-[10px] uppercase tracking-[0.15em] font-black border-b border-zinc-300 pb-1">
                {section.title}
              </h3>
              <p className="mt-1 mb-2 text-[10px] text-zinc-600">{section.subtitle}</p>
              <table className="w-full border-collapse">
                <tbody>
                  {section.rows.map(row => (
                    <tr key={`${section.title}-${row.label}`} className="border-b border-zinc-200 last:border-0">
                      <td className="py-1.5 pr-2 align-top text-zinc-700">{row.label}</td>
                      <td className="py-1.5 text-right align-top font-mono font-bold">{row.value}</td>
                      {row.detail && (
                        <td className="py-1.5 pl-2 text-right align-top text-[10px] text-zinc-600">{row.detail}</td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </section>

        <footer className="mt-8 border-t border-black pt-3 text-[9px] text-zinc-600">
          <p>
            Reporte de soporte de carga generado por JABA. Debe conservarse junto con la documentacion respaldatoria,
            comprobantes AFIP, papeles de trabajo y conciliaciones contables.
          </p>
        </footer>
      </article>
    </section>
  );
}
