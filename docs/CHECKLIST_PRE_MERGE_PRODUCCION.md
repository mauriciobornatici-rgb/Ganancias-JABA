# Checklist de pre-merge a producción — módulo IVA + IIBB mensual

> Rama: `feature/iva-iibb-mensual-core` → `main`. `main` despliega a producción (Vercel) y usa la base
> de Hostinger `u669600172_ganancias_jaba`.
>
> **Regla de oro del orden:** la base de producción debe tener las columnas/tablas nuevas **ANTES** de
> que el código nuevo despliegue. Por eso: backup → migrar prod → rotar credenciales → merge a main.

---

## Lo que ya verifiqué (no requiere acción)

- **Las 5 migraciones nuevas son ADITIVAS y no destructivas** (no tocan datos existentes):
  - `20260622002033_add_fiscal_monthly_ledger` — tablas nuevas del libro mensual.
  - `20260624120000_add_included_in_settlement` — columna nullable/default.
  - `20260624130000_add_taxreturn_monthly_import_link` — columnas nullable.
  - `20260624140000_add_taxcredit_included_in_settlement` — columna con default.
  - `20260624150000_add_jurisdiction_tax_rate` — columna nullable.
- **Ningún secreto commiteado**: `.env*` está en `.gitignore`.
- **La guarda de deploy ya protege**: Producción solo desde `main`; exige `AUTH_PASSWORD`/`AUTH_SECRET`
  configurados; Preview no puede apuntar a la base productiva.
- **Rollback de código es seguro**: como las migraciones son aditivas, el código viejo sigue funcionando
  aun con las columnas/tablas nuevas presentes. No hace falta revertir la base para revertir el código.

---

## Paso 0 — Pre-vuelo (rama lista)

```powershell
cd "C:\Dev\Ganancia\_worktrees\ganancias-jaba-iva-iibb-mensual"
npx tsc --noEmit ; npx eslint . ; npm run build ; npx vitest run   # los 4 en verde
git status                                                         # limpio, pusheado
```

- [ ] Los 4 gates en verde.
- [ ] Rama limpia y pusheada (`origin/feature/iva-iibb-mensual-core` al día).
- [ ] (Opcional) Revisar el diff que irá a prod: `git --no-pager diff main..feature/iva-iibb-mensual-core --stat`.

## Paso 1 — Backup de la base productiva (ANTES de tocar nada)

- [ ] Backup completo de `u669600172_ganancias_jaba` desde el panel de Hostinger (o `mysqldump`).
- [ ] **Probar la restauración** del backup en una base vacía (un backup sin restore probado no es backup).
- [ ] Anotar fecha/hora y tamaño del backup.

## Paso 2 — Aplicar migraciones a producción

> Esto crea las tablas/columnas nuevas. Es aditivo, pero igual hacelo después del backup.
> **Nunca `prisma migrate dev` contra producción.** Solo `migrate deploy`.

```powershell
# Con DATABASE_URL apuntando a la base de PRODUCCIÓN (Hostinger), en una terminal local:
$env:DATABASE_URL="mysql://USUARIO:PASSWORD@srv1199.hstgr.io:3306/u669600172_ganancias_jaba"
npx prisma migrate deploy
```

- [ ] `migrate deploy` aplicó las 5 migraciones nuevas sin error.
- [ ] Verificar en la base que existen las tablas nuevas (ej. `FiscalPeriod`, `VatSettlement`,
      `ClientTaxJurisdiction`) y las columnas nuevas (`FiscalDocument.includedInSettlement`,
      `ClientTaxJurisdiction.taxRate`).

## Paso 3 — Rotar credenciales (seguridad — fueron expuestas en el incidente de middleware)

> Ojo con el ORDEN si rotás la password de la DB: la app productiva actual usa la password vieja desde
> las env vars de Vercel. Si cambiás la password en Hostinger, la app se cae hasta que actualices Vercel
> y redespliegue. Coordinarlo (idealmente en la misma ventana del merge).

- [ ] **Password de la DB (Hostinger)**: cambiarla → actualizar `DATABASE_URL` en Vercel (entorno
      **Production**) y en la terminal donde corras `migrate deploy`.
- [ ] **`AUTH_PASSWORD`**: setear una contraseña fuerte nueva en Vercel (Production). (La guarda exige
      que esté y que no diga "REEMPLAZAR".)
- [ ] **`AUTH_SECRET`**: generar uno nuevo aleatorio (largo) en Vercel (Production).
- [ ] Confirmar que `DATABASE_URL` de **Preview** NO apunta a la base productiva (o no está seteada).
- [ ] (Opcional) Setear `HEALTH_CHECK_TOKEN` para el monitor externo.

## Paso 4 — Merge a `main` y deploy

```powershell
# Opción PR (recomendada): abrir PR feature/iva-iibb-mensual-core -> main y mergear.
# O por línea de comandos:
git checkout main
git pull origin main
git merge --no-ff feature/iva-iibb-mensual-core
git push origin main
```

- [ ] Merge a `main` hecho.
- [ ] Vercel disparó el deploy de Production. El `prebuild` (guarda) pasó (sale de main + secretos OK).
- [ ] El build terminó verde en Vercel.

## Paso 5 — Smoke test en producción (post-deploy)

- [ ] `/login` carga y se puede entrar con la nueva `AUTH_PASSWORD`.
- [ ] `/api/health` responde OK.
- [ ] Crear un cliente / abrir uno existente → configurar perfil fiscal e IIBB.
- [ ] Crear un período mensual → subir un comprobante de prueba → calcular IVA → NO da error de columnas.
- [ ] Revisar logs de Vercel: sin errores de "column does not exist" ni 500 inesperados.

## Paso 6 — Si algo sale mal (rollback)

- [ ] **Revertir el código**: `git revert` del merge en `main` (o redeploy del deploy anterior en Vercel).
      Como las migraciones son aditivas, el código viejo funciona con las columnas nuevas presentes:
      **no hace falta tocar la base**.
- [ ] Si el problema fuera de datos (no debería, por ser aditivo): restaurar el backup del Paso 1.

---

## Hardening operativo (alrededor del merge, no bloqueante para el deploy)

- [ ] Backup automático programado en Hostinger + prueba de restauración periódica.
- [ ] Monitor externo (uptime + `/api/health` con `HEALTH_CHECK_TOKEN`).
- [ ] Revisar permisos del usuario de DB en Hostinger (mínimo necesario).

## Fuera de alcance de este merge (fase siguiente)

- Alícuota de IIBB por actividad (hoy por jurisdicción).
- Regímenes especiales de Convenio Multilateral.
- Circuito de vencimientos / acuses de presentación y pago.
- Refactor de pantallas grandes (wizard ~5k líneas).
