# Registro del proyecto - Ganancias JABA Persona Fisica

Ultima actualizacion: 2026-07-18

## Entrada reciente

### 2026-07-20 - INCIDENTE: importacion de comprobantes IVA fallaba en produccion (FK violada) - resuelto

- Sintoma: POST de comprobantes al libro fiscal mensual devolvia 500 "Foreign key constraint violated (fiscalDocumentId)" SOLO en produccion (desde local el mismo insert funcionaba).
- Causa raiz: mismo patron que el hallazgo A2 de la auditoria, en otra ruta. La importacion corria dentro de prisma.$transaction interactiva con timeout DEFAULT de 5 s, insertando comprobante por comprobante (2 round-trips c/u) contra la base remota. Desde Vercel (mas latencia por viaje) un archivo mensual real supera los 5 s: Prisma aborta la transaccion a mitad de camino y el insert de la linea de IVA queda sin su documento -> FK violada.
- Fix doble: (1) persistFiscalDocuments y persistTaxCredits reescritos EN LOTE (createMany de documentos con ids generados en cliente + createMany de lineas): 2-3 viajes totales sin importar el tamanio del archivo; (2) timeout explicito { timeout: 60000, maxWait: 10000 } en las transacciones de ambas rutas de importacion. Verificado contra la base real: lote insertado y vinculado correctamente, idempotencia intacta, tests nuevos en fiscalLedgerPersistence.test.ts.
- REGLA DE ORO derivada (2da vez que muerde): NINGUNA prisma.$transaction interactiva sin timeout explicito, y NUNCA insertar en loop dentro de una transaccion contra la base remota: siempre createMany.
- Pendiente reportado por el usuario (segundo error, a investigar): 422 "No se pudo compilar ningun comprobante de los archivos subidos" en algunos intentos.

### 2026-07-19 - Backup automatico configurable desde la app (arquitectura A) + monitor activado

- **PR #19 mergeado**: monitor de salud ACTIVO y verificado en verde (el primer intento fallo por un \r de PowerShell al setear el token via pipe; se recargo por argumento/archivo sin newline en GitHub y Vercel + redeploy). El monitor corre cada 15 min y avisa por mail.
- **Arquitectura elegida por el usuario (opcion A)**: backup hacia carpeta local sincronizada de Google Drive. La app guarda la configuracion; un runner local la ejecuta.
- **Nueva seccion /configuracion** (item de nav nuevo): activar/desactivar, carpeta destino, frecuencia diaria/semanal (+dia), hora y retencion (1-365 dias). Muestra el resultado del ultimo backup (fecha, estado, archivo) reportado por el runner. API `GET/PUT /api/backup-config` con validaciones y auditoria. Tabla nueva `BackupConfig` (migracion `20260719160000_add_backup_config`, APLICADA a produccion).
- **Runner** `scripts/backup-runner.mjs`: corre cada hora via tarea programada "JABA Backup Automatico" (wscript oculto via `scripts/backup-runner-oculto.vbs`, sin admin, StartWhenAvailable: si la PC estaba apagada corre al encender). Calcula la ultima ocurrencia vencida (logica pura `lastDueOccurrence` en `backupCore.mjs`, con tests), ejecuta el backup, aplica retencion y reporta en BackupConfig. Log en `backups/runner.log`.
- **Refactor**: `scripts/backupCore.mjs` comparte el volcado entre el backup manual (`npm run db:backup`) y el runner.
- **E2E verificado**: corrida vencida -> backup real de 60MB/53 tablas en carpeta de prueba + reporte OK en la base; segunda corrida no duplica. Config de prueba eliminada: el usuario configura desde la app.
- Para desinstalar el runner: `Unregister-ScheduledTask -TaskName "JABA Backup Automatico"`.

### 2026-07-19 - Punto 1: backup automatizable + simulacro de restauracion + monitor de salud

- **Backup**: nuevo `scripts/backup-db.mjs` (npm run db:backup). Descubre las tablas con SHOW TABLES (52, incluye _prisma_migrations), solo LECTURA, vuelca a `backups/ganancias-jaba-AAAA-MM-DD-HHmm.sql` con retencion de 30 dias. Primer backup real: 52 tablas, 8.684 filas, 60MB. Carpeta /backups en .gitignore (datos fiscales fuera del repo).
- **SIMULACRO DE RESTAURACION EJECUTADO Y VERIFICADO** (2026-07-19): el backup se restauro en una base aislada del contenedor Docker de pruebas (`docker exec ... mysql < backup.sql`); verificados 52 tablas y conteos clave (6 clientes, 6 DDJJ, 7.343 ventas, 802 compras, auditoria y migraciones). El circuito backup→restore funciona de punta a punta.
- **Monitor de salud**: workflow `health-monitor.yml` chequea `/api/health` de produccion cada 15 minutos con el header x-health-token; si falla, GitHub envia mail automatico al dueño del repo. Token nuevo generado y cargado como secret HEALTH_CHECK_TOKEN en GitHub Actions y en Vercel (Production) - requiere el redeploy del merge para activarse en Vercel.
- DECISION DEL USUARIO (2026-07-19): el backup automatico NO va por Task Scheduler. Quiere configurarlo DENTRO DE LA APP: ubicacion de destino (seguramente Google Drive), hora, frecuencia y periodo de almacenamiento. Direccion tecnica a evaluar al retomar: (a) integracion server-side con Google Drive API + cron de Vercel (requiere credenciales de Google del usuario y evaluar limites del plan de Vercel), vs (b) runner local que lee la configuracion guardada por la app. Mientras tanto: backup manual con `npm run db:backup` (recomendado antes de cada sesion de carga importante).
- Pendiente ademas: merge del PR #19 (quedo listo con CI verde; el redeploy activa el token del monitor en Vercel) y TLS a MySQL.

### 2026-07-19 - UX: contraste AA (punto 3, parte 3b) + logo institucional JABA

- **Contraste**: `text-zinc-600` (2.8:1, fallaba AA) y las clases invalidas `text-zinc-550` (no existen en Tailwind; renderizaban color heredado impredecible) pasaron a `text-zinc-400` (7:1) en 21 etiquetas/textos de ayuda del wizard, parametros, liquidacion IVA y config IIBB. Menu movil: ya cubierto por el AppHeader compartido desde la migracion a rutas (pendiente solo en pantallas del modulo mensual).
- **Logo institucional** (JABA Direccion & Gestion, provisto por el usuario en JPG fondo blanco): en el header de toda la app, login y wizard como placa blanca redondeada discreta (fondo oscuro); en los encabezados del papel de trabajo e informe cliente en color, visible en la impresion A4; favicon desde el logo (src/app/icon.jpg). Assets versionados en /public (logo-jaba-color.jpg y logo-jaba-negro.jpg); carpeta fuente /logos en .gitignore. Si se consigue version PNG transparente, reemplazar los archivos de /public mejora la integracion en fondo oscuro.

### 2026-07-19 - UX: importes visibles completos + tipografias legibles (punto 3, parte 3a)

- Pedido del usuario: los campos de carga manual de importes cortaban los digitos (se veia "26006" en lugar del numero completo). Fix: los ~20 inputs numericos de las grillas del wizard (ventas, compras, bienes, bancos, efectivo, deudas, retenciones, justificaciones, AXI) tienen `min-w-[130px]`; la columna crece sola y entran 10+ digitos con centavos.
- Accesibilidad (primera tajada): todas las tipografias de 8px y 9px subieron a 10px en la app (wizard, tarjetas mensuales y sus desgloses, parametros, auditoria, clientes). EXCLUIDOS a proposito los documentos imprimibles (papel de trabajo, informe cliente, fiscalDocumentChrome, WizardLoadReportPrint): su diseño A4 aprobado queda pixel-identico.
- Pendiente parte 3b: contraste de textos grises y menu movil.

### 2026-07-18 - Punto 3 (parte 2): /parametros y /auditoria como rutas propias - navegacion 100% por URLs

- Segunda etapa de la migracion: Parametros y Auditoria dejaron de ser vistas internas del dashboard y viven en `/parametros` y `/auditoria` con la misma UI y comportamiento. La navegacion completa (Dashboard, Clientes, Parametros, Auditoria) es ahora por URLs reales.
- Compatibilidad: `/?view=parametros|auditoria` redirige a las rutas nuevas (router.replace), los favoritos viejos siguen funcionando.
- El dashboard quedo solo con su vista: page.tsx bajo de ~1477 a ~590 lineas (2050 al inicio de la migracion). Conserva una carga compacta de parametros 2025 para la tarjeta "Periodo Activo".
- Fix colateral: al guardar una edicion manual de parametros ahora se recarga la lista de resoluciones (el guardado crea una version nueva por el versionado append-only; antes el selector seguia mostrando la version anterior).
- Pendiente de la migracion: partir el resto del dashboard si crece, y accesibilidad/tamanios de texto (punto 3 parte 3).

### 2026-07-18 - Punto 3 (parte 1): /clientes como ruta propia - piloto de navegacion por URLs

- Arranca la migracion del dashboard monolitico (page.tsx) a rutas reales. Piloto: la pestania Clientes ahora vive en `/clientes` (favoritos, boton atras y F5 funcionan), misma UI y comportamiento (solapas Activos/Dados de baja, alta, edicion, baja logica, reactivacion).
- Header compartido nuevo `AppHeader` (src/app/AppHeader.tsx) con Links reales; lo usan el dashboard y /clientes. Parametros y Auditoria siguen como vistas internas de "/" seleccionadas por `?view=parametros|auditoria` (URLs marcables) hasta migrarlas.
- "Ver Liquidaciones" navega a `/?buscar=<nombre>`; el dashboard lee `?buscar` (searchTerm inicial) y deriva `activeView` de `?view` (sin estado, evita la regla react-hooks/set-state-in-effect). `useSearchParams` exige envolver Home en `<Suspense>` para el prerender.
- El monolito perdio la vista clientes, sus modales y handlers (~350 lineas menos). Proximos pasos de la migracion: Parametros y Auditoria a sus propias rutas, luego partir el dashboard.

### 2026-07-17 - Punto 2 del plan: IIBB automatico + circuito de candidatos + ventas con categorias

Tres mejoras funcionales definidas por el usuario (criterios 2026-07-16):

1. **IIBB determinado automatico**: al importar el libro mensual a la DDJJ anual, cada mes con IIBB cotejado (CLOSED) crea una fila de gasto deducible con el impuesto determinado de ese mes, fechada el ultimo dia del periodo (expenseType GastosGenerales, invoiceNumber IIBB-AAAA-MM). Lleva importSource=MONTHLY_LEDGER: la reimportacion reemplaza sin duplicar. Builder puro `buildIibbDeterminedExpenseDrafts` con tests.
2. **Circuito de candidatos a bienes de uso (Paso 4)**: panel sobre la tabla de bienes con los candidatos PENDING de la importacion mensual; "Agregar como bien" precarga proveedor/fecha/importe y marca CONFIRMED, "Descartar" marca DISMISSED, ambos con "Deshacer" (REOPEN). API `GET/PATCH /api/declaraciones/[id]/candidatos-bienes-uso` con guard de inmutabilidad y auditoria.
3. **Ventas con categorias (Paso 2)**: columnas nuevas Categoria (Bienes/Servicios/MueblesYUtiles, default Bienes) y Tratamiento (Deducible/No Computable, default Deducible). Tarjetas mensuales como en compras: suman SOLO el neto gravado computable (exentas y No Computables cuentan pero no suman) con desglose por categoria y filtro de grilla. EFECTO FISCAL: una venta No Computable queda excluida del calculo de ingresos de la DDJJ (filtro en `calculationInputMapper`, decision explicita del usuario).
   - Migracion aditiva `20260716130000_add_sales_category_computable` (saleCategory/isComputable con defaults) APLICADA a produccion via migrate deploy el 2026-07-17. Leccion tecnica: el SQL de migracion no debe tener BOM (Set-Content -Encoding utf8 de PowerShell 5.1 lo agrega y MariaDB lo rechaza con error 1064; se resolvio con migrate resolve --rolled-back + archivo limpio).
   - Las ventas guardadas antes del cambio quedaron con los defaults (Bienes/Deducible); ajustar a mano las que correspondan.

### 2026-07-16 - UX: contenido del wizard al ancho completo del header (fix de tablas cortadas)

- Reporte del usuario: en el Paso 3 la tabla de comprobantes aparecia cortada con barra de scroll horizontal aun con pantalla ancha de sobra.
- Causa: el `<main>` del wizard estaba en `max-w-5xl` (1024px) mientras el header y la barra de progreso usan `max-w-7xl` (1280px); las tablas tienen columnas con ancho minimo que superan los 1024px.
- Fix: el contenido usa el mismo `max-w-7xl` que el header. Beneficia a todas las tablas del wizard (ventas Paso 2, compras Paso 3, creditos Paso 5). En pantallas angostas el scroll horizontal sigue siendo el comportamiento correcto (las columnas conservan anchos minimos legibles).

### 2026-07-16 - Tarjetas mensuales del Paso 3: solo suman comprobantes Deducibles

- Hallazgo del usuario: al marcar un comprobante como "No Deducible" (columna Tratamiento), el total Deducible de cabecera lo excluia pero las tarjetas mensuales lo seguian sumando.
- Criterio aplicado: el total del mes y el desglose por categoria suman UNICAMENTE lo marcado "Deducible en Ganancias". Aplica tambien a "Ver todos los meses" y "Sin fecha valida". Ahora todo el panel es consistente con el total Deducible de cabecera.
- La cantidad de comprobantes del mes sigue incluyendo los no deducibles (la tarjeta tambien es filtro para encontrarlos); solo se excluye su importe. La leyenda del panel lo aclara.
- Implementacion: `buildPurchaseMonthlySummary` (campo `isDeductible`; sin flag se asume deducible por compatibilidad). Test que fija el criterio en `purchaseMonthlySummary.test.ts`.

### 2026-07-16 - Desglose por tipo de gasto en las tarjetas mensuales del Paso 3

- Cada tarjeta de mes (y los buckets "Ver todos los meses" y "Sin fecha valida") muestra, ademas del total y la cantidad, la suma discriminada por las 4 categorias del selector por comprobante: Materia Prima / Insumos, Gastos Generales, Servicios Basicos y Alquileres.
- Tipos desconocidos o vacios se agrupan como "Sin clasificar" (nada queda invisible). Solo se muestran categorias con movimiento; el desglose siempre cuadra con el total del mes.
- Implementacion: `buildPurchaseMonthlySummary` acumula `byExpenseType` por bucket (fuente unica: `PURCHASE_EXPENSE_CATEGORIES` en `purchaseMonthlySummary.ts`); `PurchaseMonthlySummaryPanel` renderiza los renglones. Se actualiza en vivo al cambiar el tipo de gasto en la grilla.
- Contexto operativo: la esposa del usuario ajusta la categoria de cada comprobante (default MateriaPrima desde la importacion); este desglose le permite controlar mes a mes sin salir del Paso 3.

### 2026-07-11 - CRITERIO PROFESIONAL por codigo AFIP en importacion de compras (Paso 3)

- Definicion del usuario (tabla 2026-07-11), aplicada en `parseLibroCompras` de `afipImporter.ts`:
  - **Codigos 1/2/3 (Factura/ND/NC A)**: suma el **Total Neto Gravado** (col. AE del export AFIP) + su parte exenta/no gravada como fila aparte (tambien suma, decision explicita del usuario).
  - **Codigos 6/7/8 (Factura/ND/NC B)**: **NO suman nada**. Se importan visibles con netAmount $0 y isDeductible=false para conservar la traza (decision: "importar sin sumar", no descartar).
  - **Codigos 11/12/13/15 (Factura/ND/NC/Recibo C)**: suman el **Importe Total** (col. H), SIEMPRE, aunque traigan neto o exento discriminado.
  - Comprobantes sin codigo legible: fallback anterior (neto -> exento -> importe total).
  - El signo de AFIP se preserva: las NC vienen negativas y restan.
- Hallazgo corregido: las Facturas B entraban como gasto deducible por el Importe Total e inflaban compras/deducciones de Ganancias.
- Verificacion: contra el Excel real `comprobantes_comprasprueba.xlsx` el importador dio 3.795.852,11, identico al calculo manual del criterio (cod 1: 3.533.202,27 / cod 6: 0 / cod 11: 257.966,79 / cod 12: 4.683,05). Test integral en `importer.test.ts` fija la tabla completa.
- OPERATIVO: las compras importadas ANTES de este cambio quedaron con la regla vieja; para aplicar el criterio hay que RE-IMPORTAR los archivos de compras en el Paso 3 y guardar.
- Nota: el modulo mensual de IVA (fiscal-periods) usa otro parser (`afipFiscalLedgerImporter`) con logica propia de IVA; NO fue alcanzado por este criterio.

### 2026-07-11 - INCIDENTE: produccion sin acceso a la base (pool timeout) - resuelto

