# Backlog Priorizado - Ganancias JABA

## P32 - Modulo IVA + IIBB mensual integrado con Ganancias

Estado: Activo. Desarrollo exclusivamente en `feature/iva-iibb-mensual-core` y Docker `3318`. El siguiente bloque es el piloto IVA AFIP mayo 2026; no se habilita merge, Preview ni Produccion hasta completar sus gates.

Avance:

- Corte 1 completado: Docker aislado por worktree en puerto configurable; esta rama opera en `3318` y no comparte contenedor ni volumen con el entorno existente de `3317`.
- Corte 2 completado: schema Prisma, cliente generado y migracion `20260622002033_add_fiscal_monthly_ledger` aplicados solo en Docker `3318`. Se agregaron perfiles semilla ficticios ARBA local y CM regimen general con coeficientes que suman 1. No se modificaron modelos ni tablas anuales existentes.
- Resguardo adicional: Prisma usa `ganancias_jaba_test_shadow` local para generar migraciones; el runner rechaza destinos que no sean Docker local. P19 ya usa el puerto configurable del worktree.
- Corte 3 completado: importador mensual separado conserva bases e IVA por alicuota y genera una clave de comprobante estable, sin usar el nombre de archivo. El importador anual de Ganancias mantiene sus pruebas de regresion verdes.
- Corte 4 en curso: tablero mensual, seleccion de comprobantes, motor IVA, persistencia, cotejo y pantalla existen como avance local sin commit. La base de dominio pasa sus pruebas, pero TypeScript aun falla porque `includedInSettlement` no tiene migracion ni cliente Prisma regenerado.
- Caso AFIP de referencia validado fuera del repositorio: mayo 2026, 39 compras, 48 ventas; el resultado esperado F2002 es debito `9.090.888,61`, credito `2.630.946,77`, tecnico `381.664,35` y saldo final `179.731,35`.
- Plan de cierre del piloto: `docs/superpowers/plans/2026-06-23-piloto-iva-afip-mayo-2026.md`.

Objetivo:

- Cargar comprobantes mensuales una sola vez por cliente, preparar IVA Simple e IIBB, y reutilizar la informacion clasificada en Ganancias anual.
- Cubrir IVA Simple/F.2051, IIBB local ARBA y Convenio Multilateral regimen general sin tocar DDJJ anuales existentes.

Decisiones cerradas:

- El libro fiscal mensual sera independiente; no se moveran destructivamente comprobantes existentes de `TaxReturn`.
- Ganancias consumira snapshots de consolidacion inmutables.
- Se usan parametros versionados y aprobados, nunca alicuotas o vencimientos hardcodeados.
- Los regimenes especiales de CM y Monotributo Unificado quedan fuera del primer corte.
- Desarrollo y pruebas exclusivamente con Docker; produccion se evalua solo despues de Preview, backup y aprobacion explicita.

Referencia:

- `docs/superpowers/specs/2026-06-20-iva-iibb-mensual-design.md`.

Ultima actualizacion: 2026-06-21

Uso: trabajar de arriba hacia abajo. Si se cambia el orden por decision del usuario o por bloqueo tecnico, registrar el motivo en `docs/REGISTRO_PROYECTO.md`.

## Estados permitidos

- `Activo`: frente actual.
- `Siguiente`: proximo frente si no hay bloqueo.
- `Pendiente`: no empezar todavia.
- `Bloqueado`: requiere dato, decision o entorno.
- `Resuelto`: cerrado con verificacion y registro.

## P33 - PDF de correcciones del usuario (6 puntos) - 2026-07-24

