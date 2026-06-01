# Continuar Aqui - Ganancias JABA

Ultima actualizacion: 2026-06-01

Este es el primer archivo a leer cuando se retoma el proyecto. La bitacora larga sigue en `docs/REGISTRO_PROYECTO.md`, pero no deberia ser necesario recorrerla completa para saber por donde seguir.

## Estado actual

- Rama activa: `feature/wizard-optimizado`.
- Ultimo checkpoint documentado: P3 resuelto, AXI estatico/dinamico alineado con indices utiles y planilla.
- Fase activa: Fase 1 - Validacion contra Excel y estabilizacion de carga/persistencia.
- Fuente funcional principal: planilla `DJ Ganancias 2025 - Tercera Categoria.xlsx`.
- Objetivo de producto: carga agil, explicable y auditable para un estudio chico/unipersonal.

## Como retomar en 5 minutos

1. Ejecutar `git status --short --branch`.
2. Leer esta pagina completa.
3. Abrir `docs/BACKLOG_PRIORIZADO.md`.
4. Tomar el primer item con estado `Activo` o `Siguiente`.
5. No abrir un nuevo frente si hay uno `En curso`, salvo instruccion explicita del usuario.
6. Al terminar una unidad, actualizar `docs/REGISTRO_PROYECTO.md` y este archivo si cambia la prioridad.
7. Correr verificacion fresca antes de decir que algo quedo terminado.
8. Hacer commit y push a GitHub al cerrar cada bloque util.

## Ultima unidad cerrada

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

Estado: activo, cuarto corte de formula JVP aplicado.

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

Siguiente corte recomendado:

- Mapear esos conceptos contra `JVP` filas 8/13/85 y validar como se reflejan en consumo.
- Mapear creditos/pasivos personales contra hojas auxiliares `Creditos`, `Pasivo` y `Banco`.

## Reglas de continuidad

- Una unidad de trabajo debe cerrar con registro, verificacion, commit y push.
- Si aparece un bloqueo del entorno, se documenta con fecha y se sigue por el siguiente camino seguro.
- Si un pendiente queda resuelto por un cambio posterior, marcarlo como resuelto en el backlog; no dejar pendientes fantasmas.
- Si una decision afecta calculos fiscales, debe indicar si sigue la planilla Excel, normativa/importacion o una decision intencional.

## Archivos de referencia

- Registro historico largo: `docs/REGISTRO_PROYECTO.md`.
- Backlog ordenado: `docs/BACKLOG_PRIORIZADO.md`.
- Plan de fase Excel: `docs/FASE_1_VALIDACION_EXCEL.md`.
- Mapeo JVP contra Excel: `docs/MAPEO_JVP_EXCEL.md`.
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