- Sintoma: todas las rutas con DB devolvian 500 con "pool timeout ... active=0 idle=0" desde Vercel, mientras la base respondia bien desde afuera (conexion local OK).
- Causa raiz REAL: al buscar la password de la base en Hostinger para actualizar el `.env` local, se genero una password nueva sin advertirlo. El `.env` local quedo con la nueva (todo funcionaba local) pero la `DATABASE_URL` de Vercel quedo con la anterior: produccion no podia autenticar. El pool del adapter enmascara el error de auth como "pool timeout".
- Resolucion: el usuario actualizo `DATABASE_URL` en Vercel (Production) con el mismo valor del `.env` local + `vercel redeploy` (los cambios de env no aplican sin redeploy). Verificado con 200 en papel de trabajo, informe, parametros y declaraciones.
- Mejora colateral que quedo en main (PR #5): pool ajustado al servidor compartido de Hostinger (wait_timeout=20, max_connect_errors=5): `idleTimeout 15s`, `minimumIdle 1`, `connectionLimit 5`. Hallazgo tecnico: `minimumIdle: 0` rompe el adapter de Prisma ("pool is closed"); el default (= connectionLimit) hace que el pool nunca libere ociosas. Test de guarda en `databaseConnection.test.ts`.
- Leccion operativa: la password de DB vive en DOS lugares (`.env` local y Vercel Production, esta ultima Sensitive e ilegible). Cualquier cambio en Hostinger exige actualizar ambos y redesplegar. Ojo: el panel de Hostinger no muestra la password vigente; "verla" suele implicar regenerarla.

### 2026-07-10 - MIGRACIONES PRODUCTIVAS del hardening aplicadas (fix del papel de trabajo/informe caidos)

- Sintoma en produccion: papel de trabajo e informe cliente bloqueados con "The table FixedAssetImportCandidate does not exist" (las pantallas de error nuevas funcionaron: no se emitio ningun documento con ceros).
- Causa: el merge del PR #4 (commit de produccion cba9fde) desplego el codigo del hardening pero las 3 migraciones nuevas nunca se corrieron contra la base (el deploy de Vercel no migra por diseno).
- Bloqueo intermedio: el `.env` local tenia la password de DB anterior a la rotacion post-incidente; la vigente esta solo en Vercel (Sensitive) y Hostinger. El usuario actualizo `.env` a mano.
- Aplicado con `prisma migrate deploy` (solo aditivas, sin tocar datos): `20260710190000_add_iibb_carry_forward`, `20260710193000_version_iibb_coefficients`, `20260710194500_add_fixed_asset_import_candidates`. `migrate status` verifica "Database schema is up to date".
- Leccion operativa: el checklist pre-merge debe incluir `migrate deploy` SIEMPRE que el PR agregue carpetas en `prisma/migrations` (quedo omitido en el pase del PR #4).

### 2026-06-22 - VALIDACION CONTRA AFIP REAL: motor IVA clava la liquidacion al peso

- El usuario aporto una pantalla real de liquidacion de IVA (F2002) + los CSV de ventas/compras del mes. Cotejo:
  - debito fiscal 9.090.888,61 | credito 2.630.946,77 | saldo tecnico a ARCA 381.664,35 | saldo impuesto a ARCA 179.731,35.
- Dos hallazgos que el caso real revelo (ningun test los habia detectado):
  1. NOTAS DE CREDITO: AFIP las computa en el lado CONTRARIO (NC emitida -> credito; NC recibida -> debito). El neto no cambia, pero los TOTALES de debito/credito que se cotejan con ARCA si. La app las restaba en su propio lado (mostraba debito 8.885.532 vs ARCA 9.090.888). Corregido en `settlementBuilders.ts` (clasificacion estilo F2002).
  2. SALDO DE LIBRE DISPONIBILIDAD ANTERIOR: AFIP lo aplica en la posicion mensual separado del saldo tecnico. El motor solo arrastraba el tecnico. Agregado `previousFreeAvailability` a `vatSettlement.ts`.
- Resultado: con los 2 fixes, la app reproduce los 4 valores de ARCA AL PESO leyendo directamente los CSV. Validacion fiscal real superada.
- PENDIENTE: actualizar tests de vatSettlement/settlementBuilders con el caso AFIP; flujo de pantalla (subir -> seleccionar filas -> cotejar -> guardar); persistir el settlement.

### 2026-06-22 - Fase 5 (parte): armador de liquidacion + ruta API de settlement

- `settlementBuilders.ts`: orquestadores puros que toman los documentos del periodo y arman los inputs de los motores. `buildVatSettlement` separa debito (ventas) de credito computable (compras), aplica percep/ret y saldo tecnico anterior, y devuelve el desglose por alicuota (lo que la pantalla muestra). `buildGrossIncomeSettlement` deriva la base imponible de las ventas gravadas netas y llama al motor IIBB. Tests: `settlementBuilders.test.ts`, 7/7 en sandbox.
- Ruta `GET /api/clientes/[id]/fiscal-periods/[periodId]/settlement`: lee documentos + percep/ret + perfil + saldo tecnico del mes anterior, calcula IVA (siempre) e IIBB (si el perfil tiene regimen y jurisdicciones), y devuelve los numeros serializados. IIBB informa "pendiente de configurar alicuotas" hasta que el perfil las tenga.
- PENDIENTE: pantalla React de liquidacion (consume esta ruta); cargar alicuotas IIBB por jurisdiccion en el editor de perfil; persistir el settlement (hoy solo calcula); decision de imputacion inferida (flujo) ya elegida por el usuario, falta implementar la heuristica.

### 2026-06-22 - Fase 4 (parte): consolidador anual a Ganancias

- Nuevo `annualConsolidation.ts`: funcion pura que toma los 12 periodos mensuales (con sus comprobantes ya imputados a una categoria de Ganancias via `GainsAllocationKind`) y agrega los netos por categoria: ventas gravadas/exentas, compras de bienes de cambio (CMV), gastos deducibles, bienes de uso, gastos no deducibles, IVA no computable (al costo) e IIBB pagado (gasto deducible). Produce el snapshot + `sourceHash` (djb2 determinista para detectar cambios y reconsolidar). Fidelidad fiscal: IVA neutro, solo viajan netos; IVA no computable al costo; percep/ret de IVA/IIBB NO entran a Ganancias.
- Avisos: meses faltantes para cerrar el año, mes repetido, imputaciones OTHER sin categoria.
- Tests: `annualConsolidation.test.ts`, 7 casos / 14 aserciones, 14/14 en sandbox.
- PENDIENTE para cerrar la integracion: (a) el flujo de imputacion (como se llena la allocation de cada compra: manual / inferida por tipo de comprobante / mixta) -> decision del usuario; (b) adaptador snapshot -> `TaxReturnCalculationInput` del motor de Ganancias; (c) persistencia del snapshot; (d) pantallas (Fase 5).

### 2026-06-22 - Fase 3: endpoint de importacion por periodo

- Nueva ruta `POST /api/clientes/[id]/fiscal-periods/[periodId]/documents`: valida que el periodo pertenezca al cliente, recibe FormData multiarchivo (ventas y/o compras), parsea con `parseAfipFiscalLedgerDocuments`, persiste con `persistFiscalDocuments` (idempotente) y devuelve `inserted`/`duplicates`/`warnings`/`fileResults`. Tope de 15 MB por lote (413), auditoria `IMPORT`.
- Verificacion con los CSV reales del usuario sobre el importador del modulo (`afipFiscalLedgerImporter`): ventas 239 documentos (doc1 neto 15.123,97 SIN x100; vatLine TAXED 21% base/iva separados); compras 32 documentos (Factura C tipo 11 -> NON_TAXED, creditComputable=false, correcto: no da credito fiscal). El importador del modulo YA trae el fix de CSV (Latin-1, `;`, coma decimal) y el desglose por alicuota con kind TAXED/EXEMPT/NON_TAXED.
- Pendiente: prueba de integracion HTTP contra Docker (levantar app, subir archivo a un periodo); UI de importacion (Fase 5).

### 2026-06-22 - Fase 2: motor IIBB construido (local + Convenio Multilateral)

- Se creo `grossIncomeSettlement.ts` (no existia). Cubre los regimenes del enum: ARBA_LOCAL/ARBA_SIMPLIFICADO (una jurisdiccion), CM_REGIMEN_GENERAL/ESPECIAL (reparte la base por coeficiente unificado), NONE.
- Por jurisdiccion: base asignada (base total x coeficiente en CM, o base total en local) x alicuota = impuesto determinado; percepciones/retenciones de IIBB de esa jurisdiccion se aplican contra su impuesto; el excedente queda como saldo a favor que se arrastra. Soporta saldo a favor anterior por jurisdiccion.
- Defensa: avisa si en CM los coeficientes no suman 1 (ademas de la validacion al guardar el perfil).
- Output alineado al modelo `GrossIncomeJurisdictionLine` (assignedBase, taxRate, determinedTax, creditsApplied, balance) + totales.
- Tests: `grossIncomeSettlement.test.ts`, 8 casos (local, percep/ret, excedente a favor, favor anterior, CM reparto, CM aviso suma!=1, CM percep por jurisdiccion, NONE). 8/8 en sandbox aislado.
- Pendiente: alicuotas reales por actividad/jurisdiccion como parametros; caso real de IIBB para cotejar.

### 2026-06-22 - Fase 1: motor IVA corregido y blindado

- Hallazgo corregido: `vatSettlement.ts` calculaba `freeAvailabilityBalance` sumando todas las percepciones/retenciones SIN aplicarlas contra el saldo a pagar (`amountDue` no las restaba). Resultado: liquidaba IVA pagando de mas. No es solo falta de tests, era un error conceptual del Art. 24 Ley 23.349.
- Correccion: el motor ahora aplica la mecanica completa del Art. 24:
  - Saldo tecnico (1er parr.): debito - credito - saldo tecnico anterior; si queda a favor se arrastra (`technicalCarryForward`).
  - Percepciones/retenciones/pagos a cuenta de IVA (2do parr.): se aplican contra el impuesto tecnico; el EXCEDENTE es saldo de libre disponibilidad (`freeAvailabilityBalance`).
  - Nuevos campos trazables en el resultado: `technicalBalance`, `technicalDue`, `creditsAvailable`, `creditsApplied`.
- Tests: `vatSettlement.test.ts` pasa de 1 a 10 casos (debito>credito, credito>debito con arrastre, saldo previo a favor/insuficiente, no computables excluidos, multi-alicuota, percep/ret que reducen, percep/ret que exceden -> libre disponibilidad, periodo vacio).
- Verificacion: 10/10 en sandbox aislado (vitest + decimal.js). Falta correr `vitest run` completo en Windows.
- PENDIENTE Fase 1: caso real de control con un F2002 real (el usuario lo aportara) para cotejar al peso.
- `calculateVatSettlement` no estaba conectado a ninguna ruta/persistencia, asi que la correccion no rompe consumidores.

### 2026-06-20 - Diseno IVA + IIBB mensual integrado con Ganancias

- Se reviso el plan inicial del usuario y se valido el marco operativo actual de ARCA/ARBA.
- Decision de arquitectura: no mover destructivamente `SalesInvoice`/`PurchaseInvoice` desde `TaxReturn`; se creara un libro fiscal mensual independiente y Ganancias consumira snapshots de consolidacion inmutables.
- Alcance inicial aprobado para planificacion: IVA Simple/F.2051, IIBB local ARBA y Convenio Multilateral regimen general con coeficientes CM05 cargados y aprobados. Regimenes especiales CM y Monotributo Unificado quedan expresamente fuera de la primera entrega.
- Se creo worktree aislado `C:\Dev\Ganancia\_worktrees\ganancias-jaba-iva-iibb-mensual` sobre `main`, rama `feature/iva-iibb-mensual-core`.
- Regla operativa: Docker `ganancias_jaba_test` es el unico ambiente de desarrollo. Hostinger, Vercel y datos productivos no se modificaron.
- Especificacion: `docs/superpowers/specs/2026-06-20-iva-iibb-mensual-design.md`.

### 2026-06-20 - P32 corte 1: Docker aislado por worktree

- Hallazgo: `docker-compose.yml` usaba un `container_name` fijo y los scripts tenian `127.0.0.1:3317` hardcodeado. Un segundo worktree podia competir por el mismo contenedor y base de pruebas.
- Correccion: se elimino el nombre fijo de contenedor; Compose usa `JABA_TEST_DB_PORT` con default `3317`; el nuevo helper `scripts/testDbConfig.mjs` construye la URL Docker y rechaza destinos no locales/no seguros; `run-test-db-command.mjs` y `seed-test-db.mjs` consumen esa unica fuente. Se agrego el comando seguro `create-migration` para que Prisma reciba siempre `DATABASE_URL` Docker.
- Verificacion: test TDD rojo por helper ausente y luego verde (2 tests); Prisma validate OK; base exclusiva `127.0.0.1:3318/ganancias_jaba_test` creada, migracion inicial aplicada y seed OK.
- El contenedor original `ganancias-jaba-test-db` en puerto `3317` no se modifico. Hostinger y Vercel no se tocaron.

### 2026-06-13 - P12 saneamiento lint global aplicado

- Se atendio la deuda tecnica detectada tras corregir el `.env`: `eslint` global pasaba a ser el unico control rojo relevante, con 77 errores y 22 warnings iniciales.
- Alcance: APIs de auditoria/clientes/declaraciones, dashboard principal, wizard, informe cliente, papel de trabajo, `wizardStateTypes`, `seed.ts` y `test_db.js`.
- Cambios principales:
  - reemplazo de `any` explicitos por tipos de Prisma, tipos de vista y `unknown` controlado;
  - correccion de hooks React en dashboard y wizard;
  - eliminacion de imports/variables sin uso;
  - tipado de parametros activos IPC, papel de trabajo e informe cliente;
  - registro del plan en `docs/superpowers/plans/2026-06-13-calidad-lint-hardening.md`.
- Verificacion fresca:
  - `eslint`: OK, sin errores ni warnings;
  - `vitest run`: OK, 46 archivos pasados, 1 skipped; 189 tests pasados, 1 skipped;
  - `tsc --noEmit`: OK;
  - `prisma validate --schema prisma/schema.prisma`: OK;
  - `next build --webpack`: OK;
  - smoke DB solo lectura `SELECT 1`: OK.
- Commit/push: `d706483 chore: sanear lint global p12` en `feature/p21-backup-health`.
- No se modificaron formulas fiscales ni persistencia de datos productivos.

### 2026-06-10 - HALLAZGO CRITICO: importacion CSV AFIP multiplicaba importes x100

- Origen: el usuario aporto los CSV reales de "Mis Comprobantes" (ventas y compras) de AFIP.
- Bug critico de liquidacion: esos CSV usan separador ';', codificacion Latin-1 y coma decimal ("15123,97"). SheetJS interpretaba la coma como separador de miles y devolvia 1512397: TODOS los importes importados quedaban x100, inflando la base imponible 100 veces. Verificado: el "Total Neto Gravado" de la primera venta daba 1.512.397 en vez de 15.123,97; total de ventas 663M en vez de 6,6M.
- Fix: nuevo lector `readSheetRows` que para CSV los lee como texto plano (decodifica Latin-1, autodetecta separador ';'/',', respeta comillas) preservando "15123,97" para que `parseSpanishDecimal` lo convierta bien; SheetJS queda solo para .xlsx (numeros/fechas nativos). `parseExcelDate` ahora maneja el formato ISO AAAA-MM-DD de AFIP (antes "2025-01-02" se interpretaba como 1925-02-01).
- Bug secundario corregido: el nombre del proveedor tomaba "Tipo Doc. Vendedor" (valor "80") porque `findColumnIndex` matcheaba 'vendedor' antes que 'denominaci'. Corregido priorizando 'denominaci'.
- Verificacion sobre los archivos reales del usuario (importador completo reconstruido + esbuild): ventas 234 registros, neto 15123.97, fecha 2025-01-02, total 6.633.777,76; compras 24 registros con nombres correctos; multiarchivo (12 CSV) compila 2808 registros; slot equivocado se rechaza con aviso. Tests nuevos en `importer.test.ts` (CSV ventas, CSV compras con tildes, multiarchivo).
- Decisiones del usuario aplicadas (2026-06-10):
  - Facturas/Recibos C y B sin IVA discriminado: se importan usando el Importe Total como gasto deducible (antes se omitian; en el caso real eran ~580k de gastos perdidos). 7 comprobantes recuperados.
  - Notas de credito: AFIP ya las entrega con importe NEGATIVO; el importador confia en ese signo e importa todo importe distinto de cero (antes `net.gt(0)` descartaba los negativos), de modo que las NC restan. Verificado: ventas con 5 NC, compras con 2 NC (TELECOM -23.785,12).
  - Alta de DDJJ: una DDJJ ANULADA ya no bloquea recrear el periodo; el alta la borra fisicamente y continua (decision: borrar la anulada). Solo las DDJJ activas se tratan como duplicado.
- Verificacion final sobre archivos reales: ventas 239 comprobantes total neto 6.495.182,72; compras 33 comprobantes total neto 3.526.640,16. Tests nuevos: CSV ventas/compras, Facturas C, Notas de credito, multiarchivo.
- PENDIENTE: commit/deploy a produccion; correr `vitest run` completo en Windows (el sandbox verifico la logica de forma aislada por el truncamiento del espejo, no la suite completa).

### 2026-06-10 - P31.8 + migracion a proxy.ts (cierre de codigo de P31)

- P31.8 renovacion deslizante de sesion: `shouldRenewSimpleAuthToken` en `simpleAuth.ts` (reemite el token cuando consumio mas de la mitad de sus 12 hs; solo tras verify; payloads anomalos -> false). El interceptor reemite la cookie con la actividad: una carga larga ya no pierde la sesion.
- Migracion Next 16: `src/middleware.ts` -> `src/proxy.ts` con funcion exportada `proxy` (convencion verificada en `next/dist/build/templates/middleware.js`: `(isProxy ? mod.proxy : mod.middleware) || mod.default`). Elimina el warning de deprecacion.
- `middlewareLocation.test.ts` actualizado: exige `src/proxy.ts`, prohibe middleware/proxy en raiz o `src/middleware.ts`, y verifica que el archivo exporte `function proxy` y `config`.
- Verificacion: `simpleAuth.test.ts` 7/7 OK (incluye renovacion deslizante) ejecutado sobre los archivos reales.
- IMPORTANTE tras deploy: por ser un cambio de convencion del interceptor (la clase de cambio que causo el incidente), reverificar OBLIGATORIO: `curl /api/clientes` sin sesion = 401, login navegador OK, health con token = 200.

### 2026-06-10 - HOTFIX CRITICO: RESUELTO Y VERIFICADO EN PRODUCCION

- Cronologia del cierre: el primer deploy del fix (f976cf6) fallo el type-check de Vercel (`isAuthorizedHealthToken` usaba un objeto literal no asignable desde `process.env`); se corrigio tipando con `SimpleAuthEnv` extendido (commit `942975f`, en el arbol via asistente de GitHub); las ramas divergieron y se unifico con merge normal: `staging`/`main` = `03c6e34`.
- Deploy `dpl_8FyLta...` READY en produccion. Verificacion final: `curl /api/clientes` sin sesion devuelve 401 "Sesion no autenticada" (antes devolvia todos los datos). Middleware activo desde `src/middleware.ts`.
- Leccion tecnica: los builds previos de Vercel y el smoke de P19 ya mostraban el dashboard accesible sin login; quedo enmascarado. El test `middlewareLocation.test.ts` fija la ubicacion. Nota: Next 16 avisa que `middleware` esta deprecado a favor de `proxy`; migrar el nombre en un corte futuro.
- PENDIENTE DE SEGURIDAD (no cerrar P31 sin esto): rotar `AUTH_PASSWORD`, `AUTH_SECRET` y password de la base en Hostinger, porque los datos y endpoints estuvieron publicamente accesibles desde P18. Probar `curl -H "x-health-token: <token>" /api/health` (debe dar 200) y configurar monitor externo.

### 2026-06-10 - HOTFIX CRITICO DE SEGURIDAD: middleware no se ejecutaba en produccion (detalle original)

- Hallazgo: al verificar el health token, `web_fetch` SIN cookie ni token a `/api/clientes` y `/api/parametros` en produccion devolvio datos completos (CUITs, nombres, parametros). La app entera estaba expuesta sin autenticacion.
- Causa raiz: con estructura `src/app`, Next 16 solo ejecuta el middleware si esta en `src/middleware.ts`. El archivo estaba en la raiz del repo (`./middleware.ts`), donde Next lo ignora silenciosamente. La autenticacion simple (P18) y el health token (P31.5) nunca se aplicaron en produccion; el login del navegador funcionaba como pantalla pero las APIs quedaban abiertas.
- Antiguedad: preexistente desde P18 (incorporacion de auth). No fue introducido por los cortes P29/P31.
- Correccion: se movio `middleware.ts` a `src/middleware.ts` (imports ajustados a rutas relativas de `src/`) y se elimino el de la raiz para evitar el conflicto E900 de Next.
- Prueba de regresion: `src/domain/ganancias/tests/middlewareLocation.test.ts` fija que el middleware viva en `src/` y no en la raiz.
- ACCIONES INMEDIATAS DEL USUARIO tras desplegar el fix:
  1. Verificar con `web_fetch`/curl SIN cookie que `/api/clientes` devuelva 401 (no datos).
  2. Asumir que los datos estuvieron accesibles publicamente: rotar `AUTH_PASSWORD`, `AUTH_SECRET` y la password de la base; evaluar exposicion de datos de contribuyentes.
  3. Confirmar que el login del navegador sigue funcionando.

### 2026-06-10 - P31.3/4/5 aplicados (seguridad: rate limit, zod, health token)

- Publicado previo confirmado: `main` = `2aee793` (P31.1/2/7 en produccion).
- P31.3 rate limit de login: nueva logica pura `auth/loginRateLimit.ts` (5 fallos en 15 min -> bloqueo 15 min, demora fija de 1 s ante clave incorrecta, clave de cliente por primera IP de x-forwarded-for). La ruta de login responde 429 con Retry-After; estado en memoria por instancia (mejor esfuerzo en serverless, documentado).
- P31.4 validacion: nuevo `presentation/apiValidation.ts` con zod. `POST /api/declaraciones` valida CUIT/nombre/periodo con mensajes legibles; `PUT /api/declaraciones/[id]` rechaza payloads > 6 MB (413); `/api/import` rechaza lotes > 15 MB (413).
- P31.5 health token: `isAuthorizedHealthToken` en `simpleAuth.ts` (HEALTH_CHECK_TOKEN >= 16 chars, comparacion tiempo constante); el middleware permite `GET /api/health` con header `x-health-token` para monitores de uptime. Variable documentada en `.env.example`; falta cargarla en Vercel y configurar el monitor.
- Tests nuevos: `loginRateLimit.test.ts` (5), `apiValidation.test.ts` (4), caso P31.5 en `simpleAuth.test.ts`. Verificacion sandbox: 15 tests OK.
- Pendiente: commit/push/merge habitual; cargar HEALTH_CHECK_TOKEN en Vercel; configurar monitor externo (p.ej. UptimeRobot) apuntando a /api/health con el header.

### 2026-06-10 - P31.7 y carga agil aplicados (coma decimal + grillas paginadas)

- CI de GitHub Actions del corte P21/P29 confirmado verde por el usuario.
- `moneyFormat.ts`: nueva `normalizeArgentineAmountInput` ("1.234.567,89" -> "1234567.89"; tolera $, espacios, negativos y miles sin coma; no altera decimales estandar). Testeada con 4 casos en `moneyFormat.test.ts`.
- `calculationInputMapper.ts`: `decimalValue` tolera importes con coma (backstop para payloads/localStorage); antes `new Decimal("1.234,56")` tiraba excepcion.
- Wizard:
  - `handleCellChange` normaliza los campos monetarios de todas las grillas en un unico punto (`MONETARY_CELL_FIELDS`);
  - `onPasteCapture` en el contenedor raiz intercepta pegado de importes AR dentro de inputs numericos (caso tipico: copiar desde Excel) y los normaliza antes de que el navegador los rechace o malinterprete;
  - grillas de Ventas y Compras paginadas (100 filas por pagina) con buscador por contraparte/CUIT/comprobante/fecha; los handlers conservan el indice original, asi seleccion masiva y edicion siguen operando sobre la coleccion completa; "Añadir fila manual" salta a la ultima pagina.
- Verificacion en sandbox Linux: moneyFormat (7), calculationInputMapper (4), golden y pagosACuenta OK (17 tests). Pendiente en Windows: `vitest run` completo + `tsc` + build (lo cubre el CI al pushear).
- Pendiente: commit/push y prueba visual de paginacion y pegado.

### 2026-06-10 - P31.1 y P31.2 aplicados (resiliencia dashboard y listado)

- `src/app/page.tsx`: la carga inicial ya no traga errores; ante fallo de red o respuesta `success:false` (p.ej. sesion vencida) muestra banner rojo con boton Reintentar en vez de ceros enganosos. Funcion `loadDashboardData` reutilizable.
- `src/app/api/declaraciones/route.ts`: `currentStep` se extrae con `safeCurrentStep` (parse protegido, rango 1-6); un snapshot corrupto en una fila ya no tira 500 el listado; `client`/`fiscalYear` tolerantes a nulos.
- Analisis de confiabilidad de carga y UX realizado (ver conclusiones en conversacion y proximos puntos P31.7 y virtualizacion de grillas).
- Pendiente: commit/push de estos cambios y validacion visual del banner.

### 2026-06-10 - Auditoria integral de la app en produccion

- Se reviso seguridad/auth (cookie HMAC httpOnly+secure, comparacion en tiempo constante: OK), rutas API, manejo de errores del frontend, payloads y operacion.
- Resultado: 9 hallazgos priorizados registrados como P31 en el backlog. El hallazgo 1 (dashboard traga errores de fetch y muestra ceros) explica el incidente de "datos vacios" de hoy.
- Fortalezas confirmadas: guardas de deploy (P16), workflow de inmutabilidad (P20), health check (P21), validacion de CUIT con digito verificador, auditoria de eventos, CI completo en GitHub Actions.

### 2026-06-10 - Incidente: falsa alarma de perdida de datos en produccion

- Tras publicar `7833cf5` en `main`, el dashboard de produccion se mostro vacio y se sospecho perdida de datos.
- Verificacion realizada: `/api/health` confirmo conexion a `srv1199.hstgr.io/u669600172_ganancias_jaba`; phpMyAdmin mostro `Client` con 2 filas (Lobato 2026-06-07, Dominguez 2026-06-08) y `TaxReturn` con 1 borrador (Dominguez 2024, 2026-06-08); el diff de codigo publicado no toca conexion, schema ni datos; los logs de runtime de Vercel no muestran errores.
- Conclusion: no hubo perdida; la base de produccion siempre tuvo solo esos registros (las cargas completas de prueba viven en la base Docker local). La pantalla vacia fue un fallo transitorio de carga/sesion; al reingresar los datos aparecieron.
- Accion preventiva: exportar backup SQL manual desde phpMyAdmin como linea base (procedimiento en `docs/BACKUP_RESTAURACION_OPERATIVA.md`).

### 2026-06-09 - Cierre P21 + P29: commit, integracion y publicacion

- Commits realizados en Windows sobre `feature/p21-backup-health`:
  - `495360c feat: backup, salud operativa y cierre ux p21/p28` (cierra el pendiente de commit de P21 y del cierre UX P28);
  - `e5ae003 fix: paridad de calculo con excel ig 25 p29`.
- Incidentes resueltos durante el commit: `index.lock` huerfano dejado por un intento de git desde el sandbox del asistente (eliminado); un primer commit mezclado `5f2594b` se deshizo con `reset --soft` y se rearmo en dos commits separados.
- Merge `480476c` a `staging` y push; luego `main` integrada por fast-forward a `480476c` y pusheada. Produccion (Vercel desde `main`) toma este corte.
- CI de GitHub Actions corre sobre `staging` y `main` (tests + typecheck + prisma validate + build); confirmar tilde verde en la pestania Actions del repo.
- Pendiente menor trasladado al backlog: confirmar el importe minimo vigente de anticipos (piso $5.000 tomado del Excel), columna `deduccionEspecificaJubilados` en `TaxParameterSet`, y exposicion en UI de los campos nuevos (F62:F66, F70, quebranto trasladable).

### 2026-06-09 - P29 paridad de calculo con Excel IG 25

- Revision integral de la app contra `DJ Ganancias 2025 - Tercera Categoría.xlsx` (todas las hojas con formulas) y `AXI Inflación IMPOSITIVO Comercial 2025.xlsx`.
- Se detectaron 9 divergencias; detalle completo y decisiones en `docs/superpowers/plans/2026-06-09-paridad-excel-p29.md`.
- Decisiones del usuario: criterio legal documentado ante errores internos del Excel (D27/D29/D30); alcance nucleo critico (venta de bienes de uso pasa a P30).
- Nota operativa: el arbol de trabajo tenia cambios de P21 sin commitear en `feature/p21-backup-health`; P29 se aplico sobre esa misma rama sin tocar git. Al commitear, separar primero P21 y luego los archivos de P29 (motor de calculo, types, mapper, wizard, tests y docs de este frente).
- Cambios aplicados:
  - `types.ts`: `taxCode` extendido (AnticipoEfectivo, AnticipoIDCB, AnticipoMisFacilidades, IDCB, Combustibles), parametro opcional `deduccionEspecificaJubilados`, nuevos campos de salida (anticipos cancelados, computo IDCB, combustibles, saldo IDCB trasladable F70, quebranto trasladable, impuesto proyectado anticipos, doceava parte);
  - `determinacionImpuesto.ts`: pagos a cuenta por concepto F61:F67 con logica F68/F70 (IDCB computable hasta el impuesto determinado, excedente trasladable), exclusion de `Otros` con warning, anticipos RG 5211 `(impuesto proyectado - retenciones - ITC)/5` con piso $5.000 y coeficiente IPC jul->dic, quebranto trasladable expuesto, JVP con resultado post-quebrantos (F38), doceava parte para dependientes, jubilados parametrizable con fallback;
  - `calculationInputMapper.ts`: normalizacion de los nuevos `taxCode`;
  - wizard Paso 5: opciones nuevas en el selector de tipo de credito;
  - tests nuevos: `pagosACuenta.test.ts` (5 tests F61:F67/F68/F70), `anticiposProyectados.test.ts` (5 tests coef jul->dic, cuota, piso $5.000), `quebrantosYDeduccionesPersonales.test.ts` (6 tests quebranto, doceava, jubilados);
  - `taxReturnPreview.test.ts` actualizado: el caso chico ya no espera anticipos (cuota bajo el piso de $5.000) y el payload de hidratacion incorpora los campos nuevos;
  - informe cliente y papel de trabajo suman la doceava parte a la deduccion especial mostrada;
  - `quebrantosApplied` y `totalPaymentsOnAccount` de `CalculationRun` dejan de estar en 0/solo-retenciones.
- Verificacion ejecutada (sandbox Linux con vitest 2 + decimal.js, copia aislada del dominio):
  - 38 archivos de test de dominio pasados, 147 tests OK, incluyendo los 16 nuevos de P29 y golden sin regresion;
  - 6 suites no ejecutables en sandbox por dependencias de entorno (xlsx, prisma schema, Docker, scripts deploy): excelOracle, importer, parameterImporter, databaseSchemaArchitecture, excelCaptureCaseDockerPersistence, deploymentDbSafety.
- Nota de seguridad (2026-06-09): se intento commitear desde el entorno sandbox del asistente y se aborto a proposito; el espejo de archivos del sandbox mostraba versiones truncadas de los archivos editados (en disco estan integros, verificado por lectura directa) y `git` no podia escribir `.git/index.lock`. El commit debe ejecutarse en Windows. Secuencia acordada: 1) verificacion fresca, 2) commit P21 (todo lo pendiente del arbol excepto archivos P29, incluye cierre UX P28), 3) commit P29 (motor, wizard, informes, tests y bitacora), 4) push de la rama, 5) merge a `staging` y push. Integracion a `main` recien despues de validar en staging.
- Pendiente para cerrar P29 (en maquina Windows):
  - `vitest run` completo, `tsc --noEmit`, `prisma validate`, `next build --webpack`;
  - `git diff --check` y commit separado de P21 y P29 (secuencia de la nota anterior);
  - decidir si se agrega `deduccionEspecificaJubilados` como columna de `TaxParameterSet` + seed (hoy es parametro opcional del motor con fallback);
  - exponer en el wizard Paso 6 / papel de trabajo los campos nuevos (anticipos cancelados, IDCB, F70, quebranto trasladable) si se quiere verlos desglosados en pantalla.

### 2026-06-08 - P21 primer corte backup y salud operativa

- Se creo la rama `feature/p21-backup-health` desde `staging`, dejando `main` intacta.
- P20 quedo integrado a `staging` con commit `f7d8713`, sin publicarse en produccion.
- Objetivo del corte P21:
  - tener un endpoint de salud de base de datos;
  - diagnosticar host/base sin exponer usuario ni password;
  - documentar backup Hostinger y restauracion segura primero en Docker.
- Cambios aplicados:
  - se agrego `src/domain/ganancias/operations/operationalHealth.ts`;
  - se agrego `src/domain/ganancias/tests/operationalHealth.test.ts`;
  - se agrego `GET /api/health`;
  - se creo `docs/BACKUP_RESTAURACION_OPERATIVA.md`;
  - se creo el plan `docs/superpowers/plans/2026-06-08-backup-health-p21.md`.
- Verificacion ejecutada:
  - `vitest run src/domain/ganancias/tests/operationalHealth.test.ts`: OK, 3 tests;
  - `vitest run`: OK, 40 archivos pasados, 1 omitido, 155 tests pasados, 1 omitido;
  - `tsc --noEmit`: OK;
  - `prisma validate --schema prisma/schema.prisma`: OK;
  - `next build --webpack`: OK;
  - smoke HTTP local contra Docker: `/api/health` OK, `success: true`, DB `127.0.0.1:3317/ganancias_jaba_test`;
  - `git diff --check`: OK, solo avisos CRLF habituales de Windows.
- Pendiente:
  - commit y push de la rama;
  - probar `/api/health` en Vercel Preview/Staging si se decide publicar la rama de pruebas.

### 2026-06-08 - P20 primer corte workflow profesional de DDJJ

- Se creo la rama `feature/p20-workflow-ddjj` desde `staging`, dejando `main` intacta.
- Se integro P19 a `staging` por fast-forward para conservar el corte de validacion Excel/Docker como base de pruebas, sin publicarlo en produccion.
- Objetivo del corte P20:
  - proteger DDJJ cerradas/presentadas/rectificadas/anuladas contra edicion accidental;
  - reemplazar borrado operativo por anulacion con motivo;
  - conservar borrado fisico solo como rollback tecnico de cabeceras borrador creadas automaticamente.
- Cambios aplicados:
  - se agrego `src/domain/ganancias/workflow/taxReturnWorkflow.ts`;
  - se agrego `src/domain/ganancias/tests/taxReturnWorkflow.test.ts`;
  - `PUT /api/declaraciones/[id]` aplica politica de workflow antes de persistir detalle;
  - reapertura requiere `workflowAction: "reopen"` y `workflowReason`;
  - `DELETE /api/declaraciones/[id]` anula con motivo y registra auditoria;
  - rollback tecnico usa header `X-JABA-Rollback: true`;
  - `/api/declaraciones` oculta anuladas por defecto salvo `includeAnnulled=true`;
  - el dashboard pide motivo de anulacion y ya no habla de borrado permanente de DDJJ;
  - el wizard detecta DDJJ inmutables, muestra aviso de solo lectura y bloquea guardar/cerrar.
- Verificacion ejecutada:
  - `vitest run src/domain/ganancias/tests/taxReturnWorkflow.test.ts src/domain/ganancias/tests/taxReturnSaveFlow.test.ts`: OK, 16 tests;
  - `vitest run`: OK, 39 archivos pasados, 1 omitido, 152 tests pasados, 1 omitido;
  - `tsc --noEmit`: OK;
  - `prisma validate --schema prisma/schema.prisma`: OK;
  - `next build --webpack`: OK;
  - `git diff --check`: OK, solo avisos CRLF habituales de Windows.
- Pendiente:
  - commit y push de la rama;
  - definir si se agrega en un segundo corte UI explicita para reabrir/rectificar desde dashboard.

### 2026-06-08 - P19 primer corte automatico contra Docker

- Se inicio el frente P19 en rama `feature/p19-validacion-excel-docker`.
- Objetivo del corte:
  - convertir el caso Excel/capturas Lobato 2024 en una validacion repetible;
  - confirmar guardado, recalculo y reapertura contra MySQL Docker;
  - no tocar Hostinger ni produccion.
- Cambios aplicados:
  - se agrego `src/domain/ganancias/fixtures/excelCaptureCaseFixture.ts` con el caso unico de referencia;
  - `src/domain/ganancias/tests/simulacionUsuario.test.ts` dejo de duplicar importes y usa el fixture;
  - se agrego `src/domain/ganancias/tests/excelCaptureCaseDockerPersistence.test.ts`;
  - se agrego `npm run db:test:validate:excel`;
  - `scripts/run-test-db-command.mjs` activa `RUN_DOCKER_DB_VALIDATION=1` solo para esa validacion;
  - se documento el comando en `docs/PROCEDIMIENTO_DESARROLLO_SEGURO.md` y `docs/GUIA_PRUEBA_PILOTO.md`.
- Guarda de seguridad:
  - el test exige que `DATABASE_URL` sea exactamente `mysql://jaba_test:jaba_test_pass@127.0.0.1:3317/ganancias_jaba_test`;
  - esto evita correr la validacion destructiva/recreativa contra Hostinger.
- Verificacion ejecutada:
  - `vitest run src/domain/ganancias/tests/simulacionUsuario.test.ts src/domain/ganancias/tests/excelCaptureCaseDockerPersistence.test.ts`: OK, 1 archivo pasado, 1 omitido, 2 tests pasados;
  - `npm run db:test:up`: OK;
  - `npm run db:test:migrate`: OK, sin migraciones pendientes;
  - `npm run db:test:validate:excel`: OK, 1 test.
- Verificacion HTTP local adicional contra Docker:
  - se intento usar el navegador integrado, pero fallo por runtime/sandbox Windows;
  - no habia Playwright instalado localmente, por lo que no se obtuvieron screenshots;
  - se detuvo el servidor dev ambiguo que estaba en `localhost:3000`;
  - se levanto temporalmente Next contra `mysql://jaba_test:***@127.0.0.1:3317/ganancias_jaba_test`;
  - login dev: HTTP 200;
  - dashboard: HTTP 200 y contiene `Consola de Liquidacion`;
  - `/api/declaraciones`: HTTP 200;
  - resultado API: 1 DDJJ Lobato 2024 encontrada en Docker.
- Verificacion HTTP extendida contra Docker:
  - se uso la DDJJ Lobato 2024 generada por el fixture en Docker;
  - `/declaraciones/{id}/wizard`: HTTP 200;
  - `/declaraciones/{id}/papel-de-trabajo`: HTTP 200;
  - `/declaraciones/{id}/informe-cliente`: HTTP 200;
  - las tres rutas devolvieron shell/contenido identificable.
- Resultado:
  - el caso Lobato 2024 se guarda, recalcula y reabre desde la base Docker con los totales esperados de CMV, AXI, resultado, patrimonio, consumo y JVP.
- Pendiente:
  - prueba visual/manual del wizard con `npm run dev:testdb`;
  - revision de papel de trabajo, informe cliente y legajo PDF contra los mismos totales;
  - registrar y corregir diferencias de UI/exportaciones si aparecen.

### 2026-06-08 - Cierre P18 y orden de ramas

- El usuario confirmo que la autenticacion ya funciona en produccion y que aparece el boton `Salir`.
- Se limpio el repositorio para evitar frentes abiertos y ramas obsoletas:
  - se eliminaron ramas locales/remotas `integrate/auth-simple-safe-main`, `fix/produccion-parametros-axi-deducciones`, `feature/auth-simple`, `feature/wizard-optimizado`;
  - se conservaron `main` y `staging`;
  - `staging` quedo alineada al mismo commit que `main`: `a309f22`.
- Estado resultante:
  - `main`: produccion;
  - `staging`: rama de pruebas alineada para futuros trabajos;
  - siguiente frente del plan: P19 validacion real contra Excel en Docker.
- Nota operativa:
  - si Vercel Preview muestra error en `staging`, no afecta produccion; se debe a la guarda que bloquea usar DB productiva en Preview mientras `DATABASE_URL` siga marcada para Preview.

### 2026-06-08 - P18 integracion segura de autenticacion sobre main actual

- El usuario pidio realizar todas las correcciones y adaptaciones necesarias para no pisar ni romper la app productiva, que quedo funcionando luego de los hotfixes recientes.
- Se evito mergear `feature/auth-simple` completo porque estaba basado antes de los hotfixes de AXI/IPC/deducciones.
- Se creo la rama `integrate/auth-simple-safe-main` desde `main`.
- Se incorporaron solo los archivos necesarios de autenticacion:
  - middleware;
  - login/logout;
  - helper de cookie firmada;
  - sanitizacion de redirect;
  - tests de auth;
  - placeholders de variables en `.env.example` y `.env.docker.example`.
- Se agrego boton `Salir` en dashboard y wizard.
- Se agrego `wizardExitGuard` para advertir antes de salir/refrescar una liquidacion iniciada.
- Se agrego confirmacion al cerrar sesion desde el wizard si hay carga iniciada.
- Se agrego guarda en `scripts/check-deployment-db-safety.mjs`: Vercel Production bloquea build si faltan `AUTH_PASSWORD` o `AUTH_SECRET`.
- TDD ejecutado:
  - `wizardExitGuard.test.ts` fallo inicialmente porque faltaba el helper;
  - `deploymentDbSafety.test.ts` fallo inicialmente porque Production permitia auth sin variables.
- Verificacion ejecutada:
  - `vitest run src/domain/ganancias/tests/wizardExitGuard.test.ts src/domain/ganancias/tests/simpleAuth.test.ts`: OK, 8 tests;
  - `vitest run src/domain/ganancias/tests/deploymentDbSafety.test.ts src/domain/ganancias/tests/simpleAuth.test.ts src/domain/ganancias/tests/wizardExitGuard.test.ts`: OK, 16 tests;
  - `vitest run`: OK, 38 archivos y 145 tests;
  - `tsc --noEmit`: OK;
  - `prisma validate --schema prisma/schema.prisma`: OK;
  - `scripts/check-deployment-db-safety.mjs`: OK en entorno local;
  - `next build --webpack`: OK;
  - lint focalizado en archivos nuevos/pequenos de auth/guardas: OK;
  - lint incluyendo `src/app/page.tsx` y wizard completo: falla por deuda previa ya registrada (`any`, hooks y warnings historicos), no por los archivos nuevos de auth.
- Dato externo confirmado:
  - el usuario configuro `AUTH_PASSWORD` y `AUTH_SECRET` en Vercel Production antes de publicar.
- Publicacion:
  - rama segura mergeada por fast-forward a `main`;
  - commit final publicado: `a309f22 docs: confirmar variables auth vercel`;
  - Vercel redeploy ejecutado luego de confirmar variables.

### 2026-06-08 - Hotfix UX IPC en Paso 6

- El usuario reporto que, aun revisando Parametros Manuales 2024, seguia apareciendo el aviso: `AXI Estatico: No se encontraron indices IPC validos de enero y/o diciembre`.
- Se confirmo que Parametros Manuales no edita IPC; solo deducciones y topes. El editor de IPC operativo esta dentro de la liquidacion, en Paso 5 > Ajuste por Inflacion (AXI).
- Causa raiz de UX: el aviso de Paso 6 no indicaba la ubicacion correcta ni permitia saltar directo al editor, por lo que era facil intentar corregirlo desde la pantalla equivocada.
- Cambios aplicados:
  - `isMissingIpcWarning` detecta la advertencia especifica de IPC faltante;
  - Paso 6 muestra boton `Ir a cargar IPC en AXI`;
  - el texto del aviso explica que debe cargarse en Paso 5 > AXI > Editor de Indices IPC;
  - al guardar IPC se invalida el preview backend anterior para recalcular con los valores actualizados.
- Verificacion ejecutada:
  - `vitest run src/domain/ganancias/tests/wizardCalculationParams.test.ts`: OK, 5 tests;
  - `tsc --noEmit`: OK;
  - `vitest run`: OK, 36 archivos y 136 tests;
  - `scripts/check-deployment-db-safety.mjs`: OK;
  - `next build --webpack`: OK.
- Pendiente:
  - commit/push a `main`;
  - validar en produccion el flujo Paso 6 > boton > Paso 5 AXI > Guardar Indices > Paso 6 sin aviso.

### 2026-06-08 - Hotfix produccion parametros, AXI y deducciones

- El usuario reporto problemas observados directamente en produccion:
  - al guardar indices IPC fallaba Prisma con `Transaction API error` por timeout de 5000 ms;
  - ajuste dinamico mostraba el retiro/aporte con signo contrario al esperado;
  - la pantalla advertia falta de indices IPC aunque el editor tenia valores cargados;
  - deducciones personales/generales aparecian en cero.
- Se creo la rama `fix/produccion-parametros-axi-deducciones` desde `main`, separada de `feature/auth-simple`, para poder publicar un hotfix sin arrastrar la autenticacion si no se decide mergearla todavia.
- Causa raiz identificada:
  - `PUT /api/parametros` guardaba parametros, escalas e indices dentro de una transaccion interactiva Prisma con timeout default de 5 segundos;
  - el wizard consideraba `activeParams` como valido aunque `parameterSet` viniera `null`, anulando el fallback de deducciones;
  - el calculo usaba indices persistidos/recargados, pero no siempre los indices visibles en pantalla;
  - `Number()` y `Decimal()` no toleraban coma decimal sin normalizacion;
  - AXI estatico aceptaba IPC cero y podia derivar en `Infinity` o `-0`;
  - ajuste dinamico se estaba mostrando como `capital real - capital teorico`, cuando el criterio definido es `capital teorico - capital real`.
- Cambios aplicados:
  - `src/domain/ganancias/persistence/taxParameterPersistence.ts` define opciones de transaccion con timeout ampliado;
  - `src/app/api/parametros/route.ts` usa esas opciones y normaliza coma decimal en IPC;
  - `src/domain/ganancias/presentation/wizardCalculationParams.ts` arma parametros efectivos del wizard con fallback seguro de deducciones, indices visibles y coeficientes utiles;
  - `src/app/declaraciones/crear/wizard/page.tsx` usa parametros efectivos, normaliza IPC de pantalla y corrige la visualizacion/copia de retiro-aporte neto;
  - `calculateAxiStaticInflationRate` exige IPC positivos antes de dividir;
  - `calculateAxiStatic` evita resultado `-0` cuando la tasa es cero.
- Tests agregados/actualizados:
  - `wizardCalculationParams.test.ts`;
  - `taxParameterPersistence.test.ts`;
  - `axiInflationRate.test.ts`.
- Verificacion ejecutada:
  - tests focales: OK, 7 tests;
  - `vitest run`: OK, 36 archivos y 135 tests;
  - `tsc --noEmit`: OK;
  - `prisma validate --schema prisma/schema.prisma`: OK;
  - lint focalizado: OK;
  - `scripts/check-deployment-db-safety.mjs`: OK;
  - `next build --webpack`: OK.
- Publicacion:
  - commit `09f3e2b fix: corregir parametros axi y deducciones` integrado por fast-forward en `main`;
  - `main` pusheado a GitHub para que Vercel ejecute el deploy automatico.
- Pendiente:
  - validar en produccion guardado de indices, AXI y deducciones.

### 2026-06-08 - Plan App 10/10

- El usuario solicito un plan para cubrir todas las cuestiones necesarias para que la app quede 10/10 y registrar tambien las que surjan conforme se avance.
- Se creo `docs/PLAN_APP_10_10.md` como roadmap ejecutivo.
- Se creo `docs/superpowers/plans/2026-06-08-app-10-10.md` como plan tecnico por tareas.
- Se actualizaron `docs/CONTINUAR_AQUI.md` y `docs/BACKLOG_PRIORIZADO.md`.
- Se definio el orden P18-P27:
  - P18 autenticacion y proteccion de acceso;
  - P19 validacion real contra Excel en Docker;
  - P20 workflow profesional de DDJJ;
  - P21 backup/restauracion y salud operativa;
  - P22 adjuntos, soportes y paquete final;
  - P23 parametros fiscales, tipos de cambio y casos especiales;
  - P24 calidad tecnica y mantenibilidad;
  - P25 UX 10/10 y controles por pantalla;
  - P26 E2E y prueba visual;
  - P27 produccion controlada.
