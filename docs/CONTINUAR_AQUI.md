# Continuar Aqui - Ganancias JABA

Ultima actualizacion: 2026-06-08

Este es el primer archivo a leer cuando se retoma el proyecto. La bitacora larga sigue en `docs/REGISTRO_PROYECTO.md`, pero no deberia ser necesario recorrerla completa para saber por donde seguir.

## Estado actual

- Rama activa: `fix/produccion-parametros-axi-deducciones`.
- Rama productiva publicada: `main`.
- Rama de pruebas publicada: `staging`.
- Ultimo checkpoint documentado: hotfix produccion parametros/AXI/deducciones.
- Fase activa: endurecimiento profesional para uso operativo seguro.
- Fuente funcional principal: planilla `DJ Ganancias 2025 - Tercera Categoria.xlsx`.
- Objetivo de producto: carga agil, explicable y auditable para un estudio chico/unipersonal.
- Estado de uso: listo para iniciar piloto controlado, con salvedad de validar visualmente el caso real de capturas nuevas en navegador.
- Caso patron de carga documentado: `docs/INSTRUCTIVO_CARGA_CASO_EXCEL_2025.md`.

## Como retomar en 5 minutos

1. Ejecutar `git status --short --branch`.
2. Leer esta pagina completa.
3. Abrir `docs/PROCEDIMIENTO_DESARROLLO_SEGURO.md`.
4. Si se va a desarrollar o probar, usar `npm run dev:testdb` contra Docker, no `npm run dev`.
5. Si se va a validar contra Excel/capturas, abrir `docs/INSTRUCTIVO_CARGA_CASO_EXCEL_2025.md`.
6. Abrir `docs/GUIA_PRUEBA_PILOTO.md`.
7. Abrir `docs/BACKLOG_PRIORIZADO.md`.
8. Tomar el primer item con estado `Activo` o `Siguiente`.
9. No abrir un nuevo frente si hay uno `En curso`, salvo instruccion explicita del usuario.
10. Al terminar una unidad, actualizar `docs/REGISTRO_PROYECTO.md` y este archivo si cambia la prioridad.
11. Correr verificacion fresca antes de decir que algo quedo terminado.
12. Hacer commit y push a GitHub al cerrar cada bloque util.

## Ultima unidad cerrada

### Hotfix produccion - Parametros, AXI y deducciones

Estado: implementado en rama `fix/produccion-parametros-axi-deducciones`, pendiente de merge controlado a `main`.

Origen:

- En produccion fallaba "Guardar indices" con timeout de Prisma/Hostinger.
- Ajuste dinamico mostraba retiro/aporte con signo invertido.
- La pantalla indicaba que faltaban indices IPC aunque los valores estaban cargados.
- Las deducciones aparecian en cero cuando habia indices activos pero faltaba `parameterSet`.

Cambios aplicados:

- `PUT /api/parametros` usa timeout de transaccion ampliado para Hostinger.
- El wizard arma parametros efectivos con fallback de deducciones si la API no trae `parameterSet`.
- Los indices visibles en pantalla alimentan el calculo aunque todavia no hayan sido recargados desde la API.
- Se normaliza coma decimal en indices IPC.
- AXI estatico ignora indices cero para evitar `Infinity`/`-0`.
- Ajuste dinamico se calcula como `Capital Afectado Teorico - Capital Afectado Real`.

Verificacion ejecutada:

- Tests focales: OK, 7 tests.
- `vitest run`: OK, 36 archivos y 135 tests.
- `tsc --noEmit`: OK.
- `prisma validate --schema prisma/schema.prisma`: OK.
- Lint focalizado: OK.
- `check-deployment-db-safety`: OK.
- `next build --webpack`: OK.

Pendiente inmediato:

- Repetir verificacion final si se toca algo mas.
- Mergear a `main` para que Vercel publique el hotfix.
- Probar en produccion: guardar indices, revisar AXI, revisar deducciones.

### Parentesis - Instructivo de carga del caso Excel/capturas

Estado: documentado.

Objetivo inmediato:

- Darle al usuario y al estudio una guia didactica para cargar exactamente el caso numerico de control.
- Explicar que valor poner, en que paso y en que campo.
- Separar importes cargables, importes calculados y controles esperados.

Documento creado:

- `docs/INSTRUCTIVO_CARGA_CASO_EXCEL_2025.md`.

