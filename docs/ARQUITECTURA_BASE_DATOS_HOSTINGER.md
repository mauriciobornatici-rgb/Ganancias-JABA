# Arquitectura Base de Datos Hostinger

Fecha: 2026-06-07

## Objetivo

Dejar Ganancias JABA preparada para usar una unica base MySQL/MariaDB en Hostinger, publicada desde Vercel, con uso personal inicial y arquitectura extensible a multiusuario.

## Recomendacion para crear en Hostinger

Segun el prefijo mostrado por Hostinger:

- Base de datos, sufijo recomendado: `ganancias_jaba`
- Base de datos completa: `u669600172_ganancias_jaba`
- Usuario, sufijo recomendado: `jaba_app`
- Usuario completo: `u669600172_jaba_app`
- Password: usar una clave fuerte generada por Hostinger o un gestor de claves.

No guardar la password en documentos, capturas, GitHub ni mensajes.

Estado al 2026-06-07:

- Base creada: `u669600172_ganancias_jaba`.
- Usuario creado: `u669600172_jaba_app`.
- Sitio asociado en Hostinger: `lightgray-herring-775204.hostingersite.com`.
- Host MySQL remoto confirmado: `srv1199.hstgr.io`.
- IP alternativa informada por Hostinger: `193.203.175.56`.
- Remote MySQL habilitado para la base `u669600172_ganancias_jaba` con acceso `%` (cualquier host), necesario para Vercel sin IP fija.
- Conexion remota verificada desde la app el 2026-06-07.
- Migracion Prisma aplicada en Hostinger el 2026-06-07: 35 tablas creadas.
- Seed inicial ejecutado en Hostinger el 2026-06-07.
- Verificacion post-seed: 3 clientes, 2 periodos fiscales, 1 set de parametros, 9 tramos Art. 94, 12 indices, 1 DDJJ historica y 1 ejecucion de calculo.
- La password fue visible en una captura de trabajo; no se registra en el repo. Recomendacion: regenerarla antes de usar produccion o tratarla como clave temporal.
- No usar `127.0.0.1`, `localhost` ni el dominio del sitio web como host de Vercel.

## Conexion

Formato:

```env
DATABASE_URL="mysql://u669600172_jaba_app:PASSWORD_URL_ENCODED@srv1199.hstgr.io:3306/u669600172_ganancias_jaba"
```

Reglas:

- Si la password contiene `@`, `:`, `/`, `#`, `%` u otros caracteres especiales, debe estar URL-encoded.
- Ejemplo: `p@ss:word/2026` se escribe como `p%40ss%3Aword%2F2026`.
- El helper `buildMariaDbConnectionConfig` usa `URL`, no regex manual.
- Si falta `DATABASE_URL`, la app falla explicitamente; no usa fallback local silencioso.
- `test_db.js` y `seed.ts` imprimen la URL enmascarada, sin password.

## Flujo GitHub + Vercel + Base de datos

La arquitectura correcta queda asi:

```text
GitHub
  contiene codigo, schema Prisma, migraciones y cliente generado
  no contiene passwords ni DATABASE_URL real

Vercel
  toma el codigo desde GitHub
  ejecuta build/deploy
  guarda DATABASE_URL como Environment Variable
  ejecuta la app publicada y las rutas API

Hostinger MySQL
  guarda los datos reales
  recibe conexiones remotas desde Vercel en runtime
```

Regla importante:

- GitHub no se conecta a la base durante el uso normal de la app.
- Vercel si se conecta a Hostinger MySQL porque ahi corre la aplicacion publicada.
- La base no debe depender de la maquina local para funcionar una vez desplegada.
- Los secretos se cargan en Vercel, nunca en el repositorio.

Flujo operativo recomendado:

1. Se hace push del codigo a GitHub.
2. Vercel detecta el push y despliega la app.
3. Vercel usa `DATABASE_URL` para conectar sus rutas API con Hostinger MySQL.
4. La app lee/escribe DDJJ, cargas, adjuntos e importaciones en MySQL.

Migraciones:

- Para el MVP personal, aplicar `prisma migrate deploy` manualmente cuando la DB de Hostinger este creada y `DATABASE_URL` este configurada.
- No conviene ejecutar migraciones automaticamente en cada build de Vercel al inicio, para evitar que un deploy fallido mezcle problemas de build con cambios de base.
- Mas adelante se puede agregar GitHub Actions para aplicar migraciones con control, usando un secret de GitHub o de Vercel y ejecutandolo solo sobre la rama productiva.

## Vercel