- Proximo frente recomendado: P18, porque la app ya esta publicada en Vercel y no se observo login/middleware activo.
- Regla para nuevos hallazgos: todo nuevo problema o mejora se registra como `Pxx` con problema, impacto, accion, criterio de cierre, verificacion y commit asociado.
- Decision de continuidad: no abrir mejoras sueltas fuera del backlog, salvo urgencia registrada.

### 2026-06-07 - P17 base Docker local de pruebas

- Se configuro una base MySQL de pruebas local con Docker Desktop para simular persistencia sin tocar Hostinger.
- Servicio Docker: `mysql-test`.
- Contenedor: `ganancias-jaba-test-db`.
- Base local: `ganancias_jaba_test`.
- Usuario local: `jaba_test`.
- Puerto local final: `3317`, porque `3307` estaba ocupado.
- URL de pruebas enmascarada: `mysql://jaba_test:***@127.0.0.1:3317/ganancias_jaba_test`.
- Se actualizo `docker-compose.yml` para usar volumen `mysql_test_data` y healthcheck.
- Se agrego `.env.docker.example` sin credenciales productivas.
- Se agrego `scripts/run-test-db-command.mjs`, que fuerza `DATABASE_URL` de Docker para comandos de Prisma/Next.
- Se agrego `scripts/seed-test-db.mjs`, seed minimo en JS puro con `mariadb`, para no depender de `npx/tsx` en esta terminal.
- Se agregaron scripts npm:
  - `db:test:up`;
  - `db:test:down`;
  - `db:test:reset`;
  - `db:test:migrate`;
  - `db:test:seed`;
  - `db:test:validate`;
  - `db:test:studio`;
  - `dev:testdb`.
- Se creo `docs/BASE_DOCKER_PRUEBAS.md` con comandos y reglas de seguridad.
- Verificacion:
  - Docker disponible: version `29.4.2`; Compose `v5.1.3`.
  - Primer intento en `3307`: fallo porque el puerto ya estaba ocupado.
  - Reconfigurado a `3317`.
  - `docker compose up -d --force-recreate mysql-test`: OK.
  - `docker compose ps mysql-test`: contenedor `healthy`.
  - `docker exec ... mysqladmin ping`: `mysqld is alive`.
  - `scripts/run-test-db-command.mjs validate`: OK.
  - `scripts/run-test-db-command.mjs migrate`: OK; migracion inicial aplicada.
  - `scripts/seed-test-db.mjs`: OK; 2 clientes, 2 periodos fiscales, 1 set de parametros, 9 escalas y 12 indices.
  - Validacion de conexion app: `buildMariaDbConnectionConfig` apunta a `127.0.0.1:3317/ganancias_jaba_test`.
- Nota: existe un contenedor huerfano anterior `ganancias-jaba-db` del compose viejo. No se elimino automaticamente para evitar acciones destructivas no solicitadas; puede limpiarse luego con cuidado si se confirma que no se usa.

### 2026-06-07 - Procedimiento obligatorio de desarrollo seguro

- A pedido del usuario, se reforzo el registro del procedimiento porque sera fundamental para agregar funcionalidades, probarlas y no romper produccion ni la base asociada.
- Se creo `docs/PROCEDIMIENTO_DESARROLLO_SEGURO.md` como documento central.
- El procedimiento establece:
  - usar Docker local para desarrollo y pruebas;
  - usar `npm run dev:testdb` para forzar `ganancias_jaba_test`;
  - no usar la base productiva de Hostinger para pruebas;
  - no usar `prisma db push` contra produccion;
  - crear migraciones versionadas;
  - hacer backup SQL antes de migraciones productivas;
  - actualizar registro, backlog y continuidad antes de cerrar cada unidad;
  - commitear y pushear cambios utiles.
- Se enlazo el procedimiento desde:
  - `docs/CONTINUAR_AQUI.md`;
  - `docs/BASE_DOCKER_PRUEBAS.md`;
  - `docs/FLUJO_SEGURO_DEPLOY.md`;
  - `docs/BACKLOG_PRIORIZADO.md`.
- Decision permanente: salvo instruccion explicita y registrada, toda prueba local se realiza contra Docker y no contra Hostinger.

### 2026-06-07 - P16 flujo seguro de deploy y resguardo de DB productiva

- Se definio `main` como unica rama de produccion y `staging` como rama de pruebas/Preview.
- Se agrego una guarda automatica para evitar que Vercel Preview/Staging use la base productiva de Hostinger por error.
- Script agregado: `scripts/check-deployment-db-safety.mjs`.
- Test agregado: `src/domain/ganancias/tests/deploymentDbSafety.test.ts`.
- El script corre como `prebuild`, antes de `next build`.
- Production:
  - requiere `DATABASE_URL`;
  - si Vercel informa rama distinta de `main`, bloquea el build.
- Preview/Staging:
  - permite no tener `DATABASE_URL`;
  - bloquea si `DATABASE_URL` apunta a `srv1199.hstgr.io` / `193.203.175.56` y base `u669600172_ganancias_jaba`;
  - permite una DB staging separada.
- Se agregaron scripts npm `test`, `typecheck`, `prisma:validate` y `verify`.
- Se agrego CI GitHub en `.github/workflows/ci.yml` para push/PR sobre `main` y `staging`.
- Se creo `docs/FLUJO_SEGURO_DEPLOY.md` con ambientes, reglas de Vercel, backups, migraciones y checklist de produccion.
- Se actualizo `.env.example` sin credenciales reales, agregando variables de identificacion de DB productiva.
- Se publico `origin/staging` desde `main` para usarlo como rama de pruebas/Preview antes de integrar cambios futuros a produccion.
- Decision: no ejecutar migraciones automaticamente durante build de Vercel. Las migraciones productivas siguen siendo manuales y con backup SQL previo.
- Pendiente externo: en Vercel, confirmar que `DATABASE_URL` este marcada solo para Production. Si se quiere persistencia real en Preview, crear una DB staging separada.
- Verificacion:
  - TDD rojo confirmado: `deploymentDbSafety.test.ts` fallo inicialmente porque no existia `scripts/check-deployment-db-safety.mjs`.
  - Test focalizado: `deploymentDbSafety.test.ts` OK, 7 tests.
  - Prueba CLI manual: Preview con DB productiva bloqueado; Production desde `main` permitido.
  - `vitest run`: OK, 34 archivos y 129 tests.
  - `tsc --noEmit`: OK.
  - `prisma validate --schema prisma/schema.prisma`: OK.
  - `check-deployment-db-safety` + `next build --webpack`: OK.
  - `git diff --check`: OK, solo avisos CRLF habituales de Windows.

### 2026-06-07 - P15 arquitectura MySQL Hostinger/Vercel

- Se inicio la etapa de base de datos para uso personal con Hostinger y despliegue en Vercel, dejando prevista extension futura a multiusuario.
- Se documento el plan en `docs/superpowers/plans/2026-06-07-base-datos-hostinger.md`.
- Se creo `docs/ARQUITECTURA_BASE_DATOS_HOSTINGER.md` con nombres recomendados, formato de `DATABASE_URL`, migraciones, backups y pendientes externos.
- Se incorporo explicitamente el flujo GitHub + Vercel + Hostinger MySQL: GitHub versiona codigo/migraciones, Vercel despliega y ejecuta la conexion runtime, Hostinger conserva los datos.
- Recomendacion para Hostinger:
  - DB: `u669600172_ganancias_jaba`;
  - usuario: `u669600172_jaba_app`.
- El usuario creo en Hostinger la DB `u669600172_ganancias_jaba` y el usuario `u669600172_jaba_app` el 2026-06-07.
- Se registro el sitio asociado `lightgray-herring-775204.hostingersite.com`.
- Se confirmo host MySQL remoto `srv1199.hstgr.io` e IP alternativa `193.203.175.56`.
- Se habilito Remote MySQL para `u669600172_ganancias_jaba` con acceso `%`, compatible con Vercel sin IP fija.
- Se verifico conexion remota desde la app contra Hostinger y se aplico `prisma migrate deploy` el 2026-06-07.
- Verificacion posterior: 35 tablas creadas en `u669600172_ganancias_jaba`.
- Se ejecuto seed inicial contra Hostinger el 2026-06-07.
- Verificacion post-seed: `Client=3`, `FiscalYear=2`, `TaxParameterSet=1`, `TaxArt94Bracket=9`, `UpdateIndex=12`, `TaxReturn=1`, `CalculationRun=1`.
- La password fue visible en captura; no se registra en el repo y se recomienda regenerarla antes de produccion o tratarla como temporal.
- Se agrego `.env.example` sin secretos reales.
- Se actualizo `.gitignore` para permitir versionar `.env.example`.
- Se agrego helper `buildMariaDbConnectionConfig` y `maskDatabaseUrl`.
- Se removio el fallback silencioso local de `src/domain/ganancias/prisma.ts` y `prisma/seed.ts`.
- `test_db.js` deja de imprimir passwords.
- `schema.prisma` incorpora estructura relacional para CUIT de contraparte, bajas de bienes, deducciones, AXI estatico, adjuntos binarios e importaciones AFIP.
- La persistencia guarda esos campos en tablas propias y conserva `variablesSnapshot` como soporte de auditoria/fallback.
- La reapertura de DDJJ prefiere valores relacionales y usa snapshot solo como compatibilidad con declaraciones previas.
- Se genero migracion inicial en `prisma/migrations/20260607000100_initial_hostinger_mysql/migration.sql`.
- Verificacion tecnica ejecutada: `prisma validate` OK, tests focalizados OK, `vitest run` OK con 33 archivos y 122 tests, `tsc --noEmit` OK, `next build --webpack` OK y `git diff --check` OK con avisos CRLF habituales.

## Para Retomar Rapido

Leer primero `docs/CONTINUAR_AQUI.md`.

Ese archivo resume estado actual, prioridad activa, comandos utiles y la regla de continuidad. Este registro queda como bitacora historica larga y evidencia de decisiones, pero no como punto de entrada principal.

## Objetivo

Construir y estabilizar una aplicacion para un estudio contable chico/unipersonal, orientada a preparar declaraciones juradas de Ganancias Persona Fisica - Tercera Categoria.

Prioridades del producto:

- Carga agil.
- Automatizacion donde aporte eficiencia real.
- Sin "magia": cada calculo debe ser visible, explicable y auditable.
- Uso inicial por una sola persona.
- La planilla Excel actual se toma como referencia funcional porque ya se usa en produccion profesional.

## Archivos base de referencia

Ubicacion: `C:\Dev\Ganancia\Persona Fisica`

- `DJ Ganancias 2025 - Tercera Categoria.xlsx`
- `AXI Inflacion IMPOSITIVO Comercial 2025.xlsx`
- `Indices de actualizacion hasta 2025 (1).xlsx`

Pendiente:

- No se encontro un archivo claramente identificado como "tipos de cambio". En la planilla base hay campos de tipo de cambio en cuentas/bancos/compras, pero no un archivo complementario especifico detectado en la carpeta.

## Aplicacion analizada

Ubicacion: `C:\Dev\Ganancia\Persona Fisica\ganancias-jaba`

Stack detectado:

- Next.js 16
- React 19
- Prisma 7
- MariaDB/MySQL
- decimal.js
- xlsx
- zod
- Vitest
- ESLint

## Estado de verificacion inicial

Comandos relevantes ya ejecutados:

- Tests de dominio con Vitest: pasaron 5 tests en 2 archivos.
- Build de produccion con Next: paso correctamente usando ejecucion con permisos elevados por descarga de fuentes Google.
- Lint: fallo con 205 problemas aproximados, mayormente `no-explicit-any` y variables sin uso, pero tambien hay problemas reales de hooks/orden de declaracion.
- Dev server con Turbopack: fallo en sandbox por permisos al crear procesos.
- Dev server con Webpack: respondio 200 en rutas API principales.
- Git: no esta disponible en el PATH de PowerShell en esta maquina.
- Browser plugin: no pudo usarse por error de sandbox en `node_repl`.

## Hallazgos principales

### H1 - "Sincronizar ARCA" no es una sincronizacion real

Estado: resuelto como mitigacion de producto.

La aplicacion muestra una accion de sincronizacion ARCA, pero actualmente genera parametros hardcodeados/simulados.

Riesgo:

- Alto riesgo funcional y profesional si el usuario interpreta que los parametros vienen realmente de una fuente oficial.

Accion esperada:

- Accion renombrada a carga de base interna.
- Dejar claro si los parametros son importados desde Excel, cargados manualmente o simulados.

### H2 - Importacion de indices incompatible con el archivo real

Estado: parcialmente resuelto.

El archivo `Indices de actualizacion hasta 2025 (1).xlsx` usa fechas seriales de Excel y coeficientes distribuidos en una estructura que el importador actual no valida correctamente.

Riesgo:

- Coeficientes IPC mal cargados.
- Ajustes por inflacion incorrectos.

Accion esperada:

- Parser especifico creado para normalizar fechas seriales de Excel a meses 1..12.
- Test agregado contra el archivo real de indices.
- Pendiente: definir como persistir y aplicar coeficientes utiles en AXI estatico/dinamico, porque el modelo actual solo guarda `ipcValue` mensual.

### H3 - Deducciones generales no equivalen completamente a la planilla base

Estado: parcialmente resuelto.

La planilla aplica topes y formulas especificas, incluyendo rubros que no estan completos en el modelo actual.

Riesgo:

- Diferencias entre la aplicacion y la planilla usada por el estudio.

Accion esperada:

- Mapear rubro por rubro contra `IG 25` y `Ded. Gen.`.
- Deduccion locador/locatario 10% agregada al motor y al wizard.
- Alinear formulas con la planilla o documentar diferencias intencionales.

### H4 - AXI esta simplificado frente a la planilla

Estado: parcialmente resuelto.

La planilla de AXI tiene apertura estatica y dinamica mucho mas detallada que el modelo actual.

Riesgo:

- Resultado AXI incompleto para casos reales.

Accion esperada:

- Separar AXI estatico y dinamico por secciones equivalentes a la planilla.
- Definir una carga guiada que sea rapida pero auditable.

### H5 - El importador pierde detalle auditable

Estado: parcialmente resuelto.

Ventas, compras y retenciones importadas se reducen a pocos campos genericos.

Riesgo:

- Menor trazabilidad ante revision.
- Reproceso manual si hay que justificar un dato.

Accion esperada:

- Preservar datos relevantes: fecha, comprobante, punto de venta, numero, CUIT, razon social, moneda, tipo de cambio, IVA, no gravado, exento, total, regimen/certificado de retencion, etc.
- Avance aplicado: ventas y compras importadas conservan comprobante, numero, contraparte, CUIT, IVA y total durante importacion, carga en wizard, persistencia relacional y reapertura.
- Limitacion vigente: el CUIT de contraparte queda en `variablesSnapshot` porque las tablas `SalesInvoice` y `PurchaseInvoice` no tienen columna propia para ese dato. Queda pendiente evaluar migracion si se quiere consulta directa por CUIT.

### H6 - Doble calculo entre frontend y backend

Estado: abierto con mitigaciones incrementales.

El wizard calcula en cliente y el backend vuelve a calcular al guardar.

Riesgo:

- Diferencias entre lo que ve el usuario y lo que queda guardado.

Accion esperada:

- Centralizar calculo en dominio/backend.
- El frontend debe pedir preview/calculo y mostrar resultado, no ser una segunda fuente de verdad.
- Primeros pasos aplicados: el wizard y la pagina independiente de papel de trabajo ya usan un mapper testeado para no recalcular con datos parciales o divergentes.
- Se agrego un endpoint backend de preview/cÃ¡lculo (`POST /api/declaraciones/preview`) que usa el mapper comun y devuelve resultado serializado apto para UI.

### H8 - Alta nueva de DDJJ no persistia toda la carga inicial

Estado: resuelto.

Cuando el wizard creaba una declaracion nueva desde `/declaraciones/crear/wizard`, el `POST /api/declaraciones` creaba cabecera y un `CalculationRun` inicial, pero no persistia ventas, compras, bienes, bancos, deducciones, patrimonio ni AXI cargados en ese mismo cierre/guardado.

Riesgo:

- La informacion podia quedar solo en `localStorage` del navegador despues de la creacion inicial.
- Al consultar desde otra sesion/dispositivo o desde la base, la DDJJ podia aparecer incompleta.

Accion aplicada:

- El wizard conserva en memoria el `id` real ya persistido para que los guardados siguientes usen `PUT` aunque la ruta todavia venga de `/crear`.
- El auto-alta del wizard envia payload completo al `POST /api/declaraciones`.
- El backend ahora detecta cuando el `POST /api/declaraciones` trae carga operativa y persiste detalle relacional/calculo dentro de la misma transaccion de creacion.
- El exito del modal se muestra solo si ese `POST` atomico devuelve confirmacion.
- Si ya existe una DDJJ original para el mismo cliente y periodo, el backend responde con codigo funcional e ID existente, y el wizard abre esa declaracion en lugar de mostrar un error tecnico.

Pendiente:

- Validar manualmente contra base local con un caso real de wizard.
- Mitigacion adicional aplicada: el `POST` guarda en `variablesSnapshot` todo el payload operativo recibido cuando no dispara persistencia relacional completa.

### H9 - Reapertura de DDJJ con fechas incompletas podia fallar

Estado: resuelto como mitigacion de robustez.

La API `GET /api/declaraciones/[id]` formateaba fechas con `toISOString()` directo. Esto era fragil para campos opcionales como la fecha de movimientos AXI dinamicos.

Riesgo:

- Una DDJJ con datos historicos o importados con fecha nula podia fallar al abrirse en el wizard.
- El usuario podia perder agilidad justo al intentar continuar una carga ya persistida.

Accion aplicada:

- Se agrego un formateador testeado para convertir fechas persistidas a formato `YYYY-MM-DD`.
- Si la fecha es nula o invalida, la API devuelve cadena vacia en vez de romper la respuesta.
- Se conecto el helper a ventas, compras, bienes de uso y AXI dinamico.

### H7 - Campos patrimoniales y JVP incompletos

Estado: abierto.

La planilla usa una justificacion de variaciones patrimoniales amplia. La app tiene arreglos vacios o simplificados para efectivo, creditos, pasivos y otras justificaciones.

Riesgo:

- Consumo/justificacion patrimonial poco confiable.

Accion esperada:

- Incorporar carga por rubros equivalentes a planilla.
- Mantener calculo visible en papel de trabajo.

## Decisiones tomadas

### D1 - La planilla Excel es el oraculo funcional inicial

Fecha: 2026-05-30

Se decide que los calculos de la app se validaran contra la planilla base antes de cambiar formulas sensibles.

### D2 - Primero se crea una red de pruebas, luego se corrige logica

Fecha: 2026-05-30

Se evita reescribir calculos fiscales sin tests de resguardo.

### D3 - Toda mejora debe quedar registrada

Fecha: 2026-05-30

Este archivo funcionara como bitacora y estado vivo del proyecto. Cada bloque de trabajo debe registrar:

- Que se hizo.
- Que se verifico.
- Que queda pendiente.
- Riesgos o decisiones abiertas.

### D4 - La continuidad operativa se gestiona desde un tablero corto

Fecha: 2026-06-01

Se decide que `docs/CONTINUAR_AQUI.md` es la puerta de entrada para retomar el proyecto. `docs/BACKLOG_PRIORIZADO.md` define el orden de trabajo y `docs/REGISTRO_PROYECTO.md` queda como bitacora historica detallada.

Regla operativa:

- Al retomar, no recorrer todo el proyecto.
- Leer `CONTINUAR_AQUI`.
- Tomar el primer item activo/siguiente del backlog.
- Al cerrar una unidad, actualizar registro, verificar, commitear y pushear.

## Plan inmediato

Fase 1 - Validacion Excel y parametros:

- Crear extractor/fixture de valores clave desde los Excel base.
- Agregar tests de lectura de planillas.
- Corregir o endurecer importacion de indices.
- Registrar cualquier diferencia entre app y Excel.
- No tocar formulas fiscales complejas sin una prueba que exponga la diferencia.

## Bitacora

### 2026-06-01 - Control operativo de continuidad

Se agrego una capa de continuidad para retomar el proyecto sin reconstruir contexto desde cero.

Riesgo mitigado:

- La bitacora historica ya contiene mucha informacion y obliga a releer demasiado para saber por donde seguir.
- Habia frentes abiertos en distinto grado de avance, con pendientes viejos mezclados con pendientes reales.
- Retomar sin un tablero corto aumenta el riesgo de duplicar trabajo o abrir nuevos frentes sin cerrar los activos.

Archivos modificados:

- `docs/CONTINUAR_AQUI.md`.
- `docs/BACKLOG_PRIORIZADO.md`.
- `docs/superpowers/plans/2026-06-01-continuidad-operativa.md`.
- `docs/REGISTRO_PROYECTO.md`.
- `docs/FASE_1_VALIDACION_EXCEL.md`.

Resultado funcional:

- `CONTINUAR_AQUI` queda como puerta de entrada para proximas sesiones.
- `BACKLOG_PRIORIZADO` ordena los frentes por prioridad y estado.
- El registro historico enlaza al tablero corto y conserva la evidencia larga.
- H5 se reclasifico como parcialmente resuelto porque ventas/compras ya conservan detalle importado, aunque quedan mejoras de CUIT en columna propia y retenciones.
- Al cerrar esta unidad, P0 queda resuelto y la prioridad activa pasa a P1: reducir riesgo operativo/deuda del wizard.

Verificacion prevista:

- Lectura de los documentos nuevos.
- Busqueda de enlaces y prioridades.
- `git diff --check`.

Pendiente:

- Mantener estos documentos actualizados en cada cierre de bloque.
- Continuar por P1: reducir riesgo operativo/deuda del wizard.

### 2026-06-01 - P1 primer corte: formato monetario fuera del wizard

Se inicio la reduccion incremental de deuda del wizard sin reescribir la pantalla completa.

Riesgo mitigado:

- El wizard tenia helpers inline con `any`, mezclando presentacion, formato y UI.
- Cada cambio en esa pantalla aumenta riesgo si no se extraen piezas testeables.
- El objetivo de P1 es mejorar verificabilidad por cortes chicos, no una refactorizacion masiva.

Archivos modificados:

- `src/domain/ganancias/presentation/moneyFormat.ts`.
- `src/domain/ganancias/tests/moneyFormat.test.ts`.
- `src/app/declaraciones/crear/wizard/page.tsx`.
- `docs/CONTINUAR_AQUI.md`.
- `docs/BACKLOG_PRIORIZADO.md`.
- `docs/REGISTRO_PROYECTO.md`.

Resultado funcional:

- Se agregaron `formatCurrencyWhole` y `formatCurrencyCents`.
- Se retiro del wizard el helper local `formatDecimal` con `any`.
- Se retiro el helper local `formatVal` usado para topes con centavos.
- Se elimino el import no usado `Info`.
- El comportamiento de formato queda cubierto por tests.

Verificacion:

- TDD rojo confirmado: `moneyFormat.test.ts` fallo inicialmente porque el helper no existia.
- `vitest run src/domain/ganancias/tests/moneyFormat.test.ts`: 1 archivo, 3 tests, todo OK.
- `vitest run`: 20 archivos, 58 tests, todo OK.
- `tsc --noEmit`: OK.
- `eslint` focalizado sobre helper/test nuevo: OK.
- `next build --webpack`: OK.
- `eslint src/app/declaraciones/crear/wizard/page.tsx`: sigue fallando por deuda previa, ahora con 31 problemas (26 errores, 5 warnings).

Pendiente:

- Siguiente subcorte recomendado: tipar o extraer bloque de carga/cache inicial del wizard.
- Resolver progresivamente reglas de hooks (`setState` en efectos) y `Date.now` en creacion de filas.

### 2026-06-01 - P1 segundo corte: estado tipado del wizard

Se avanzo sobre la deuda critica del wizard tipando sus estructuras principales sin modificar formulas fiscales.

Riesgo mitigado:

- Los `any` del estado principal permitian asignaciones opacas en ventas, compras, bancos, bienes, retenciones, patrimonio, AXI, resoluciones y parametros.
- La pantalla de carga es el punto mas sensible para un estudio chico: debe ser rapida, pero tambien previsible y auditable.
- Antes de tocar calculo, AXI o JVP conviene que el estado editable tenga nombres y tipos explicitos.

Archivos modificados:

- `src/domain/ganancias/presentation/wizardStateTypes.ts`.
- `src/domain/ganancias/tests/wizardStateTypes.test.ts`.
- `src/app/declaraciones/crear/wizard/page.tsx`.
- `docs/CONTINUAR_AQUI.md`.
- `docs/BACKLOG_PRIORIZADO.md`.
- `docs/REGISTRO_PROYECTO.md`.

Resultado funcional:

- Se agregaron tipos reutilizables para resoluciones, parametros activos, padron, declaraciones, ventas, compras, bienes de uso, bancos, retenciones, patrimonio personal, pasivos y movimientos AXI.
- Se agrego `coerceWizardPersonalDeductionType` para evitar casts inseguros al cargar la deduccion especial.
- Se agregaron helpers `wizardMoneyToString` y `wizardMoneyToNumber` para normalizar valores editables antes de usarlos en estado, parseos o JSX.
- El wizard ya no contiene `any` explicitos en los estados y mapeos principales tocados.
- Se reemplazaron dos `Date.now()` de altas manuales por ids deterministas basados en la cantidad actual de filas.
- Se retiro el efecto derivado de `maxVisitedStep`; ahora se actualiza junto con el cambio de paso.

Verificacion:

- TDD rojo confirmado: `wizardStateTypes.test.ts` fallo inicialmente porque `wizardStateTypes` no existia.
- TDD rojo confirmado: el test de helpers monetarios fallo inicialmente porque `wizardMoneyToString` y `wizardMoneyToNumber` no existian.
- `vitest run src/domain/ganancias/tests/wizardStateTypes.test.ts src/domain/ganancias/tests/moneyFormat.test.ts`: 2 archivos, 6 tests, todo OK.
- `vitest run`: 21 archivos, 61 tests, todo OK.
- `tsc --noEmit`: OK.
- `eslint` focalizado sobre `wizardStateTypes.ts` y su test: OK.
- `next build --webpack`: OK.
- `git diff --check`: OK, solo advertencias CRLF esperadas de Git en Windows.
- `eslint src/app/declaraciones/crear/wizard/page.tsx`: sigue fallando por deuda previa, pero baja a 5 problemas (4 errores, 1 warning), concentrados en efectos de React/carga inicial.

Pendiente:

- Proximo subcorte P1: extraer/ordenar carga inicial, localStorage y reset de contribuyente para resolver los 5 problemas restantes de hooks.
- No tocar calculo fiscal, AXI ni JVP hasta cerrar ese subcorte o aceptar conscientemente el riesgo.

### 2026-06-01 - P1 tercer corte: wizard sin deuda focal de ESLint

Se cerro P1 corrigiendo la deuda remanente del wizard sin modificar formulas fiscales.

Riesgo mitigado:

- El wizard aun tenia efectos que sincronizaban estado de forma fragil (`persistedReturnId`, carga inicial, reset por cambio de contribuyente y parametros activos).
- Esos efectos podian generar renders en cascada o borrar datos por efectos secundarios poco visibles.
- Para una carga agil y confiable, los resets deben ocurrir por accion del usuario y los estados derivados deben calcularse, no duplicarse.

Archivos modificados:

- `src/domain/ganancias/presentation/wizardStateTypes.ts`.
- `src/domain/ganancias/tests/wizardStateTypes.test.ts`.
- `src/app/declaraciones/crear/wizard/page.tsx`.
- `docs/CONTINUAR_AQUI.md`.
- `docs/BACKLOG_PRIORIZADO.md`.
- `docs/REGISTRO_PROYECTO.md`.

Resultado funcional:

- `activeReturnId` ahora se deriva del id de ruta normalizado y del id persistido luego de crear, sin efecto sincronico extra.
- `isLoadingData` ahora se deriva de la carga de ruta y del import historico, evitando setear `true` dentro del efecto inicial.
- El reset de datos de detalle se movio al evento real de cambio de nombre/CUIT del contribuyente, manteniendo la proteccion contra contaminacion de datos sin efecto reactivo opaco.
- Los parametros activos se guardan con la clave de resolucion consultada; si no hay resolucion, el valor visible deriva a `null` sin setState sincronico.
- Se agregaron helpers testeados para resolver id de ruta, decidir reset de detalle y decidir si corresponde pedir parametros activos.
- `eslint src/app/declaraciones/crear/wizard/page.tsx` pasa limpio.

Verificacion:

- TDD rojo confirmado: `wizardStateTypes.test.ts` fallo inicialmente porque faltaban helpers de flujo (`resolveWizardRouteReturnId`, `shouldResetWizardDetailsOnIdentityChange`, `shouldRequestActiveTaxParameters`).
- `vitest run src/domain/ganancias/tests/wizardStateTypes.test.ts`: 1 archivo, 4 tests, todo OK.
- `vitest run`: 21 archivos, 62 tests, todo OK.
- `tsc --noEmit`: OK.
- `eslint src/app/declaraciones/crear/wizard/page.tsx`: OK.
- `next build --webpack`: OK.
- `git diff --check`: OK, solo advertencias CRLF esperadas de Git en Windows.

Pendiente:

- P2 queda como prioridad activa: consolidar calculo backend/frontend para evitar diferencias silenciosas entre preview, guardado y papel de trabajo.

### 2026-06-01 - P2 primer corte: advertencia de cierre sin preview backend vigente

Se inicio P2 reduciendo el riesgo de diferencias silenciosas entre el resultado visible y el resultado que se recalcula al guardar/cerrar.

Riesgo mitigado:

- El wizard muestra resultado backend cuando esta vigente, pero tambien puede mostrar fallback local si el backend esta pendiente o fallo.
- Al cerrar una DDJJ, el backend vuelve a calcular y persiste el resultado; si el usuario ve fallback local, podria cerrar creyendo que ese valor esta confirmado.
- Para un estudio chico, la agilidad no debe ocultar que el numero visible aun no fue confirmado por el motor backend.

Archivos modificados:

- `src/domain/ganancias/presentation/taxReturnPreview.ts`.
- `src/domain/ganancias/tests/taxReturnPreview.test.ts`.
- `src/app/declaraciones/crear/wizard/page.tsx`.
- `docs/CONTINUAR_AQUI.md`.
- `docs/BACKLOG_PRIORIZADO.md`.
- `docs/REGISTRO_PROYECTO.md`.

Resultado funcional:

- Se agrego `buildTaxReturnCloseConsistencyWarning`.
- Si el preview vigente es backend, el cierre no agrega advertencia extra.
- Si el preview esta pendiente, en fallback local o sin backend vigente, el wizard pide confirmacion explicita antes de cerrar.
- El guardado como borrador no se bloquea; la advertencia se concentra en el acto sensible de cierre.

Verificacion:

- TDD rojo confirmado: `taxReturnPreview.test.ts` fallo inicialmente porque `buildTaxReturnCloseConsistencyWarning` no existia.
- `vitest run src/domain/ganancias/tests/taxReturnPreview.test.ts`: 1 archivo, 8 tests, todo OK.
- `vitest run`: 21 archivos, 64 tests, todo OK.
- `tsc --noEmit`: OK.
- `eslint` focalizado sobre preview/test/wizard: OK.
- `next build --webpack`: OK.
- `git diff --check`: OK, solo advertencias CRLF esperadas de Git en Windows.

Pendiente:

- Siguiente subcorte P2: asegurar con test o documentacion tecnica que preview backend y persistencia usan el mismo mapper y parametros efectivos.
- Revisar si conviene bloquear el cierre hasta tener backend vigente en lugar de solo pedir confirmacion.

### 2026-06-01 - P2 segundo corte: jubilado consistente entre preview y persistencia

Se corrigio una diferencia funcional entre el preview backend y el calculo persistido.

Riesgo mitigado:

- El preview/backend recibia `personalDeductions.esJubiladoOchoHaberes` y aplicaba la deduccion especifica de 8 haberes.
- La persistencia reconstruia `personalDeductions` antes de recalcular, pero omitÃ­a esa marca.
- En un caso jubilado, la DDJJ podia mostrar un resultado y guardar otro al cerrar o actualizar.

Archivos modificados:

- `src/domain/ganancias/persistence/taxReturnDetailsPersistence.ts`.
- `src/domain/ganancias/tests/taxReturnDetailsPersistence.test.ts`.
- `docs/CONTINUAR_AQUI.md`.
- `docs/BACKLOG_PRIORIZADO.md`.
- `docs/REGISTRO_PROYECTO.md`.

Resultado funcional:

- `persistTaxReturnDetails` ahora conserva `esJubiladoOchoHaberes` al reconstruir deducciones personales.
- Se agrego una prueba que calcula el preview y compara el resultado persistido (`totalPersonalDeductions` y `finalBalance`) para un contribuyente jubilado.
- El caso que antes guardaba deduccion personal `0` ahora guarda la deduccion de 8 haberes que corresponde al motor.

Verificacion:

- TDD rojo confirmado: `taxReturnDetailsPersistence.test.ts` fallo con `totalPersonalDeductions` persistido en `0` contra preview `24800000`.
- `vitest run src/domain/ganancias/tests/taxReturnDetailsPersistence.test.ts`: 1 archivo, 2 tests, todo OK.
- `vitest run src/domain/ganancias/tests/taxReturnDetailsPersistence.test.ts src/domain/ganancias/tests/taxReturnPreview.test.ts`: 2 archivos, 10 tests, todo OK.
- `vitest run`: 19 archivos OK y 2 omitidos; 62 tests OK y 3 omitidos.
- `tsc --noEmit`: OK.
- `eslint` focalizado sobre persistencia/test: OK.
- `next build --webpack`: OK.
- `git diff --check`: OK, solo advertencias CRLF esperadas de Git en Windows.

Pendiente:

- Seguir revisando P2 para confirmar parametros efectivos y resultado persistido contra preview en otros casos sensibles.

### 2026-06-01 - P2 tercer corte: resolucion efectiva en snapshot de calculo

Se reforzo la trazabilidad de parametros usados por cada corrida de calculo.

Riesgo mitigado:

- La DDJJ guardaba `taxParameterSetId`, pero el snapshot de `CalculationRun` no dejaba trazada la resolucion efectiva de esa corrida.
- Si luego se cambia una resolucion o se revisa un calculo historico, conviene saber que parametros se usaron en esa ejecucion.
- Para presentaciones de Ganancias, la trazabilidad de la escala/parametros es tan importante como el resultado final.

Archivos modificados:

- `src/domain/ganancias/persistence/taxReturnSnapshot.ts`.
- `src/domain/ganancias/persistence/taxReturnDetailsPersistence.ts`.
- `src/domain/ganancias/tests/taxReturnSnapshot.test.ts`.
- `src/domain/ganancias/tests/taxReturnDetailsPersistence.test.ts`.
- `docs/CONTINUAR_AQUI.md`.
- `docs/BACKLOG_PRIORIZADO.md`.
- `docs/REGISTRO_PROYECTO.md`.

Resultado funcional:

- `buildInitialTaxReturnSnapshot` conserva `taxParameterSetId` cuando la DDJJ se crea con payload minimo.
- `persistTaxReturnDetails` guarda en `variablesSnapshot.taxParameterSetId` el id efectivo de parametros usado por el calculo persistido.
- La prueba de persistencia verifica que el snapshot de calculo use `params-2025`.

Verificacion:

- TDD rojo confirmado: `taxReturnSnapshot.test.ts` y `taxReturnDetailsPersistence.test.ts` fallaron inicialmente porque `taxParameterSetId` no estaba en snapshot.
- `vitest run src/domain/ganancias/tests/taxReturnSnapshot.test.ts src/domain/ganancias/tests/taxReturnDetailsPersistence.test.ts`: 2 archivos, 4 tests, todo OK.
- `vitest run`: 21 archivos, 65 tests, todo OK.
- `tsc --noEmit`: OK.
- `eslint` focalizado sobre snapshot/persistencia/tests: OK.
- `next build --webpack`: OK.
- `git diff --check`: OK, solo advertencias CRLF esperadas de Git en Windows.

Pendiente:

- Evaluar cierre de P2 o agregar una prueba general de equivalencia preview/persistencia con parametros reales.

### 2026-06-01 - P2 cierre operativo

Se da por resuelto P2 y se mueve la prioridad activa a P3.

Motivo:

- El wizard ya indicaba fuente de resultado y ahora ademas advierte antes de cerrar si no hay preview backend vigente.
- Se corrigio una diferencia real entre preview y persistencia para jubilados con 8 haberes.
- Se agrego trazabilidad de `taxParameterSetId` efectivo en snapshots de calculo.
- La persistencia y el preview comparten el mapper `buildTaxReturnCalculationInput`; el caso sensible detectado quedo cubierto por test.

Verificacion acumulada de P2:

- `taxReturnPreview.test.ts` cubre estado de preview, request backend, hidratacion y advertencia de cierre.
- `taxReturnDetailsPersistence.test.ts` cubre detalle importado y equivalencia preview/persistencia para jubilado.
- `taxReturnSnapshot.test.ts` cubre conservacion de `taxParameterSetId`.
- Full suite y build fueron ejecutados en los cortes de P2.

Siguiente prioridad:

- P3 - H4/H2: AXI e indices utiles. Antes de tocar formulas, mapear estado actual contra planilla e indices disponibles.

### 2026-05-30 - Auditoria inicial

Se reviso estructura del proyecto, planillas Excel y calculos principales.

Resultado:

- La app compila en produccion.
- Los tests existentes pasan.
- Lint falla y requiere limpieza.
- Hay inconsistencias funcionales relevantes frente a la planilla.
- Se identifico que el flujo de carga ya esta avanzado, pero necesita robustez fiscal, trazabilidad y validacion.

### 2026-05-30 - Registro persistente

Se crea este registro para no depender de la conversacion y trabajar de forma ordenada.

Pendiente inmediato:

- Crear plan tecnico detallado de Fase 1.
- Implementar primera prueba/fixture contra Excel.
- Actualizar esta bitacora luego de cada cambio.

### 2026-05-30 - Fase 1, primer cambio: parser de indices

Se implemento un mapper puro para importar parametros desde Excel:

- Archivo nuevo: `src/domain/ganancias/mappers/parameterImporter.ts`.
- Test nuevo: `src/domain/ganancias/tests/parameterImporter.test.ts`.
- Ruta actualizada: `src/app/api/parametros/import/route.ts`.

Resultado funcional:

- El archivo real `Indices de actualizacion hasta 2025 (1).xlsx` ya no se interpreta como meses `45658`, `45689`, etc.
- El parser normaliza enero-diciembre 2025 como `monthIndex` 1..12.
- Se capturan coeficientes utiles del archivo:
- Coeficiente dic24-dic25: `1.3154876051`.
- Coeficiente promedio 2025: `1.128840454`.

Verificacion:

- `vitest run`: 3 archivos, 6 tests, todo OK.
- `tsc --noEmit`: OK.
- `eslint` sobre archivos tocados: OK.
- `next build`: OK ejecutado fuera del sandbox por bloqueo de descarga de Google Fonts.

Pendiente:

- Conectar los coeficientes utiles con el calculo AXI cuando se amplie el modelo.
- Evitar dependencia de Google Fonts en build para que no requiera red.
- Continuar con fixture de celdas clave del libro principal `DJ Ganancias 2025 - Tercera Categoria.xlsx`.

### 2026-05-30 - Fase 1, segundo cambio: oraculo de planilla principal

Se agrego un test de oraculo para la planilla base de Ganancias:

- Archivo nuevo: `src/domain/ganancias/tests/excelOracle.test.ts`.

Resultado funcional:

- Se valida que existan las 21 hojas esperadas del libro principal.
- Se fijan formulas clave de `IG 25`, `ER`, `JVP` y `Bienes de Uso`.
- Queda documentada por test la deduccion locador/locatario 10% en `IG 25!C28/D28/F28`, actualmente faltante o no equivalente en el motor.

Verificacion:

- `vitest run`: 4 archivos, 8 tests, todo OK.
- `tsc --noEmit`: OK.
- `eslint` sobre archivos tocados: OK.

Pendiente:

- Agregar comparaciones contra resultados esperados cuando haya casos de carga reales/no vacios.
- Mapear deducciones generales de la app contra `IG 25` y `Ded. Gen.` rubro por rubro.
- Formula de amortizaciones de `Bienes de Uso` revisada y ajustada al criterio de anios al cierre.

### 2026-05-30 - Mejora de build local sin red

Se elimino la dependencia de `next/font/google` en `src/app/layout.tsx`.

Archivos modificados:

- `src/app/layout.tsx`.
- `src/app/globals.css`.
- `package.json`.

Resultado:

- La aplicacion ya no necesita descargar Geist desde Google Fonts para compilar.
- `next build --webpack` pasa dentro del sandbox sin permisos elevados.
- Los scripts `dev` y `build` quedan configurados con Webpack por defecto.
- Se agregan `dev:turbopack` y `build:turbopack` para probar Turbopack de forma explicita.
- `next build` con Turbopack sigue fallando en este entorno por `Acceso denegado` al crear procesos; se considera limitacion del sandbox, no error fiscal/funcional de la app.

Verificacion:

- `vitest run`: 4 archivos, 8 tests, todo OK.
- `tsc --noEmit`: OK.
- `eslint` sobre archivos TS/TSX tocados: OK.
- `next build --webpack`: OK.

### 2026-05-30 - Fase 1, tercer cambio: deduccion locador/locatario

Se agrego la deduccion general "Nueva deduccion - Locador / Locatario" que existe en la planilla base.

Referencia Excel:

- `Ded. Gen.` bloque "Nueva deduccion - Locador / Locatario".
- `IG 25!C28`: toma el total desde `Ded. Gen.!F216`.
- `IG 25!D28`: calcula el 10%.
- `IG 25!F28`: computa el importe admitido.

Archivos modificados:

- `src/domain/ganancias/types.ts`.
- `src/domain/ganancias/calculations/determinacionImpuesto.ts`.
- `src/domain/ganancias/tests/deduccionesGenerales.test.ts`.
- `src/app/api/declaraciones/[id]/route.ts`.
- `src/app/declaraciones/crear/wizard/page.tsx`.

Resultado funcional:

- El usuario puede cargar la base de la deduccion locador/locatario en el Paso 5.
- El motor admite el 10% del importe informado.
- La API guarda/recupera el campo en el estado extra del borrador.
- Los borradores antiguos siguen siendo compatibles: si el campo no existe, se toma cero.

Verificacion:

- `vitest run`: 5 archivos, 9 tests, todo OK.
- `tsc --noEmit`: OK.
- `next build --webpack`: OK.
- `eslint` completo sobre wizard/API sigue fallando por deuda preexistente (`any`, reglas de hooks/purity), no bloquea build pero queda pendiente de limpieza.

Pendiente:

- Agregar desglose visible de deducciones generales admitidas en el papel de trabajo final.

### 2026-05-30 - Fase 1, cuarto cambio: topes encadenados de deducciones generales

Se ajusto el motor para replicar el orden de topes de la planilla `IG 25` en:

- Cuota medico asistencial 5%.
- Honorarios medicos 40% + 5%.
- Donaciones 5%.

Referencia Excel:

- `IG 25!D29/F29`.
- `IG 25!D30/F30`.
- `IG 25!D31/F31`.

Resultado funcional:

- El motor ya no calcula estos topes como 5% simple del resultado neto bruto.
- Ahora considera las deducciones previamente admitidas segun los rangos usados por la planilla (`F20:F23` y `F20:F28`).
- Se agrego test especifico para capturar esa diferencia.

Verificacion:

- `vitest run`: 5 archivos, 10 tests, todo OK.
- `tsc --noEmit`: OK.
- `eslint` sobre archivos de dominio tocados: OK.
- `next build --webpack`: OK.

Pendiente:

- Agregar desglose visible por rubro en el resultado/papel de trabajo.
- Revisar si conviene exponer en UI el importe admitido por cada deduccion mientras se carga.

### 2026-05-30 - Fase 1, quinto cambio: amortizaciones de bienes de uso

Se alineo la semantica de amortizaciones con la planilla `Bienes de Uso`.

Referencia Excel:

- `Bienes de Uso!F4`: `$B$1-E4+1`.
- `Bienes de Uso!J4`: `I4/G4`.
- `Bienes de Uso!K4`: `J4*H4`.
- `Bienes de Uso!L4`: `I4-(J4*F4)`.
- `Bienes de Uso!M4`: `I4*H4-(K4*F4)`.

Archivos modificados:

- `src/domain/ganancias/calculations/amortizaciones.ts`.
- `src/domain/ganancias/tests/amortizaciones.test.ts`.
- `src/domain/ganancias/types.ts`.
- `src/domain/ganancias/exports/excelGenerator.ts`.
- `src/app/declaraciones/crear/wizard/page.tsx`.

Resultado funcional:

- `yearsElapsed` ahora significa anios amortizados al cierre.
- En el ultimo anio de vida util se computa amortizacion anual y el residual queda en cero.
- Un bien nuevo cargado desde el wizard arranca con `1` anio al cierre.
- El exportador Excel del sistema usa el mismo criterio.
- Si `yearsElapsed` supera la vida util, no computa nueva amortizacion anual y deja residual cero.

Verificacion:

- `vitest run`: 6 archivos, 12 tests, todo OK.
- `tsc --noEmit`: OK.
- `eslint` sobre archivos de dominio/export tocados: OK.
- `next build --webpack`: OK.

Pendiente:

- Revisar si conviene bloquear edicion manual de anios al cierre o dejarlo editable para casos especiales.

### 2026-05-31 - Fase 1, septimo cambio: fecha de compra y anios al cierre automaticos

Se agrego calculo automatico de anios al cierre para bienes de uso.

Referencia Excel:

- `Bienes de Uso!E4`: `YEAR(D4)`.
- `Bienes de Uso!F4`: `$B$1-E4+1`.

Archivos modificados:

- `src/domain/ganancias/calculations/amortizaciones.ts`.
- `src/domain/ganancias/tests/amortizaciones.test.ts`.
- `src/app/declaraciones/crear/wizard/page.tsx`.

Resultado funcional:

- La grilla de bienes de uso ahora muestra `Fecha Compra`.
- Al cambiar la fecha de compra, el wizard recalcula `Anios al Cierre`.
- El calculo se centralizo en `calculateYearsElapsedAtClose`.
- Un bien comprado en 2023 para periodo 2025 calcula 3 anios al cierre.
- Una fecha vacia o futura se trata conservadoramente como 1 anio.

Verificacion:

- `vitest run`: 6 archivos, 13 tests, todo OK.
- `tsc --noEmit`: OK.
- `eslint` sobre amortizaciones y test tocado: OK.
- `next build --webpack`: OK.

Pendiente:

- Evaluar UX: dejar `Anios al Cierre` editable manualmente o convertirlo en solo lectura con override explicito.

### 2026-05-31 - Fase 1, octavo cambio: desglose visible de deducciones generales

Se agrego desglose por rubro de deducciones generales admitidas.

Referencia Excel:

- `IG 25!F20:F31`.

Archivos modificados:

- `src/domain/ganancias/types.ts`.
- `src/domain/ganancias/calculations/determinacionImpuesto.ts`.
- `src/domain/ganancias/tests/deduccionesGenerales.test.ts`.
- `src/app/declaraciones/crear/wizard/page.tsx`.

Resultado funcional:

- El motor ahora expone importes admitidos de autonomos, prepagas y donaciones, que antes quedaban solo dentro del total.
- El resumen final del wizard muestra el detalle por rubro cuando el importe admitido es distinto de cero.
- Esto facilita controlar visualmente contra la planilla `IG 25`.

Verificacion:

- `vitest run`: 6 archivos, 13 tests, todo OK.
- `tsc --noEmit`: OK.
- `eslint` sobre archivos de dominio tocados: OK.
- `next build --webpack`: OK.

Pendiente:

- Resuelto en cambio posterior: el mismo desglose se llevo a la pagina independiente `/declaraciones/[id]/papel-de-trabajo`.

### 2026-05-30 - Fase 1, sexto cambio: eliminar falsa sincronizacion ARCA

Se cambio el lenguaje de producto para evitar que el usuario crea que la aplicacion consulta una fuente oficial externa.

Archivos modificados:

- `src/app/page.tsx`.
- `src/app/api/parametros/route.ts`.

Resultado funcional:

- El boton ya no dice `Sincronizar ARCA`.
- Ahora dice `Cargar base interna` / `Cargar base {anio}`.
- La API ya no devuelve mensajes de "servidor oficial de ARCA".
- La fuente queda como `Plantilla interna JABA - verificar normativa oficial`.
- Los mensajes advierten que debe verificarse/importarse normativa oficial antes de presentar.

Verificacion:

- `vitest run`: 6 archivos, 12 tests, todo OK.
- `tsc --noEmit`: OK.
- `next build --webpack`: OK.

Pendiente:

- Si se desea una integracion oficial real, hay que definir fuente, proceso de actualizacion y control de version normativa.

### 2026-05-31 - Fase 1, noveno cambio: desglose en papel de trabajo independiente

Se llevo el desglose de deducciones generales admitidas a la pagina independiente de papel de trabajo.

Referencia Excel:

- `IG 25!F20:F31`.

Archivos modificados:

- `src/domain/ganancias/presentation/deductionsBreakdown.ts`.
- `src/domain/ganancias/tests/deductionsBreakdown.test.ts`.
- `src/app/declaraciones/crear/wizard/page.tsx`.
- `src/app/declaraciones/[id]/papel-de-trabajo/page.tsx`.

Resultado funcional:

- El desglose por rubro ya no queda duplicado manualmente en el wizard.
- El papel de trabajo independiente muestra los importes admitidos no nulos con referencia a la celda de `IG 25`.
- La pagina independiente ahora tambien incluye `deduccionLocadorLocatario` al construir el input de calculo, evitando diferencias contra el wizard.

Verificacion:

- `vitest run`: 7 archivos, 15 tests, todo OK.
- `tsc --noEmit`: OK.
- `eslint` focalizado sobre helper/test nuevos: OK.
- `next build --webpack`: OK.

Pendiente:

- En una iteracion posterior, limpiar deuda global de lint en pantallas grandes para poder usar `eslint` completo como control obligatorio.

### 2026-05-31 - Fase 1, decimo cambio: mapper testeado para recalculo del papel de trabajo

Se detecto que el papel de trabajo independiente reconstruia manualmente el input del motor y omitia datos que la API si entrega.

Riesgo corregido:

- `personalLiabilities` quedaba vacio en el recalculo de la pagina independiente.
- `axiDynamic` quedaba vacio en el recalculo de la pagina independiente.
- Esto podia generar diferencias entre lo visto en wizard/backend y el papel de trabajo final.

Archivos modificados:

- `src/domain/ganancias/mappers/calculationInputMapper.ts`.
- `src/domain/ganancias/tests/calculationInputMapper.test.ts`.
- `src/app/declaraciones/[id]/papel-de-trabajo/page.tsx`.

Resultado funcional:

- La pagina independiente ahora arma el `TaxReturnCalculationInput` con un mapper de dominio testeado.
- El mapper conserva `deduccionLocadorLocatario`, pasivos personales y movimientos AXI dinamicos.
- Queda una base reutilizable para ir eliminando duplicacion de calculo entre frontend y backend.

Verificacion:

- `vitest run`: 8 archivos, 16 tests, todo OK.
- `tsc --noEmit`: OK.
- `eslint` focalizado sobre helpers/tests nuevos: OK.
- `next build --webpack`: OK.

Pendiente:

- Reutilizar este mapper tambien en el wizard y/o API, o avanzar hacia un endpoint unico de preview/calculo.

### 2026-05-31 - Fase 1, undecimo cambio: wizard conectado al mapper de calculo

Se redujo duplicacion entre el wizard y el papel de trabajo para construir el input del motor impositivo.

Archivos modificados:

- `src/domain/ganancias/mappers/calculationInputMapper.ts`.
- `src/domain/ganancias/tests/calculationInputMapper.test.ts`.
- `src/app/declaraciones/crear/wizard/page.tsx`.

Resultado funcional:

- El mapper ahora acepta las dos formas de parametros usadas por la app:
- Forma directa del papel de trabajo: `brackets` + `ipcIndices`.
- Forma activa del wizard: `parameterSet` + `brackets` + `indices`.
- El wizard conserva sus parametros fallback 2025, pero delega la conversion a `TaxReturnCalculationInput` en el mapper testeado.
- Se elimina una construccion manual larga de `Decimal` dentro del componente de UI.

Verificacion:

- `vitest run`: 8 archivos, 17 tests, todo OK.
- `tsc --noEmit`: OK.
- `eslint` focalizado sobre mapper/test: OK.
- `next build --webpack`: OK.

Pendiente:

- Evaluar exponer un endpoint unico de calculo/preview para terminar de cerrar H6.

### 2026-05-31 - Fase 1, duodecimo cambio: parametros por defecto en papel de trabajo

Se corrigio un caso borde de carga del papel de trabajo independiente.

Riesgo corregido:

- Si una declaracion no tenia `taxParameterSetId` guardado, la pagina no cargaba parametros y no podia recalcular.
- La API `/api/parametros` ya soporta elegir la resolucion por defecto del anio si no se envia `resolutionId`, pero la pantalla no aprovechaba ese fallback.

Archivos modificados:

- `src/domain/ganancias/presentation/taxParameterRequest.ts`.
- `src/domain/ganancias/tests/taxParameterRequest.test.ts`.
- `src/app/declaraciones/[id]/papel-de-trabajo/page.tsx`.

Resultado funcional:

- El papel de trabajo siempre intenta cargar parametros por anio fiscal.
- Si existe `taxParameterSetId`, lo usa.
- Si no existe, omite `resolutionId` y deja que la API seleccione la resolucion vigente/default del anio.

Verificacion:

- `vitest run`: 9 archivos, 19 tests, todo OK.
- `tsc --noEmit`: OK.
- `eslint` focalizado sobre helper/test: OK.
- `next build --webpack`: OK.

Pendiente:

- Resuelto en cambio posterior: el papel de trabajo ya muestra advertencia visible cuando usa parametros default por falta de resolucion explicita.

### 2026-05-31 - Fase 1, decimotercer cambio: API de guardado conectada al mapper de calculo

Se conecto la API `PUT /api/declaraciones/[id]` al mapper comun de `TaxReturnCalculationInput`.

Archivos modificados:

- `src/app/api/declaraciones/[id]/route.ts`.
- `src/domain/ganancias/mappers/calculationInputMapper.ts`.
- `src/domain/ganancias/tests/calculationInputMapper.test.ts`.
- `docs/REGISTRO_PROYECTO.md`.
- `docs/FASE_1_VALIDACION_EXCEL.md`.

Resultado funcional:

- Wizard, papel de trabajo y API de guardado comparten la misma normalizacion hacia el motor impositivo.
- Se redujo una fuente importante de divergencia de calculo.
- El mapper ahora acepta valores decimales tipo Prisma que exponen `toString()`, evitando convertir parametros de base a cero.

Verificacion:

- `vitest run`: 9 archivos, 20 tests, todo OK.
- `tsc --noEmit`: OK.
- `eslint` focalizado sobre mapper/test: OK.
- `next build --webpack`: OK.

Pendiente:

- Crear un endpoint unico de preview/calculo para que el frontend no tenga que calcular localmente en el largo plazo.

### 2026-05-31 - Fase 1, decimocuarto cambio: aviso de parametros default en papel de trabajo

Se agrego una advertencia visible cuando el papel de trabajo usa parametros default del periodo por falta de `taxParameterSetId` en la DDJJ.

Archivos modificados:

- `src/domain/ganancias/presentation/taxParameterNotice.ts`.
- `src/domain/ganancias/tests/taxParameterNotice.test.ts`.
- `src/app/declaraciones/[id]/papel-de-trabajo/page.tsx`.
- `docs/REGISTRO_PROYECTO.md`.
- `docs/FASE_1_VALIDACION_EXCEL.md`.

Resultado funcional:

- La pantalla ya no usa parametros default de manera silenciosa.
- El aviso muestra la fuente normativa/base usada y version si esta disponible.
- La advertencia tambien queda en el documento impreso para auditoria interna.

Verificacion:

- `vitest run`: 10 archivos, 22 tests, todo OK.
- `tsc --noEmit`: OK.
- `eslint` focalizado sobre helper/test: OK.
- `next build --webpack`: OK.

Pendiente:

- A futuro, bloquear cierre o pedir confirmacion si una DDJJ usa parametros default sin resolucion explicita.

### 2026-05-31 - Fase 1, decimoquinto cambio: confirmacion al cerrar con parametros no explicitos

Se agrego una confirmacion en el wizard antes de cerrar una DDJJ cuando falta resolucion explicita o parametros activos.

Archivos modificados:

- `src/domain/ganancias/presentation/taxParameterNotice.ts`.
- `src/domain/ganancias/tests/taxParameterNotice.test.ts`.
- `src/app/declaraciones/crear/wizard/page.tsx`.
- `docs/REGISTRO_PROYECTO.md`.
- `docs/FASE_1_VALIDACION_EXCEL.md`.

Resultado funcional:

- El cierre ya no avanza silenciosamente si la DDJJ puede estar usando parametros default o fallback interno.
- El usuario puede cancelar, revisar/cargar resolucion y luego cerrar.
- Si decide continuar, la confirmacion deja claro que es una decision consciente.

Verificacion:

- `vitest run`: 10 archivos, 25 tests, todo OK.
- `tsc --noEmit`: OK.
- `eslint` focalizado sobre helper/test: OK.
- `next build --webpack`: OK.

Pendiente:

- Reemplazar el `window.confirm` por un modal propio de la app para mejorar trazabilidad y UX.

### 2026-05-31 - Fase 1, decimosexto cambio: persistencia completa al crear DDJJ desde wizard

Se corrigio el flujo de alta nueva para evitar que la informacion cargada quede solo en memoria/localStorage.

Archivos modificados:

- `src/domain/ganancias/presentation/taxReturnSaveFlow.ts`.
- `src/domain/ganancias/tests/taxReturnSaveFlow.test.ts`.
- `src/app/declaraciones/crear/wizard/page.tsx`.
- `docs/REGISTRO_PROYECTO.md`.
- `docs/FASE_1_VALIDACION_EXCEL.md`.

Resultado funcional:

- Al crear una DDJJ nueva, primero se obtiene el `id` de la cabecera.
- Inmediatamente se dispara un `PUT` al nuevo `id` con todo el payload cargado.
- Si el guardado completo falla, no se muestra exito y el usuario recibe error.
- Si falla ese guardado completo, el wizard intenta revertir la cabecera recien creada para no dejar una DDJJ vacia/incompleta en la base.

Verificacion:

- `vitest run`: 11 archivos, 27 tests, todo OK.
- `tsc --noEmit`: OK.
- `eslint` focalizado sobre helper/test: OK.
- `next build --webpack`: OK.

Pendiente:

- Convertir el `POST /api/declaraciones` en una operacion atomica completa para que no dependa de dos requests desde el frontend.

### 2026-05-31 - Fase 1, decimoseptimo cambio: snapshot inicial completo en POST de DDJJ

Se reforzo el endpoint `POST /api/declaraciones` para que guarde en base un snapshot inicial completo cuando recibe payload de carga.

Archivos modificados:

- `src/app/api/declaraciones/route.ts`.
- `src/domain/ganancias/persistence/taxReturnSnapshot.ts`.
- `src/domain/ganancias/tests/taxReturnSnapshot.test.ts`.
- `docs/REGISTRO_PROYECTO.md`.
- `docs/FASE_1_VALIDACION_EXCEL.md`.

Resultado funcional:

- El `CalculationRun` inicial ya no guarda solo `currentStep`.
- Si el POST recibe ventas, compras, bienes, bancos, deducciones, patrimonio o AXI, esos datos quedan registrados en `variablesSnapshot`.
- Esto suma una capa de persistencia/auditoria desde el primer request, mientras se mantiene el `PUT` completo para poblar tablas relacionales.

Verificacion:

- `vitest run`: 12 archivos, 29 tests, todo OK.
- `tsc --noEmit`: OK.
- `eslint` focalizado sobre helper/test: OK.
- `next build --webpack`: OK.

Pendiente:

- Mover toda la persistencia relacional al `POST` dentro de una transaccion atomica compartida con `PUT`.

### 2026-05-31 - Fase 1, decimoctavo cambio: ID persistido activo en wizard

Se reforzo el flujo de guardado para evitar duplicados o guardados contra el endpoint incorrecto despues de crear una DDJJ desde `/declaraciones/crear/wizard`.

Riesgo corregido:

- Despues del primer `POST`, el wizard podia seguir decidiendo `POST` vs `PUT` solo por el `id` de la ruta.
- Si la URL seguia siendo `crear` en memoria, un guardado posterior podia intentar crear otra DDJJ en lugar de actualizar la ya creada.
- El auto-alta del wizard enviaba un payload minimo, por lo que dependia demasiado de un guardado posterior para persistir el detalle.

Archivos modificados:

- `src/domain/ganancias/presentation/taxReturnSaveFlow.ts`.
- `src/domain/ganancias/tests/taxReturnSaveFlow.test.ts`.
- `src/app/declaraciones/crear/wizard/page.tsx`.
- `docs/REGISTRO_PROYECTO.md`.
- `docs/FASE_1_VALIDACION_EXCEL.md`.

Resultado funcional:

- Se agrego un resolver testeado para decidir si el guardado debe ser `POST /api/declaraciones` o `PUT /api/declaraciones/[id]`.
- Una DDJJ recien creada guarda su `id` persistido en el estado del wizard.
- Los cambios de paso y guardados manuales posteriores actualizan la DDJJ existente, aunque la ruta no se haya refrescado completamente.
- El auto-alta desde el wizard ahora crea con payload completo.

Verificacion:

- `vitest run`: 12 archivos, 32 tests, todo OK.
- `tsc --noEmit`: OK.
- `eslint` focalizado sobre helper/test nuevos: OK.
- `next build --webpack`: OK.

Pendiente:

- Mantener como mejora estructural la persistencia atomica del `POST` en backend para eliminar la doble request desde frontend.

### 2026-05-31 - Fase 1, decimonoveno cambio: POST atomico con detalle operativo

Se movio la persistencia relacional completa a una rutina compartida de backend.

Riesgo corregido:

- El alta completa dependia de que el frontend hiciera `POST` y luego `PUT`.
- Si el usuario/navegador/interfaz se interrumpia entre requests, podia quedar una DDJJ creada sin detalle relacional.
- La logica de persistencia estaba duplicada dentro del `PUT`, dificultando reutilizarla en el `POST`.

Archivos modificados:

- `src/app/api/declaraciones/route.ts`.
- `src/app/api/declaraciones/[id]/route.ts`.
- `src/domain/ganancias/persistence/taxReturnDetailsPersistence.ts`.
- `src/domain/ganancias/persistence/taxReturnPayload.ts`.
- `src/domain/ganancias/tests/taxReturnPayload.test.ts`.
- `docs/REGISTRO_PROYECTO.md`.
- `docs/FASE_1_VALIDACION_EXCEL.md`.

Resultado funcional:

- El `POST /api/declaraciones` distingue cabecera minima de payload operativo completo.
- Si el payload trae carga del wizard, crea cabecera, detalle relacional y `CalculationRun` dentro de una misma transaccion Prisma.
- El `PUT /api/declaraciones/[id]` reutiliza la misma rutina de persistencia, reduciendo divergencia entre alta y actualizacion.
- El alta minima sigue disponible para casos donde solo se necesita crear cabecera y snapshot inicial.

Verificacion:

- `vitest run`: 13 archivos, 35 tests, todo OK.
- `tsc --noEmit`: OK.
- `eslint` focalizado sobre helpers/tests nuevos: OK.
- `next build --webpack`: OK.

Pendiente:

- Resuelto en cambio posterior: el `PUT` redundante del frontend fue retirado del flujo de creacion.

### 2026-05-31 - Fase 1, vigesimo cambio: frontend alineado al POST atomico

Se simplifico el guardado del wizard ahora que el backend persiste detalle completo durante el `POST`.

Riesgo corregido:

- El frontend seguia haciendo `POST` y luego `PUT` aunque el backend ya resolvia la creacion atomica.
- Eso duplicaba calculo/persistencia y podia producir mas latencia o resultados dificiles de auditar ante errores intermedios.

Archivos modificados:

- `src/domain/ganancias/presentation/taxReturnSaveFlow.ts`.
- `src/domain/ganancias/tests/taxReturnSaveFlow.test.ts`.
- `src/app/declaraciones/crear/wizard/page.tsx`.
- `docs/REGISTRO_PROYECTO.md`.
- `docs/FASE_1_VALIDACION_EXCEL.md`.

Resultado funcional:

- Se agrego un builder testeado para armar el request de guardado del wizard.
- Si la DDJJ no tiene `id`, el wizard hace un `POST /api/declaraciones` con payload completo.
- Si ya existe `id` persistido, el wizard hace `PUT /api/declaraciones/[id]`.
- El `POST` exitoso ya no dispara un `PUT` redundante; solo guarda el nuevo `id`, actualiza localStorage y reemplaza/navega la URL.

Verificacion:

- `vitest run`: 13 archivos, 37 tests, todo OK.
- `tsc --noEmit`: OK.
- `eslint` focalizado sobre helper/test nuevos: OK.
- `next build --webpack`: OK.

Pendiente:

- Validar manualmente contra base local desde el flujo visual completo del wizard.

### 2026-05-31 - Fase 1, vigesimo primer cambio: duplicados de DDJJ con respuesta funcional

Se agrego manejo explicito para el caso en que ya existe una DDJJ original del mismo contribuyente y periodo.

Riesgo corregido:

- La base tiene un indice unico por cliente, periodo fiscal y version.
- Si el wizard intentaba crear otra original para el mismo cliente/anio, podia devolver un error tecnico de restriccion unica.
- Ese mensaje no era util para seguir cargando con agilidad.

Archivos modificados:

- `src/app/api/declaraciones/route.ts`.
- `src/app/declaraciones/crear/wizard/page.tsx`.
- `src/domain/ganancias/persistence/taxReturnDuplicate.ts`.
- `src/domain/ganancias/tests/taxReturnDuplicate.test.ts`.
- `src/domain/ganancias/presentation/taxReturnSaveFlow.ts`.
- `src/domain/ganancias/tests/taxReturnSaveFlow.test.ts`.
- `docs/REGISTRO_PROYECTO.md`.
- `docs/FASE_1_VALIDACION_EXCEL.md`.

Resultado funcional:

- `POST /api/declaraciones` busca una DDJJ original existente antes de crear.
- Si existe, responde `409` con `code: DUPLICATE_TAX_RETURN` y el `id` de la DDJJ existente.
- El wizard detecta esa respuesta y abre la declaracion existente.
- El guardado manual muestra mensaje claro; el auto-alta redirige sin dejar al usuario ante un error de base.

Verificacion:

- `vitest run`: 14 archivos, 40 tests, todo OK.
- `tsc --noEmit`: OK.
- `eslint` focalizado sobre helpers/tests nuevos: OK.
- `next build --webpack`: OK.

Pendiente:

- Validar visualmente el flujo de duplicado cuando exista una DDJJ real en base.

### 2026-05-31 - Fase 1, vigesimo segundo cambio: fechas seguras al reabrir DDJJ

Se reforzo la lectura de declaraciones persistidas desde `GET /api/declaraciones/[id]`.

Riesgo corregido:

- La API usaba `toISOString()` directo sobre fechas al mapear datos de base al estado del wizard.
- `AxiDynamicItem.date` es opcional en el modelo, por lo que una fecha nula podia provocar error al reabrir la DDJJ.

Archivos modificados:

- `src/app/api/declaraciones/[id]/route.ts`.
- `src/domain/ganancias/persistence/taxReturnReadMapper.ts`.
- `src/domain/ganancias/tests/taxReturnReadMapper.test.ts`.
- `docs/REGISTRO_PROYECTO.md`.
- `docs/FASE_1_VALIDACION_EXCEL.md`.

Resultado funcional:

- Las fechas persistidas se convierten de forma segura al formato de input del wizard.
- Fechas nulas o invalidas vuelven como cadena vacia.
- Se evita que la reapertura de una DDJJ falle por un movimiento AXI incompleto o historico.

Verificacion:

- `vitest run`: 15 archivos, 43 tests, todo OK.
- `tsc --noEmit`: OK.
- `eslint` focalizado sobre helper/test nuevos: OK.
- `next build --webpack`: OK.

Pendiente:

- Validar visualmente una DDJJ con AXI dinamico sin fecha cargada.

### 2026-05-31 - Fase 1, vigesimo tercer cambio: endpoint backend de preview de calculo

Se agrego una primera pieza para cerrar la divergencia entre calculo de frontend y backend.

Riesgo mitigado:

- El wizard calcula en cliente mientras el backend recalcula al guardar.
- Aunque ambos usan el mapper comun, el frontend sigue siendo una segunda fuente operativa de resultado.
- Para mover el calculo sin romper la experiencia, primero se necesita un endpoint backend estable y testeado.

Archivos modificados:

- `src/app/api/declaraciones/preview/route.ts`.
- `src/domain/ganancias/presentation/taxReturnPreview.ts`.
- `src/domain/ganancias/tests/taxReturnPreview.test.ts`.
- `docs/REGISTRO_PROYECTO.md`.
- `docs/FASE_1_VALIDACION_EXCEL.md`.

Resultado funcional:

- `POST /api/declaraciones/preview` recibe datos de declaracion y parametros impositivos.
- El endpoint usa `buildTaxReturnCalculationInput` y `calculateTaxReturn`, igual que el guardado backend.
- La respuesta serializa los `Decimal` a numeros y arreglos simples para que sea apta para JSON/UI.
- Se agrego una funcion de rehidratacion para convertir la respuesta JSON nuevamente a `Decimal`, compatible con la UI actual del wizard.
- El wizard todavia no consume este endpoint; se deja listo para conectar en una iteracion controlada.

Verificacion:

- `vitest run`: 16 archivos, 45 tests, todo OK.
- `tsc --noEmit`: OK.
- `eslint` focalizado sobre endpoint/helper/test nuevos: OK.
- `next build --webpack`: OK.

Pendiente:

- Conectar el wizard al endpoint con debounce/cancelacion y fallback local mientras se valida visualmente.

### 2026-05-31 - Fase 1, vigesimo cuarto cambio: wizard conectado al preview backend

Se conecto el wizard de carga al endpoint backend de preview sin retirar todavia el calculo local.

Riesgo mitigado:

- El usuario necesita resultados inmediatos mientras carga.
- El backend debe empezar a ser la fuente operativa del calculo para evitar divergencias al guardar.
- Cambiar todo de golpe podia degradar agilidad o dejar la pantalla sin resultado ante una falla de red.

Archivos modificados:

- `src/app/declaraciones/crear/wizard/page.tsx`.
- `src/domain/ganancias/presentation/taxReturnPreview.ts`.
- `src/domain/ganancias/tests/taxReturnPreview.test.ts`.
- `docs/REGISTRO_PROYECTO.md`.
- `docs/FASE_1_VALIDACION_EXCEL.md`.

Resultado funcional:

- Se agrego `buildTaxReturnPreviewRequest` para centralizar el request `POST /api/declaraciones/preview`.
- El wizard arma el mismo payload de calculo que ya usa localmente y lo envia al backend con debounce de 350 ms.
- Se usa `AbortController` para cancelar requests anteriores cuando la carga cambia rapido.
- El resultado backend se aplica solo si corresponde al payload vigente.
- Si el backend demora o falla, la UI conserva el calculo local como fallback, manteniendo agilidad y evitando "magia" oculta.

Verificacion:

- `vitest run`: 16 archivos, 46 tests, todo OK.
- `tsc --noEmit`: OK.
- `eslint` focalizado sobre helper/test nuevos: OK.
- `eslint` sobre el wizard sigue fallando por deuda previa ya registrada (`any`, efectos antiguos, `Date.now`), sin errores nuevos del preview conectado.
- `next build --webpack`: OK.

Pendiente:

- Validar visualmente que el resumen final del wizard muestre el resultado backend cuando haya conexion normal y conserve el fallback local ante error/cancelacion.

### 2026-05-31 - Fase 1, vigesimo quinto cambio: indicador visible de origen del preview

Se hizo explicito en la UI de carga si el resultado mostrado viene del preview backend o del calculo local de respaldo.

Riesgo mitigado:

- El sistema usa backend y fallback local durante la transicion hacia un motor unico.
- Sin una senal visible, el usuario no podia saber si estaba viendo un resultado confirmado por backend o un preview local provisorio.
- Para un estudio chico, la agilidad no debe depender de "magia"; la pantalla debe explicar el estado operativo sin interrumpir la carga.

Archivos modificados:

- `src/app/declaraciones/crear/wizard/page.tsx`.
- `src/domain/ganancias/presentation/taxReturnPreview.ts`.
- `src/domain/ganancias/tests/taxReturnPreview.test.ts`.
- `docs/REGISTRO_PROYECTO.md`.
- `docs/FASE_1_VALIDACION_EXCEL.md`.

Resultado funcional:

- Se agrego `buildTaxReturnPreviewStatus` para describir el estado del preview como `backend`, `pending`, `fallback` o `idle`.
- El wizard registra si hay request backend pendiente y si el ultimo intento fallo.
- El paso 6 muestra un indicador con detalle: motor backend actualizado, esperando confirmacion backend o preview local de respaldo.
- La barra fiscal viva tambien muestra un badge compacto con el origen del calculo.
- El fallback local sigue operativo para no romper la agilidad de carga cuando el backend demora o no responde.

Verificacion:

- TDD rojo confirmado: `taxReturnPreview.test.ts` fallo inicialmente porque `buildTaxReturnPreviewStatus` no existia.
- `vitest run src/domain/ganancias/tests/taxReturnPreview.test.ts`: 6 tests, todo OK.
- `vitest run`: 16 archivos, 49 tests, todo OK.
- `tsc --noEmit`: OK.
- `eslint` focalizado sobre helper/test nuevos: OK.
- `eslint` sobre el wizard sigue fallando por deuda previa ya registrada (`any`, efectos antiguos, `Date.now`), sin errores nuevos del indicador.
- `next build --webpack`: OK.
- Validacion HTTP local de `POST /api/declaraciones/preview`: OK, respondio `success: true` con impuesto determinado 50 para payload minimo.

Pendiente:

- Validar visualmente con navegador cuando el conector/browser local este disponible; el intento en esta sesion quedo bloqueado por entorno de automatizacion.

### 2026-05-31 - Fase 1, vigesimo sexto cambio: auditoria de importacion de parametros

Se agrego trazabilidad persistida para la carga de parametros e indices desde Excel.

Riesgo mitigado:

- El importador devolvia `warnings` y `usefulCoefficients` en la respuesta HTTP, pero esa informacion podia perderse al cerrar la pantalla.
- Para un estudio contable, cada carga de indices/parametros debe poder rastrearse por archivo, resolucion, periodo y resultado de parsing.
- Se evito abrir una migracion nueva en esta etapa usando `AuditLog`, que ya existe en el modelo y cumple la funcion de bitacora operativa.

Archivos modificados:

- `src/app/api/parametros/import/route.ts`.
- `src/domain/ganancias/persistence/taxParameterImportAudit.ts`.
- `src/domain/ganancias/tests/taxParameterImportAudit.test.ts`.
- `docs/REGISTRO_PROYECTO.md`.
- `docs/FASE_1_VALIDACION_EXCEL.md`.

Resultado funcional:

- El endpoint `/api/parametros/import` crea un `AuditLog` dentro de la misma transaccion que crea el `TaxParameterSet`.
- El detalle auditable queda en JSON estable con archivo, tamanio, MIME, anio fiscal, resolucion, version, conteo de tramos, conteo de IPC, warnings y coeficientes utiles.
- La respuesta de importacion devuelve `auditLogId` para rastrear la operacion.
- No se agrega migracion de base; se aprovecha la tabla de auditoria existente.

Verificacion:

- TDD rojo confirmado: `taxParameterImportAudit.test.ts` fallo inicialmente porque el helper no existia.
- `vitest run src/domain/ganancias/tests/taxParameterImportAudit.test.ts`: 1 test, todo OK.
- `vitest run`: 17 archivos, 50 tests, todo OK.
- `tsc --noEmit`: OK.
- `eslint` focalizado sobre helper/test/endpoint de importacion: OK.
- `next build --webpack`: OK.

Pendiente:

- Validar con una importacion real desde la pantalla de parametros y revisar el evento en `/api/auditoria?action=IMPORT&entityType=TaxParameterSet`.
- Definir mas adelante si algun dato auditable debe pasar de `AuditLog.details` a columnas propias de `TaxParameterSet`.

### 2026-05-31 - Fase 1, vigesimo septimo cambio: detalle auditable en importacion AFIP/ARCA

Se corrigio la perdida de detalle en ventas y compras importadas desde Excel AFIP/ARCA.

Riesgo mitigado:

- La carga importada llegaba al wizard con importes, pero se perdian comprobante, contraparte, IVA y total al persistir o reabrir la DDJJ.
- Para un estudio chico, la importacion debe ahorrar carga manual sin convertir la DDJJ en una caja negra.
- Ante revision, el usuario necesita volver a ver de que comprobante y contraparte salio cada renglon.

Archivos modificados:

- `src/domain/ganancias/mappers/afipImporter.ts`.
- `src/domain/ganancias/types.ts`.
- `src/domain/ganancias/persistence/taxReturnDetailsPersistence.ts`.
- `src/domain/ganancias/persistence/taxReturnReadMapper.ts`.
- `src/domain/ganancias/tests/importer.test.ts`.
- `src/domain/ganancias/tests/taxReturnDetailsPersistence.test.ts`.
- `src/domain/ganancias/tests/taxReturnReadMapper.test.ts`.
- `src/app/api/declaraciones/[id]/route.ts`.
- `src/app/declaraciones/crear/wizard/page.tsx`.
- `docs/REGISTRO_PROYECTO.md`.
- `docs/FASE_1_VALIDACION_EXCEL.md`.

Resultado funcional:

- El parser de ventas/compras ahora extrae tipo de comprobante, punto de venta, numero, razon social, CUIT de contraparte, IVA y total.
- El wizard conserva esos campos al importar y los envia dentro del payload de guardado.
- La persistencia relacional guarda comprobante, numero, nombre de cliente/proveedor, IVA y total en `SalesInvoice` y `PurchaseInvoice`.
- El CUIT de contraparte se conserva en `variablesSnapshot` porque el esquema actual no tiene columna propia en esas tablas.
- Al reabrir una DDJJ, la API devuelve nuevamente el CUIT de contraparte desde el snapshot y el resto del detalle desde las tablas relacionales.
- Se tiparon las capturas del importador y del endpoint tocado para no agregar deuda nueva de `any`.

Verificacion:

- TDD rojo confirmado: `taxReturnDetailsPersistence.test.ts` fallo inicialmente porque `variablesSnapshot` no incluia ventas/compras.
- TDD rojo confirmado: `taxReturnReadMapper.test.ts` fallo inicialmente porque `snapshotStringAt` no existia.
- `vitest run src/domain/ganancias/tests/importer.test.ts src/domain/ganancias/tests/taxReturnDetailsPersistence.test.ts src/domain/ganancias/tests/taxReturnReadMapper.test.ts`: 3 archivos, 10 tests, todo OK.
- `vitest run`: 18 archivos, 53 tests, todo OK.
- `tsc --noEmit`: OK.
- `eslint` focalizado sobre importador, persistencia, mapper de lectura, endpoint `[id]` y tests nuevos: OK.
- `eslint src/app/declaraciones/crear/wizard/page.tsx`: sigue fallando por deuda previa del componente (`setState` en efectos, `Date.now`, `any` antiguos y warnings), sin bloquear TypeScript ni build.
- `next build --webpack`: OK.

Pendiente:

- Evaluar migracion para agregar `counterpartyCuit` como columna propia en `SalesInvoice` y `PurchaseInvoice` si se necesitara filtrar/reportar por CUIT.
- Mejorar la grilla del wizard para mostrar comprobante/contraparte de forma visible y editable, no solo conservarlo internamente.

### 2026-05-31 - Fase 1, vigesimo octavo cambio: trazabilidad visible en grillas del wizard

Se hizo visible en las grillas de ventas y compras el detalle importado de comprobante y contraparte.

Riesgo mitigado:

- Conservar el detalle en base no alcanza si el usuario no puede reconocer rapidamente que renglones importo.
- La carga agil necesita control visual inmediato sin abrir pantallas auxiliares.
- La grilla no debe obligar a editar datos tecnicos, pero si debe mostrar la referencia auditable basica.

Archivos modificados:

- `src/domain/ganancias/presentation/invoiceTrace.ts`.
- `src/domain/ganancias/tests/invoiceTrace.test.ts`.
- `src/app/declaraciones/crear/wizard/page.tsx`.
- `docs/REGISTRO_PROYECTO.md`.

Resultado funcional:

- Se agrego `buildInvoiceTraceSummary` para armar una referencia legible con comprobante, contraparte, CUIT, IVA y total.
- La tabla de ventas muestra una columna `Comprobante / Contraparte`.
- La tabla de compras muestra una columna `Comprobante / Proveedor`.
- Las filas manuales se identifican como `Carga manual` y `Sin contraparte importada`, evitando confundir datos no importados con datos perdidos.
- Las grillas usan scroll horizontal si el ancho no alcanza, manteniendo usabilidad en pantallas chicas.

Verificacion:

- TDD rojo confirmado: `invoiceTrace.test.ts` fallo inicialmente porque el helper no existia.
- `vitest run src/domain/ganancias/tests/invoiceTrace.test.ts`: 1 archivo, 2 tests, todo OK.
- `vitest run`: 19 archivos, 55 tests, todo OK.
- `tsc --noEmit`: OK.
- `eslint` focalizado sobre helper/test nuevo: OK.
- `eslint src/app/declaraciones/crear/wizard/page.tsx`: sigue fallando por deuda previa del componente (`setState` en efectos, `Date.now`, `any` antiguos y warnings).
- `next build --webpack`: OK.
- Verificacion HTTP local de `/declaraciones/crear/wizard`: OK, respondio `200`.
- Verificacion visual con Browser integrado: bloqueada por sandbox de Windows; fallback Playwright CLI no disponible porque no hay `npx` en el runtime.

Pendiente:

- Hacer una pasada visual manual o con navegador disponible para revisar densidad de columnas en desktop/mobile.
- Si la pantalla queda muy cargada, evaluar un modo compacto/expandible por fila para detalle del comprobante.

### 2026-06-01 - Fase 1, P3 primer corte: AXI estatico con coeficiente util de indices

Se corrigio el criterio de coeficiente para el ajuste por inflacion impositivo estatico.

Hallazgo contra Excel:

- En `AXI Inflacion IMPOSITIVO Comercial 2025.xlsx`, hoja `AXI.Estatico`, el coeficiente estatico surge de `IPC dic-2025 / IPC dic-2024 - 1`.
- El motor venia usando `IPC dic-2025 / IPC ene-2025 - 1`.
- Con los indices del archivo, la tasa correcta es `1.3154876051264572 - 1`; el criterio anterior daba aproximadamente `0.2870307375681953`.
- Para un capital computable inicial de `$1.000.000`, el AXI estatico correcto es `-315.488`, no `-287.031`.

Decision de arquitectura:

- No se agrego una migracion nueva para guardar coeficientes derivados.
- Se calcula on demand desde indices persistidos:
- `decPreviousToDecCurrent`: IPC diciembre anio actual / IPC diciembre anio anterior.
- `currentYearAverage`: IPC diciembre anio actual / promedio IPC mensual del anio actual.
- El importador de Excel ahora detecta diciembre del anio anterior y la importacion lo guarda como `UpdateIndex` del ejercicio anterior.

Archivos modificados:

- `src/domain/ganancias/mappers/parameterImporter.ts`.
- `src/domain/ganancias/mappers/taxParameterUsefulCoefficients.ts`.
- `src/domain/ganancias/mappers/calculationInputMapper.ts`.
- `src/domain/ganancias/calculations/determinacionImpuesto.ts`.
- `src/domain/ganancias/persistence/taxReturnDetailsPersistence.ts`.
- `src/app/api/parametros/import/route.ts`.
- `src/app/api/parametros/route.ts`.
- `src/domain/ganancias/types.ts`.
- `src/domain/ganancias/tests/parameterImporter.test.ts`.
- `src/domain/ganancias/tests/taxParameterUsefulCoefficients.test.ts`.
- `src/domain/ganancias/tests/calculationInputMapper.test.ts`.
- `src/domain/ganancias/tests/axiInflationRate.test.ts`.
- `src/domain/ganancias/tests/taxReturnDetailsPersistence.test.ts`.

Resultado funcional:

- El parser de indices conserva los 12 IPC del anio fiscal y ademas expone diciembre del anio anterior.
- La importacion persiste diciembre del anio anterior como indice del ejercicio previo.
- `/api/parametros` devuelve `usefulCoefficients` derivados desde la base.
- El mapper pasa esos coeficientes al motor de calculo.
- `calculateTaxReturn` usa el coeficiente util para AXI estatico cuando esta disponible.
- `persistTaxReturnDetails` deriva los mismos coeficientes antes de calcular y guardar, evitando diferencia entre preview y calculo persistido.
- Se elimino deuda focal de `any` en `src/app/api/parametros/route.ts` al tocar la ruta.

Verificacion:

- TDD rojo confirmado: `axiInflationRate.test.ts` fallo inicialmente porque el AXI estatico daba `-287031` en vez de `-315488`.
- TDD rojo confirmado: `calculationInputMapper.test.ts` fallo inicialmente porque no preservaba `usefulCoefficients`.
- TDD rojo confirmado: `parameterImporter.test.ts` fallo inicialmente porque no exponia diciembre del anio anterior.
- TDD rojo confirmado: `taxParameterUsefulCoefficients.test.ts` fallo inicialmente porque el helper no existia.
- `vitest run src/domain/ganancias/tests/axiInflationRate.test.ts src/domain/ganancias/tests/calculationInputMapper.test.ts src/domain/ganancias/tests/parameterImporter.test.ts src/domain/ganancias/tests/taxParameterUsefulCoefficients.test.ts`: 4 archivos, 7 tests, todo OK.
- `vitest run src/domain/ganancias/tests/taxReturnDetailsPersistence.test.ts src/domain/ganancias/tests/axiInflationRate.test.ts src/domain/ganancias/tests/taxParameterUsefulCoefficients.test.ts`: 3 archivos, 5 tests, todo OK.
- `vitest run`: 23 archivos, 69 tests, todo OK.
- `tsc --noEmit`: OK.
- `eslint` focalizado sobre calculo, mappers, persistencia y rutas de parametros: OK.
- `next build --webpack`: OK.

Pendiente:

- Mapear AXI dinamico contra planilla, especialmente movimientos que usan coeficiente promedio anual.
- Evaluar aviso visible cuando no existe diciembre del anio anterior y el sistema cae al fallback `dic/ene`.

### 2026-06-01 - Fase 1, P3 segundo corte: AXI dinamico con coeficiente promedio anual

Se alineo el AXI dinamico con las filas agregadas de la planilla.

Hallazgo contra Excel:

- En `AXI Inflacion IMPOSITIVO Comercial 2025.xlsx`, hoja `AXI.Dinamico`, la fila `Retiros de los socios` usa `D86/AVERAGE(D75:D86)`.
- La fila `Aportes y aumentos de capital historico` usa el mismo coeficiente promedio anual.
- El motor venia usando `IPC diciembre / IPC del mes de la fecha` para todos los movimientos.
- Por eso un retiro cargado al 31/12 daba coeficiente `1` y ajuste `0`, mientras la planilla da coeficiente `1.1288404539857682` y ajuste aproximado `$502.654` sobre `$3.901.371,69`.

Decision de arquitectura:

- Para `RetiroSocio` y `AporteCapital`, el motor usa `usefulCoefficients.currentYearAverage` cuando esta disponible.
- Para movimientos `Otro`, se conserva el criterio mensual por fecha.
- Si falta coeficiente promedio anual, el motor emite una advertencia visible en el wizard de cierre/calculo.
- La persistencia dejo de recalcular AXI dinamico con una formula duplicada y ahora reutiliza `calculateAxiDynamic`.

Archivos modificados:

- `src/domain/ganancias/calculations/ajustePorInflacion.ts`.
- `src/domain/ganancias/calculations/determinacionImpuesto.ts`.
- `src/domain/ganancias/persistence/taxReturnDetailsPersistence.ts`.
- `src/domain/ganancias/persistence/taxReturnReadMapper.ts`.
- `src/app/api/declaraciones/[id]/route.ts`.
- `src/app/declaraciones/crear/wizard/page.tsx`.
- `src/domain/ganancias/presentation/wizardStateTypes.ts`.
- `src/domain/ganancias/tests/axiDynamicAverageCoefficient.test.ts`.
- `src/domain/ganancias/tests/taxReturnDetailsPersistence.test.ts`.
- `src/domain/ganancias/tests/taxReturnReadMapper.test.ts`.

Resultado funcional:

- AXI dinamico de retiros/aportes agregados replica el criterio de coeficiente promedio anual de la planilla.
- AXI dinamico de movimientos no agregados conserva coeficiente mensual.
- `AxiDynamicItem` guarda el mismo `coef` y `computedAxi` que calcula el motor.
- Al reabrir una DDJJ, la API devuelve coeficiente, factor y ajuste calculado.
- El wizard muestra columnas read-only `Coef.` y `Ajuste` para controlar la carga guardada.
- La grilla AXI ahora soporta scroll horizontal para no romper pantallas chicas.

Verificacion:

- TDD rojo confirmado: `axiDynamicAverageCoefficient.test.ts` fallo inicialmente porque un retiro al 31/12 usaba coeficiente `1`.
- TDD rojo confirmado: `taxReturnDetailsPersistence.test.ts` fallo inicialmente porque `AxiDynamicItem` se guardaba con `coef = 1`.
- TDD rojo confirmado: `taxReturnReadMapper.test.ts` fallo inicialmente porque no existia un mapper que conservara `coef`, `factor` y `computedAxi`.
- `vitest run src/domain/ganancias/tests/axiDynamicAverageCoefficient.test.ts src/domain/ganancias/tests/taxReturnDetailsPersistence.test.ts src/domain/ganancias/tests/taxReturnReadMapper.test.ts`: 3 archivos, 12 tests, todo OK.
- `vitest run`: 24 archivos, 73 tests, todo OK.
- `tsc --noEmit`: OK.
- `eslint` focalizado sobre calculo AXI, determinacion, persistencia, mapper de lectura, endpoint `[id]`, wizard y tests nuevos: OK.

Cierre P3:

- P3 queda resuelto: AXI estatico/dinamico esta alineado con los coeficientes utiles de la planilla y los coeficientes usados quedan auditables.
- Siguiente prioridad: P4 patrimonio y justificacion patrimonial.

### 2026-06-01 - Fase 1, P4 primer corte: JVP unificada en la liquidacion principal

Se inicio el frente de patrimonio y justificacion patrimonial.

Hallazgo:

- Existia `calculatePatrimonialJustification` como funcion pura de dominio.
- `calculateTaxReturn` no la usaba; tenia una implementacion paralela mas simple para patrimonio, columnas y consumo.
- Esa duplicacion hacia que algunas advertencias de auditoria patrimonial, como consumo nulo, no llegaran al wizard aunque la funcion JVP las contemplaba.

Decision de arquitectura:

- `calculateTaxReturn` ahora delega la JVP en `calculatePatrimonialJustification`.
- Para no cambiar la semantica de totales existentes, se arman componentes patrimoniales equivalentes:
- Activos personales cargados por el usuario.
- Cuentas bancarias convertidas a pesos con tipo de cambio inicial/final.
- Patrimonio comercial calculado desde AXI estatico, resultado comercial y retiros/aportes.
- Pasivos personales cargados por el usuario.

Archivos modificados:

- `src/domain/ganancias/calculations/determinacionImpuesto.ts`.
- `src/domain/ganancias/tests/jvpIntegration.test.ts`.
- `docs/CONTINUAR_AQUI.md`.
- `docs/BACKLOG_PRIORIZADO.md`.
- `docs/REGISTRO_PROYECTO.md`.

Resultado funcional:

- La liquidacion principal usa una sola funcion auditable para JVP.
- Se mantienen `patrimonioInicioTotal`, `patrimonioCierreTotal` y `consumoDiferencial` como campos publicos del resultado.
- Las advertencias de JVP se propagan a `warnings`, por lo que el wizard puede alertar consumos nulos o negativos.

Verificacion:

- TDD rojo confirmado: `jvpIntegration.test.ts` fallo inicialmente porque `calculateTaxReturn` no propagaba `Consumo Nulo`.
- `vitest run src/domain/ganancias/tests/jvpIntegration.test.ts src/domain/ganancias/tests/golden.test.ts src/domain/ganancias/tests/deduccionesGenerales.test.ts src/domain/ganancias/tests/taxReturnPreview.test.ts`: 4 archivos, 12 tests, todo OK.
- `vitest run`: 25 archivos, 74 tests, todo OK.
- `tsc --noEmit`: OK.
- `eslint` focalizado sobre determinacion, JVP y test nuevo: OK.
- `next build --webpack`: OK.

Pendiente:

- Persistir/reabrir `otherJustifications`, que hoy el mapper deja vacio.
- Agregar UI agil para otros conceptos de columna I/II y mapearlos contra `JVP`.

### 2026-06-01 - Fase 1, P4 segundo corte: persistencia y reapertura de otras justificaciones JVP

Se activo el circuito backend de `otherJustifications` para que las justificaciones patrimoniales cargadas queden guardadas en base y reaparezcan al abrir la DDJJ.

Hallazgo:

- El modelo Prisma `PatrimonialJustification` ya existia y estaba relacionado con `TaxReturn`.
- El mapper de entrada dejaba `otherJustifications` vacio, por lo que el motor JVP no recibia conceptos manuales de columna I/II.
- La persistencia no borraba ni recreaba la tabla `PatrimonialJustification`.
- La API de reapertura no incluia `justifications`, por lo que aun guardando la tabla esos datos no volvian al wizard.

Decision de arquitectura:

- Mantener `PatrimonialJustification` como tabla auditora de conceptos JVP.
- Normalizar la columna a `1` o `2` en mapper/persistencia para evitar valores ambiguos.
- Conservar el payload original en `variablesSnapshot` para preservar la carga textual del usuario.
- Reabrir desde la relacion persistida y usar el snapshot como fallback para declaraciones guardadas antes del cambio.

Archivos modificados:

- `src/domain/ganancias/mappers/calculationInputMapper.ts`.
- `src/domain/ganancias/persistence/taxReturnDetailsPersistence.ts`.
- `src/domain/ganancias/persistence/taxReturnReadMapper.ts`.
- `src/app/api/declaraciones/[id]/route.ts`.
- `src/domain/ganancias/tests/calculationInputMapper.test.ts`.
- `src/domain/ganancias/tests/taxReturnDetailsPersistence.test.ts`.
- `src/domain/ganancias/tests/taxReturnReadMapper.test.ts`.
- `docs/CONTINUAR_AQUI.md`.
- `docs/BACKLOG_PRIORIZADO.md`.
- `docs/REGISTRO_PROYECTO.md`.

Resultado funcional:

- `buildTaxReturnCalculationInput` entrega `otherJustifications` al motor JVP.
- `persistTaxReturnDetails` borra/recrea `PatrimonialJustification` por DDJJ y guarda concepto, columna e importe.
- `CalculationRun.variablesSnapshot` conserva `otherJustifications`.
- `GET /api/declaraciones/[id]` devuelve `otherJustifications` al wizard desde la base o desde snapshot como compatibilidad.

Verificacion:

- TDD rojo confirmado: `calculationInputMapper.test.ts` fallo inicialmente porque `otherJustifications[0]` era `undefined`.
- TDD rojo confirmado: `taxReturnDetailsPersistence.test.ts` fallo inicialmente porque no se creaba `PatrimonialJustification`.
- TDD rojo confirmado: `taxReturnReadMapper.test.ts` fallo inicialmente porque no existia `mapPatrimonialJustificationForWizard`.
- `vitest run src/domain/ganancias/tests/calculationInputMapper.test.ts src/domain/ganancias/tests/taxReturnDetailsPersistence.test.ts src/domain/ganancias/tests/taxReturnReadMapper.test.ts`: 3 archivos, 16 tests, todo OK.
- `tsc --noEmit`: OK.
- `vitest run`: 25 archivos, 76 tests, todo OK.
- `eslint` focalizado sobre mapper, persistencia, mapper de lectura, endpoint `[id]` y tests modificados: OK.
- `next build --webpack`: OK.

Pendiente:

- Agregar UI agil para cargar otras justificaciones JVP desde el wizard.
- Validar el reflejo contra filas relevantes de hoja `JVP` y definir rubros sugeridos para columna I/II.

### 2026-06-01 - Fase 1, P4 tercer corte: UI agil para otras justificaciones JVP

Se agrego carga manual de otras justificaciones patrimoniales en el Paso 4 del wizard.

Objetivo:

- Que un estudio chico pueda cargar conceptos JVP adicionales sin depender de campos genericos ocultos.
- Mantener la carga simple: concepto, columna e importe.
- Evitar automatismos opacos; la columna se elige explicitamente como I o II.

Decision de UX:

- Ubicar la grilla en Paso 4, junto a activos, bancos y pasivos personales, porque forma parte de la justificacion patrimonial.
- Mostrar totales por columna para que el contador vea rapidamente el efecto de la carga.
- Usar una fila por defecto con columna II e importe cero, pensando en conceptos que justifican recursos o PN inicial.
- Mantener los datos dentro del mismo payload usado por autosave, guardado, localStorage y preview.

