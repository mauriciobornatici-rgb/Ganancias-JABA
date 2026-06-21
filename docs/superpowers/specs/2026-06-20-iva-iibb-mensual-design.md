# Diseno: Modulo IVA + IIBB Mensual Integrado con Ganancias

**Fecha:** 2026-06-20  
**Estado:** Diseno aprobado para planificacion. No implementado.  
**Rama de trabajo:** `feature/iva-iibb-mensual-core`  
**Ambiente de desarrollo:** Docker `ganancias_jaba_test` unicamente.

## Objetivo

Registrar una unica vez los comprobantes mensuales de cada cliente para preparar, revisar y archivar las liquidaciones de IVA e IIBB. La DDJJ anual de Ganancias reutiliza esos datos mediante una consolidacion controlada, sin volver a cargarlos ni modificar declaraciones anuales ya cerradas.

La aplicacion produce papeles de trabajo y preliquidaciones auditables. La presentacion legal se realiza inicialmente en los portales oficiales y queda registrada como evidencia; no se automatiza el ingreso con credenciales de ARCA, ARBA o SIFERE en este modulo.

## Alcance inicial

Incluido:

- IVA de responsables inscriptos: preliquidacion mensual alineada con IVA Simple/F.2051, debito y credito por alicuota, ajustes manuales, pagos a cuenta, retenciones, percepciones, saldos tecnicos y conciliacion con Portal IVA.
- IIBB local de Provincia de Buenos Aires bajo DDJJ Web ARBA, para contribuyentes de regimen general.
- Convenio Multilateral bajo regimen general: distribucion mensual por jurisdiccion con coeficientes anuales CM05 cargados, versionados y aprobados por el contador.
- Importacion de comprobantes ARCA/AFIP existentes, carga manual complementaria y control de duplicados.
- Consolidacion hacia Ganancias de ventas, compras y gastos clasificados, IVA no computable e IIBB determinado, conservando evidencia del origen mensual.
- Estados independientes, rectificativas, auditoria, PDF profesional y adjuntos de soporte.

Excluido deliberadamente de la primera entrega:

- Regimen Simplificado/Monotributo Unificado de IIBB.
- Regimenes especiales de Convenio Multilateral; se detectan y bloquean con mensaje explicito para evitar una liquidacion generica incorrecta.
- Presentacion automatica, VEP automatico o manejo de credenciales oficiales.
- Calculo autonomo de coeficientes CM05 desde comprobantes mensuales. La aplicacion almacena el coeficiente vigente aprobado; la confeccion anual CM05 es un proceso contable separado.

## Fundamento normativo

- ARCA informa que desde noviembre de 2025 los responsables inscriptos determinan e ingresan IVA mediante IVA Simple. La DDJJ mensual es F.2051 y se confecciona en Portal IVA.
- Portal IVA pone a disposicion comprobantes, retenciones, percepciones, pagos a cuenta y saldos existentes; el contribuyente debe validarlos y puede ajustar, incorporar, eliminar o importar datos. El resultado de la app debe por tanto conciliarse contra el portal, no reemplazarlo silenciosamente.
- ARBA diferencia DDJJ Web de IIBB local, Regimen Simplificado y Convenio Multilateral. Las deducciones/percepciones disponibles deben revisarse y pueden complementarse manualmente o por importacion.
- El Convenio Multilateral requiere separar regimen general y especiales. En esta etapa solo se permite regimen general con coeficientes aprobados.

Fuentes oficiales verificadas el 2026-06-20:

- https://www.arca.gob.ar/iva/iva-simple/sujetos-operaciones-alcanzadas.asp
- https://www.arca.gob.ar/iva/iva-simple/confeccion-declaracion.asp
- https://www.arca.gob.ar/iva/iva-simple/presentacion.asp
- https://web.arba.gov.ar/ingresos-brutos

Las alicuotas, vencimientos, nomencladores y parametros se almacenan con vigencia, fuente y aprobacion. Nunca se hardcodean como reglas permanentes.

## Arquitectura de datos

No se reapuntan ni se borran `SalesInvoice` y `PurchaseInvoice` actuales: hoy dependen de `TaxReturn` y son evidencia de DDJJ anuales existentes. Una migracion destructiva comprometeria auditoria, rectificativas y calculos cerrados.

Se incorpora un libro fiscal mensual paralelo e independiente:

```text
Client
|- ClientTaxProfileVersion
|- FiscalPeriod (cliente, ano, mes)
|  |- FiscalDocument
|  |  |- FiscalDocumentVatLine
|  |  |- FiscalDocumentAllocation
|  |- TaxCreditRecord
|  |- VatSettlement
|  |  |- VatSettlementLine
|  |- GrossIncomeSettlement
|     |- GrossIncomeJurisdictionLine
|- ConventionCoefficientVersion
`- TaxReturn
   `- AnnualFiscalConsolidationSnapshot
```

### Responsabilidades

- `ClientTaxProfileVersion`: condicion IVA, regimen IIBB, actividad/codigo, jurisdicciones, inscripciones, regimen CM y vigencia. Impide liquidar con un perfil ambiguo.
- `FiscalPeriod`: contenedor mensual unico por cliente, ano y mes. No decide por si mismo el estado de IVA o IIBB.
- `FiscalDocument`: comprobante fuente de venta, compra o ajuste, con origen, hash/importacion, comprobante relacionado y referencia a documento rectificado/anulado cuando corresponda.
- `FiscalDocumentVatLine`: base, alicuota, impuesto, exento/no gravado y computabilidad. Permite varias alicuotas en un comprobante.
- `FiscalDocumentAllocation`: clasificacion para Ganancias: venta gravada/exenta, mercaderia, gasto deducible, bien de uso, no deducible, IVA no computable u otra asignacion aprobada. Evita tratar toda compra como gasto.
- `TaxCreditRecord`: retencion, percepcion, pago a cuenta o saldo trasladable, identificado por impuesto, jurisdiccion, agente, certificado, fecha, importe, documento soporte, aplicado y remanente.
- `VatSettlement`: preliquidacion IVA, conciliacion oficial, importes presentados/pagados y flujo de rectificativas.
- `GrossIncomeSettlement`: preliquidacion IIBB local o CM; conserva lineas por jurisdiccion y el parametro normativo usado.
- `ConventionCoefficientVersion`: coeficiente CM05 por cliente, ejercicio, jurisdiccion, vigencia, fuente y aprobacion. La suma de coeficientes activos debe ser exactamente 1.
- `AnnualFiscalConsolidationSnapshot`: fotografia inmutable de los periodos mensuales seleccionados y sus clasificaciones al consolidar Ganancias.

## Estados y trazabilidad

IVA e IIBB son procesos independientes. Cada liquidacion usa:

```text
Borrador -> EnRevision -> ListaParaPresentar -> PresentadaExternamente -> Cerrada
                                                     |
                                                     `-> Rectificativa