Configurar en Environment Variables:

- `DATABASE_URL`

Configurar el proyecto Vercel conectado al repositorio GitHub `Ganancias-JABA`.

Variables recomendadas:

- Production: `DATABASE_URL` apuntando a Hostinger productivo.
- Preview/Staging: no usar la DB productiva. Dejar `DATABASE_URL` sin configurar o crear otra DB, por ejemplo `u669600172_ganancias_jaba_staging`.
- Development: se puede usar `.env` local con la misma estructura.

Proteccion agregada:

- `scripts/check-deployment-db-safety.mjs` corre automaticamente antes de `next build` por `prebuild`.
- Si Vercel Preview intenta usar `u669600172_ganancias_jaba`, el build se bloquea.
- Si Vercel Production no tiene `DATABASE_URL`, el build se bloquea.
- Si Vercel Production no viene desde `main`, el build se bloquea.
- Si Vercel Preview no tiene `DATABASE_URL`, se permite porque no puede escribir datos reales.

Detalle operativo completo: `docs/FLUJO_SEGURO_DEPLOY.md`.

Para uso personal se puede iniciar con Remote MySQL habilitado de forma amplia en Hostinger si no hay IP fija disponible. Arquitectura recomendada para endurecer mas adelante:

- restringir hosts permitidos cuando se tenga IP fija,
- rotar password si se compartio por error,
- crear usuarios de DB separados si aparece ambiente de pruebas/produccion,
- no usar usuario root ni credenciales del panel Hostinger.

## Prisma

Schema principal:

- `prisma/schema.prisma`

Migracion inicial generada:

- `prisma/migrations/20260607000100_initial_hostinger_mysql/migration.sql`

Comandos locales:

```powershell
& 'C:\Users\mauri\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' 'node_modules\prisma\build\index.js' validate --schema prisma/schema.prisma
& 'C:\Users\mauri\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' 'node_modules\prisma\build\index.js' generate --schema prisma/schema.prisma
```

Cuando `DATABASE_URL` apunte a Hostinger y la base este creada:

```powershell
& 'C:\Users\mauri\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' 'node_modules\prisma\build\index.js' migrate deploy --schema prisma/schema.prisma
```

Para cargar parametros iniciales:

```powershell
& 'C:\Users\mauri\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' 'node_modules\tsx\dist\cli.mjs' prisma/seed.ts
```

## Modelo de datos

La base conserva:

- usuarios, roles, permisos y accesos por cliente,
- clientes/contribuyentes,
- periodos fiscales, parametros, escalas e indices,
- cabecera de DDJJ,
- ventas y compras con CUIT de contraparte,
- bienes de uso con marca de baja y perdida por baja,
- existencias, bancos, efectivo, creditos, deudas y retenciones,
- patrimonio personal y justificacion patrimonial,
- deducciones generales/personales en tablas propias,
- AXI estatico y dinamico,
- ejecuciones del motor con snapshot JSON de auditoria,
- adjuntos dentro de la base mediante `AttachmentBlob`,
- lotes y archivos importados desde AFIP.

## Criterio de snapshot

`CalculationRun.variablesSnapshot` no se elimina. Se usa como respaldo de auditoria y compatibilidad con declaraciones viejas.

Criterio actual:

- datos operativos consultables: tablas relacionales,
- soporte tecnico completo de la carga: snapshot,
- reapertura: primero tabla relacional, luego fallback al snapshot.

## Backups

Regla minima recomendada para uso personal:

- exportar SQL desde Hostinger antes de cambios importantes,
- exportar SQL antes de aplicar migraciones productivas,
- exportar despues de cierres de declaraciones,
- guardar copia local y copia externa,
- probar periodicamente que el backup se puede descargar y abrir.

## Seguridad suficiente para MVP personal

Aunque el uso sea personal, se aplican estas practicas:

- no commitear `.env`,
- no imprimir passwords,
- no usar fallback silencioso,
- usar migraciones versionadas,
- indices para consultas frecuentes,
- relaciones con `onDelete: Cascade` para limpiar una DDJJ completa si se elimina.

## Pendientes posteriores

- Revisar en Vercel que `DATABASE_URL` este marcada solo para Production.
- Crear una DB staging si se quiere probar previews con persistencia real separada.
- Revisar/actualizar parametros reales antes de usar una DDJJ productiva si las escalas o indices cargados son solo base inicial.
- Probar `test_db.js`.
- Implementar endpoint de adjuntos/importaciones usando `AttachmentBlob`, `ImportBatch` e `ImportFile`.
