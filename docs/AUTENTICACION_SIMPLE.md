# Autenticacion simple - Ganancias JABA

Fecha: 2026-06-08
Estado: integrado sobre `main` actual en rama `integrate/auth-simple-safe-main`, pendiente de publicacion controlada.

## Decision tomada

Para avanzar rapido y proteger la app publicada, se implemento una seguridad simple de uso personal:

- una clave unica del estudio;
- sesion por cookie firmada;
- proteccion de paginas y APIs;
- sin usuarios, roles ni permisos por ahora.

El esquema multiusuario queda diferido para una etapa posterior, cuando la app ya este probada operativamente.

## Que protege

El middleware protege todo lo que no sea publico:

- dashboard `/`;
- paginas de declaraciones;
- APIs de clientes, declaraciones, importaciones, parametros y auditoria;
- cualquier nueva ruta queda protegida por defecto salvo que se excluya expresamente.

Quedan publicos:

- `/login`;
- `/api/auth/login`;
- `/api/auth/logout`;
- assets de Next y archivos estaticos.

## Como funciona

1. El usuario entra a la app.
2. Si no tiene cookie valida, el sistema lo envia a `/login`.
3. El login valida la clave contra `AUTH_PASSWORD`.
4. Si la clave es correcta, se emite cookie `jaba_auth`.
5. La cookie dura 12 horas.
6. La cookie es `HttpOnly`, `SameSite=Lax` y `Secure` en produccion.
7. Las APIs sin sesion devuelven `401`.
8. Si falta configuracion en produccion, la app no abre y redirige a login con aviso de setup.
9. El build de Vercel Production queda bloqueado si faltan `AUTH_PASSWORD` o `AUTH_SECRET`, para no publicar una app inaccesible.
10. En el wizard, salir/cerrar sesion con carga iniciada muestra advertencia para evitar perdida accidental de datos no guardados.

## Variables de entorno

### Produccion en Vercel

Configurar en el proyecto de Vercel, idealmente solo para `Production`:

```env
AUTH_PASSWORD="CLAVE_REAL_DEL_ESTUDIO"
AUTH_SECRET="SECRETO_LARGO_ALEATORIO"
```

Reglas:

- no commitear la clave real;
- no pegarla en documentacion;
- si la clave se expuso en capturas o chat, regenerarla;
- usar un `AUTH_SECRET` largo y distinto de la clave;
- si se crea Preview/Staging persistente, usar otro `AUTH_PASSWORD` y otro `AUTH_SECRET`.

### Desarrollo local / Docker

Para pruebas locales se puede copiar `.env.docker.example` y usar:

```env
AUTH_PASSWORD="JabaDev2026!"
AUTH_SECRET="jaba-dev-auth-secret-change-me-before-production"
```

Si en desarrollo no se configuran variables, la app usa temporalmente `JabaDev2026!` para facilitar pruebas rapidas.

## Archivos principales

- `middleware.ts`: bloquea paginas/APIs si no hay sesion valida.
- `src/app/login/page.tsx`: pantalla de ingreso.
- `src/app/api/auth/login/route.ts`: valida clave y crea sesion.
- `src/app/api/auth/logout/route.ts`: borra sesion.
- `src/domain/ganancias/auth/simpleAuth.ts`: firma y verifica token.
- `src/domain/ganancias/auth/redirect.ts`: evita redirecciones externas desde login.
- `src/domain/ganancias/tests/simpleAuth.test.ts`: pruebas de configuracion, clave, token, rutas y redirect.
- `src/domain/ganancias/presentation/wizardExitGuard.ts`: regla de advertencia antes de salir del wizard con carga iniciada.
- `scripts/check-deployment-db-safety.mjs`: bloquea Production si faltan variables criticas.

## Limitaciones conocidas

Este alcance es intencionalmente simple:

- no hay usuarios individuales;
- no hay roles;
- no hay recuperacion de clave;
- no hay rate limiting por intentos fallidos;
- la auditoria todavia no puede registrar un `userId` real;
- no reemplaza un modelo multiusuario profesional.

Estas limitaciones son aceptadas para el uso personal inicial. Cuando se retome multiusuario, conviene crear un nuevo punto del backlog para usuarios, roles, permisos, auditoria por usuario y recuperacion/rotacion de credenciales.

## Verificacion ejecutada

Comandos ejecutados con runtime local de Codex:

```powershell
node ./node_modules/vitest/vitest.mjs run ./src/domain/ganancias/tests/simpleAuth.test.ts
node ./node_modules/vitest/vitest.mjs run
node ./node_modules/typescript/bin/tsc --noEmit
node ./node_modules/eslint/bin/eslint.js middleware.ts src/domain/ganancias/auth/simpleAuth.ts src/domain/ganancias/auth/redirect.ts src/domain/ganancias/tests/simpleAuth.test.ts src/app/api/auth/login/route.ts src/app/api/auth/logout/route.ts src/app/login/page.tsx
node ./scripts/check-deployment-db-safety.mjs
node ./node_modules/next/dist/bin/next build --webpack
```

Resultados registrados en la bitacora de proyecto.

Ultima verificacion registrada en la integracion segura:

- `simpleAuth.test.ts`: OK, 5 tests.
- `wizardExitGuard.test.ts`: OK, 3 tests.
- `deploymentDbSafety.test.ts`: OK, 8 tests.
- `vitest run`: OK, 38 archivos y 145 tests.
- `tsc --noEmit`: OK.
- `prisma validate --schema prisma/schema.prisma`: OK.
- `check-deployment-db-safety`: OK.
- `next build --webpack`: OK.
- `eslint` focalizado en archivos nuevos/pequenos de auth/guardas: OK.

Nota posterior de integracion segura:

- Se agrego test para bloquear Production sin `AUTH_PASSWORD`/`AUTH_SECRET`.
- Se agrego test para salida segura del wizard.
- La publicacion a `main` debe hacerse solo despues de configurar variables reales en Vercel.