```

- Una liquidacion presentada o cerrada no se sobreescribe.
- Una correccion crea una rectificativa vinculada a la original, con motivo y auditoria.
- El periodo mensual solo se considera cerrado cuando sus liquidaciones aplicables estan cerradas o existe una excepcion documentada.
- El sistema guarda calculo, parametros, documentos incluidos, usuario, fecha y evidencia de presentacion/pago.

## Reglas de calculo

### IVA

- Debito fiscal: suma de lineas de ventas gravadas por alicuota; exentos y no gravados se exhiben por separado.
- Credito fiscal: solo lineas de compras marcadas como computables. Facturas C o comprobantes sin IVA discriminado no generan credito fiscal por defecto.
- Saldo tecnico: se calcula y arrastra por periodo segun la naturaleza del saldo. El sistema impide cerrar un mes si falta el saldo de origen necesario o permite una excepcion auditada.
- Retenciones, percepciones y pagos a cuenta se muestran por tipo y se aplican con una regla explicita; no se mezclan con saldo tecnico solo por sumar importes.
- Conciliacion obligatoria: diferencia entre preliquidacion JABA y valor presentado en Portal IVA debe ser cero o contar con motivo, ajuste y soporte.

### IIBB ARBA local

- Base imponible: ingresos gravados del periodo segun perfil fiscal, actividad y ajustes aprobados; no se deriva ciegamente del total facturado.
- Alicuota: parametro versionado por actividad, jurisdiccion y vigencia.
- Retenciones/percepciones: se imputan como creditos por jurisdiccion y certificado, conservando remanente.
- Se emite preliquidacion para conciliacion contra DDJJ Web ARBA y se registra la presentacion externa.

### Convenio Multilateral

- Solo se habilita cuando el perfil declara `CM_REGIMEN_GENERAL`.
- La base mensual se distribuye con los coeficientes CM05 vigentes aprobados por el contador, por jurisdiccion.
- Cada linea identifica jurisdiccion, actividad, base asignada, alicuota, impuesto, creditos aplicados y saldo.
- Si faltan coeficientes, su suma no es uno o el cliente tiene regimen especial, no se permite cerrar; se exige correccion o excepcion documentada.

### Ganancias

- Para Responsable Inscripto, las operaciones se consolidan netas de IVA computable.
- IVA no computable se incorpora unicamente segun la asignacion del comprobante, nunca como regla global.
- Ventas, mercaderia, gastos, bienes de uso y no deducibles se transfieren conforme a `FiscalDocumentAllocation`.
- IIBB determinado se incorpora como gasto del giro en una linea identificable; los creditos de IIBB no se convierten en pagos a cuenta de Ganancias.
- Retenciones/percepciones de Ganancias se transfieren como pagos a cuenta solo si su impuesto origen es Ganancias.
- Una DDJJ anual cerrada conserva su snapshot y no se recalcula por cambios posteriores de meses.

## Experiencia de uso

1. Cliente > seleccionar mes.
2. Importar ventas/compras ARCA y soportes de retenciones/percepciones.
3. Revisar duplicados, alicuotas, comprobantes sin clasificar, IVA computable y asignacion a Ganancias.
4. Revisar y cerrar preliquidacion IVA con conciliacion Portal IVA.
5. Revisar y cerrar preliquidacion IIBB local o CM con conciliacion ARBA/SIFERE.
6. Adjuntar acuse, VEP y comprobante de pago.
7. En Ganancias, seleccionar los doce periodos y generar una consolidacion revisable antes de guardar el snapshot anual.

La pantalla principal debe exhibir una grilla de doce meses con estado separado de IVA e IIBB, alertas de meses faltantes, diferencias de conciliacion, creditos sin aplicar y clasificaciones pendientes.

## Seguridad y operaciones

- Todo desarrollo, migracion y seed se ejecuta contra Docker `ganancias_jaba_test` mediante los scripts existentes `db:test:*` y `dev:testdb`.
- No se ejecuta `prisma db push` ni migraciones contra Hostinger durante desarrollo.
- Antes de una migracion productiva: backup SQL, prueba de restauracion local, deploy probado en Preview con DB staging o sin DB productiva, y `prisma migrate deploy` manual aprobado.
- Los archivos fuente, acuses y comprobantes se almacenan como adjuntos con hash, periodo y relacion a la liquidacion.
- No se almacenan credenciales de organismos fiscales en la base ni se automatiza presentacion oficial en la primera entrega.

## Estrategia de entrega

1. Fundacion: perfil fiscal, parametros versionados y libro fiscal mensual sin afectar Ganancias actual.
2. IVA Simple: lineas por alicuota, creditos, arrastres, conciliacion y pruebas de casos reales.
3. IIBB local ARBA: base, actividad, alicuota, creditos, conciliacion y pruebas.
4. CM regimen general: coeficientes aprobados, distribucion por jurisdiccion, controles y pruebas.
5. Consolidacion Ganancias: clasificaciones, snapshot anual, controles anti-duplicacion y pruebas de regresion contra Excel.
6. UX, PDFs, adjuntos, prueba piloto y publicacion controlada.

Cada entrega es reversible, incluye migracion Prisma versionada, pruebas Docker, pruebas de dominio, verificacion de tipos/build y un commit separado. Produccion solo se toca despues de Preview validado, backup y aprobacion explicita.

## Criterios de aceptacion globales

- Ninguna DDJJ anual existente cambia por habilitar el modulo mensual.
- Un comprobante se importa una sola vez y puede explicar su impacto en IVA, IIBB y Ganancias.
- Todo saldo mensual tiene origen, aplicacion, remanente y evidencia.
- Los meses no conciliados o sin perfil/parametros completos no pueden cerrarse sin excepcion auditada.
- IIBB local, CM general y regimenes especiales nunca comparten un calculo generico silencioso.
- La consolidacion anual puede reconstruirse desde su snapshot aun cuando cambie la carga mensual despues del cierre.
- Todas las pruebas de desarrollo usan Docker, nunca Hostinger productivo.