Hallazgo importante:

- El archivo fisico `DJ Ganancias 2025 - Tercera Categoria.xlsx` esta como base/plantilla sin datos operativos al leerlo desde el proyecto.
- Los valores reales de la prueba salen de las capturas del 06/06/2026 y del test interno `simulacionUsuario.test.ts`.
- La guia advierte no mezclar este caso con el escenario anterior de AXI `-429.715,06`.

Uso recomendado:

- Usar esta guia para P19 - Validacion real contra Excel en Docker.
- Cargar primero en base Docker con `npm run dev:testdb`, guardar, reabrir y comparar con los controles redondeados.

### P18-P27 - Plan App 10/10

Estado: planificado y registrado.

Objetivo inmediato:

- Ordenar todas las mejoras necesarias para que la app quede profesional, segura, auditable y validada.
- Evitar frentes sueltos.
- Registrar nuevos hallazgos como `Pxx` con criterio de cierre.

Documentos creados:

- `docs/PLAN_APP_10_10.md`.
- `docs/superpowers/plans/2026-06-08-app-10-10.md`.

Orden recomendado:

1. P18 - Autenticacion y proteccion de acceso.
2. P19 - Validacion real contra Excel en Docker.
3. P20 - Workflow profesional de DDJJ.
4. P21 - Backup/restauracion y salud operativa.
5. P22 - Adjuntos, soportes y paquete final.
6. P23 - Parametros fiscales, tipos de cambio y casos especiales.
7. P24 - Calidad tecnica y mantenibilidad.
8. P25 - UX 10/10 y controles por pantalla.
9. P26 - E2E y prueba visual.
10. P27 - Produccion controlada.

Proximo frente recomendado:

- P18 - Autenticacion y proteccion de acceso, porque la app ya esta publicada en Vercel.

### P17 - Base Docker local de pruebas

Estado: resuelto tecnicamente.

Objetivo inmediato:

- Simular una base MySQL de pruebas local sin tocar Hostinger.
- Poder levantar la app local contra Docker con comandos simples.
- Probar migraciones, seeds y cargas ficticias antes de publicar cambios.

Avance:

- `docker-compose.yml` define `mysql-test` con base `ganancias_jaba_test`.
- Puerto local elegido: `3317`, porque `3307` estaba ocupado.
- URL de pruebas: `mysql://jaba_test:***@127.0.0.1:3317/ganancias_jaba_test`.
- Se agrego `.env.docker.example`.
- Se agrego `scripts/run-test-db-command.mjs` para ejecutar Prisma/Next contra Docker.
- Se agrego `scripts/seed-test-db.mjs` en JS puro, sin depender de `npx/tsx`.
- Scripts npm agregados: `db:test:up`, `db:test:migrate`, `db:test:seed`, `db:test:reset`, `db:test:down`, `db:test:studio`, `dev:testdb`.
- Guia creada: `docs/BASE_DOCKER_PRUEBAS.md`.

Verificacion ejecutada:

- Docker disponible: `Docker version 29.4.2`, Compose `v5.1.3`.
- Primer intento en puerto `3307`: bloqueado por puerto ocupado.
- Reconfigurado a `3317`.
- `docker compose up -d --force-recreate mysql-test`: OK.
- Healthcheck Docker: `healthy`; `mysqladmin ping`: `mysqld is alive`.
- `scripts/run-test-db-command.mjs migrate`: OK, migracion inicial aplicada.
- `scripts/seed-test-db.mjs`: OK, 2 clientes, 2 periodos, 1 set de parametros, 9 escalas, 12 indices.
- Validacion de URL de app: apunta a `127.0.0.1:3317/ganancias_jaba_test`.

Uso recomendado:

```powershell
npm run db:test:up
npm run db:test:migrate
npm run db:test:seed
npm run dev:testdb
```

### P16 - Flujo seguro de deploy y resguardo de DB productiva

Estado: resuelto tecnicamente, pendiente ajustar variable en Vercel si aun figura como Production and Preview.

Objetivo inmediato:

- Mantener `main` como produccion.
- Crear `staging` como rama de pruebas/Preview.
- Evitar que Preview/Staging use la DB productiva por accidente.
- Dejar CI y documentacion para probar antes de pasar a produccion.

Avance:

- Guia operativa creada: `docs/FLUJO_SEGURO_DEPLOY.md`.
- Plan guardado: `docs/superpowers/plans/2026-06-07-flujo-seguro-deploy.md`.
- Guarda agregada: `scripts/check-deployment-db-safety.mjs`.
- Test agregado: `src/domain/ganancias/tests/deploymentDbSafety.test.ts`.
- `prebuild` ejecuta la guarda antes de `next build`.
- CI agregado en `.github/workflows/ci.yml` para `main` y `staging`.
- Si Vercel Preview usa `u669600172_ganancias_jaba`, el build queda bloqueado.
- Si Vercel Production no tiene `DATABASE_URL`, el build queda bloqueado.
- Si Vercel Preview no tiene `DATABASE_URL`, se permite porque no puede escribir en produccion.

Pendiente al retomar:

- En Vercel, confirmar que `DATABASE_URL` este marcada solo para `Production`.
- Si se quiere probar persistencia real en Preview, crear DB staging separada y configurar Preview con esa URL.
- No ejecutar migraciones productivas sin backup SQL previo de Hostinger.

Verificacion ejecutada:

- TDD rojo confirmado: el test nuevo fallo inicialmente por falta del script de guarda.
- `deploymentDbSafety.test.ts`: OK, 7 tests.
- Prueba CLI manual: Preview con DB productiva bloqueado; Production desde `main` permitido.
- `vitest run`: OK, 34 archivos y 129 tests.
- `tsc --noEmit`: OK.
- `prisma validate --schema prisma/schema.prisma`: OK.
- `check-deployment-db-safety` + `next build --webpack`: OK.
- `git diff --check`: OK, solo avisos CRLF habituales de Windows.

### P15 - Base de datos MySQL Hostinger/Vercel

Estado: resuelto tecnicamente, produccion Hostinger/Vercel conectada.

Objetivo inmediato:

- Crear la arquitectura de base MySQL para Hostinger y Vercel.
- Guardar declaraciones y carga operativa en tablas relacionales, manteniendo snapshot como auditoria.
- Preparar la base para uso personal inicial y extension futura a multiusuario.

Avance:

- Plan guardado: `docs/superpowers/plans/2026-06-07-base-datos-hostinger.md`.
- Guia operativa creada: `docs/ARQUITECTURA_BASE_DATOS_HOSTINGER.md`.
- Arquitectura objetivo: GitHub contiene codigo/migraciones, Vercel despliega y ejecuta la app, Hostinger MySQL persiste datos reales.
- Recomendacion Hostinger:
  - base completa: `u669600172_ganancias_jaba`;
  - usuario completo: `u669600172_jaba_app`.
- DB/usuario creados en Hostinger el 2026-06-07.
- Sitio asociado en Hostinger: `lightgray-herring-775204.hostingersite.com`.
- Host MySQL remoto confirmado: `srv1199.hstgr.io`.
- Remote MySQL habilitado para `u669600172_ganancias_jaba` con acceso `%` (cualquier host).
- Conexion remota verificada y migracion Prisma aplicada en Hostinger el 2026-06-07: 35 tablas creadas.
- Seed inicial ejecutado en Hostinger el 2026-06-07: 3 clientes, 2 periodos fiscales, 1 set de parametros, 9 tramos Art. 94, 12 indices, 1 DDJJ historica y 1 ejecucion.
- Password no registrada por seguridad; se recomienda regenerarla si quedo expuesta en capturas.
- Se agrego `.env.example` y `.gitignore` permite versionarlo sin credenciales reales.
- Se agrego helper de conexion segura sin fallback local silencioso.
- `schema.prisma` incorpora CUIT de contraparte, bajas/perdidas de bienes de uso, deducciones, AXI estatico, adjuntos binarios e importaciones AFIP.
- Migracion inicial: `prisma/migrations/20260607000100_initial_hostinger_mysql/migration.sql`.

Pendiente al retomar:

- Revisar/actualizar parametros reales antes de usar una DDJJ productiva.
- Implementar endpoints finales de adjuntos/importaciones si se prioriza guardar soportes binarios desde UI.

Verificacion ejecutada:

- `prisma validate`: OK.
- Tests focalizados DB/persistencia: OK.
- `vitest run`: OK, 33 archivos y 122 tests.
- `tsc --noEmit`: OK.
- `next build --webpack`: OK.
- `git diff --check`: OK, solo avisos CRLF habituales.

### P14 - Legajo profesional de carga PDF e instructivo de carga