Archivos modificados:

- `src/app/declaraciones/crear/wizard/page.tsx`.
- `src/domain/ganancias/presentation/wizardStateTypes.ts`.
- `src/domain/ganancias/tests/wizardStateTypes.test.ts`.
- `docs/CONTINUAR_AQUI.md`.
- `docs/BACKLOG_PRIORIZADO.md`.
- `docs/REGISTRO_PROYECTO.md`.

Resultado funcional:

- El wizard permite agregar, editar y eliminar `otherJustifications`.
- Cada fila guarda `concept`, `column` e `amount`.
- `column` se normaliza a `1` o `2` para evitar valores ambiguos.
- La informacion participa del calculo local/backend porque se incluye en `calculationData`.
- La informacion se conserva en autosave, guardado manual y reapertura desde localStorage/API.

Verificacion:

- TDD rojo confirmado: `wizardStateTypes.test.ts` fallo inicialmente porque no existia `coerceWizardOtherJustificationColumn`.
- `vitest run src/domain/ganancias/tests/wizardStateTypes.test.ts`: 1 archivo, 5 tests, todo OK.
- `tsc --noEmit`: OK.
- `eslint` focalizado sobre wizard, tipos de estado y test nuevo: OK.
- `next build --webpack`: OK.

Limitacion de entorno:

- No se pudo completar inspeccion visual automatizada: `node_repl` fallo al lanzar Chromium por sandbox y no hay `npx` disponible para usar el wrapper local de Playwright.
- Se deja pendiente una recorrida visual manual/automatizada del Paso 4 cuando el entorno Browser/Chrome este disponible.

Pendiente:

- Validar rubros y comportamiento contra filas relevantes de hoja `JVP`.
- Mapear creditos/pasivos personales contra hojas auxiliares `Creditos`, `Pasivo` y `Banco`.

### 2026-06-01 - Fase 1, P4 cuarto corte: resultado JVP alineado con IG 25!F38

Se contrasto la hoja `JVP` contra la planilla base y se corrigio la fuente del resultado del periodo usado para justificar recursos.

Hallazgo en Excel:

- `JVP!D14` referencia `IG 25!F38`.
- `IG 25!F38` es `Resultado Neto`, calculado como resultado impositivo antes de quebrantos menos quebrantos anteriores.
- La app estaba pasando `resultadoComercialNeto` a la funcion JVP.

Decision contable:

- Usar `resultadoImpositivoNeto` en JVP porque es el equivalente funcional de `IG 25!F38`.
- Mantener el patrimonio comercial de cierre calculado desde resultado comercial, porque representa la variacion patrimonial de la explotacion.
- Documentar que, cuando las deducciones generales reducen el resultado impositivo sin reflejo patrimonial, el consumo puede volverse negativo igual que en la estructura de la planilla si no se carga el concepto compensatorio correspondiente.

Archivos modificados:

- `src/domain/ganancias/calculations/determinacionImpuesto.ts`.
- `src/domain/ganancias/tests/jvpIntegration.test.ts`.
- `docs/CONTINUAR_AQUI.md`.
- `docs/BACKLOG_PRIORIZADO.md`.
- `docs/REGISTRO_PROYECTO.md`.

Resultado funcional:

- `calculateTaxReturn` envia `resultadoImpositivoNet` a `calculatePatrimonialJustification`.
- La JVP queda mas cerca de la hoja Excel para la fila `Resultado impositivo de periodo (beneficio)`.

Verificacion:

- TDD rojo confirmado: `jvpIntegration.test.ts` fallo inicialmente porque el consumo seguia en `0` al usar resultado comercial.
- `vitest run src/domain/ganancias/tests/jvpIntegration.test.ts`: 1 archivo, 2 tests, todo OK.

Pendiente:

- Completar mapeo fino de filas `JVP!C8`, `JVP!D13` y auxiliares para conceptos que no surgen automaticamente.
- Revisar si conviene agregar presets de conceptos frecuentes para columna I/II sin automatizar la decision contable.

Nota de continuidad:

- Se creo `docs/MAPEO_JVP_EXCEL.md` con el mapa de hojas, formulas y brechas detectadas contra la planilla base.

### 2026-06-01 - Fase 1, P4 quinto corte: presets rapidos para JVP

Se agregaron presets de carga para conceptos habituales de otras justificaciones patrimoniales.

Objetivo de carga:

- Reducir tipeo repetitivo en un estudio chico.
- No esconder criterio contable: cada preset muestra la columna sugerida antes de cargar.
- Mantener editable concepto, columna e importe despues de insertar la fila.

Presets iniciales:

- Herencia / donacion: columna II.
- Gasto no deducible: columna I.
- Ganancia exenta: columna II.
- Amortizacion 3ra: columna II.
- AXI positivo: columna I.
- AXI negativo: columna II.

Archivos modificados:

- `src/app/declaraciones/crear/wizard/page.tsx`.
- `src/domain/ganancias/presentation/wizardStateTypes.ts`.
- `src/domain/ganancias/tests/wizardStateTypes.test.ts`.
- `docs/CONTINUAR_AQUI.md`.
- `docs/BACKLOG_PRIORIZADO.md`.
- `docs/REGISTRO_PROYECTO.md`.

Verificacion:

- TDD rojo confirmado: `wizardStateTypes.test.ts` fallo inicialmente porque no existia `buildWizardOtherJustificationFromPreset`.
- `vitest run src/domain/ganancias/tests/wizardStateTypes.test.ts`: 1 archivo, 6 tests, todo OK.
- `tsc --noEmit`: OK.

Pendiente:

- Ajustar o ampliar presets luego de validar casos reales contra `JVP`.

### 2026-06-01 - Fase 1, P4 sexto corte: totales JVP auditables

Se expusieron los totales de columna I, columna II y cuadre JVP desde el motor hacia las capas de presentacion.

Problema:

- `calculatePatrimonialJustification` ya calculaba `totalColumnaI`, `totalColumnaII` y `justificationDiff`.
- `calculateTaxReturn` solo devolvia patrimonio inicio/cierre y consumo.
- La persistencia guardaba `justificationDiff` como `0` fijo.
- La UI y el exportador no podian mostrar el cuadre real del papel de trabajo.

Decision:

- Agregar al resultado principal `jvpTotalColumnaI`, `jvpTotalColumnaII` y `jvpJustificationDiff`.
- Serializar/hidratar esos campos en preview backend/local.
- Persistir `jvpJustificationDiff` calculado.
- Mostrar totales de columnas y cuadre en el panel de auditoria del Paso 6.
- Usar esos totales en el exportador de Excel cuando esten disponibles.

Archivos modificados:

- `src/domain/ganancias/types.ts`.
- `src/domain/ganancias/calculations/determinacionImpuesto.ts`.
- `src/domain/ganancias/presentation/taxReturnPreview.ts`.
- `src/domain/ganancias/persistence/taxReturnDetailsPersistence.ts`.
- `src/domain/ganancias/exports/excelGenerator.ts`.
- `src/app/declaraciones/crear/wizard/page.tsx`.
- `src/domain/ganancias/tests/jvpIntegration.test.ts`.
- `src/domain/ganancias/tests/taxReturnPreview.test.ts`.
- `docs/CONTINUAR_AQUI.md`.
- `docs/BACKLOG_PRIORIZADO.md`.
- `docs/REGISTRO_PROYECTO.md`.

Verificacion:

- TDD rojo confirmado: `jvpIntegration.test.ts` y `taxReturnPreview.test.ts` fallaron inicialmente porque los campos no existian.
- `vitest run src/domain/ganancias/tests/jvpIntegration.test.ts src/domain/ganancias/tests/taxReturnPreview.test.ts`: 2 archivos, 10 tests, todo OK.

Pendiente:

- Validar visualmente el panel de auditoria cuando el entorno Browser/Chrome vuelva a estar disponible.

### 2026-06-02 - Fase 1, P5 primer corte: mapeo de deducciones generales

Se inicio P5 con una tabla rubro por rubro contra `IG 25` y `Ded. Gen.`.

Hallazgo:

- La app cubre los rubros agregados que alimentan `IG 25!F20:F31`.
- Existen tests sobre locador/locatario, topes encadenados de prepagas, honorarios medicos y donaciones.
- La brecha principal no es formula agregada sino trazabilidad documental: la hoja `Ded. Gen.` conserva fecha, comprobante, numero, concepto y total por rubro.

Decision de continuidad:

- Crear `docs/MAPEO_DEDUCCIONES_GENERALES_EXCEL.md`.
- Mantener por ahora la carga agregada por rubro como opcion mas agil para estudio chico.
- Dejar pendiente decidir si la app sera tambien repositorio documental comprobante por comprobante.

Archivo nuevo:

- `docs/MAPEO_DEDUCCIONES_GENERALES_EXCEL.md`.

Archivos modificados:

- `docs/CONTINUAR_AQUI.md`.
- `docs/BACKLOG_PRIORIZADO.md`.
- `docs/REGISTRO_PROYECTO.md`.

Pendiente:

- Resolver decision de detalle documental.
- Confirmar fuente anual del tope parametrico de gastos educativos.

### 2026-06-02 - Fase 1, P5 segundo corte: excedentes no admitidos a JVP

Se corrigio la trazabilidad de los excedentes de deducciones generales que la planilla muestra en la columna JVP de `IG 25`.

Hallazgo:

- `IG 25!E32 = SUM(E20:E31)`.
- Esos importes representan excedentes no admitidos por topes, relevantes para la justificacion patrimonial.
- La app computaba solo lo admitido en `F20:F31` y no exponia ni trasladaba los excedentes a JVP.

Decision:

- Calcular `totalExcedenteDeduccionesGeneralesJvp`.
- Incluir ese total en `GeneralDeductionsOutput`.
- Sumarlo a JVP columna I sin modificar `gastosNoDeducibles` comercial.
- Mostrar un aviso visible en el wizard cuando exista excedente.
- Incluir fila especifica en el exportador Excel: `Excedente deducciones generales no admitido`.

Archivos modificados:

- `src/domain/ganancias/types.ts`.
- `src/domain/ganancias/calculations/determinacionImpuesto.ts`.
- `src/domain/ganancias/presentation/taxReturnPreview.ts`.
- `src/domain/ganancias/exports/excelGenerator.ts`.
- `src/app/declaraciones/crear/wizard/page.tsx`.
- `src/domain/ganancias/tests/deduccionesGenerales.test.ts`.
- `src/domain/ganancias/tests/deductionsBreakdown.test.ts`.
- `src/domain/ganancias/tests/taxReturnPreview.test.ts`.
- `docs/MAPEO_DEDUCCIONES_GENERALES_EXCEL.md`.
- `docs/CONTINUAR_AQUI.md`.
- `docs/BACKLOG_PRIORIZADO.md`.
- `docs/REGISTRO_PROYECTO.md`.

Verificacion:

- TDD rojo confirmado: `deduccionesGenerales.test.ts` fallo inicialmente porque `totalExcedenteDeduccionesGeneralesJvp` no existia.
- `vitest run src/domain/ganancias/tests/deduccionesGenerales.test.ts src/domain/ganancias/tests/taxReturnPreview.test.ts src/domain/ganancias/tests/deductionsBreakdown.test.ts`: 3 archivos, 13 tests, todo OK.
- `tsc --noEmit`: OK.
- `vitest run`: 25 archivos, 80 tests, todo OK.
- `eslint` focalizado sobre motor, preview, exportador, wizard y tests tocados: OK.
- `next build --webpack`: OK.

Pendiente:

- Resolver decision de detalle documental por comprobante para deducciones generales.

### 2026-06-02 - Fase 1, P4 septimo corte: JVP no se pierde en alta inicial

Se corrigio una brecha chica pero sensible de persistencia para la carga JVP.

Hallazgo:

- `persistTaxReturnDetails` ya guardaba `otherJustifications` en relacion y snapshot cuando el flujo entraba por persistencia detallada.
- El alta inicial decide si usa persistencia detallada con `hasDetailedTaxReturnPayload`.
- `otherJustifications` no estaba incluido en ese detector ni en `buildInitialTaxReturnSnapshot`.
- Si una DDJJ se creaba solo con datos JVP y sin otras estructuras operativas, esa informacion podia no quedar en la base.

Decision:

- Tratar `otherJustifications` como carga operativa detallada.
- Incluir `otherJustifications` en el snapshot inicial para conservar compatibilidad con altas minimas y estados intermedios.
- No crear una tabla nueva en este corte, porque ya existe `PatrimonialJustification` para el caso persistido completo.

Archivos modificados:

- `src/domain/ganancias/persistence/taxReturnPayload.ts`.
- `src/domain/ganancias/persistence/taxReturnSnapshot.ts`.
- `src/domain/ganancias/tests/taxReturnPayload.test.ts`.
- `src/domain/ganancias/tests/taxReturnSnapshot.test.ts`.
- `docs/CONTINUAR_AQUI.md`.
- `docs/BACKLOG_PRIORIZADO.md`.
- `docs/REGISTRO_PROYECTO.md`.

Verificacion:

- TDD rojo confirmado: `taxReturnPayload.test.ts` devolvia `false` para una carga con solo `otherJustifications`.
- TDD rojo confirmado: `taxReturnSnapshot.test.ts` no encontraba `snapshot.otherJustifications`.
- `vitest run src/domain/ganancias/tests/taxReturnPayload.test.ts src/domain/ganancias/tests/taxReturnSnapshot.test.ts`: 2 archivos, 6 tests, todo OK.
- `vitest run`: 25 archivos, 82 tests, todo OK.
- `tsc --noEmit`: OK.
- `eslint` focalizado sobre payload, snapshot y tests: OK.
- `next build --webpack`: OK.

Pendiente:

- Seguir con mapeo fino de creditos/pasivos y filas JVP.
- Resolver decision de detalle documental por comprobante para deducciones generales.

### 2026-06-02 - Fase 1, P4 octavo corte: auxiliares ESP preservados en backend

Se avanzo sobre la brecha de hojas auxiliares `Efectivo`, `Creditos` y `Pasivo`.

Hallazgo:

- El dominio y Prisma ya contemplaban `cashHoldings`, `receivables` y `liabilities`.
- `calculationInputMapper` los descartaba y devolvia arrays vacios.
- El alta inicial no los detectaba como carga operativa ni los copiaba al snapshot.
- `persistTaxReturnDetails` no los pasaba al motor ni los guardaba en tablas.
- La reapertura de DDJJ no los devolvia desde la API.

Decision:

- Mapear `cashHoldings`, `receivables` y `liabilities` desde payload al input del motor.
- Considerarlos carga operativa detallada para activar persistencia.
- Guardarlos en `variablesSnapshot` y en tablas relacionales si estan presentes.
- Devolverlos al reabrir la DDJJ desde `GET /api/declaraciones/[id]`.
- Dejar UI/importador como siguiente corte, para no agrandar el wizard sin una decision de carga.

Archivos modificados:

- `src/domain/ganancias/mappers/calculationInputMapper.ts`.
- `src/domain/ganancias/persistence/taxReturnPayload.ts`.
- `src/domain/ganancias/persistence/taxReturnSnapshot.ts`.
- `src/domain/ganancias/persistence/taxReturnDetailsPersistence.ts`.
- `src/app/api/declaraciones/[id]/route.ts`.
- `src/domain/ganancias/tests/calculationInputMapper.test.ts`.
- `src/domain/ganancias/tests/taxReturnPayload.test.ts`.
- `src/domain/ganancias/tests/taxReturnSnapshot.test.ts`.
- `src/domain/ganancias/tests/taxReturnDetailsPersistence.test.ts`.
- `docs/CONTINUAR_AQUI.md`.
- `docs/BACKLOG_PRIORIZADO.md`.
- `docs/MAPEO_JVP_EXCEL.md`.
- `docs/REGISTRO_PROYECTO.md`.

Verificacion:

- TDD rojo confirmado: `calculationInputMapper.test.ts` fallaba porque `cashHoldings[0]` era `undefined`.
- TDD rojo confirmado: `taxReturnPayload.test.ts` no detectaba efectivo/creditos/pasivos como carga operativa.
- TDD rojo confirmado: `taxReturnSnapshot.test.ts` no conservaba esos arrays.
- TDD rojo confirmado: `taxReturnDetailsPersistence.test.ts` no llamaba a `cashHolding.createMany`.
- `vitest run src/domain/ganancias/tests/calculationInputMapper.test.ts src/domain/ganancias/tests/taxReturnPayload.test.ts src/domain/ganancias/tests/taxReturnSnapshot.test.ts src/domain/ganancias/tests/taxReturnDetailsPersistence.test.ts`: 4 archivos, 17 tests, todo OK.
- `vitest run`: 25 archivos, 84 tests, todo OK.
- `tsc --noEmit`: OK.
- `eslint` focalizado sobre mapper, persistencia, endpoint y tests tocados: OK.
- `next build --webpack`: OK.

Pendiente:

- Definir UI/importador para cargar `Efectivo`, `Creditos` y `Pasivo` sin sobrecargar la pantalla.
- Validar una DDJJ real contra `ESP`, `Patrimonio personal` y `JVP`.

### 2026-06-02 - Fase 1, P4 noveno corte: UI colapsable para auxiliares ESP

Se agrego carga visible en el wizard para los auxiliares ESP preparados en backend.

Hallazgo:

- El Paso 4 ya tenia bancos, bienes personales, pasivos personales y otras justificaciones JVP.
- Los nuevos arrays `cashHoldings`, `receivables` y `liabilities` se preservaban en backend, pero no habia forma agil de cargarlos desde la pantalla.
- Integrarlos automaticamente al patrimonio comercial agregado todavia puede generar doble computo si no se define la regla exacta contra `ESP`, AXI y JVP.

Decision:

- Agregar una seccion colapsable "Auxiliares ESP" en Paso 4.
- Incluir mini-grillas para efectivo, creditos y pasivos comerciales.
- Mostrar totales auxiliares de activo y patrimonio neto inicio/cierre como control operativo.
- Incluir aviso visible: esos saldos se guardan y reabren, pero no automatizan todavia `activoTotalInicio`/`pasivoTotalInicio`.
- Conectar estado, localStorage, preview payload, guardado y reapertura.

Archivos modificados:

- `src/domain/ganancias/presentation/wizardStateTypes.ts`.
- `src/domain/ganancias/tests/wizardStateTypes.test.ts`.
- `src/app/declaraciones/crear/wizard/page.tsx`.
- `docs/CONTINUAR_AQUI.md`.
- `docs/BACKLOG_PRIORIZADO.md`.
- `docs/MAPEO_JVP_EXCEL.md`.
- `docs/REGISTRO_PROYECTO.md`.

Verificacion:

- TDD rojo confirmado: `wizardStateTypes.test.ts` fallo porque `buildDefaultWizardCashHolding` no existia.
- `vitest run src/domain/ganancias/tests/wizardStateTypes.test.ts`: 1 archivo, 7 tests, todo OK.
- `tsc --noEmit`: OK.
- `eslint` focalizado sobre wizard, tipos y test: OK.
- `vitest run src/domain/ganancias/tests/wizardStateTypes.test.ts src/domain/ganancias/tests/calculationInputMapper.test.ts src/domain/ganancias/tests/taxReturnDetailsPersistence.test.ts src/domain/ganancias/tests/taxReturnPayload.test.ts src/domain/ganancias/tests/taxReturnSnapshot.test.ts`: 5 archivos, 24 tests, todo OK.
- `vitest run`: 25 archivos, 85 tests, todo OK.
- `next build --webpack`: OK.
- Validacion visual automatizada: bloqueada por entorno (`node_repl kernel exited unexpectedly`, `windows sandbox failed: spawn setup refresh`).

Pendiente:

- Definir regla de integracion automatica contra `activoTotalInicio` y `pasivoTotalInicio` sin doble computo.
- Validar visualmente el Paso 4 cuando Browser/Chrome local este disponible.
- Validar una DDJJ real contra `ESP`, `Patrimonio personal` y `JVP`.

### 2026-06-02 - Fase 1, P5 tercer corte: tope educativo derivado desde MNI

Se resolvio la decision abierta sobre gastos educativos contra la planilla base.

Hallazgo:

- `IG 25!D26 = E41 * 0.4`.
- La app ya tenia `topeGastosEducativos` como parametro editable/importado.
- Si el archivo de parametros trae MNI pero no trae el tope educativo explicito, el importador caia al default fijo 2025.

Decision:

- Mantener `topeGastosEducativos` como campo parametrico para permitir override auditable.
- Derivar el tope como `minimoNoImponible * 0.4` cuando el workbook no trae tope educativo explicito.
- No sumar gastos educativos a excedentes JVP, porque en la planilla `IG 25!E26` esta fijo en `0`.

Archivos modificados:

- `src/domain/ganancias/mappers/parameterImporter.ts`.
- `src/domain/ganancias/tests/parameterImporter.test.ts`.
- `docs/MAPEO_DEDUCCIONES_GENERALES_EXCEL.md`.
- `docs/CONTINUAR_AQUI.md`.
- `docs/BACKLOG_PRIORIZADO.md`.
- `docs/REGISTRO_PROYECTO.md`.

Verificacion:

- TDD rojo confirmado: `parameterImporter.test.ts` fallo porque el importador devolvia `1803002.21` en lugar de `400000` cuando el workbook solo traia MNI `1000000`.
- `vitest run src/domain/ganancias/tests/parameterImporter.test.ts`: 1 archivo, 2 tests, todo OK.
- `vitest run`: 25 archivos, 81 tests, todo OK.
- `tsc --noEmit`: OK.
- `eslint` focalizado sobre importador y test: OK.
- `next build --webpack`: OK.

Pendiente:

- Resolver decision de detalle documental por comprobante para deducciones generales.

### 2026-06-02 - Fase 1, P4 decimo corte: reconciliacion explicita ESP contra agregado

Se resolvio el pendiente de integracion entre auxiliares ESP y patrimonio comercial agregado sin introducir automatismos riesgosos.

Hallazgo:

- El Paso 4 ya cargaba efectivo, creditos y pasivos comerciales, pero el calculo de totales estaba inline en la pantalla.
- Automatizar esos saldos contra `activoTotalInicio` y `pasivoTotalInicio` puede duplicar rubros cuando el agregado incluye bienes de cambio, bienes de uso u otros conceptos no detallados en auxiliares.
- El criterio de trabajo del estudio prioriza agilidad y trazabilidad: sugerir y controlar, no reemplazar el juicio profesional.

Decision:

- Extraer el resumen ESP a `buildWizardEspAuxiliarySummary`, testeado en la capa de presentacion.
- Calcular activos, pasivos y patrimonio neto auxiliar de inicio/cierre.
- Detectar diferencias contra `activoTotalInicio` / `pasivoTotalInicio`.
- Mostrar advertencia operativa solo si hay diferencia.
- Permitir copiar activo inicial auxiliar y pasivo inicial auxiliar al agregado mediante botones explicitos.
- Mantener la decision de no impactar automaticamente AXI/JVP para evitar doble computo silencioso.

Archivos modificados:

- `src/domain/ganancias/presentation/wizardStateTypes.ts`.
- `src/domain/ganancias/tests/wizardStateTypes.test.ts`.
- `src/app/declaraciones/crear/wizard/page.tsx`.
- `docs/CONTINUAR_AQUI.md`.
- `docs/BACKLOG_PRIORIZADO.md`.
- `docs/MAPEO_JVP_EXCEL.md`.
- `docs/REGISTRO_PROYECTO.md`.

Verificacion:

- TDD rojo confirmado: `wizardStateTypes.test.ts` fallo porque `buildWizardEspAuxiliarySummary` no existia.
- `vitest run src/domain/ganancias/tests/wizardStateTypes.test.ts`: 1 archivo, 8 tests, todo OK.
- `eslint` focalizado sobre wizard, tipos y test: OK.
- `vitest run`: 25 archivos, 86 tests, todo OK.
- `git diff --check`: OK, solo avisos CRLF habituales.
- `tsc --noEmit`: OK.
- `next build --webpack`: OK.
- Validacion visual automatizada: bloqueada por entorno. Browser integrado fallo con `node_repl kernel exited unexpectedly` / `windows sandbox failed: spawn setup refresh`.
- Smoke HTTP local: no concluyente. Next arranco como job temporal en `127.0.0.1:3010`, pero el job no quedo disponible para conectar desde el siguiente proceso de verificacion.

Pendiente:

- Validar visualmente el Paso 4 cuando Browser/Chrome local este disponible.
- Validar una DDJJ real contra `ESP`, `Patrimonio personal` y `JVP`.

### 2026-06-02 - Fase 1, P5 cuarto corte: decision documental de deducciones generales

Se cerro la decision pendiente sobre detalle comprobante por comprobante en deducciones generales.

Hallazgo:

- La app ya cubre los rubros agregados que impactan `IG 25!F20:F31`.
- La hoja `Ded. Gen.` conserva detalle por fecha/comprobante/concepto, pero cargarlo completo volveria mas lenta la operatoria de un estudio chico si la app no pretende ser repositorio documental.
- El usuario pidio agilidad y automatizacion sin magia; por eso la carga agregada por rubro es adecuada como MVP de liquidacion.

Decision:

- Mantener deducciones generales como importes agregados por rubro.
- No crear tabla `GeneralDeductionItem` en este corte.
- Mostrar en Paso 5 un aviso visible: la app liquida por rubro y no reemplaza respaldo documental comprobante por comprobante.
- Dejar el detalle documental como mejora futura solo si el estudio decide que la app tambien debe ser repositorio de auditoria.

Archivos modificados:

- `src/domain/ganancias/presentation/deductionsBreakdown.ts`.
- `src/domain/ganancias/tests/deductionsBreakdown.test.ts`.
- `src/app/declaraciones/crear/wizard/page.tsx`.
- `docs/CONTINUAR_AQUI.md`.
- `docs/BACKLOG_PRIORIZADO.md`.
- `docs/MAPEO_DEDUCCIONES_GENERALES_EXCEL.md`.
- `docs/REGISTRO_PROYECTO.md`.

Verificacion:

- TDD rojo confirmado: `deductionsBreakdown.test.ts` fallo porque `getGeneralDeductionsDocumentationNotice` no existia.
- `vitest run src/domain/ganancias/tests/deductionsBreakdown.test.ts`: 1 archivo, 3 tests, todo OK.
- `eslint` focalizado sobre wizard, helper y test: OK.
- `vitest run`: 25 archivos, 87 tests, todo OK.
- `git diff --check`: OK, solo avisos CRLF habituales.
- `tsc --noEmit`: OK.
- `next build --webpack`: OK.
- Nota de verificacion: un primer `tsc --noEmit` fallo al correr en paralelo con `next build` porque `.next/types` estaba siendo regenerado; reejecutado aislado despues del build quedo OK.

Pendiente:

- Validacion visual sigue bloqueada por el entorno del navegador integrado.

### 2026-06-02 - Fase 1, P4 undecimo corte: referencias Excel en presets JVP

Se cerro el pendiente tecnico de validar rubros frecuentes de `otherJustifications` contra filas relevantes de hoja `JVP`.

Hallazgo:

- `docs/MAPEO_JVP_EXCEL.md` ya documentaba las filas troncales `JVP!C8`, `JVP!D9`, `JVP!D11` y `JVP!D13`.
- El wizard tenia presets rapidos por concepto y columna, pero no mostraba la referencia Excel.
- Sin esa referencia, la carga era rapida pero menos auditable para revisar por que un concepto entra por columna I o II.

Decision:

- Agregar `reference` al catalogo `WIZARD_OTHER_JUSTIFICATION_PRESETS`.
- Mostrar la referencia Excel en el boton del preset y en el tooltip.
- Mantener el calculo sin cambios: la referencia guia la carga, no modifica importes ni columnas.

Archivos modificados:

- `src/domain/ganancias/presentation/wizardStateTypes.ts`.
- `src/domain/ganancias/tests/wizardStateTypes.test.ts`.
- `src/app/declaraciones/crear/wizard/page.tsx`.
- `docs/CONTINUAR_AQUI.md`.
- `docs/BACKLOG_PRIORIZADO.md`.
- `docs/MAPEO_JVP_EXCEL.md`.
- `docs/REGISTRO_PROYECTO.md`.

Verificacion:

- TDD rojo confirmado: `wizardStateTypes.test.ts` fallo porque el preset `herenciaDonacion` no tenia referencia `JVP!D11`.
- `vitest run src/domain/ganancias/tests/wizardStateTypes.test.ts`: 1 archivo, 8 tests, todo OK.
- `eslint` focalizado sobre wizard, tipos y test: OK.
- `vitest run`: 25 archivos, 88 tests, todo OK.
- `git diff --check`: OK, solo avisos CRLF habituales.
- `tsc --noEmit`: OK.
- `next build --webpack`: OK.

Pendiente:

- Validar una DDJJ real contra `ESP`, `Patrimonio personal` y `JVP`.
- Validacion visual sigue bloqueada por el entorno del navegador integrado.

### 2026-06-02 - Cierre tecnico MVP

Se deja documentado el cierre tecnico del MVP funcional.

Decision:

- Considerar P0 a P6 cerrados como desarrollo tecnico del MVP.
- Separar pendientes externos de validacion real/visual de los pendientes de desarrollo.
- Crear `docs/ESTADO_FINAL_DESARROLLO.md` como resumen ejecutivo para retomar sin reconstruir todo el historial.

Estado:

- Desarrollo tecnico implementado: 100%.
- Preparacion para uso piloto: 95%, sujeto a prueba con DDJJ real o fixture realista.
- Validacion visual automatizada: bloqueada por entorno Browser/Windows.

Pendiente externo:

- Probar con una DDJJ real ya resuelta en Excel.
- Validar visualmente wizard cuando el navegador integrado o Chrome local este disponible.

### 2026-06-02 - Fase 1, P6 primer corte: retenciones importadas auditables

Se cerro la brecha remanente de auditoria importada para Mis Retenciones.

Hallazgo:

- El schema `TaxWithholding` ya tenia campos para CUIT/agente, regimen, certificado, fecha y operacion.
- El importador leia Mis Retenciones pero reducia cada fila a `taxCode` e `amount`.
- La persistencia guardaba valores genericos (`Agente Retencion`, `00000000`), perdiendo datos utiles para revision.
- Ventas/compras ya preservan `counterpartyCuit` en `variablesSnapshot` y lo devuelven desde reapertura, aunque no esta migrado a columnas propias.

Decision:

- Preservar detalle de retenciones en el importador: CUIT/agente, descripcion de impuesto, regimen, fecha, certificado y operacion.
- Guardar esos campos en `TaxWithholding` y devolverlos al reabrir.
- Mostrar columnas compactas de auditoria en Paso 5 para revisar agente/certificado y fecha/regimen.
- Mantener `counterpartyCuit` de ventas/compras en snapshot documentado por ahora; migrar a columnas solo si el estudio necesita consultas/reportes DB por CUIT.

Archivos modificados:

- `src/domain/ganancias/types.ts`.
- `src/domain/ganancias/mappers/afipImporter.ts`.
- `src/domain/ganancias/mappers/calculationInputMapper.ts`.
- `src/domain/ganancias/persistence/taxReturnDetailsPersistence.ts`.
- `src/domain/ganancias/presentation/wizardStateTypes.ts`.
- `src/app/api/declaraciones/[id]/route.ts`.
- `src/app/declaraciones/crear/wizard/page.tsx`.
- `src/domain/ganancias/tests/importer.test.ts`.
- `src/domain/ganancias/tests/taxReturnDetailsPersistence.test.ts`.
- `docs/CONTINUAR_AQUI.md`.
- `docs/BACKLOG_PRIORIZADO.md`.
- `docs/REGISTRO_PROYECTO.md`.

Verificacion:

- TDD rojo confirmado: `importer.test.ts` fallo porque `cuitAgent` era `undefined`.
- TDD rojo confirmado: `taxReturnDetailsPersistence.test.ts` fallo porque persistencia seguia usando agente/certificado genericos.
- `vitest run src/domain/ganancias/tests/importer.test.ts src/domain/ganancias/tests/taxReturnDetailsPersistence.test.ts`: 2 archivos, 11 tests, todo OK.
- `eslint` focalizado sobre importador, mapper, persistencia, wizard, endpoint y tests: OK.
- `vitest run`: 25 archivos, 88 tests, todo OK.
- `git diff --check`: OK, solo avisos CRLF habituales.
- `tsc --noEmit`: OK.
- `next build --webpack`: OK.
- Nota de verificacion: un primer `tsc --noEmit` fallo al correr en paralelo con `next build` porque `.next/types` estaba siendo regenerado; reejecutado aislado despues del build quedo OK.

Pendiente:

- Validacion visual sigue bloqueada por el entorno del navegador integrado.

### 2026-06-02 - Fase 1, P8: preparacion de prueba piloto reproducible

