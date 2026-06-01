# Backlog Priorizado - Ganancias JABA

Ultima actualizacion: 2026-06-01

Uso: trabajar de arriba hacia abajo. Si se cambia el orden por decision del usuario o por bloqueo tecnico, registrar el motivo en `docs/REGISTRO_PROYECTO.md`.

## Estados permitidos

- `Activo`: frente actual.
- `Siguiente`: proximo frente si no hay bloqueo.
- `Pendiente`: no empezar todavia.
- `Bloqueado`: requiere dato, decision o entorno.
- `Resuelto`: cerrado con verificacion y registro.

## P0 - Continuidad y control operativo

Estado: Resuelto.

Problema:

- Al retomar se pierde tiempo reconstruyendo contexto desde una bitacora historica larga.
- Hay varios frentes abiertos y algunos pendientes viejos ya fueron resueltos por cambios posteriores.

Accion:

- Mantener `docs/CONTINUAR_AQUI.md` como puerta de entrada.
- Mantener este backlog como lista unica de prioridades.
- Actualizar estado luego de cada commit relevante.

Criterio de cierre:

- Archivos de continuidad creados.
- Registro historico enlaza a la puerta de entrada.
- Commit y push realizados.

## P1 - Reducir riesgo operativo del wizard

Estado: Resuelto.

Problema:

- El wizard concentra carga, calculo, persistencia, importacion y UI.
- `eslint src/app/declaraciones/crear/wizard/page.tsx` falla por deuda previa: `any`, `setState` en efectos, `Date.now` y warnings.
- Esta deuda no rompe build, pero dificulta trabajar con seguridad y vuelve mas caro retomar.

Accion recomendada:

- No reescribir todo el wizard.
- Extraer helpers puros y testeables cuando se toque una zona.
- Tipar datos de ventas/compras/bancos/retenciones por etapas.
- Reducir efectos que derivan estado cuando pueda calcularse durante render o inicializacion.

Avance 2026-06-01:

- Primer corte aplicado: formato monetario extraido a `src/domain/ganancias/presentation/moneyFormat.ts`.
- Test agregado: `src/domain/ganancias/tests/moneyFormat.test.ts`.
- `eslint` del wizard baja de 34 problemas registrados a 31 problemas actuales.
- Se elimino un import no usado (`Info`).
- Segundo corte aplicado: tipos de estado del wizard extraidos a `src/domain/ganancias/presentation/wizardStateTypes.ts`.
- Test agregado: `src/domain/ganancias/tests/wizardStateTypes.test.ts`.
- Se eliminaron los `any` explicitos del estado principal del wizard y de handlers/mapeos tocados.
- Se reemplazaron dos `Date.now()` de alta manual por ids deterministas basados en cantidad actual de filas.
- `eslint` del wizard baja a 5 problemas actuales: 4 errores y 1 warning, concentrados en efectos de React/carga inicial.
- Tercer corte aplicado: se elimino la sincronizacion artificial de `persistedReturnId`, se derivo `isLoadingData`, se ordeno `activeParams` por clave de resolucion y el reset de datos se movio al evento real de cambio de identidad.
- `eslint src/app/declaraciones/crear/wizard/page.tsx`: OK.

Criterio de cierre:

- Definir cortes pequenos.
- Lograr que al menos una zona del wizard quede sin nuevos `any`.
- Mantener `vitest run`, `tsc --noEmit` y `next build --webpack` verdes.
- Registrar deuda remanente con conteo o secciones afectadas.
- P1 queda resuelto; no queda deuda focal de ESLint en el wizard.

## P2 - H6: consolidar calculo backend/frontend

Estado: Activo.

Problema:

- El wizard todavia mantiene calculo local con fallback mientras tambien consume preview backend.
- Riesgo: que el usuario vea un resultado distinto al que se guarda.

Accion recomendada:

- Mantener preview backend como fuente preferida.
- Definir si el calculo local queda solo como modo degradado visible o se elimina.
- Cubrir con tests de presentacion/preview antes de tocar UI.

Criterio de cierre:

- La UI indica claramente fuente del resultado.
- No hay diferencias silenciosas entre resultado visible y guardado.
- El papel de trabajo y guardado usan el mismo mapper/motor.

## P3 - H4/H2: AXI e indices utiles

Estado: Pendiente.

Problema:

- El archivo de indices trae coeficientes utiles que hoy se auditan, pero no se aplican completamente en AXI.
- El modelo actual guarda IPC mensual, no todos los coeficientes derivados utiles.

Accion recomendada:

- Definir si los coeficientes utiles se calculan on demand o se persisten.
- Mapear AXI estatico/dinamico contra planilla.
- Agregar pruebas contra archivo real antes de cambiar formulas.

Criterio de cierre:

- AXI estatico y dinamico tienen carga guiada y trazable.
- Coeficientes usados en calculo pueden auditarse.

## P4 - H7: patrimonio y justificacion patrimonial

Estado: Pendiente.

Problema:

- JVP y consumo diferencial estan simplificados frente a la planilla.
- Faltan rubros patrimoniales/justificativos suficientes para casos reales.

Accion recomendada:

- Mapear JVP contra hojas `JVP`, `Creditos`, `Pasivo`, `Banco`.
- Agregar rubros en carga sin volver lenta la pantalla.
- Mostrar papel de trabajo claro.

Criterio de cierre:

- Consumo/variacion patrimonial se explica por rubros.
- La carga patrimonial no depende de campos genericos opacos.

## P5 - H3: deducciones generales remanentes

Estado: Pendiente.

Problema:

- Ya se corrigieron rubros importantes, pero falta confirmar equivalencia completa contra `IG 25` y `Ded. Gen.`.

Accion recomendada:

- Hacer tabla rubro por rubro: planilla, app, formula, tope, estado.
- Agregar tests antes de modificar formulas.

Criterio de cierre:

- Cada deduccion tiene estado: igual a Excel, decision intencional o pendiente normativo.

## P6 - H5 remanente: auditoria importada completa

Estado: Pendiente.

Problema:

- Ventas/compras ya conservan detalle principal.
- Falta evaluar columnas propias para CUIT y completar detalle de retenciones/certificados.

Accion recomendada:

- Definir si `counterpartyCuit` merece migracion a `SalesInvoice` y `PurchaseInvoice`.
- Preservar regimen/certificado/agente en retenciones importadas.

Criterio de cierre:

- Datos importados necesarios para revision quedan en DB consultable o snapshot documentado.

## P7 - Validaciones visuales/manuales

Estado: Bloqueado parcialmente.

Problema:

- Browser integrado fallo por sandbox de Windows.
- Playwright CLI no esta disponible porque no hay `npx` en el runtime actual.

Accion recomendada:

- Validar manualmente pantalla de wizard cuando el navegador este disponible.
- Si se instala/disponibiliza Playwright CLI, agregar capturas de pasos criticos.

Criterio de cierre:

- Flujo visual de alta/guardado/importacion validado con caso real o fixture realista.

## Pendientes resueltos que no deben reabrirse sin motivo

- H1: falsa sincronizacion ARCA, mitigada por cambio de lenguaje.
- H8: alta nueva desde wizard persiste carga completa en POST atomico.
- H9: reapertura con fechas invalidas/nulas no rompe la API.
- Desglose de deducciones generales en papel de trabajo independiente.
- Preview backend creado y conectado al wizard con fallback visible.