Estado: resuelto tecnicamente, pendiente validacion visual manual del PDF generado desde navegador.

Objetivo inmediato:

- Reemplazar la impresion desprolija de pantalla por un legajo profesional de soporte de carga.
- Documentar el orden correcto de carga para evitar duplicaciones y errores de calculo.

Criterio de cierre:

- El boton del wizard se presenta como `Generar Legajo de Carga (PDF)`.
- La impresion usa un reporte print-only profesional con portada, resumen, secciones por paso, controles y leyenda.
- `buildWizardLoadReport` arma un modelo testeable del legajo desde datos en memoria.
- `docs/INSTRUCTIVO_CARGA_DDJJ_GANANCIAS.md` explica carga correcta, errores frecuentes y checklist final.
- Verificacion ejecutada: `vitest run` OK con 31 archivos y 106 tests, `tsc --noEmit` OK, `next build --webpack` OK, `git diff --check` OK y lint focalizado de archivos nuevos OK.

Pendiente al retomar:

- Validar visualmente en navegador el PDF A4 generado desde el boton.
- Commit y push ya realizados en `6df8154 feat: generar legajo profesional de carga`.

### P13 - Sincronizacion de saldos iniciales desde AXI

Estado: resuelto tecnicamente, pendiente solo de validacion visual manual.

Objetivo inmediato:

- Resolver la confusion por la ausencia del viejo interruptor de calculo automatico en Paso 1.
- Mantener la automatizacion centralizada en Paso 5 > Ajuste por Inflacion (AXI) > "Sugerir desde Contabilidad".
- Asegurar que el boton actualice tambien los tres campos visibles de Paso 1.

Criterio de cierre:

- `buildWizardAxiStaticSuggestion` calcula la grilla AXI y devuelve `activoTotalInicio`, `pasivoTotalInicio` y `bienesNoComputablesInicio`.
- Creditos fiscales genericos de las capturas se tratan como creditos computables, salvo conceptos especificos de retenciones, anticipos, saldos a favor o impuesto ley.
- Paso 1 muestra una nota indicando donde esta el automatismo.
- El boton de Paso 5 sincroniza la grilla AXI y los saldos iniciales del Paso 1.
- Verificacion ejecutada: `wizardStateTypes.test.ts` OK, `simulacionUsuario.test.ts` OK, `tsc --noEmit` OK, `vitest run` OK con 105 tests, `next build --webpack` OK y `git diff --check` OK.

Pendiente al retomar:

- Validar visualmente en navegador el recorrido Paso 1 > Paso 5 con datos reales.

### P11 - Auditoria guia/capturas y duplicaciones de calculo

Estado: resuelto tecnicamente, pendiente validacion visual con caso real.

Objetivo inmediato:

- Corregir inconsistencias detectadas despues de comparar guia PDF, capturas nuevas y calculos visibles de la app.
- Evitar que wizard, papel de trabajo e informe cliente muestren resultados distintos al motor.

Criterio de cierre:

- `simulacionUsuario.test.ts` replica las capturas nuevas del 06/06/2026 como caso separado del escenario anterior de la guia PDF.
- Los bienes de uso dados de baja no quedan duplicados en patrimonio comercial de cierre.
- El capital comercial de cierre se calcula con `calculateClosingCommercialPatrimony`.
- CMV y gastos se separan con `purchaseBreakdown` para evitar doble computo de compras.
- `informe-cliente` usa `buildTaxReturnCalculationInput` y deja de reconstruir el input manualmente.
- Verificacion ejecutada: `vitest run` con 30 archivos y 103 tests OK; `tsc --noEmit` OK; `next build --webpack` OK; lint focal de helpers/tests nuevos OK.
- Nota: `eslint` global sigue pendiente por deuda amplia previa/no abordada en esta unidad.

Pendiente al retomar:

- Probar en navegador wizard, papel de trabajo e informe cliente con los importes de las capturas nuevas.
- Confirmar si la guia PDF anterior debe mantenerse como caso historico o actualizarse al nuevo caso.
- Si se prioriza calidad interna, abrir una unidad separada para saneamiento de `eslint` global.

### P8 - Preparacion de prueba piloto

Estado: resuelto.

Objetivo inmediato:

- Dejar un caso piloto reproducible para validar calculo, persistencia y reapertura critica.
- Dejar una guia manual para comenzar a probar sin reconstruir contexto.