Se preparo el puente operativo entre el cierre tecnico del MVP y la prueba manual/real del estudio.

Hallazgo:

- El desarrollo tecnico estaba cerrado, pero el siguiente paso practico necesitaba una guia concreta.
- Sin fixture ni checklist, cada retomada obligaba a reconstruir datos de prueba y aumentaba el riesgo de dejar frentes abiertos.
- El usuario remarco que la declaracion y la informacion cargada deben quedar en base de datos; por eso el caso piloto no podia limitarse a calcular, tambien debia verificar persistencia critica.

Decision:

- Crear un fixture piloto realista con importes como strings, igual que llegan desde formularios/importadores.
- Cubrir calculo end-to-end con el mapper y el motor real.
- Cubrir persistencia critica con mocks de tablas/snapshot: ventas, compras, efectivo, creditos, pasivos, retenciones, otras justificaciones JVP y calculationRun.
- Documentar un recorrido manual para poder empezar a probar sin depender de memoria.

Archivos modificados:

- `src/domain/ganancias/fixtures/pilotTaxReturnFixture.ts`.
- `src/domain/ganancias/tests/pilotTaxReturnFixture.test.ts`.
- `docs/GUIA_PRUEBA_PILOTO.md`.
- `docs/CONTINUAR_AQUI.md`.
- `docs/BACKLOG_PRIORIZADO.md`.
- `docs/ESTADO_FINAL_DESARROLLO.md`.
- `docs/REGISTRO_PROYECTO.md`.

Verificacion:

- TDD rojo confirmado: `pilotTaxReturnFixture.test.ts` fallo porque `buildPilotTaxReturnFixture` no existia.
- TDD rojo confirmado: el fixture tenia 3 indices y la prueba exigio 12 indices mensuales.
- `vitest run src/domain/ganancias/tests/pilotTaxReturnFixture.test.ts`: 1 archivo, 2 tests, todo OK.
- `vitest run`: 26 archivos, 90 tests, todo OK.
- `eslint` focalizado sobre fixture y test piloto: OK.
- `git diff --check`: OK, solo avisos CRLF habituales.
- `next build --webpack`: OK.
- `tsc --noEmit`: OK.

Pendiente externo:

- Ejecutar `docs/GUIA_PRUEBA_PILOTO.md` manualmente en navegador.
- Comparar una DDJJ real ya resuelta contra Excel y registrar diferencias si aparecen.

### 2026-06-02 - Fase 1, P9: carga multiarchivo AFIP mensual

Se ajusto la importacion para que ventas y compras puedan cargarse con los archivos mensuales tal cual se descargan de AFIP.

Hallazgo:

- El parser fiscal ya soportaba los formatos reales/truncados de AFIP, pero trabajaba archivo por archivo.
- `/api/import` recibia solo `file`.
- El wizard usaba `event.target.files?.[0]`, por lo que aunque el navegador permitiera seleccionar varios, se procesaba solo el primero.
- Esto obligaba al usuario a consolidar manualmente 12 archivos mensuales, justo lo que se quiere evitar por eficiencia y riesgo de error.

Decision:

- Crear `parseAfipExportFiles` como agregador puro sobre el parser existente.
- Mantener compatibilidad con la carga anterior de un solo archivo.
- Enviar desde el wizard todos los archivos seleccionados como `files`.
- Agregar `expectedType` para que la API rechace mezclas de ventas/compras/retenciones en una carga equivocada.
- Permitir multiples archivos tambien en retenciones porque usa el mismo mecanismo y no agrega complejidad.

Archivos modificados:

- `src/domain/ganancias/mappers/afipImporter.ts`.
- `src/domain/ganancias/tests/importer.test.ts`.
- `src/app/api/import/route.ts`.
- `src/app/declaraciones/crear/wizard/page.tsx`.
- `docs/GUIA_PRUEBA_PILOTO.md`.
- `docs/CONTINUAR_AQUI.md`.
- `docs/BACKLOG_PRIORIZADO.md`.
- `docs/ESTADO_FINAL_DESARROLLO.md`.
- `docs/REGISTRO_PROYECTO.md`.

Verificacion:

- TDD rojo confirmado: `importer.test.ts` fallo porque `parseAfipExportFiles` no existia.
- `vitest run src/domain/ganancias/tests/importer.test.ts`: 1 archivo, 6 tests, todo OK.
- `vitest run`: 26 archivos, 92 tests, todo OK.
- `eslint` focalizado sobre importador, test, endpoint y wizard: OK.
- `git diff --check`: OK, solo avisos CRLF habituales.
- `next build --webpack`: OK.
- `tsc --noEmit`: OK.

Pendiente externo:

- Probar en navegador con los 12 archivos reales de ventas y los 12 archivos reales de compras descargados de AFIP.
- Confirmar que los totales compilados coinciden con el portal/Excel de control.

### 2026-06-02 - Fase 1, P10: verificaciones por pantalla y duplicados

Se agregaron controles operativos para que la carga multiarchivo sea segura en uso real.

Hallazgo:

- La carga multiarchivo resolvia el problema de consolidar manualmente 12 meses.
- Faltaba evitar un riesgo nuevo: subir dos veces el mismo mes o repetir comprobantes.
- Tambien faltaba feedback visible por lote para saber cuantos archivos/registros entraron y cuantos se omitieron.

Decision:

- Detectar duplicados importados en el wizard antes de incorporar filas al estado.
- Ventas/compras usan comprobante, CUIT contraparte, fecha e importe como clave detectable.
- Retenciones usan certificado, CUIT agente, fecha e importe.
- Si una fila no tiene comprobante/certificado suficiente, no se bloquea automaticamente para no perder informacion; queda visible para revision manual.
- Mostrar resumen en pantalla con archivos procesados, registros leidos, registros incorporados, duplicados omitidos y advertencias.

Archivos modificados:

- `src/domain/ganancias/presentation/wizardStateTypes.ts`.
- `src/domain/ganancias/tests/wizardStateTypes.test.ts`.
- `src/app/declaraciones/crear/wizard/page.tsx`.
- `docs/GUIA_PRUEBA_PILOTO.md`.
- `docs/CONTINUAR_AQUI.md`.
- `docs/BACKLOG_PRIORIZADO.md`.
- `docs/ESTADO_FINAL_DESARROLLO.md`.
- `docs/REGISTRO_PROYECTO.md`.

Verificacion:

- TDD rojo confirmado: `wizardStateTypes.test.ts` fallo porque `splitWizardImportDuplicates` no existia.
- `vitest run src/domain/ganancias/tests/wizardStateTypes.test.ts`: 1 archivo, 11 tests, todo OK.
- `vitest run`: 26 archivos, 95 tests, todo OK.
- `eslint` focalizado sobre wizard, helper y test: OK.
- `git diff --check`: OK, solo avisos CRLF habituales.
- `next build --webpack`: OK.
- `tsc --noEmit`: OK.

Pendiente externo:

- Validar visualmente con archivos reales que el resumen sea claro.
- Probar repetir una importacion mensual y confirmar que los duplicados se omiten sin duplicar totales.

### 2026-06-06 - Fase 1, P11: auditoria de consistencia contra guia/capturas y duplicaciones de calculo

Se realizo una auditoria puntual sobre los cambios posteriores del proyecto, tomando como referencia la guia PDF aportada por el usuario y las capturas nuevas de Excel.

Hallazgos:

- La guia PDF describe un escenario anterior con ventas por `72.117.989,49`, CMV `64.760.935,00`, amortizacion `203.500,00` y AXI `-429.715,06`.
- Las capturas nuevas del 06/06/2026 describen otro escenario, con ventas `55.188.790,74`, compras CMV `55.516.958,16`, EI `155.496,41`, EF `7.856.322,00`, CMV `47.816.132,57`, utilidad neta `5.449.883,07`, AXI `-225.273,03`, resultado impositivo `5.224.610,04`, patrimonio inicial `-4.520.316,58`, patrimonio cierre `-7.150.516,11` y consumo `10.031.052,72`.
- El test `simulacionUsuario.test.ts` estaba nombrado como si validara capturas actuales, pero contenia datos del escenario anterior.
- El motor descontaba la perdida por baja de bienes de uso, pero el patrimonio comercial de cierre todavia podia conservar ese mismo bien como activo, duplicando economicamente el efecto.
- El wizard calculaba el capital afectado real de cierre con una formula propia que omitía bienes de uso activos.
- El CMV en vivo del wizard usaba todas las compras, no solo las imputables a costo.
- `papel-de-trabajo` e `informe-cliente` mostraban gastos comerciales sumando todas las compras deducibles, incluyendo mercaderia/materia prima ya incluida en CMV.
- `informe-cliente` armaba manualmente el input del motor e ignoraba auxiliares ESP/JVP como efectivo, creditos, pasivos, pasivos personales, justificaciones, AXI dinamico y bajas.
- `papel-de-trabajo` duplicaba calculos de amortizacion/baja en UI.

Decision:

- Mantener la guia PDF como referencia del escenario anterior y crear una prueba separada para las capturas nuevas.
- Extraer helpers de dominio/presentacion para evitar formulas repetidas:
  - `calculateClosingCommercialPatrimony`.
  - `buildFixedAssetDepreciationForPresentation`.
  - `sumDeductibleCostPurchases` / `sumDeductibleNonCostPurchases`.
- Hacer que wizard, papel de trabajo e informe cliente usen los mismos criterios del motor/mapper donde corresponde.
- No tocar vinculacion de base de datos ni ejecutar migraciones, por pedido explicito del usuario.

Archivos modificados/agregados:

- `src/domain/ganancias/tests/simulacionUsuario.test.ts`.
- `src/domain/ganancias/tests/jvpIntegration.test.ts`.
- `src/domain/ganancias/tests/fixedAssetPresentation.test.ts`.
- `src/domain/ganancias/tests/patrimonioComercial.test.ts`.
- `src/domain/ganancias/tests/purchaseBreakdown.test.ts`.
- `src/domain/ganancias/calculations/determinacionImpuesto.ts`.
- `src/domain/ganancias/calculations/patrimonioComercial.ts`.
- `src/domain/ganancias/presentation/fixedAssetPresentation.ts`.
- `src/domain/ganancias/presentation/purchaseBreakdown.ts`.
- `src/app/declaraciones/crear/wizard/page.tsx`.
- `src/app/declaraciones/[id]/papel-de-trabajo/page.tsx`.
- `src/app/declaraciones/[id]/informe-cliente/page.tsx`.
- `docs/CONTINUAR_AQUI.md`.
- `docs/BACKLOG_PRIORIZADO.md`.
- `docs/REGISTRO_PROYECTO.md`.

Verificacion:

- TDD rojo confirmado: `fixedAssetPresentation.test.ts` fallo porque el helper no existia.
- TDD rojo confirmado: `patrimonioComercial.test.ts` fallo porque el helper no existia.
- TDD rojo confirmado: `purchaseBreakdown.test.ts` fallo porque el helper no existia.
- TDD rojo confirmado: `jvpIntegration.test.ts` expuso que un bien dado de baja seguia integrando patrimonio de cierre.
- TDD rojo confirmado: `simulacionUsuario.test.ts` expuso diferencia de coeficiente AXI hasta ajustar el coeficiente exacto de captura.
- `vitest run src/domain/ganancias/tests/fixedAssetPresentation.test.ts src/domain/ganancias/tests/simulacionUsuario.test.ts src/domain/ganancias/tests/jvpIntegration.test.ts src/domain/ganancias/tests/amortizaciones.test.ts`: OK.
- `vitest run src/domain/ganancias/tests/patrimonioComercial.test.ts src/domain/ganancias/tests/simulacionUsuario.test.ts src/domain/ganancias/tests/jvpIntegration.test.ts`: OK.
- `vitest run src/domain/ganancias/tests/purchaseBreakdown.test.ts src/domain/ganancias/tests/simulacionUsuario.test.ts`: OK.
- `tsc --noEmit`: OK.
- `vitest run`: 30 archivos, 103 tests, todo OK.
- `next build --webpack`: OK.
- `eslint` focalizado sobre helpers/tests nuevos: OK.
- `eslint` global: pendiente, falla por deuda amplia preexistente/no abordada en esta unidad (`any` en APIs/paginas, reglas de hooks en pantallas existentes, imports no usados, `require` en seed/test_db).

Pendiente externo:

- Validar visualmente en navegador el wizard, papel de trabajo e informe cliente con la carga real del caso de capturas nuevas.
- Confirmar con el usuario si la guia PDF anterior queda como caso historico de regresion o si debe actualizarse a las capturas nuevas.
- Definir si se abre una unidad separada de saneamiento lint global.

### 2026-06-06 - Fase 1, P13: sincronizacion de saldos iniciales desde AXI

Se analizo la observacion del usuario sobre la ausencia del boton de "Calculo Automatico de Saldos Iniciales" en Paso 1.

Hallazgos:

- El boton ya no debe estar en Paso 1; el flujo vigente lo concentra en Paso 5 > Ajuste por Inflacion (AXI) > "Sugerir desde Contabilidad".
- La pantalla de Paso 1 no explicaba ese cambio, por lo que el usuario podia interpretar que el automatismo habia desaparecido.
- El boton de Paso 5 completaba la grilla AXI, pero no sincronizaba visualmente los campos de Paso 1 (`activoTotalInicio`, `pasivoTotalInicio`, `bienesNoComputablesInicio`).
- La logica inline del boton clasificaba genericamente `Fiscal` como credito fiscal no computable; para las capturas nuevas, "Creditos fiscales" integra el capital afectado/computable de inicio.

Decision:

- Mantener el boton en Paso 5, no reintroducir interruptor en Paso 1.
- Extraer la sugerencia AXI a una funcion testeable en `wizardStateTypes.ts`.
- Hacer que "Sugerir desde Contabilidad" complete la grilla AXI y sincronice tambien los tres saldos iniciales visibles de Paso 1.
- Clasificar creditos fiscales genericos como deudores/creditos computables, salvo conceptos especificos de retenciones, anticipos, saldos a favor o impuesto ley.

Archivos modificados:

- `src/domain/ganancias/presentation/wizardStateTypes.ts`.
- `src/domain/ganancias/tests/wizardStateTypes.test.ts`.
- `src/app/declaraciones/crear/wizard/page.tsx`.
- `docs/CONTINUAR_AQUI.md`.
- `docs/BACKLOG_PRIORIZADO.md`.
- `docs/REGISTRO_PROYECTO.md`.

Verificacion:

- TDD rojo confirmado: `wizardStateTypes.test.ts` fallo porque `buildWizardAxiStaticSuggestion` no existia.
- `vitest run src/domain/ganancias/tests/wizardStateTypes.test.ts`: OK.
- `vitest run src/domain/ganancias/tests/simulacionUsuario.test.ts`: OK.
- `tsc --noEmit`: OK.
- `vitest run`: 30 archivos, 105 tests, todo OK.
- `next build --webpack`: OK.
- `git diff --check`: OK, solo avisos CRLF habituales.

Pendiente externo:

- Validar visualmente en navegador el recorrido Paso 1 > Paso 5 con datos reales.

### 2026-06-06 - Fase 1, P14: legajo profesional de carga PDF e instructivo de carga

Se analizo el uso esperado del boton superior de impresion del wizard. El objetivo definido por el usuario es conservar un soporte profesional de las pantallas de carga y sus valores, no una captura desprolija de la pantalla operativa.

Hallazgos:

- El boton existente ejecutaba `window.print()` directamente sobre el wizard.
- La pantalla interactiva no es un buen soporte documental: depende del paso actual, tiene controles de navegacion y no resume toda la carga.
- La informacion necesaria para el soporte ya existe en memoria del wizard, incluso antes de guardar la DDJJ.
- Faltaba un instructivo unico de carga para ordenar criterios y evitar duplicaciones.

Decision:

- Mantener el flujo de impresion del navegador para guardar como PDF, sin agregar dependencias nuevas.
- Reemplazar el contenido impreso por un reporte print-only profesional.
- Crear un helper testeable (`buildWizardLoadReport`) que arma metadatos, metricas, secciones y advertencias.
- Crear un instructivo operativo detallado para uso del estudio.

Archivos modificados/agregados:

- `src/domain/ganancias/presentation/wizardLoadReport.ts`.
- `src/domain/ganancias/tests/wizardLoadReport.test.ts`.
- `src/app/declaraciones/crear/wizard/WizardLoadReportPrint.tsx`.
- `src/app/declaraciones/crear/wizard/page.tsx`.
- `docs/INSTRUCTIVO_CARGA_DDJJ_GANANCIAS.md`.
- `docs/superpowers/plans/2026-06-06-legajo-carga-pdf.md`.
- `docs/CONTINUAR_AQUI.md`.
- `docs/BACKLOG_PRIORIZADO.md`.
- `docs/REGISTRO_PROYECTO.md`.

Verificacion:

- TDD rojo confirmado: `wizardLoadReport.test.ts` fallo porque `wizardLoadReport` no existia.
- `vitest run src/domain/ganancias/tests/wizardLoadReport.test.ts`: OK.
- `vitest run src/domain/ganancias/tests/wizardLoadReport.test.ts src/domain/ganancias/tests/wizardStateTypes.test.ts`: OK.
- `tsc --noEmit`: OK.
- `vitest run`: 31 archivos, 106 tests, todo OK.
- `next build --webpack`: OK.
- `git diff --check`: OK, solo avisos CRLF habituales.
- Lint focalizado de archivos nuevos (`wizardLoadReport.ts`, `wizardLoadReport.test.ts`, `WizardLoadReportPrint.tsx`): OK.

Pendiente externo:

- Validar visualmente el PDF cuando el navegador este disponible.

### 2026-06-08 - Parentesis: instructivo de carga del caso Excel/capturas

Se hizo una pausa antes de continuar con correcciones para preparar un instructivo didactico de carga usando el caso numerico de control.

Solicitud del usuario:

- Explicar precisamente donde cargar cada valor.
- Incluir el valor numerico.
- Permitir que una persona de carga pueda reproducir el caso sin depender de reconstruir toda la conversacion.
- Usar el Excel ubicado en `C:\Dev\Ganancia\Persona Fisica\DJ Ganancias 2025 - Tercera Categoria.xlsx`.

Hallazgos:

- El archivo fisico en esa ruta se pudo abrir y contiene las hojas esperadas (`IG 25`, `JVP`, `ER`, `ESP`, `Ventas`, `Compras`, `Patrimonio personal`, auxiliares, etc.).
- Al leerlo desde el proyecto, el archivo aparece como plantilla/base sin datos operativos: las hojas de resumen y detalle devuelven importes en cero.
- Los valores reales de validacion ya estaban representados en `src/domain/ganancias/tests/simulacionUsuario.test.ts`, alineados con las capturas nuevas del 06/06/2026.
- Se detecto y se dejo explicitado que no debe mezclarse este caso con el escenario anterior de AXI `-429.715,06`.

Decision:

- Crear un instructivo especifico de caso patron, separado del instructivo general de carga.
- Tomar como fuente numerica las capturas/test y dejar nota sobre el Excel fisico en blanco.
- Indicar para cada paso del wizard que se carga, que se deja en cero y que no se carga porque la app lo calcula.
- Documentar los controles esperados con centavos Excel y redondeo esperado de la app.

Archivo creado:

- `docs/INSTRUCTIVO_CARGA_CASO_EXCEL_2025.md`.

Archivos actualizados:

- `docs/CONTINUAR_AQUI.md`.
- `docs/BACKLOG_PRIORIZADO.md`.
- `docs/REGISTRO_PROYECTO.md`.

Uso posterior:

- Este instructivo queda como entrada directa para P19 - Validacion real contra Excel en Docker.
- Cuando se ejecute P19, cargar el caso en `npm run dev:testdb`, guardar, reabrir y comparar wizard, papel de trabajo, informe cliente y legajo PDF.

### 2026-06-21 - P32, Checkpoint 2: Libro fiscal mensual base aislado

Solicitud y limite operativo:

- Se continua el modulo IVA + IIBB como complemento de Ganancias.
- El usuario pidio expresamente no tocar `main`, Produccion Vercel, Hostinger ni la base productiva hasta contar con pruebas completas en una rama independiente.
- El trabajo permanece en `feature/iva-iibb-mensual-core`, worktree `C:\Dev\Ganancia\_worktrees\ganancias-jaba-iva-iibb-mensual`.

Hallazgos y resguardo de Preview:

- Los previews fallidos vistos en Vercel no provienen de cambios en `main`: `DATABASE_URL` esta alcanzando Preview y apunta a la DB Hostinger productiva.
- Se reprodujo la guarda `check-deployment-db-safety` de forma local: Preview con esa URL queda bloqueado; Preview sin `DATABASE_URL` queda permitido.
- La accion externa pendiente es limitar `DATABASE_URL` a `Production` en Vercel, o crear una DB staging distinta. La guarda no debe desactivarse.

Implementacion local:

- Se agrego el libro fiscal paralelo y versionado: perfiles fiscales, actividades, jurisdicciones, periodos mensuales, comprobantes y lineas IVA, creditos, liquidaciones IVA/IIBB, coeficientes CM05 y snapshots anuales hacia Ganancias.
- Se mantuvieron `TaxReturn`, `SalesInvoice` y `PurchaseInvoice` sin cambios destructivos ni nueva vinculacion mensual.
- Se genero `20260622002033_add_fiscal_monthly_ledger` y se aplico solo en Docker `3318`.
- Prisma ahora usa `ganancias_jaba_test_shadow` para generar migraciones. La URL principal y shadow se validan como `127.0.0.1` con credenciales Docker; no pueden derivar a Hostinger por accidente.
- El seeder local agrega exclusivamente datos ficticios: un perfil ARBA local y un CM regimen general con coeficientes `0,40 + 0,60 = 1,00`.
- Se corrigio P19 para tomar el puerto seguro configurable del worktree en lugar de asumir `3317`.
- Se regenero el cliente Prisma versionado para incluir los nuevos modelos.

TDD y verificacion:

- Rojo confirmado: falta de `resolveTestShadowDatabaseUrl`, luego pruebas verdes de configuracion Docker.
- Rojo confirmado: inexistencia de perfiles fiscales semilla; luego seed Docker y prueba de lectura verdes.
- Rojo confirmado: P19 esperaba `3317` y recibia `3318`; luego regresion Excel/capturas verde en `3318`.
- `fiscalLedgerSchemaArchitecture.test.ts`: 5 pruebas verdes.
- `testDbConfig.test.ts` y `testDbMigrationSafetyConfig.test.ts`: 4 pruebas verdes.
- `fiscalLedgerSeedDocker.test.ts`: 1 prueba verde contra Docker.
- `prisma validate`: schema valido.
- `tsc --noEmit`: verde despues de ajustar el contrato tipado del helper de entorno.

No se realizo:

- No se hizo push ni deploy de este checkpoint.
- No se modifico `main`, Vercel, Hostinger ni datos productivos.
- No se implementaron todavia importacion mensual, API, motor IVA/IIBB ni pantallas.

Siguiente paso:

- Task 3 del plan `docs/superpowers/plans/2026-06-20-modulo-iva-iibb-mensual.md`: importador mensual AFIP/ARCA por alicuota, clave deterministica y deduplicacion, conservando intacto el importador anual de Ganancias.

### 2026-06-21 - P32, Checkpoint 3: Importacion mensual AFIP/ARCA por alicuota

Objetivo:

- Reutilizar la lectura segura de CSV Latin-1/XLSX de AFIP sin mover ni alterar la importacion anual vigente.
- Conservar el detalle IVA por alicuota para la liquidacion mensual y deduplicar reimportaciones sin depender del nombre del archivo.

Implementacion:

- Se expusieron de forma reutilizable el lector de filas AFIP, la conversion decimal argentina y el parser de fechas ya probados por el importador anual.
- Se agrego `afipFiscalLedgerImporter.ts`, que detecta ventas/compras, genera lineas `TAXED`, `EXEMPT` o `NON_TAXED`, conserva las alicuotas 0%, 2,5%, 5%, 10,5%, 21% y 27%, y marca el credito IVA de compras como computable.
- Se agrego `documentKey.ts`: la clave usa CUIT del titular, direccion, fecha, tipo, numero y CUIT contraparte; excluye el nombre de archivo para que una copia del mismo CSV no se duplique.
- Las facturas sin IVA discriminado se conservan como una linea `NON_TAXED` para no perder el importe y poder revisarlas luego.

TDD y verificacion:

- Rojo confirmado: los modulos mensual y de clave no existian.
- Verde: se conserva una venta con bases/IVA separadas de 10,5% y 21%, y una compra con credito computable 21%.
- Una regresion inicial de `Mis Retenciones` revelo una referencia interna al nombre previo del parser decimal; se corrigio de forma puntual y las pruebas anuales volvieron a pasar.
- `afipFiscalLedgerImporter.test.ts`, `documentKey.test.ts` e `importer.test.ts`: 14 pruebas verdes.
- `tsc --noEmit`: verde.

Siguiente paso:

- Task 4: validacion de perfiles, persistencia idempotente y API de periodos fiscales mensuales contra Docker `3318`.

### 2026-06-21 - P32, Checkpoint 4: API y tablero inicial de periodos IVA/IIBB

Objetivo:

- Llegar a una pantalla local de prueba que permita crear y visualizar los doce periodos mensuales de un cliente, sin impactar Ganancias anual ni Produccion.

Implementacion:

- Se agrego `createFiscalPeriodSchema`, que admite exclusivamente anios operativos y meses calendario.
- `resolveActiveFiscalProfile` fija el perfil fiscal que estaba vigente al cierre de cada mes. No se permite crear un `FiscalPeriod` sin esa referencia versionada.
- Se agrego `GET/POST /api/clientes/[id]/fiscal-periods`; el listado devuelve cliente, periodos, perfil, ultimo estado IVA/IIBB y cantidad de comprobantes. El alta audita la operacion y protege el unico `[cliente, anio, mes]`.
- Se agrego el tablero de doce meses y el acceso desde Clientes. Los periodos inexistentes se pueden crear; los creados exponen los controles reales hoy disponibles y no simulan importacion ni liquidaciones que aun no existen.

TDD y verificacion:

- Rojo confirmado para contratos inexistentes de solicitud, perfil vigente y estado de tablero; verde posterior con 6 pruebas nuevas.
- Suite completa: 213 pruebas aprobadas, 5 omitidas; `tsc --noEmit` y `prisma validate` verdes.
- El navegador integrado rechazo navegar a `localhost:3000` por su politica de seguridad. No se intento eludir esa limitacion; la prueba visual manual queda registrada.

No se realizo:

- No se modifico `main`, no se hizo push, deploy ni Preview.
- No se consulto ni modifico Hostinger/Vercel/Produccion.
- No se toco `TaxReturn`, `SalesInvoice` ni `PurchaseInvoice`.

Siguiente paso:

- Detail wizard por periodo: importacion AFIP/ARCA, resumen por alicuota, persistencia idempotente y liquidacion IVA inicial sobre Docker 3318.

### 2026-06-23 - P32, piloto IVA AFIP mayo 2026: contrato funcional y resguardo de integracion

Evidencia revisada localmente, no incorporada al repositorio:

- `C:\Users\mauri\Downloads\dudas\comprobantes_compras.csv`: 39 filas, CSV AFIP con `;`, coma decimal y columnas por alicuota.
- `C:\Users\mauri\Downloads\dudas\comprobantes_ventas.csv`: 48 filas, mismo formato AFIP.
- `C:\Users\mauri\Downloads\dudas\iva.jpeg`: cotejo de Portal IVA / F2002.

Resultado reproducido a partir de las columnas por alicuota y las notas de credito:

- Debito fiscal: `9.090.888,61`.
- Credito fiscal: `2.630.946,77`.
- Saldo tecnico anterior: `6.078.277,49`.
- Saldo tecnico ARCA: `381.664,35`.
- Libre disponibilidad anterior: `167.342,88`.
- Retenciones, percepciones y pagos a cuenta IVA: `34.590,12`.
- Saldo final de impuesto a favor de ARCA: `179.731,35`.

Decisiones operativas cerradas:

- Se importan ambos CSV a un `FiscalPeriod` del cliente y mes elegidos; cada fila se conserva aun si el usuario la excluye del calculo.
- Solo las filas `includedInSettlement=true` forman debito, credito y bases para IIBB/Ganancias.
- Las NC se computan en el lado opuesto, segun F2002: compra NC suma debito; venta NC suma credito.
- Debito, credito y saldo final oficiales deben estar presentes y coincidir para cerrar IVA. Una diferencia puede guardarse solo como `IN_REVIEW` con motivo; nunca habilita Ganancias.
- Los arrastres tecnico y de libre disponibilidad se toman solo del ultimo IVA `CLOSED` del mes anterior o de una excepcion auditada.
- Ganancias no recibe debito/credito IVA como ingreso/gasto: recibe un snapshot de operaciones netas clasificadas, IVA no computable e IIBB cerrado/determinado conforme al plan maestro.

Resguardo:

- Se confirma que el trabajo sigue en worktree enlazado y rama `feature/iva-iibb-mensual-core`.
- No se modifica `main`, Hostinger, Vercel, datos productivos ni DDJJ anuales durante este piloto.
- Los CSV reales no se subiran a Git; se creara una regresion anonimizada con los mismos importes/tipos relevantes.

Plan creado:

- `docs/superpowers/plans/2026-06-23-piloto-iva-afip-mayo-2026.md`.

Bloqueo actual antes de prueba funcional:

- Agregar migracion de `FiscalDocument.includedInSettlement`, regenerar Prisma y recuperar `tsc`/build verdes.
- Corregir cierre parcial, normalizacion argentina de importes y arrastres desde estados no cerrados.

---

## 2026-06-24 — Flujo completo de liquidacion de IVA (subir → revisar → cotejar → guardar → anual)

Se construyo el flujo punta a punta que pidio el contador, sobre el motor de IVA ya validado al peso contra AFIP.

Modelo / schema:

- `FiscalDocument.includedInSettlement Boolean @default(true)`: bandera de seleccion de filas. El comprobante excluido queda en el libro (trazabilidad) pero NO entra al calculo. Requiere migracion Prisma en Windows.

Endpoints (todos bajo `/api/clientes/[id]/fiscal-periods/[periodId]`):

- `GET documents`: lista los comprobantes del periodo (ventas y compras) con su IVA y estado de inclusion, para la grilla de revision.
- `PATCH documents/selection`: marca/desmarca filas en lote (defiende ids ajenos al periodo).
- `GET settlement`: recalcula IVA solo con las filas `includedInSettlement=true`, aplicando arrastre tecnico y libre disponibilidad del ultimo IVA `CLOSED` del mes anterior. Pasa `voucherType` para el criterio NC del F2002.
- `POST settlement/save`: recalcula del lado servidor (no confia en el cliente), coteja contra los valores oficiales de AFIP y persiste. Coincide → `CLOSED` (cotejada, habilita Ganancias). Difiere y `forceSave=false` → 409 con el detalle de diferencias. Difiere y `forceSave=true` → `IN_REVIEW` con observacion. Audita el evento.

Persistencia (`persistence/fiscalSettlementPersistence.ts`):

- `persistVatSettlement`: versiona (no pisa), guarda totales + lineas de desglose por alicuota + valores oficiales del cotejo + `filedAt` al cerrar.
- `checkVatCotejo`: concilia debito/credito/saldo contra AFIP con tolerancia de 1 centavo.
- `persistGrossIncomeSettlement`: idem para IIBB.

Compuerta mensual → anual (`fiscalLedger/annualConsolidation.ts`):

- `selectCotejadoPeriodsForAnnual`: regla de negocio dura — SOLO los meses con IVA `CLOSED` alimentan la liquidacion anual de Ganancias. Borrador, en revision o faltante quedan bloqueados con motivo; el año solo consolida con los 12 meses cotejados.

Pantalla (`clientes/[id]/periodos-fiscales/[periodId]/liquidacion-iva/`):

- 3 pasos: (1) subir CSV de compras y ventas, (2) grilla con tilde por fila + "todos" + subtotal de IVA incluido en vivo, (3) totales estilo F2002 + campos de cotejo de AFIP con verificacion en vivo + guardar. La tarjeta del mes en el dashboard ahora enlaza a "Liquidar IVA".

Normalizacion de importes:

- Cotejo acepta formato argentino (`9.090.888,61`) y plano; `toPlain`/`norm` unificados en validacion zod y en el guardado (se corrigio un bug que dejaba puntos de miles antes de Decimal).

Verificacion (sandbox, logica replicada por truncado del espejo):

- 15/15 aserciones del flujo IVA (NC a lado contrario, libre disponibilidad, cotejo, versionado/estado).
- 10/10 aserciones de la compuerta anual (CLOSED usable; DRAFT/IN_REVIEW/faltante bloquean).
- Tests vitest agregados: `settlementBuilders.test.ts` (regresion NC + libre disp.), `fiscalSettlementPersistence.test.ts`, `annualConsolidation.test.ts` (compuerta). Pendiente correrlos en Windows con node_modules.

