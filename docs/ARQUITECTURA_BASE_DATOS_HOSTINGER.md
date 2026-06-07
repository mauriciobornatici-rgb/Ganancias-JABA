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

## Conexion

Formato:

```env
DATABASE_URL="mysql://u669600172_jaba_app:PASSWORD_URL_ENCODED@HOST_MYSQL:3306/u669600172_ganancias_jaba"
```

Reglas:

- Si la password contiene `@`, `:`, `/`, `#`, `%` u otros caracteres especiales, debe estar URL-encoded.
- Ejemplo: `p@ss:word/2026` se escribe como `p%40ss%3Aword%2F2026`.
- El helper `buildMariaDbConnectionConfig` usa `URL`, no regex manual.
- Si falta `DATABASE_URL`, la app falla explicitamente; no usa fallback local silencioso.
- `test_db.js` y `seed.ts` imprimen la URL enmascarada, sin password.

## Vercel

Configurar en Environment Variables:

- `DATABASE_URL`

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

- Crear la base y usuario en Hostinger.
- Configurar Remote MySQL.
- Pegar `DATABASE_URL` en `.env` local y en Vercel.
- Ejecutar `migrate deploy`.
- Ejecutar seed de parametros.
- Probar `test_db.js`.
- Implementar endpoint de adjuntos/importaciones usando `AttachmentBlob`, `ImportBatch` e `ImportFile`.