Criterio de cierre:

- `src/domain/ganancias/fixtures/pilotTaxReturnFixture.ts` existe.
- `src/domain/ganancias/tests/pilotTaxReturnFixture.test.ts` cubre calculo y persistencia critica del fixture.
- `docs/GUIA_PRUEBA_PILOTO.md` documenta recorrido manual y checklist.
- Cambios verificados, commiteados y pusheados.

### P9 - Carga multiarchivo AFIP mensual

Estado: resuelto.

Objetivo inmediato:

- Permitir que ventas y compras se importen con varios archivos mensuales de AFIP sin consolidacion manual previa.
- Mantener validacion por tipo para evitar mezclar compras en ventas o viceversa.

Criterio de cierre:

- El importador compila multiples archivos con prueba automatizada.
- `/api/import` acepta `files` multiple y conserva compatibilidad con `file`.
- El wizard permite seleccion multiple en ventas, compras y retenciones.
- Cambios verificados, commiteados y pusheados.

### P10 - Verificacion visual de importacion y duplicados

Estado: resuelto.

Objetivo inmediato:

- Mostrar en pantalla un resumen por lote importado.
- Evitar duplicar comprobantes si se sube nuevamente el mismo archivo/mes.

Criterio de cierre:

- Helper testeado para separar registros nuevos y duplicados.
- Wizard muestra archivos procesados, registros leidos, incorporados y duplicados omitidos.
- Cambios verificados, commiteados y pusheados.

### P0 - Control operativo de continuidad

Estado: resuelto al commitear/pushear esta documentacion.

Objetivo inmediato:

- Crear y mantener una puerta de entrada unica para retomar.
- Crear backlog priorizado.
- Registrar claramente que se hizo, que falta y cual es el siguiente paso.

Criterio de cierre:

- `docs/CONTINUAR_AQUI.md` existe y resume estado/prioridad.
- `docs/BACKLOG_PRIORIZADO.md` existe y ordena frentes.
- `docs/REGISTRO_PROYECTO.md` enlaza este archivo.
- Cambios commiteados y pusheados.

## Prioridad activa

### P1 - Reducir riesgo operativo del wizard

Estado: resuelto.

Motivo:

- El wizard es la pantalla critica de carga.
- El build pasaba, pero `eslint src/app/declaraciones/crear/wizard/page.tsx` fallaba por deuda previa.
- Mientras el wizard no tenga una estructura mas verificable, cada mejora de carga corre mas riesgo de romper UX o comportamiento.

Primer corte recomendado:

- No reescribir el wizard completo.
- Extraer o tipar helpers puros del wizard en archivos testeables.
- Reducir `any` y logica inline solo donde se toque.
- Mantener `next build --webpack`, `tsc --noEmit` y tests verdes.

Avance:

- Corte 1 aplicado: `formatCurrencyWhole` y `formatCurrencyCents` en `src/domain/ganancias/presentation/moneyFormat.ts`.
- Corte 2 aplicado: tipos de estado del wizard en `src/domain/ganancias/presentation/wizardStateTypes.ts`.
- Corte 3 aplicado: carga inicial, reset de contribuyente y parametros activos ordenados sin efectos sincronicos fragiles.
- El wizard ya no tiene `any` explicitos en sus estados principales de resoluciones, parametros, padron, ventas, compras, bienes, bancos, retenciones, patrimonio y AXI.
- Se agregaron helpers para normalizar valores editables monetarios sin casts inseguros.
- `eslint src/app/declaraciones/crear/wizard/page.tsx` pasa limpio.

## Prioridad siguiente

### P2 - H6: consolidar calculo backend/frontend

Estado: resuelto.

Objetivo:

- Revisar que el resultado visible en el wizard, el preview backend, el guardado y el papel de trabajo usen el mismo criterio.
- Evitar diferencias silenciosas entre calculo local de respaldo y calculo backend.
- Mantener el fallback local solo si queda claramente identificado como modo degradado.

Avance:

- Corte 1 aplicado: si el usuario intenta cerrar con preview pendiente, fallback local o sin backend vigente, el wizard pide confirmacion explicita antes de cerrar.
- `buildTaxReturnCloseConsistencyWarning` queda testeado en `src/domain/ganancias/tests/taxReturnPreview.test.ts`.
- Corte 2 aplicado: `persistTaxReturnDetails` conserva `esJubiladoOchoHaberes` al reconstruir `personalDeductions`, evitando diferencias entre preview backend y calculo persistido.
- Test agregado en `src/domain/ganancias/tests/taxReturnDetailsPersistence.test.ts`.
- Corte 3 aplicado: `variablesSnapshot` conserva `taxParameterSetId` efectivo tanto en altas minimas como en persistencia detallada.

## Prioridad siguiente

### P3 - H4/H2: AXI e indices utiles

Estado: resuelto.

Objetivo:

- Mapear el uso real de indices/coeficientes contra la planilla.
- Confirmar si los coeficientes se calculan on demand o se persisten.
- Agregar pruebas antes de tocar formulas de AXI.

Avance:

- Se verifico contra `AXI Inflacion IMPOSITIVO Comercial 2025.xlsx` que el AXI estatico usa `IPC dic-2025 / IPC dic-2024 - 1`, no `IPC dic-2025 / IPC ene-2025 - 1`.
- Se decidio calcular coeficientes utiles on demand desde indices persistidos: diciembre del anio anterior + meses del anio actual.
- El importador de indices ahora detecta diciembre del anio anterior para poder persistirlo como `UpdateIndex` de ese ejercicio.
- `/api/parametros` devuelve `usefulCoefficients` con `decPreviousToDecCurrent` y `currentYearAverage`.
- Preview/motor y persistencia usan el coeficiente util para AXI estatico cuando esta disponible.
- Tests agregados: `axiInflationRate.test.ts`, `taxParameterUsefulCoefficients.test.ts`, mas regresiones en importador, mapper y persistencia.
- AXI dinamico usa coeficiente promedio anual para `RetiroSocio` y `AporteCapital`, igual que las filas agregadas de la planilla.
- Los demas movimientos dinamicos conservan coeficiente mensual por fecha.
- La persistencia de `AxiDynamicItem` reutiliza el motor para guardar `coef` y `computedAxi`.
- Al reabrir la DDJJ, la API devuelve `coef`, `factor` y `computedAxi`; el wizard muestra coeficiente y ajuste como control read-only.
- Tests agregados: `axiDynamicAverageCoefficient.test.ts` y regresiones en `taxReturnDetailsPersistence.test.ts` y `taxReturnReadMapper.test.ts`.

## Prioridad siguiente

### P4 - H7: patrimonio y justificacion patrimonial

Estado: resuelto como MVP tecnico.

Objetivo:

- Mapear JVP contra hojas `JVP`, `Creditos`, `Pasivo`, `Banco`.
- Agregar rubros patrimoniales/justificativos suficientes para casos reales sin volver lenta la carga.
- Mantener una explicacion clara del consumo/variacion patrimonial.

Avance:

- Se detecto que existia `calculatePatrimonialJustification`, pero `calculateTaxReturn` usaba una logica JVP paralela y mas simple.
- La liquidacion principal ahora reutiliza `calculatePatrimonialJustification` e incluye bancos y patrimonio comercial como componentes patrimoniales.
- Se propagan advertencias de auditoria JVP, incluyendo consumo nulo.
- Test agregado: `jvpIntegration.test.ts`.
- El mapper de calculo ahora levanta `otherJustifications` con concepto, columna e importe.
- La persistencia guarda/recrea `PatrimonialJustification` y conserva `otherJustifications` en `variablesSnapshot`.
- La reapertura de DDJJ devuelve `otherJustifications` desde la relacion persistida, con fallback al snapshot para datos previos.
- El Paso 4 del wizard incorpora una grilla agil para cargar otras justificaciones JVP con concepto, columna I/II e importe.
- La grilla participa de autosave, guardado, localStorage y preview.
- La JVP principal ahora usa `resultadoImpositivoNeto` como equivalente a `IG 25!F38`, en lugar de `resultadoComercialNeto`.
- La grilla JVP incluye presets rapidos de conceptos frecuentes con columna visible para acelerar carga sin ocultar criterio.
- El resultado principal ahora expone totales JVP columna I/II y cuadre para UI, preview, persistencia y exportacion.
- El alta inicial de DDJJ detecta `otherJustifications` como carga operativa y las conserva en snapshot/persistencia.
- Backend P4 preparado para auxiliares ESP: `cashHoldings`, `receivables` y `liabilities` se mapean al motor, se detectan como carga operativa, se guardan en snapshot/tablas y se devuelven al reabrir.
- El Paso 4 del wizard incorpora una seccion colapsable de auxiliares ESP para efectivo, creditos y pasivos comerciales, con totales de control y aviso de que aun no automatiza el patrimonio comercial agregado.
- El Paso 4 ahora calcula un resumen ESP testeado, detecta diferencias contra `activoTotalInicio` / `pasivoTotalInicio` y ofrece copiar los importes sugeridos solo por accion explicita del usuario.
- Decision aplicada: no automatizar el impacto ESP sobre patrimonio comercial agregado para evitar doble computo si el agregado ya incluye otros rubros.
- P5: los excedentes no admitidos de deducciones generales (`IG 25!E32`) se calculan y se llevan a JVP columna I con aviso visible.
- P5: gastos educativos queda alineado a Excel; el importador deriva `topeGastosEducativos` como `MNI * 40%` cuando el tope no viene explicito.
- P5: decision documental cerrada; la app mantiene carga agregada por rubro y el Paso 5 avisa que no reemplaza respaldo comprobante por comprobante.
- P6: Mis Retenciones conserva agente, CUIT, regimen, fecha, certificado y operacion; se guarda en `TaxWithholding` y se reabre en el wizard.
- P6: CUIT de contraparte en ventas/compras queda como snapshot documentado y reabierto; no se migra a columnas propias hasta necesitar reportes DB por CUIT.
- P4: presets de otras justificaciones JVP ahora muestran referencia Excel (`JVP!C8`, `JVP!D9`, `JVP!D11`, `JVP!D13`) y columna I/II.