Pendiente para produccion:

- Migracion Prisma de `includedInSettlement` + `prisma generate` + `tsc`/build en Windows.
- Reader DB de consolidacion anual (toma settlements `CLOSED` + imputacion por comprobante) y heuristica de imputacion inferida.
- Cargar alicuotas de IIBB por jurisdiccion en el editor de perfil.

### Correcciones tras revision de codigo (2026-06-24)

Revision externa marco 7 hallazgos. Estado y accion:

- #1 No compila sin migracion Prisma de `includedInSettlement`: valido. Bloqueo principal; se resuelve en Windows con `prisma migrate dev` + `generate`.
- #2 Cotejo parcial podia cerrar (CLOSED) cargando solo 1 importe: CORREGIDO. `checkVatCotejo` ahora expone `complete`/`missing`; `matches` exige los tres importes (debito, credito, saldo) presentes y coincidentes. El save route devuelve 409 distinto para "incompleto" (no permite forzar) vs "con diferencias" (permite `IN_REVIEW`).
- #3 Miles argentinos (`9.090.888,61`) rompian el guardado: YA estaba corregido antes de la revision (`toPlain`/`norm` sacan puntos de miles). El revisor miro estado previo.
- #4 Arrastre tomaba la ultima version aunque fuera borrador/observada: CORREGIDO. GET y save filtran `where:{status:'CLOSED'}` en los arrastres tecnico y de libre disponibilidad.
- #5 IIBB devuelve 0 (alicuotas en cero): valido/aceptado. Es andamiaje; falta el editor de parametros por jurisdiccion. No se presenta como IIBB funcional.
- #6 La pantalla decia "disponible para Ganancias" aun en DRAFT/IN_REVIEW: CORREGIDO. El mensaje ahora es condicional a `CLOSED`; si no, aclara que todavia NO alimenta Ganancias.
- #7 Versionado sin transaccion ante doble envio: CORREGIDO. `persistVatSettlement` reintenta (hasta 4) ante violacion de unicidad P2002 recomputando la version.

Verificacion sandbox de los fixes: 11/11 aserciones (cotejo completo vs parcial, status CLOSED/IN_REVIEW, reintento ante P2002). Tests vitest ampliados en `fiscalSettlementPersistence.test.ts`.

### Reader de consolidacion anual a Ganancias (2026-06-24)

Se conecto el eslabon mensual → anual (paso 6 del orden recomendado), a nivel dominio + API.

- `fiscalLedger/gainsImputation.ts`: heuristica de imputacion inferida. VENTAS se clasifican con certeza (gravada vs exenta, sin revision); COMPRAS van a `DEDUCTIBLE_EXPENSE` por default con `needsReview=true` (AFIP no informa mercaderia vs gasto vs bien de uso; lo confirma el contador). Convencion de signos: las NC con neto negativo reducen la categoria.
- `fiscalLedger/annualConsolidationAssembler.ts`: ensamblador PURO. Aplica la compuerta (solo meses IVA `CLOSED`), respeta imputaciones persistidas confirmadas o infiere, suma el IIBB `CLOSED` del mes como gasto deducible, y consolida con `consolidateAnnualFiscalLedger`. Reporta comprobantes pendientes de revision por mes.
- `persistence/annualConsolidationRead.ts`: unica capa Prisma; lee 12 periodos (estado IVA, IIBB CLOSED, comprobantes incluidos con sus imputaciones) y delega en el ensamblador. Incluye serializador JSON.
- `app/api/clientes/[id]/consolidacion-anual/route.ts`: `GET ...?year=AAAA` devuelve compuerta, totales por categoria y pendientes de revision.

Verificacion sandbox: 17/17 aserciones (inferencia ventas/compras, compuerta CLOSED, imputacion persistida respetada, IIBB sumado, NC reduce ventas, consolidacion null sin meses cotejados). Tests vitest: `annualConsolidationAssembler.test.ts`.

Pendiente del tramo anual:

- ~~Persistir el snapshot~~ HECHO (ver abajo). Falta conectar al `TaxReturn`/wizard de Ganancias (inyectar el snapshot en la DDJJ anual).
- Pantalla de revision de imputacion de compras (confirmar mercaderia/gasto/bien de uso) y de la consolidacion anual.

### Snapshot durable de consolidacion anual (2026-06-24)

- `persistence/annualConsolidationSnapshot.ts`: `persistAnnualConsolidationSnapshot` guarda el snapshot en `AnnualFiscalConsolidationSnapshot/Period` ligado a un `TaxReturn`, con su `sourceHash`. Reglas: solo persiste si hay al menos un mes CLOSED; CONFIRMA (`confirmedAt`) unicamente si el año esta completo y firme; idempotente por `sourceHash` (no duplica). `isSnapshotStale` detecta si la base mensual cambio (recotejo/imputacion) y el snapshot quedo obsoleto antes de usarse en la DDJJ.
- Verificacion sandbox: 10/10 aserciones (confirma año completo, no confirma con mes faltante, idempotencia, error sin meses CLOSED, deteccion de obsolescencia). Test vitest: `annualConsolidationSnapshot.test.ts`.

### Nota sobre el commit

El worktree tiene `.git` con gitdir en ruta Windows; git no corre desde el sandbox Linux (garantiza que no se toco `main` desde aqui). El commit se hace en Windows siguiendo `docs/COMMIT_FLUJO_IVA_ANUAL.md` (migracion → build/test verdes → commit sin push).

---

## CIERRE DE SESION — 2026-06-24

### Donde quedamos (estado actual, verificado)

- **Commit + push hechos.** Rama `feature/iva-iibb-mensual-core`, commit `7a133bc` (amend incluyo el cliente Prisma regenerado). Pusheado a `origin`. `main` y produccion INTACTOS.
- **Build verde:** `npm run build` → `✓ Finished TypeScript` sin errores. Las 4 rutas nuevas compilan.
- **Tests verdes:** 269 passed | 5 skipped (vitest, en Windows).
- **Motor IVA validado al peso** contra el F2002 real de AFIP (debito 9.090.888,61 / credito 2.630.946,77 / saldo 179.731,35).

### Que se construyo (todo en esta rama, nada en produccion)

1. **Flujo completo de liquidacion de IVA**: subir CSV AFIP (compras+ventas) → grilla con seleccion de filas (`includedInSettlement`) → calcular totales estilo F2002 → cotejar contra AFIP (exige los 3 importes) → guardar (CLOSED si coteja, IN_REVIEW si difiere). Pantalla en `clientes/[id]/periodos-fiscales/[periodId]/liquidacion-iva/`.
2. **Endpoints**: `documents` (GET lista + POST import), `documents/selection` (PATCH), `settlement` (GET preview), `settlement/save` (POST con cotejo y versionado seguro).
3. **Persistencia**: `fiscalSettlementPersistence.ts` (versionado con reintento P2002, cotejo completo, lineas por alicuota).
4. **Correcciones de la revision de codigo** (7 hallazgos): #2 cotejo parcial no cierra, #4 arrastre solo desde CLOSED, #6 mensaje condicional, #7 versionado con reintento. #3 ya estaba. #1 (migracion) y #5 (IIBB params) quedaron como pendientes.
5. **Cadena mensual → anual**: `gainsImputation.ts` (imputacion inferida), `annualConsolidationAssembler.ts` (compuerta CLOSED + consolidacion), `annualConsolidationRead.ts` (lector DB + API `GET /api/clientes/[id]/consolidacion-anual?year=`), `annualConsolidationSnapshot.ts` (snapshot durable con sourceHash).
6. **Migracion** `20260624120000_add_included_in_settlement` creada a mano (ADD COLUMN, prod-safe via `migrate deploy`).

### Que falta (pendientes)

**Del lado del usuario (Windows), cuando retome:**
- Aplicar la columna en la base: `npx prisma migrate deploy` con `.env` apuntando a la base correcta. **NUNCA `migrate dev` contra produccion.** El worktree no tiene `.env` (no se comparte entre worktrees): copiar el `.env` con `DATABASE_URL`.
- Revisar `src/app/page.tsx` (quedo modificado sin commitear, NO lo toque yo esta sesion): `git --no-pager diff src/app/page.tsx`. Decidir si entra o se descarta.
- Probar el flujo end-to-end en la app con los CSV reales contra la DB antes de pensar en merge a `main`.

**Del lado del desarrollo (proxima sesion):**
- **INYECCION AL WIZARD DE GANANCIAS (tramo en curso, NO empezado a codear).** Es el unico tramo que toca codigo compartido con produccion, por eso se encara con cuidado. Exploracion ya hecha:
  - `TaxReturn` (schema linea 267) YA tiene la relacion `annualFiscalConsolidations AnnualFiscalConsolidationSnapshot[]` y los inputs transaccionales `sales` (SalesInvoice), `purchases` (PurchaseInvoice), `fixedAssets`, `inventory`.
  - La determinacion anual vive en `src/domain/ganancias/calculations/determinacionImpuesto.ts`.
  - **Decision de diseño pendiente (clave):** como inyectar el snapshot sin romper la determinacion validada. Dos caminos: (a) el snapshot PRE-LLENA registros transaccionales (SalesInvoice/PurchaseInvoice) que el usuario revisa/edita; (b) la determinacion lee opcionalmente los totales del snapshot como fuente alternativa. Mi recomendacion preliminar: (a) con confirmacion, para no tocar la matematica de la determinacion. **Falta leer `determinacionImpuesto.ts` y el wizard a fondo antes de decidir/codear.**
- Pendientes menores arrastrados: cargar alicuotas de IIBB por jurisdiccion en el editor de perfil (#5); pantalla de revision de imputacion de compras (confirmar mercaderia/gasto/bien de uso).

### Por donde seguir (orden recomendado)

1. Usuario: `migrate deploy` + resolver `page.tsx` + prueba end-to-end con CSV reales.
2. Desarrollo: leer `determinacionImpuesto.ts` + wizard, decidir el camino (a)/(b) de inyeccion, e implementar de forma ADITIVA (paso opt-in "importar del modulo mensual" que pre-llena y el usuario confirma). Validar que la determinacion del caso Mariano sigue dando identico despues del cambio.
3. Recien con todo verde y validado: considerar merge a `main`.

### Recordatorios de seguridad vigentes

- Rotar credenciales expuestas durante el agujero de middleware (AUTH_PASSWORD, AUTH_SECRET, password de DB).
- No mergear a `main` ni tocar produccion hasta validar el flujo end-to-end.
- `migrate dev` jamas contra prod; usar `migrate deploy`.

---

## Retenciones y percepciones de IVA (2026-06-24, sesion 2)

Carga del archivo de AFIP de retenciones/percepciones para descontar del saldo de IVA (Art. 24, 2º párr.).
El MOTOR ya hacia el calculo (validado al peso: aplico ret 34.590,12 + libre disp. anterior 167.342,88
→ saldo 179.731,35). Lo que se agrego es la INGESTA del archivo + la UI.

### Formato del archivo AFIP (clave para no re-investigar)

Es **un solo CSV** (`<cuit>_IMP_PER_RET_<fecha>.csv`) con retenciones Y percepciones mezcladas:
- Separador **coma**. Importe **entrecomillado con decimal coma** (`"24297,52"`), puede ser **negativo** (NC).
- Algunos campos con **apóstrofo de Excel** (`'2026002188`) que se elimina.
- Columnas: `CUIT Agente`, `Impuesto`, `Regimen`, `Fecha Ret./Perc.`(DD/MM/YYYY), `Numero Certificado`,
  `Descripcion Operacion`(RETENCION|PERCEPCION), `Importe Ret./Perc.`, `Numero Comprobante`,
  `Fecha Comprobante`, `Descripcion Comprobante`, `Fecha Ingreso`, `Codigo de Seguridad`.
- **`Impuesto` = 767 → IVA.** Otros códigos (217 Ganancias, etc.) NO aplican contra IVA.
- Encoding Latin-1.

**Variante de formato (importante):** si el archivo se abre y se guarda en Excel, cada fila puede
quedar ENVUELTA entera entre comillas con las comillas internas duplicadas
(`"30710278071,767,...,""24297,52"",..."`). El parser detecta esto (las filas normales empiezan con
el CUIT, nunca con comilla), desenvuelve y des-duplica antes de parsear (`unwrapQuotedRow`). Sin esto,
toda la fila se leía como un solo campo y NO se cargaba nada. Además, se validan fechas inexistentes
(p. ej. 29/02 en año no bisiesto): dan error claro de "fecha inválida" en vez de imputarse mal.

### Decisiones del usuario (cerradas)

- **Solo IVA (767)** entra a este módulo; otros impuestos se ignoran con aviso.
- Imputación **por `Fecha Ret./Perc.` validando el mes** del período; las de otro mes quedan fuera (no se cargan).
- **Grilla con tilde por fila** (igual que comprobantes) + subtotales retenciones/percepciones + cotejo.

### Mecánica (la respeta el motor, ya validado)

- Saldo técnico del período = débito − crédito − saldo técnico a favor anterior. Si da a favor, ARRASTRA como saldo técnico (separado).
- Contra el impuesto técnico a ingresar se aplican, juntos, la **libre disponibilidad anterior** + las **ret/perc del período**.
- Si hay saldo a pagar → se descuentan. Si NO hay (o sobran) → el excedente queda como **saldo de libre disponibilidad** que arrastra.
- Acumulación y uso sin doble cómputo: cada mes guarda su `freeAvailabilityBalance` neto; el mes siguiente lee ese neto (solo de liquidaciones CLOSED).

### Implementado

- **Schema**: `TaxCreditRecord.includedInSettlement` (aditivo). Migración `20260624140000_add_taxcredit_included_in_settlement`.
- **Parser** `mappers/afipTaxCreditImporter.ts`: CSV coma + decimal coma + apóstrofo + negativos; filtra 767; mapea RETENCION→WITHHOLDING, PERCEPCION→PERCEPTION; valida mes; clave de idempotencia. **Validado contra el archivo REAL**: 6 ret = 335.012,48 / 11 perc = 8.797,98 / neto 343.810,46 (10/10 aserciones) + tests vitest.
- **Persistencia** `persistence/taxCreditPersistence.ts` (idempotente por creditKey).
- **Endpoints**: `tax-credits` (GET lista + POST import), `tax-credits/selection` (PATCH).
- **Settlement**: GET y save filtran `includedInSettlement` en taxCredits; GET expone subtotales (retenciones/percepciones) para cotejo.
- **UI**: sección "Paso 2b — Retenciones y percepciones" en la pantalla de IVA (subir archivo + grilla con selección + subtotales). El panel de totales ya muestra "percep./retenc. aplicadas", "saldo a pagar" y "libre disponibilidad (arrastra)".

### REQUISITO antes de compilar (campo nuevo en Prisma)

```powershell
npx prisma generate    # OBLIGATORIO: las rutas usan TaxCreditRecord.includedInSettlement
npm run build
npx vitest run         # +5 tests nuevos (afipTaxCreditImporter)
```

Aplicar en base: `npx prisma migrate deploy` (ahora son varias migraciones nuevas acumuladas).

### Pendiente

- Probar end-to-end: subir el archivo real de ret/perc en la pantalla de IVA y verificar que el saldo a pagar baja y/o queda libre disponibilidad.
- (Opcional) cotejo dedicado del total de ret/perc contra AFIP en la pantalla.

### Validacion en vivo OK (2026-06-24)

Probado en la app contra base de prueba: mayo 2026, debito 1.151.226,93 / credito 631.384,36 /
ret-perc aplicadas 343.810,46 / saldo a pagar 176.032,11 — coincidio con AFIP y guardo CLOSED v1.
Aprendizaje operativo: ante cambios de schema, correr SIEMPRE `prisma generate` (cliente) **y**
`prisma migrate deploy` (base). Si falta el deploy, la app tira "column X does not exist".

### Reload de liquidacion guardada + Reporte de avance anual (2026-06-24, sesion 2)

Dos pedidos del usuario, ambos resueltos:

1. **Volver a un mes cerrado muestra lo guardado** (antes obligaba a recalcular y recotejar a mano).
   - `GET .../settlement/saved`: devuelve la ultima VatSettlement persistida del periodo (estado, version, montos, cotejo, lineas).
   - Pantalla IVA: al montar carga lo guardado; si existe, muestra el panel `SavedSettlementPanel` (estado, debito/credito/saldo/libre disp., cotejo) y oculta los pasos de carga. Boton "Reliquidar / Modificar" reabre el flujo (pre-llena el saldo oficial). Al guardar, refresca el panel.

2. **Reporte de avance anual "a hoy"** que impacta la liquidacion anual.
   - Aprovecha el API que ya existia (`GET /api/clientes/[id]/consolidacion-anual?year=`), que aplica la COMPUERTA (solo meses IVA CLOSED) y agrega netos por categoria.
   - Nueva pantalla `clientes/[id]/consolidacion-anual` (`AnnualProgressReport`): muestra que meses estan cotejados (verde) vs pendientes, el acumulado del ejercicio por categoria (ventas grav./exentas, mercaderia, gastos, bienes de uso, IIBB, IVA no computable), un **margen bruto PROVISORIO** (orientativo, NO el impuesto final) y el detalle por mes. Avisa de compras con imputacion pendiente de confirmar.
   - Acceso desde el dashboard mensual (boton "Reporte anual").

Como impacta el flujo completo: cada mes que el contador cierra (IVA cotejado) suma automaticamente al
reporte anual; cuando estan los 12, el año esta "listo para liquidar" y se inyecta al wizard con un boton
(ver tramo "Inyeccion al wizard"). Mes a mes se va viendo como va el cliente sin rehacer nada.

### REQUISITO de este tramo

No hay cambios de schema (solo lectura + UI), asi que **no** hace falta `prisma generate` ni migracion.
Solo `npm run build` + `npx vitest run` antes de commitear.

---

## IIBB liquidable: alicuotas + Convenio Multilateral (2026-06-24, sesion 2)

El motor de IIBB ya existia (8 tests) pero el settlement le pasaba alicuotas en 0 (devolvia 0). Se cerro:
ahora el perfil guarda alicuotas por jurisdiccion y, para CM, los coeficientes unificados (CM05).

- **Schema**: `ClientTaxJurisdiction.taxRate` (Decimal 8,6, nullable). Migracion `20260624150000_add_jurisdiction_tax_rate`.
- **Settlement** (`GET .../settlement`): arma las jurisdicciones con la alicuota real del perfil y, si el
  regimen es Convenio Multilateral (CM_REGIMEN_GENERAL/ESPECIAL), con el coeficiente unificado de la
  `ConventionCoefficientVersion` del año. Avisa de jurisdicciones sin alicuota o sin coeficiente.
  Motor: `assignedBase = base × coef` (CM) o `base` (local), `determinedTax = assignedBase × alicuota`.
- **Endpoints** `GET/PUT /api/clientes/[id]/iibb-config`: leen/guardan alicuotas por jurisdiccion y
  coeficientes CM por año. El PUT valida que los coeficientes CM sumen 1 (tolerancia 0.0001) y hace
  upsert (jurisdicciones + ConventionCoefficientVersion/Line). Alicuota como fraccion (0.05 = 5%).
- **Pantalla** `clientes/[id]/iibb-config` (`IibbConfigEditor`): grilla de jurisdicciones (codigo,
  inscripcion, alicuota en %, activa) + columna de coeficiente unificado solo en CM, con suma en vivo
  que debe dar 1. Acceso desde el dashboard mensual ("Config. IIBB").
- **Tests**: settlementBuilders gana 2 casos (CM reparte por coeficiente y aplica alicuota; avisa si no
  suman 1). Verificado el calculo: 902 → 650.000×5%=32.500; total 46.500.

Convencion: alicuota se ingresa en % en la UI y se guarda como fraccion. CM05 se ingresa como decimal
(0.6500) y debe sumar 1. income/expense coefficient se igualan al unificado (el calculo usa el unificado).

### REQUISITO antes de compilar/usar (campo nuevo en Prisma)

```powershell
npx prisma generate          # OBLIGATORIO: el settlement y la config usan ClientTaxJurisdiction.taxRate
npm run build
npx vitest run               # +2 tests CM en settlementBuilders
npx prisma migrate deploy    # aplica 20260624150000 a la base
```

### Pendiente IIBB

- Alicuota por ACTIVIDAD dentro de una jurisdiccion (hoy una alicuota por jurisdiccion).
- ~~Persistir la liquidacion de IIBB~~ HECHO (ver abajo).
- ~~Mostrar el resultado de IIBB en la pantalla~~ HECHO (ver abajo).

## Ciclo de IIBB completo: guardar/cerrar + mostrar en pantalla (2026-06-24, sesion 2)

Quedo parejo con IVA. NO hay cambios de schema (GrossIncomeSettlement y officialAmount ya existian).

- **Helper compartido** `fiscalLedger/grossIncomeFromProfile.ts` (`buildPeriodGrossIncome`): centraliza el
  armado de IIBB desde el perfil (alicuotas + coeficientes CM + creditos) para que el PREVIEW (GET
  settlement) y el GUARDADO usen exactamente la misma logica. El GET settlement se refactorizo para usarlo.
- **Persistencia** `persistGrossIncomeSettlement`: ahora acepta cotejo (officialAmount/reference), setea
  filedAt al cerrar, y tiene reintento de version ante P2002 (igual que IVA).
- **Endpoints**: `POST .../settlement/iibb/save` (recalcula server-side, coteja el saldo a pagar contra
  el oficial: coincide → CLOSED; difiere → 409 o IN_REVIEW con forceSave; sin oficial → DRAFT) y
  `GET .../settlement/iibb/saved` (ultima guardada).
- **Pantalla**: seccion "Ingresos Brutos" en la liquidacion (aparece al Calcular): grilla por
  jurisdiccion (base asignada, alicuota, determinado, saldo), totales, cotejo del saldo oficial con
  match en vivo, y boton "Guardar IIBB". Badge de estado si ya hay una guardada.
- **Integracion anual**: el reader anual ya tomaba el IIBB CLOSED como gasto deducible; ahora que se
  puede CERRAR, el circuito IIBB→Ganancias queda activo.
- **Tests**: `grossIncomeFromProfile.test.ts` (NONE, sin jurisdicciones, local, CM, sin alicuota).

### REQUISITO de este tramo

No hay cambios de schema. Solo `npm run build` + `npx vitest run` antes de commitear (no hace falta
`prisma generate` ni `migrate deploy`).

## Gates tsc + eslint en verde (2026-06-24, sesion 2)

Una revision externa detecto que `next build` NO chequea los archivos de test, asi que habia gates en
rojo que el build no mostraba:
- `tsc --noEmit`: 4 errores en mocks de test (`annualConsolidationSnapshot.test.ts`,
  `fiscalSettlementPersistence.test.ts`): `const row = { id, ...args.data }` infiere `{ id: string }` y
  pierde el index signature del spread → acceso a `row.version/status/sourceHash/confirmedAt` fallaba.
  Fix: tipar `const row: Record<string, unknown> = ...`.
- `eslint .`: 3 `any` en `annualConsolidation.test.ts` (helpers `alloc`/`monthsFull`/`allocations`).
  Fix: tipar con `GainsAllocationKind`/`PeriodAllocation`/`PeriodConsolidationInput`.

**POLITICA DE GATES (decision del usuario): de ahora en mas la rama debe pasar los CUATRO gates antes
de commitear: `npx tsc --noEmit`, `npx eslint .`, `npm run build`, `npx vitest run`.** `next build` solo
no alcanza (no mira los tests). 2026-06-24: los cuatro confirmados en VERDE por el usuario.

## Alta/edicion de perfil fiscal — prerequisito del E2E (2026-06-24, sesion 2)

Hallazgo al preparar el E2E: la creacion de periodo exige un `ClientTaxProfileVersion` activo, pero NO
habia forma en la app de crear/editar ese perfil (ni el seed lo crea). Bloqueaba todo el modulo mensual
para clientes nuevos, y para IIBB hacia falta poder setear el regimen (no-NONE). Tapado:

- **Endpoint** `GET/PUT /api/clientes/[id]/tax-profile`: crea o actualiza el perfil (condicion IVA,
  regimen IIBB, regimen Convenio). Si no existe, crea una version vigente desde 2020 (cubre los años
  soportados); si existe, actualiza la ultima.
- **UI**: seccion "Perfil fiscal" en la pantalla Config. IIBB con selectores de condicion IVA / regimen
  IIBB / Convenio + "Guardar perfil". Al guardar, habilita crear periodos y configurar jurisdicciones.
- Sin cambios de schema (usa ClientTaxProfileVersion existente).

Pendiente menor: el seed podria crear un perfil demo para acelerar pruebas (hoy se carga desde la UI).

## Hallazgos del E2E en vivo (2026-06-24, sesion 2)

- **Config IIBB: jurisdiccion "desaparecia" al guardar.** Causa: la fila se descartaba si el codigo
  quedaba vacio. Fix: se exige el codigo, se avisa si falta, y el mensaje de exito muestra cuantas
  quedaron. (commit a6dd1f2)
- **Cotejo: importes con punto decimal del teclado numerico se leian x100.** El teclado mete "176032.11"
  (punto) pero el parser asumia formato AR (punto=miles). Fix: `presentation/parseMoney.ts`
  (`parseMoneyToPlain`) acepta AR ("1.151.226,93"), punto decimal ("176032.11") y US ("1,151,226.93").
  Se usa en el cotejo en vivo (front) y en el guardado (save IVA e IIBB). 13/13 aserciones + test vitest.
- Confirmado por el usuario: puntos 3 (jurisdicciones) y 8 (IIBB no calculaba) resueltos.

Pendiente a vigilar en el E2E: si el periodo se creo ANTES de configurar jurisdicciones, el settlement
lee el perfil del snapshot del alta del periodo; como el perfil se edita in-place, deberia reflejarse,
pero conviene confirmarlo en la prueba.

---

## CIERRE DE SESION — 2026-06-24 (sesion 2)

### Estado al retomar (2026-06-25)

El fix del parser de cotejo (`parseMoneyToPlain`) quedo COMMITEADO y pusheado al cierre de la sesion
anterior. `git status` confirma la rama limpia (solo esta bitacora pendiente de commit).

### Estado del modulo

Rama `feature/iva-iibb-mensual-core`. Ultimo commit pusheado: `a6dd1f2` (+ el fix de cotejo pendiente).
`main`/produccion INTACTOS. Los 4 gates (tsc/eslint/build/vitest) en verde; ~290 tests.

Funcional de punta a punta (validado en la app contra base de prueba Docker):
- IVA mensual: subir comprobantes AFIP → seleccionar filas → ret/perc → calcular (validado al peso) →
  cotejar (3 importes) → guardar/cerrar → reabrir muestra lo guardado.
- IIBB + Convenio Multilateral: perfil (condicion IVA + regimen) + jurisdicciones/alicuotas + coef CM
  (suma 1) → calcula por jurisdiccion → cotejar saldo → guardar/cerrar.
- Anual: reporte "a hoy" (solo meses CLOSED) + inyeccion al wizard de Ganancias (boton "Importar del
  modulo mensual", comprobante por comprobante).

### E2E: donde quedamos

Probado y OK: login, perfil fiscal, jurisdicciones (fix del codigo), carga de comprobantes, IVA levanta,
cotejo de IVA con el parser nuevo. 
FALTA terminar de probar en vivo: guardar IIBB (paso 9), reabrir mes cerrado (10), cargar un 2do mes (11),
reporte anual (12), importar al wizard + verificar determinacion (13-14).

### Pendientes (por prioridad)

1. Commitear el fix de cotejo (arriba).
2. Terminar el E2E (pasos 9-14) y reportar.
3. Vigilar: si el IIBB no ve una jurisdiccion recien guardada al calcular, es el snapshot de perfil del
   periodo → haria que el settlement lea el perfil vigente, no el del alta.
4. Pre-merge a main (operativo/usuario): rotar AUTH_PASSWORD/AUTH_SECRET/password DB, restringir
   DATABASE_URL a Production, monitor con HEALTH_CHECK_TOKEN, backup + prueba de restauracion,
   `migrate deploy` en prod (en Docker ya esta).
5. Fuera de alcance / fase siguiente: alicuota IIBB por actividad, CM especiales, vencimientos/acuses,
   refactor de archivos grandes (wizard 5k lineas), seed con perfil demo.

### Recordatorio de proceso

Gate obligatorio antes de cada commit: `tsc --noEmit` + `eslint .` + `build` + `vitest` (los 4).
`next build` solo NO alcanza (no chequea tests).

## Pre-merge a produccion: checklist (2026-06-25)

Se relevo el estado tecnico y se armo `docs/CHECKLIST_PRE_MERGE_PRODUCCION.md`. Verificado:
- Las 5 migraciones nuevas son ADITIVAS/no destructivas (tablas nuevas + columnas nullable/default).
- `.env*` en `.gitignore` (sin secretos commiteados).
- La guarda `check-deployment-db-safety.mjs` ya impone: Production solo desde `main`; exige
  AUTH_PASSWORD/AUTH_SECRET (no "REEMPLAZAR"); Preview no puede apuntar a la base productiva.
- Las migraciones NO corren en el build (prebuild solo corre la guarda). Hay que aplicarlas a prod
  aparte y ANTES de que el codigo nuevo despliegue.
- Rollback de codigo es seguro: al ser aditivas, el codigo viejo convive con las columnas nuevas.

Orden del checklist: backup (+restore test) → `migrate deploy` en prod → rotar credenciales
(DB/AUTH_PASSWORD/AUTH_SECRET) en Vercel → merge a main → smoke test → plan de rollback.
La ejecucion es del usuario (operativo); el plan esta documentado.

---

## Inyeccion al wizard de Ganancias (2026-06-24, sesion 2)

Se conecto el libro fiscal mensual (IVA) con la DDJJ anual de Ganancias, comprobante por comprobante
(decision del usuario: granularidad "por comprobante" para maxima trazabilidad). ADITIVO: NO se toco
`determinacionImpuesto.ts` ni ningun archivo de calculo.

- **Schema**: `SalesInvoice` y `PurchaseInvoice` suman `importSource` y `sourceFiscalDocumentId`
  (nullable, aditivo). Migracion `20260624130000_add_taxreturn_monthly_import_link`. Vinculan cada
  registro anual con su comprobante mensual de origen y permiten reimportar sin pisar cargas manuales.
- **Mapper puro** `fiscalLedger/taxReturnMonthlyImport.ts`: comprobantes CLOSED → SalesInvoice/
  PurchaseInvoice con el `expenseType` correcto (Mercaderia→CMV, gasto→deducible, no deducible→
  gasto no deducible). Bienes de uso NO se crean como compra: se devuelven como candidatos a cargar
  vida util en amortizaciones. NC con neto negativo reducen ventas/compras. 15/15 aserciones verdes.
- **Ruta** `POST /api/declaraciones/[id]/importar-mensual`: solo meses con IVA CLOSED; idempotente
  (borra importSource='MONTHLY_LEDGER' y recrea; cargas manuales intactas); persiste el snapshot
  (sourceHash) y audita. Reporta candidatos a bien de uso, compras pendientes de revisar imputacion,
  y total de IIBB cotejado (no se crea automaticamente).
- **UI**: componente aislado `MonthlyImportButton.tsx` insertado en el Paso 2 del wizard con 2 lineas
  (import + 1 JSX). Tras importar, recarga la pagina para repoblar desde la base (evita que el autosave
  del wizard pise lo importado). No se reescribio el wizard.

Como la determinacion no se modifico, el caso Mariano sigue identico por construccion (lo confirma la
suite existente de tests de determinacion).

### REQUISITO antes de compilar este tramo

Hay campos nuevos en `SalesInvoice`/`PurchaseInvoice`, asi que hay que **regenerar el cliente Prisma**:

```powershell
npx prisma generate    # OBLIGATORIO: el route usa importSource/sourceFiscalDocumentId
npm run build          # confirmar tsc verde
npx vitest run         # +15 tests nuevos (taxReturnMonthlyImport)
```

Aplicar la columna en la base con `npx prisma migrate deploy` (las DOS migraciones nuevas: includedInSettlement y el link mensual). Nunca `migrate dev` contra prod.

### Pendiente del tramo (proxima sesion)

- Probar la importacion end-to-end en la app (clic en "Importar del modulo mensual" en el wizard) con datos reales.
- Verificar que el GET `/api/declaraciones/[id]` devuelve los SalesInvoice/PurchaseInvoice importados para que el wizard los muestre tras la recarga (si no, ajustar el read).
- Opcional: auto-crear el IIBB como gasto deducible (hoy se reporta el total para carga manual); pantalla de revision de imputacion de compras.