Estado: Resuelto y EN PRODUCCION (2026-07-25, commit `b333021`, PR #31 mergeada). Queda el smoke test y la prueba de restauracion del backup.

Decisiones fiscales completas de cada punto: entrada `2026-07-24` de `docs/REGISTRO_PROYECTO.md`. No volver a preguntarlas.

- Punto 1 - Verificacion de periodo en carga y eliminacion: **Resuelto** (criterio tolerante con aviso; tacho separado compras/ventas).
- Punto 4 - Retenciones con signo negativo: **Resuelto** (codigos 210/217/218/787; los negativos son anulaciones y netean, no se usa valor absoluto).
- Punto 6 - Proyeccion de anticipos: **Resuelto** (retenciones y combustibles reexpresados por IPC, RG 5211 art. 3).
- Gate de audit del PR #31: **Resuelto**. `overrides` de `find-my-way` a 9.7.0 y `valibot` a 1.4.2, sin tocar Prisma ni instalar prereleases. Revisar al salir Prisma 7.10.0 estable para quitarlos.
- Punto 5 - IDCB en la determinacion: **Resuelto**. Carga mensual del total (bloque 2d de la liquidacion mensual) + selector 33%/100% en el perfil fiscal; la importacion anual crea una fila por mes con taxCode IDCB y el motor ya la computa contra el impuesto determinado.
- Punto 3 - Participacion en sociedades: **Resuelto**. Grilla en el Paso 2 con % y resultado total, atribuido calculado y editable con aviso de diferencia; el motor lo suma al neto de todas las categorias.
- Punto 2 - TISH: **Resuelto**. Solo Regimen General; base IIBB por bimestre de las actividades con tilde "computa TISH"; alicuota y categoria L/M/N manuales por cliente y año; bloque propio junto a la config de IIBB; parametros de la ordenanza 2026 editables; 6 cuotas con minimo de categoria K, Salud, Bomberos y Residuos.
- Pendiente de TISH para proximos cortes: regimen simplificado (cuota fija por categoria de monotributo), Convenio Multilateral (art. 208) y encuadre automatico L/M/N por facturacion de 12 meses.

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

## P28 - Hotfix produccion parametros, AXI y deducciones

Estado: Resuelto y publicado en `main` con commit `09f3e2b fix: corregir parametros axi y deducciones`. Cierre UX ampliado implementado, pendiente de commit/push.

Problema:

- Produccion no permitia guardar indices IPC por timeout de transaccion Prisma/Hostinger.
- AXI dinamico mostraba signo inverso respecto de `Capital Afectado Teorico - Capital Afectado Real`.
- El calculo podia advertir falta de indices aunque la pantalla tuviera valores cargados.
- Las deducciones quedaban en cero cuando habia indices activos pero faltaba `parameterSet`.

Accion aplicada:

- Timeout de transaccion de parametros ampliado.
- Fallback de deducciones protegido cuando `parameterSet` viene nulo.
- Indices visibles del editor IPC incorporados al calculo efectivo.
- Normalizacion de coma decimal en IPC.
- AXI estatico ignora IPC cero y evita `Infinity`/`-0`.
- Retiro/aporte neto se calcula y muestra con signo.
- Aviso de IPC faltante en Paso 6 guia directo a Paso 5 > AXI y aclara que no se corrige desde Parametros Manuales.
- Guardar IPC invalida el preview backend anterior para recalcular con los valores vigentes.

Criterio de cierre:

- Guardar indices en produccion sin timeout.
- AXI dinamico muestra `teorico - real` con signo.
- AXI usa indices visibles/cargados.
- Deducciones no se pierden por falta de `parameterSet`.

Verificacion:

- Tests focales: OK, 7 tests.
- `vitest run`: OK, 36 archivos y 135 tests.
- `tsc --noEmit`: OK.
- `prisma validate --schema prisma/schema.prisma`: OK.
- Lint focalizado: OK.
- `check-deployment-db-safety`: OK.
- `next build --webpack`: OK.
- Cierre UX IPC: test focal OK, `tsc --noEmit` OK, `vitest run` OK con 136 tests, `check-deployment-db-safety` OK y `next build --webpack` OK.

## P29 - Paridad de calculo con Excel IG 25

Estado: Resuelto y publicado en `main` (commit `e5ae003`, merge `480476c` via staging, 2026-06-09). Verificacion: 147 tests de dominio en sandbox + CI de GitHub Actions sobre staging/main. Pendientes menores derivados: confirmar piso vigente de anticipos, parametro jubilados en DB, UI de los campos nuevos.

Problema:

- Pagos a cuenta incompletos: IG 25 computa 7 conceptos (F61:F67) mas saldo IDCB trasladable (F70); la app solo restaba retenciones (incluyendo indebidamente `taxCode='Otros'`) y saldo a favor.
- Anticipos proyectados no seguian RG 5211: faltaba restar retenciones/ITC, faltaba el piso de $5.000 y el coeficiente IPC usaba dic/ene en vez de jul->dic.
- El quebranto del ejercicio (F38 negativo) se clampaba a 0 y se perdia para el arrastre.
- JVP usaba el resultado antes de quebrantos (F34) cuando el Excel usa F38.
- Faltaba la doceava parte (F50) para dependientes y los montos de jubilados 8 haberes estaban hardcodeados.

Accion:

- Plan detallado en `docs/superpowers/plans/2026-06-09-paridad-excel-p29.md` (incluye tabla completa de divergencias y decisiones: criterio legal documentado para los errores internos del Excel D27/D29/D30).

Criterio de cierre:

- Conceptos F61:F67 y F70 calculados y expuestos.
- Anticipos `(impuesto proyectado - retenciones - ITC)/5` con piso $5.000.
- Quebranto trasladable visible; JVP con resultado post-quebrantos.
- Doceava parte y parametro de jubilados.
- `vitest run`, `tsc --noEmit` y `next build --webpack` en verde en Windows.

## P31 - Endurecimiento post-auditoria integral 2026-06-10

Estado: En curso. Puntos 1, 2 y 7 publicados en `main` (`2aee793`). Puntos 3, 4 y 5 aplicados el 2026-06-10 (rate limit de login con 429/Retry-After y demora ante fallo; zod en alta de DDJJ + topes 6 MB guardado / 15 MB import; /api/health accesible con HEALTH_CHECK_TOKEN para monitoreo), pendientes de commit. Punto 8 (renovacion deslizante) aplicado el 2026-06-10 junto con la migracion `middleware`->`proxy` de Next 16. CODIGO DE P31 COMPLETO. Restan solo pasos operativos del usuario: 6 (backup automatico Hostinger), 9 (rotar AUTH_PASSWORD/AUTH_SECRET/password DB tras la exposicion), restringir DATABASE_URL a Production en Vercel, y configurar monitor externo con HEALTH_CHECK_TOKEN.

Problema / hallazgos, en orden de prioridad:

1. El dashboard traga errores de fetch (`page.tsx` linea ~77: `catch -> console.error`) y muestra ceros como si la base estuviera vacia. Causa raiz del incidente del 2026-06-10. Falta estado de error visible con boton reintentar en dashboard y wizard.
2. `GET /api/declaraciones` hace `JSON.parse(variablesSnapshot)` por cada fila sin try/catch: un snapshot corrupto tira 500 y vacia el dashboard completo. Ademas parsea snapshots enormes solo para extraer `currentStep`: persistir `currentStep` como columna y seleccionar campos minimos.
3. Login sin rate limiting ni demora ante clave incorrecta: la clave unica es fuerza-bruteable. Minimo: delay fijo en fallo + contador de intentos. Futuro: usar los modelos `User`/`Role` ya existentes en el schema.
4. `zod` esta en dependencias pero ninguna ruta API lo usa; validacion manual parcial. Sin limites de tamano de payload en `/api/import` ni `/api/declaraciones`. Definir schemas zod por ruta y tope de bytes en importaciones.
5. `/api/health` exige sesion: no sirve para monitoreo externo. Permitir acceso con token dedicado (header) y configurar un monitor de uptime.
6. Backups: solo procedimiento manual (P21). Configurar backup automatico en Hostinger y registrar verificacion mensual de restauracion.
7. Carga agil: los inputs monetarios del wizard usan `type=number` (punto decimal); el usuario argentino escribe coma. P28 normalizo coma solo en IPC. Extender normalizacion de coma a toda la carga monetaria.
8. Sesion de 12 hs sin renovacion deslizante: puede vencer en medio de una carga larga (el guard del wizard mitiga). Renovar token en actividad.
9. Rotar la password de la base Hostinger (estuvo en capturas/chats; ya recomendado en P15).

Criterio de cierre:

- Dashboard y wizard muestran error visible con reintento ante fallo de API.
- Lista de declaraciones tolera snapshots corruptos y no parsea JSON gigante por fila.
- Login con demora/contador de intentos.
- Schemas zod en rutas de escritura + tope de tamano en import.
- Health con token para monitor externo y monitor configurado.
- Backup automatico Hostinger activo y probado.

## P30 - Venta de bienes de uso con precio de venta

Estado: Pendiente (abierto por P29, decision del usuario de no incluirlo en el nucleo critico).

Problema:

- El ER del Excel contempla "Resultado por venta de Bienes de Uso" (precio de venta - costo computable); la app solo modela la baja como perdida del valor residual, sin precio de venta. No permite reconocer ganancia por venta.

Accion:

- Agregar precio de venta al modelo `FixedAsset` (requiere migracion Prisma), calcular resultado por venta y reflejarlo en ER y JVP.

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

Estado: Resuelto.

Problema:

- El wizard todavia mantiene calculo local con fallback mientras tambien consume preview backend.
- Riesgo: que el usuario vea un resultado distinto al que se guarda.

Accion recomendada:

- Mantener preview backend como fuente preferida.
- Definir si el calculo local queda solo como modo degradado visible o se elimina.
- Cubrir con tests de presentacion/preview antes de tocar UI.

Avance 2026-06-01:

- Primer corte aplicado: `buildTaxReturnCloseConsistencyWarning` advierte cuando se intenta cerrar sin preview backend vigente.
- El wizard pide confirmacion explicita si el resultado visible esta pendiente de backend o es fallback local.
- Esto evita que una DDJJ se cierre silenciosamente con posible diferencia entre vista local y recalculo servidor.
- Segundo corte aplicado: persistencia ahora conserva `esJubiladoOchoHaberes` al reconstruir deducciones personales.
- Se agrego prueba que compara el resultado persistido con el preview backend para el caso jubilado con 8 haberes.
- Tercer corte aplicado: `variablesSnapshot` conserva `taxParameterSetId` efectivo en altas minimas y calculos persistidos.
- Esto mejora trazabilidad de la resolucion usada por cada corrida de calculo.

Criterio de cierre:

- La UI indica claramente fuente del resultado.
- No hay diferencias silenciosas entre resultado visible y guardado.
- El papel de trabajo y guardado usan el mismo mapper/motor.
- P2 queda cerrado con advertencia de cierre, prueba de jubilado contra preview y trazabilidad de resolucion efectiva en snapshot.

## P3 - H4/H2: AXI e indices utiles

Estado: Resuelto.

Problema:

- El archivo de indices trae coeficientes utiles que hoy se auditan, pero no se aplican completamente en AXI.
- El modelo actual guarda IPC mensual, no todos los coeficientes derivados utiles.

Accion recomendada:

- Definir si los coeficientes utiles se calculan on demand o se persisten.
- Mapear AXI estatico/dinamico contra planilla.
- Agregar pruebas contra archivo real antes de cambiar formulas.

Avance 2026-06-01:

- Primer corte aplicado: AXI estatico usa coeficiente `dic-anterior / dic-actual` importado/derivado desde indices utiles, igual que la planilla.
- El importador detecta diciembre del anio anterior y la importacion lo persiste como indice del ejercicio anterior.
- La API de parametros deriva `decPreviousToDecCurrent` y `currentYearAverage` on demand desde indices persistidos.
- El mapper conserva `usefulCoefficients` y el motor los usa antes del fallback historico `dic/ene`.
- La persistencia detallada tambien deriva el coeficiente util para que el resultado guardado coincida con el preview.
- Segundo corte aplicado: AXI dinamico usa coeficiente promedio anual para `RetiroSocio` y `AporteCapital`, como las filas agregadas de la planilla.
- Los movimientos `Otro` conservan coeficiente mensual por fecha.
- La persistencia de `AxiDynamicItem` reutiliza `calculateAxiDynamic`, guarda el coeficiente efectivo y el ajuste calculado.
- El endpoint de reapertura conserva `coef`, `factor` y `computedAxi`; el wizard los muestra como columnas read-only para auditoria de la carga guardada.
- Verificaciones focales y suite completa quedaron verdes.

Criterio de cierre:

- AXI estatico y dinamico tienen carga guiada y trazable.
- Coeficientes usados en calculo pueden auditarse.

## P4 - H7: patrimonio y justificacion patrimonial

Estado: Resuelto como MVP tecnico.

Problema:

- JVP y consumo diferencial estan simplificados frente a la planilla.
- Faltan rubros patrimoniales/justificativos suficientes para casos reales.

Accion recomendada:

- Mapear JVP contra hojas `JVP`, `Creditos`, `Pasivo`, `Banco`.
- Agregar rubros en carga sin volver lenta la pantalla.
- Mostrar papel de trabajo claro.

Avance 2026-06-01:

- Primer corte aplicado: `calculateTaxReturn` reutiliza `calculatePatrimonialJustification` en vez de mantener una formula JVP paralela simplificada.
- Bancos y patrimonio comercial se incorporan como componentes patrimoniales para conservar los totales existentes.
- La liquidacion principal propaga advertencias JVP de auditoria, incluyendo consumo nulo.
- Test agregado: `jvpIntegration.test.ts`.
- Segundo corte backend aplicado: `otherJustifications` se mapea al motor, se persiste en `PatrimonialJustification`, se guarda en snapshot y se reabre por API.
- Tests agregados/extendidos: `calculationInputMapper.test.ts`, `taxReturnDetailsPersistence.test.ts`, `taxReturnReadMapper.test.ts`.
- Tercer corte UI aplicado: Paso 4 del wizard permite cargar otras justificaciones JVP con concepto, columna I/II e importe.
- La carga participa de autosave, guardado, reapertura local y preview.
- Cuarto corte de formula aplicado: JVP usa `resultadoImpositivoNeto`, equivalente a `IG 25!F38`, para recursos del periodo.
- Quinto corte de agilidad aplicado: presets rapidos para conceptos JVP frecuentes, siempre mostrando columna I/II.
- Sexto corte de auditoria aplicado: resultado, preview, persistencia, UI y exportacion exponen totales JVP columna I/II y cuadre.
- Septimo corte de persistencia aplicado: el alta inicial detecta `otherJustifications` como carga operativa y evita perderlas cuando la DDJJ se crea con datos JVP.
- Octavo corte backend aplicado: efectivo, creditos y pasivos comerciales se preservan desde payload hasta motor, snapshot, tablas y reapertura.
- Noveno corte UI aplicado: Paso 4 incluye una seccion colapsable de auxiliares ESP para efectivo, creditos y pasivos comerciales, con totales de control.
- Decimo corte de reconciliacion aplicado: los auxiliares ESP generan sugeridos testeados, detectan diferencias contra `activoTotalInicio` / `pasivoTotalInicio` y solo copian importes al agregado por accion explicita del usuario.
- Undecimo corte de trazabilidad aplicado: presets de `otherJustifications` muestran referencia Excel (`JVP!C8`, `JVP!D9`, `JVP!D11`, `JVP!D13`) junto a columna I/II.

Criterio de cierre:

- Consumo/variacion patrimonial se explica por rubros.
- La carga patrimonial no depende de campos genericos opacos.

Pendiente externo:

- Validar una DDJJ real contra `ESP`, `Patrimonio personal` y `JVP`.

## P5 - H3: deducciones generales remanentes

Estado: Resuelto como MVP agil.

Problema:

- Ya se corrigieron rubros importantes, pero falta confirmar equivalencia completa contra `IG 25` y `Ded. Gen.`.

Accion recomendada:

- Agregar tests antes de modificar formulas.
- Definir si se conserva carga agregada o si se agrega detalle documental comprobante por comprobante.

Avance 2026-06-02:

- Se creo `docs/MAPEO_DEDUCCIONES_GENERALES_EXCEL.md`.
- La app cubre los rubros agregados de `IG 25!F20:F31`.
- La app calcula excedentes no admitidos de `IG 25!E32` y los suma a JVP columna I con aviso visible.
- Brecha detectada: `Ded. Gen.` contiene detalle por fecha/comprobante/concepto; la app hoy carga importes agregados por rubro.
- Gastos educativos alineado: Excel usa `MNI * 40%`; la app conserva `topeGastosEducativos`, pero el importador lo deriva desde MNI si falta el tope explicito.
- Decision documental aplicada: se mantiene carga agregada por rubro y se agrega aviso visible en Paso 5 indicando que no reemplaza el respaldo documental comprobante por comprobante.

Criterio de cierre:

- Cada deduccion tiene estado: igual a Excel, decision intencional o pendiente normativo.
- Si se decide mantener agregado por rubro, documentar que la app no reemplaza respaldo documental comprobante por comprobante.
- P5 queda cerrado: los rubros agregados estan mapeados, el tope educativo esta alineado y la decision documental queda visible/testeada.

## P6 - H5 remanente: auditoria importada completa

Estado: Resuelto como MVP auditable.

Problema:

- Ventas/compras ya conservan detalle principal.
- Falta evaluar columnas propias para CUIT y completar detalle de retenciones/certificados.

Accion recomendada:

- Definir si `counterpartyCuit` merece migracion a `SalesInvoice` y `PurchaseInvoice`.
- Preservar regimen/certificado/agente en retenciones importadas.

Avance 2026-06-02:

- Retenciones importadas desde Mis Retenciones ahora conservan CUIT/agente, descripcion de impuesto, regimen, fecha, certificado y descripcion de operacion.
- Persistencia guarda esos datos en `TaxWithholding` y la reapertura los devuelve al wizard.
- El Paso 5 muestra columnas compactas de auditoria para agente/certificado y fecha/regimen.
- Decision sobre CUIT contraparte: por ahora se mantiene en `variablesSnapshot` y se devuelve al reabrir; no se migra a columnas propias hasta que el estudio necesite consultas/reportes por CUIT desde DB.

Criterio de cierre:

- Datos importados necesarios para revision quedan en DB consultable o snapshot documentado.
- P6 queda cerrado como MVP: retenciones en DB consultable; CUIT de ventas/compras en snapshot documentado.

## P7 - Validaciones visuales/manuales

Estado: Activo.

Problema:

- Browser integrado fallo por sandbox de Windows.
- Playwright CLI no esta disponible porque no hay `npx` en el runtime actual.

Accion recomendada:

- Validar manualmente pantalla de wizard usando `docs/GUIA_PRUEBA_PILOTO.md`.
- Si se instala/disponibiliza Playwright CLI, agregar capturas de pasos criticos.

Criterio de cierre:

- Flujo visual de alta/guardado/importacion validado con caso real o fixture realista.

## P8 - Preparacion de prueba piloto reproducible

Estado: Resuelto.

Problema:

- El desarrollo tecnico estaba cerrado, pero faltaba una pista de prueba concreta para empezar a usar la app sin reconstruir datos de memoria.

Accion aplicada:

- Se agrego `src/domain/ganancias/fixtures/pilotTaxReturnFixture.ts`.
- Se agrego `src/domain/ganancias/tests/pilotTaxReturnFixture.test.ts`.
- El fixture cubre calculo end-to-end y persistencia critica de ventas, compras, ESP, retenciones, JVP y snapshot.
- Se agrego `docs/GUIA_PRUEBA_PILOTO.md` con recorrido manual y checklist.

Criterio de cierre:

- Prueba automatizada focal verde.
- Guia manual disponible para iniciar el piloto.
- Pendiente externo queda limitado a ejecutar la prueba manual/real y registrar diferencias.

## P9 - Carga multiarchivo AFIP mensual

Estado: Resuelto.

Problema:

- AFIP permite descargar ventas y compras por mes.
- Obligar al usuario a consolidar manualmente los 12 archivos antes de importarlos resta agilidad y aumenta riesgo de error.

Accion aplicada:

- El importador de dominio ahora compila multiples archivos AFIP del mismo tipo.
- La API `/api/import` acepta varios archivos en `files` y conserva compatibilidad con la carga anterior de un solo `file`.
- La API valida el tipo esperado para evitar mezclar ventas, compras o retenciones en una importacion equivocada.
- El wizard permite seleccionar varios archivos para ventas, compras y retenciones.

Criterio de cierre:

- Prueba automatizada de compilacion multiarchivo verde.
- Wizard preparado para seleccion multiple.
- Pendiente externo: probar con los 12 archivos reales descargados de AFIP.

## P10 - Verificacion por pantalla y duplicados en importacion

Estado: Resuelto.

Problema:

- Importar varios meses facilita la carga, pero tambien aumenta el riesgo de subir dos veces un archivo o repetir un comprobante.
- Sin resumen visible, el usuario no sabe rapidamente cuantos archivos/registros entraron ni si hubo duplicados.

Accion aplicada:

- Se agrego helper testeado para separar registros nuevos y duplicados.
- Ventas/compras detectan duplicados por comprobante, CUIT contraparte, fecha e importe.
- Retenciones detectan duplicados por certificado, CUIT agente, fecha e importe.
- Filas sin datos suficientes para detectar duplicado no se bloquean automaticamente y quedan para revision manual.
- El wizard muestra resumen de importacion por lote: archivos, registros leidos, incorporados, duplicados omitidos y detalle por archivo.

Criterio de cierre:

- Tests de duplicados verdes.
- Feedback visible en ventas, compras y retenciones.
- Pendiente externo: validar visualmente con archivos reales.

## P11 - Auditoria guia/capturas y duplicaciones de calculo

Estado: Resuelto tecnicamente.

Problema:

- La guia PDF y las capturas nuevas corresponden a escenarios distintos.
- Habia formulas visibles en pantallas que no usaban exactamente el mismo criterio que el motor.
- Algunas pantallas podian duplicar compras entre CMV y gastos, o conservar bienes de uso dados de baja dentro del patrimonio comercial de cierre.

Accion aplicada:

- Se reemplazo el test de simulacion usuario por un caso basado en capturas nuevas del 06/06/2026.
- Se agrego helper de patrimonio comercial de cierre y se reutilizo en motor/wizard/papel.
- Se agrego helper de presentacion para bienes de uso y baja.
- Se agrego helper para separar compras imputables a CMV de gastos deducibles no imputables a costo.
- `informe-cliente` dejo de armar el input manualmente y usa el mapper central.

Criterio de cierre:

- Tests nuevos y regresiones verdes.
- `vitest run`: 30 archivos, 103 tests OK.
- `tsc --noEmit`: OK.
- Pendiente externo: validacion visual con datos reales del usuario en navegador.

## P13 - Sincronizacion de saldos iniciales desde AXI

Estado: Resuelto tecnicamente.

Problema:

- El interruptor viejo de calculo automatico de saldos iniciales ya no existe en Paso 1.
- El boton vigente esta en Paso 5 > Ajuste por Inflacion (AXI), pero Paso 1 no lo indicaba.
- El boton "Sugerir desde Contabilidad" completaba AXI, pero no sincronizaba visualmente `activoTotalInicio`, `pasivoTotalInicio` y `bienesNoComputablesInicio`.
- La sugerencia podia mandar creditos fiscales genericos a no computables, distinto del criterio usado en las capturas nuevas.

Accion aplicada:

- Se agrego `buildWizardAxiStaticSuggestion` como helper testeado para centralizar la sugerencia AXI.
- El boton de Paso 5 ahora completa la grilla AXI y actualiza los saldos iniciales visibles de Paso 1.
- Paso 1 muestra una nota operativa indicando que el automatismo esta en Paso 5.
- Creditos fiscales genericos se consideran creditos computables, salvo retenciones, anticipos, saldos a favor o impuesto ley.

Criterio de cierre:

- TDD rojo/verde sobre `wizardStateTypes.test.ts`.
- `simulacionUsuario.test.ts` conserva los resultados de las capturas.
- `tsc --noEmit`: OK.
- `vitest run`: 30 archivos, 105 tests OK.
- `next build --webpack`: OK.
- `git diff --check`: OK, solo avisos CRLF habituales.
- Pendiente externo: validacion visual manual del flujo completo.

## P14 - Legajo profesional de carga PDF e instructivo de carga

Estado: Resuelto tecnicamente, pendiente validacion visual manual.

Problema:

- El boton "Imprimir Pantalla (PDF)" llamaba a `window.print()` sobre la pantalla del wizard.
- Ese enfoque imprimia una vista operativa, no un soporte profesional ordenado para archivo del estudio.
- Faltaba un instructivo unificado de carga para prevenir duplicaciones, clasificaciones incorrectas y errores de calculo.

Accion aplicada:

- Se agrego `buildWizardLoadReport` como helper testeado para armar el legajo desde datos en memoria del wizard.
- Se agrego un componente `WizardLoadReportPrint` visible solo en impresion/PDF.
- El boton del wizard ahora se presenta como `Generar Legajo de Carga (PDF)`.
- El reporte incluye portada, resumen de carga, secciones por paso, controles y leyenda profesional.
- Se creo `docs/INSTRUCTIVO_CARGA_DDJJ_GANANCIAS.md` con orden de carga, criterios, errores frecuentes y checklist final.

Criterio de cierre:

- TDD rojo/verde sobre `wizardLoadReport.test.ts`.
- El wizard compila con el componente print-only.
- `vitest run`: 31 archivos, 106 tests OK.
- `tsc --noEmit`: OK.
- `next build --webpack`: OK.
- `git diff --check`: OK, solo avisos CRLF habituales.
- Lint focalizado de archivos nuevos: OK.
- Pendiente externo: validar visualmente el PDF generado en navegador.

## P12 - Saneamiento lint global

Estado: Resuelto localmente en `feature/p21-backup-health` (2026-06-13), pendiente de integracion/publicacion.

Problema:

- Resuelto: `eslint` global pasa sin errores ni warnings.
- Se eliminaron `any` explicitos en APIs/paginas principales tocadas, reglas de hooks pendientes, imports/variables no usados, textos JSX sin escape y la excepcion controlada de `test_db.js`.
- Ahora `eslint` puede volver a usarse como puerta de calidad junto con `tsc`, tests y build.

Accion recomendada:

- Mantener `eslint` global obligatorio antes de integrar cambios.
- No reintroducir `any` en pantallas o APIs sin un motivo documentado.
- Continuar la mejora de mantenibilidad separando componentes grandes en P24.

Criterio de cierre:

- `eslint` global ejecutado y verde.
- `vitest run`, `tsc --noEmit` y `next build --webpack` siguen OK.

## P15 - Arquitectura MySQL Hostinger/Vercel

Estado: Resuelto tecnicamente, produccion Hostinger/Vercel conectada.

Problema:

- La app necesitaba una base MySQL real para conservar declaraciones, cargas y soportes.
- La conexion tenia fallback silencioso a una base local ficticia.
- Algunos datos relevantes dependian del snapshot JSON: CUIT de contraparte, AXI estatico, deducciones y baja de bienes de uso.
- Faltaban tablas para importaciones AFIP por lote/archivo y adjuntos guardados dentro de la base.

Accion aplicada:

- Se agrego plan de implementacion en `docs/superpowers/plans/2026-06-07-base-datos-hostinger.md`.
- Se agrego `docs/ARQUITECTURA_BASE_DATOS_HOSTINGER.md`.
- Se dejo explicito el flujo GitHub + Vercel + Hostinger MySQL: GitHub versiona codigo/migraciones, Vercel ejecuta la app y usa `DATABASE_URL`, Hostinger guarda los datos reales.
- `DATABASE_URL` ahora se parsea con `URL`, falla explicitamente si falta y se enmascara en logs/scripts.
- Se creo `.env.example` sin credenciales reales.
- `schema.prisma` incorpora tablas/columnas para deducciones, AXI estatico, importaciones AFIP, adjuntos binarios, CUIT de contraparte y bajas de bienes de uso.
- Se genero migracion inicial en `prisma/migrations/20260607000100_initial_hostinger_mysql/migration.sql`.
- Persistencia/reapertura prefieren tablas relacionales y mantienen snapshot como fallback/auditoria.

Criterio de cierre:

- `prisma validate`: OK.
- Tests focalizados DB/persistencia: OK.
- `vitest run`: OK, 33 archivos y 122 tests.
- `tsc --noEmit`: OK.
- `next build --webpack`: OK.
- `git diff --check`: OK, solo avisos CRLF habituales.

Pendiente externo:

- DB/usuario Hostinger creados el 2026-06-07: `u669600172_ganancias_jaba` y `u669600172_jaba_app`.
- Host MySQL confirmado: `srv1199.hstgr.io`; IP alternativa `193.203.175.56`.
- Remote MySQL habilitado para `u669600172_ganancias_jaba` con acceso `%`.
- Conexion remota verificada y migracion Prisma aplicada en Hostinger el 2026-06-07: 35 tablas creadas.
- Seed inicial ejecutado y verificado en Hostinger el 2026-06-07.
- Vercel conectado al repo GitHub y desplegado desde `main`.
- Revisar parametros reales antes de usar una DDJJ productiva.

## P16 - Flujo seguro de deploy y resguardo de DB productiva

Estado: Resuelto tecnicamente.

Problema:

- `main` despliega produccion en Vercel.
- Si Preview/Staging usa la misma `DATABASE_URL`, una prueba podria escribir en la base productiva.
- Faltaba una rama de pruebas formal y una barrera automatica para evitar errores humanos.

Accion aplicada:

- Se agrego `scripts/check-deployment-db-safety.mjs`.
- Se agrego `src/domain/ganancias/tests/deploymentDbSafety.test.ts`.
- `prebuild` ejecuta la guarda antes de `next build`.
- Se agregaron scripts `test`, `typecheck`, `prisma:validate` y `verify`.
- Se agrego CI en `.github/workflows/ci.yml` para `main` y `staging`.
- Se creo `docs/FLUJO_SEGURO_DEPLOY.md`.
- Se documento que `DATABASE_URL` productiva debe estar solo en Vercel Production.
- Se preparo la rama `staging` como ambiente de prueba antes de integrar a `main`.

Criterio de cierre:

- Preview/Staging queda bloqueado si apunta a `u669600172_ganancias_jaba`.
- Production queda bloqueado si falta `DATABASE_URL`.
- CI ejecuta tests, typecheck, Prisma validate y build.
- Documentacion de flujo y backups disponible.

Pendiente externo:

- En Vercel, confirmar visualmente que `DATABASE_URL` este marcada solo para `Production`.
- Si se desea probar persistencia en Preview, crear una DB staging separada en Hostinger.

## P17 - Base Docker local de pruebas

Estado: Resuelto tecnicamente.

Problema:

- Hacia falta una base de pruebas local para simular persistencia real sin tocar Hostinger.
- `npm run dev` puede usar la `.env` normal; si esa `.env` apunta a produccion, la prueba local podria escribir datos reales.

Accion aplicada:

- Se configuro `docker-compose.yml` con servicio `mysql-test`.
- Se eligio puerto local `3317` para evitar conflicto con otros MySQL locales.
- Se agrego `.env.docker.example`.
- Se agrego `scripts/run-test-db-command.mjs` para forzar `DATABASE_URL` de Docker.
- Se agrego `scripts/seed-test-db.mjs` sin dependencia de `npx/tsx`.
- Se agregaron scripts npm para levantar, migrar, seedear, abrir Studio y correr la app contra Docker.
- Se documento el flujo en `docs/BASE_DOCKER_PRUEBAS.md`.

Criterio de cierre:

- Docker levanta MySQL healthy.
- Prisma migra contra `ganancias_jaba_test`.
- Seed minimo carga clientes, periodos, parametros, escalas e indices.
- La app puede iniciarse con `npm run dev:testdb` apuntando a Docker.

Pendiente externo:

- Validar visualmente en navegador `http://localhost:3000` usando `npm run dev:testdb`.

Regla permanente:

- Para agregar funcionalidades o probar cambios, seguir `docs/PROCEDIMIENTO_DESARROLLO_SEGURO.md`.
- No usar la base productiva de Hostinger para pruebas locales.
- Preferir `npm run dev:testdb` sobre `npm run dev` durante desarrollo.

## P18 - Autenticacion y proteccion de acceso

Estado: Resuelto tecnicamente y publicado en `main`; ramas ordenadas.

Problema:

- La app ya esta publicada en Vercel.
- Existen modelos `User`, `Role` y permisos, pero no se observa login/middleware activo.
- Sin autenticacion, clientes, CUITs y DDJJ podrian quedar expuestos si el dominio es accesible.

Decision 2026-06-08:

- Seguridad simple para uso personal: clave unica, cookie firmada y middleware.
- Multiusuario, roles, permisos y auditoria por usuario quedan para etapa posterior.

Accion aplicada:

- Login en `/login`.
- Logout en dashboard y wizard.
- APIs `POST /api/auth/login`, `POST /api/auth/logout` y `GET /api/auth/logout`.
- Middleware protege paginas y APIs por defecto.
- Cookie `jaba_auth` firmada, `HttpOnly`, `SameSite=Lax`, 12 horas.
- Sanitizacion de `next` para evitar redirecciones externas.
- Guarda de deploy: Vercel Production bloquea si faltan `AUTH_PASSWORD` o `AUTH_SECRET`.
- Wizard advierte antes de cerrar/refrescar y confirma antes de cerrar sesion con carga iniciada.

Criterio de cierre:

- Usuario no autenticado no puede acceder al dashboard ni APIs de datos.
- Usuario autenticado puede operar normalmente.
- Tests de auth y acceso verdes.
- Build de produccion verde.
- Vercel Production tiene `AUTH_PASSWORD` y `AUTH_SECRET` antes de publicar.
- No se revierten hotfixes recientes de AXI/IPC/deducciones.

Verificacion 2026-06-08:

- `vitest run`: OK, 38 archivos y 145 tests.
- `tsc --noEmit`: OK.
- `prisma validate --schema prisma/schema.prisma`: OK.
- `check-deployment-db-safety`: OK local.
- `next build --webpack`: OK.
- Lint focalizado en archivos nuevos/pequenos de auth/guardas: OK.
- Lint de pantallas grandes sigue con deuda previa registrada.

Dato externo:

- El usuario confirmo que `AUTH_PASSWORD` y `AUTH_SECRET` quedaron cargadas en Vercel Production.
- El usuario confirmo que el boton `Salir` aparece en produccion.

Orden de ramas:

- `main` y `staging` quedaron alineadas en `a309f22`.
- Se eliminaron ramas obsoletas locales/remotas de hotfix/auth/wizard anterior.

Fuera de alcance por decision:

- Usuarios multiples.
- Roles y permisos.
- Auditoria con `userId` real.

## P19 - Validacion real contra Excel en Docker

Estado: En staging - primer corte automatico aplicado, pendiente validacion visual.

Problema:

- El desarrollo tecnico esta avanzado, pero falta validar una DDJJ real completa contra la planilla usada profesionalmente.
- El archivo Excel fisico revisado quedo como plantilla/base sin datos operativos, por lo que la carga piloto debe seguir el caso numerico documentado desde capturas/test.

Accion recomendada:

- Usar `docs/INSTRUCTIVO_CARGA_CASO_EXCEL_2025.md` como guia de carga exacta.
- Cargar caso real en Docker.
- Guardar, reabrir y comparar con Excel.
- Validar wizard, papel de trabajo, informe cliente y legajo PDF.
- Registrar diferencias si aparecen.

Avance 2026-06-08:

- Se creo `docs/INSTRUCTIVO_CARGA_CASO_EXCEL_2025.md`.
- El instructivo separa valores cargables, valores calculados y controles esperados.
- El caso coincide con `src/domain/ganancias/tests/simulacionUsuario.test.ts`.
- Se documento la inconsistencia de fuente: Excel fisico sin datos y capturas con escenarios historicos distintos.
- Se extrajo el caso a `src/domain/ganancias/fixtures/excelCaptureCaseFixture.ts` para evitar duplicaciones.
- Se agrego `npm run db:test:validate:excel`.
- La validacion Docker guarda, recalcula y reabre Lobato 2024 en `ganancias_jaba_test`.
- Verificacion ejecutada: `npm run db:test:validate:excel` OK con 1 test.
- Smoke HTTP local contra Docker ejecutado:
  - login dev OK;
  - dashboard OK;
  - `/api/declaraciones` OK;
  - se encontro 1 DDJJ Lobato 2024 en la base Docker.
- Smoke HTTP extendido contra Docker ejecutado:
  - wizard OK;
  - papel de trabajo OK;
  - informe cliente OK.

Pendiente:

- Probar visualmente el wizard con `npm run dev:testdb`.
- Revisar papel de trabajo, informe cliente y legajo PDF contra los mismos totales.
- Registrar diferencias si aparecen en UI/exportaciones.
- Resolver/retomar validacion visual cuando el navegador integrado o Playwright esten disponibles.

Criterio de cierre:

- Caso real coincide o diferencias quedan explicadas y resueltas/documentadas.
- Checklist piloto completo.

## P20 - Workflow profesional de DDJJ

Estado: En staging - primer corte aplicado y verificado.

Problema:

- Una herramienta profesional debe evitar cambios accidentales sobre DDJJ cerradas.
- El borrado definitivo normal es riesgoso.

Accion recomendada:

- Formalizar estados: Borrador, En revision, Cerrada, Presentada, Rectificativa.
- Bloquear edicion de cerradas salvo reapertura controlada.
- Reemplazar borrado por archivo/anulacion.
- Requerir motivo para reapertura/rectificativa.

Avance 2026-06-08:

- Se agregaron reglas puras testeadas para normalizar estados y distinguir editables/inmutables.
- Estados inmutables operativos: `Cerrada`, `Presentada`, `Rectificada`, `Anulada`.
- `PUT /api/declaraciones/[id]` bloquea modificaciones normales sobre DDJJ inmutables.
- Reapertura controlada: exige `workflowAction: "reopen"` y motivo; no modifica carga en el mismo request.
- `DELETE /api/declaraciones/[id]` queda como anulacion operativa con motivo, sin borrar fisicamente.
- Rollback tecnico conserva borrado fisico solo con header interno `X-JABA-Rollback: true` y estado `Borrador`.
- Dashboard pide motivo para anular y no muestra anuladas en el listado normal.
- Wizard muestra aviso de solo lectura y bloquea guardar/cerrar si se abre manualmente una DDJJ inmutable.

Verificacion 2026-06-08:

- `taxReturnWorkflow.test.ts` y `taxReturnSaveFlow.test.ts`: OK, 16 tests.
- `vitest run`: OK, 39 archivos pasados, 1 omitido, 152 tests pasados, 1 omitido.
- `tsc --noEmit`: OK.
- `prisma validate --schema prisma/schema.prisma`: OK.
- `next build --webpack`: OK.
- `git diff --check`: OK, solo avisos CRLF habituales de Windows.

Criterio de cierre:

- DDJJ cerrada queda protegida.
- Cambios criticos dejan auditoria.
- No hay borrado destructivo como camino normal.

## P21 - Backups, restauracion y salud operativa

Estado: Activo - primer corte aplicado en `feature/p21-backup-health`.

Problema:

- La base productiva conserva datos reales y debe poder recuperarse.

Accion recomendada:

- Documentar backup Hostinger.
- Probar restauracion en Docker.
- Crear health check de DB.
- Registrar fecha, archivo y resultado.

Avance 2026-06-08:

- Se agrego helper testeado `buildOperationalHealthReport`.
- Se agrego enmascarado de destino de DB sin usuario/password.
- Se agrego endpoint `GET /api/health` con consulta liviana a DB.
- Se creo `docs/BACKUP_RESTAURACION_OPERATIVA.md`.

Verificacion 2026-06-08:

- `operationalHealth.test.ts`: OK, 3 tests.
- `vitest run`: OK, 40 archivos pasados, 1 omitido, 155 tests pasados, 1 omitido.
- `tsc --noEmit`: OK.
- `prisma validate --schema prisma/schema.prisma`: OK.
- `next build --webpack`: OK.
- Smoke HTTP local contra Docker: `/api/health` OK, `success: true`, DB `127.0.0.1:3317/ganancias_jaba_test`.
- `git diff --check`: OK, solo avisos CRLF habituales de Windows.

Criterio de cierre:

- Backup descargado y restauracion probada fuera de produccion.
- Health check operativo.

## P22 - Adjuntos, soportes y paquete final

Estado: Pendiente.

Problema:

- La DDJJ necesita expediente completo: archivos AFIP, comprobantes, legajo, informe y papel de trabajo.

Accion recomendada:

- Implementar adjuntos con `Attachment` y `AttachmentBlob`.
- Guardar/listar/descargar soportes.
- Generar paquete final por DDJJ.

Criterio de cierre:

- Una DDJJ puede descargarse con soporte completo y auditable.

## P23 - Parametros fiscales, tipos de cambio y casos especiales

Estado: Pendiente.

Problema:

- Para uso productivo, parametros, indices, tipos de cambio y casos fiscales especiales deben quedar versionados y probados.

Accion recomendada:

- Validar parametros oficiales.
- Mapear tipos de cambio.
- Agregar tests de casos especiales.
- Bloquear parametros usados por DDJJ cerradas.

Criterio de cierre:

- Cada DDJJ conserva version de parametros usada.
- Tipos de cambio quedan incorporados si aplican.
- Casos especiales tienen fixtures/tests.

## P24 - Calidad tecnica y mantenibilidad

Estado: Pendiente.

Problema:

- `eslint` global ya fue saneado en P12.
- `src/app/page.tsx`, wizard, papel de trabajo e informe cliente quedaron sin `any` explicitos, pero siguen siendo archivos grandes con mucha UI/logica.

Accion recomendada:

- Dividir dashboard en componentes/hooks.
- Seguir tipando respuestas principales en nuevas rutas/pantallas.
- Mantener tests/build verdes.

Criterio de cierre:

- `npm run lint`/`eslint` verde en cada cierre.
- Dashboard mas mantenible.
- Sin regresion funcional.

## P25 - UX 10/10 y controles por pantalla

Estado: Pendiente.

Problema:

- Antes de cerrar una DDJJ, el usuario necesita saber claramente que falta o que no cuadra.

Accion recomendada:

- Crear semaforo/checklist de cierre.
- Mostrar bloqueos, advertencias y OK.
- Mejorar previsualizacion de importaciones y mensajes de error.

Criterio de cierre:

- El usuario puede cerrar solo si la DDJJ esta lista o acepta conscientemente advertencias permitidas.

## P26 - E2E y prueba visual

Estado: Pendiente.

Problema:

- Falta prueba automatizada del flujo real de navegador.

Accion recomendada:

- Agregar Playwright o herramienta equivalente.
- Probar login, cliente, DDJJ, carga, guardado, reapertura y legajo.
- Ejecutar siempre contra Docker.

Criterio de cierre:

- Flujo critico automatizado y reproducible.

## P27 - Produccion controlada

Estado: Pendiente.

Problema:

- El paso a produccion debe seguir checklist estricto para no romper la app ni la DB.

Accion recomendada:

- Checklist final pre-produccion.
- Verificar Vercel, backup, CI, auth, caso piloto y health.
- Publicar desde `main`.
- Verificar post-deploy sin modificar datos.

Criterio de cierre:

- App productiva validada con control y evidencia.

## Cierre de desarrollo tecnico

Estado: 100% tecnico MVP al 2026-06-02.

- Los frentes P0 a P6 quedaron resueltos o resueltos como MVP con verificacion automatizada.
- P7 no es un bloqueo de desarrollo sino de entorno/caso real.
- Detalle de cierre: `docs/ESTADO_FINAL_DESARROLLO.md`.

## Pendientes resueltos que no deben reabrirse sin motivo

- H1: falsa sincronizacion ARCA, mitigada por cambio de lenguaje.
- H8: alta nueva desde wizard persiste carga completa en POST atomico.
- H9: reapertura con fechas invalidas/nulas no rompe la API.
- Desglose de deducciones generales en papel de trabajo independiente.
- Preview backend creado y conectado al wizard con fallback visible.