Siguiente corte recomendado:

- Validacion final: caso real o fixture realista de alta/guardado/reapertura y revision visual cuando el navegador este disponible.
- Documento de cierre: `docs/ESTADO_FINAL_DESARROLLO.md`.

## Reglas de continuidad

- Todo desarrollo o prueba local debe realizarse contra Docker con `npm run dev:testdb`, salvo decision explicita y registrada.
- La base productiva de Hostinger no se usa para pruebas.
- Una unidad de trabajo debe cerrar con registro, verificacion, commit y push.
- Si aparece un bloqueo del entorno, se documenta con fecha y se sigue por el siguiente camino seguro.
- Si un pendiente queda resuelto por un cambio posterior, marcarlo como resuelto en el backlog; no dejar pendientes fantasmas.
- Si una decision afecta calculos fiscales, debe indicar si sigue la planilla Excel, normativa/importacion o una decision intencional.

## Archivos de referencia

- Registro historico largo: `docs/REGISTRO_PROYECTO.md`.
- Backlog ordenado: `docs/BACKLOG_PRIORIZADO.md`.
- Plan App 10/10: `docs/PLAN_APP_10_10.md`.
- Plan tecnico App 10/10: `docs/superpowers/plans/2026-06-08-app-10-10.md`.
- Procedimiento obligatorio de desarrollo seguro: `docs/PROCEDIMIENTO_DESARROLLO_SEGURO.md`.
- Base Docker de pruebas: `docs/BASE_DOCKER_PRUEBAS.md`.
- Flujo seguro de deploy: `docs/FLUJO_SEGURO_DEPLOY.md`.
- Plan de fase Excel: `docs/FASE_1_VALIDACION_EXCEL.md`.
- Mapeo JVP contra Excel: `docs/MAPEO_JVP_EXCEL.md`.
- Mapeo deducciones generales contra Excel: `docs/MAPEO_DEDUCCIONES_GENERALES_EXCEL.md`.
- Plan de esta mejora: `docs/superpowers/plans/2026-06-01-continuidad-operativa.md`.

## Comandos utiles en esta maquina

Git esta disponible desde GitHub Desktop:

```powershell
$git='C:\Users\mauri\AppData\Local\GitHubDesktop\app-3.5.8\resources\app\git\mingw64\bin\git.exe'
& $git -c safe.directory='C:/Dev/Ganancia/Persona Fisica/ganancias-jaba' status --short --branch
```

Verificacion habitual:

```powershell
& 'C:\Users\mauri\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' 'node_modules\vitest\vitest.mjs' run
& 'C:\Users\mauri\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' 'node_modules\typescript\bin\tsc' --noEmit
& 'C:\Users\mauri\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' 'node_modules\next\dist\bin\next' build --webpack
```
