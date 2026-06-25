# Base de prueba local — probar el módulo IVA + inyección al wizard

Todo corre en tu máquina, **sin tocar producción**. Requiere **Docker Desktop** instalado y abierto.
Yo ya dejé configurado el `.env` del worktree apuntando a esta base local (clave de acceso `1234`).

> Parate siempre en el worktree:
> ```powershell
> cd "C:\Dev\Ganancia\_worktrees\ganancias-jaba-iva-iibb-mensual"
> ```

## Paso a paso (una sola vez)

```powershell
# 1) Levantar la base MySQL de prueba (puerto 3318, aislada de producción)
docker compose up -d

# 2) Esperar ~15 seg a que arranque, y aplicar TODO el esquema (incluye las migraciones nuevas)
npx prisma migrate deploy

# 3) Sembrar datos base (años fiscales, parámetros, escalas, clientes de ejemplo)
npx prisma db seed

# 4) Levantar la app
npm run dev
```

Después entrá a http://localhost:3000 y logueate con **`1234`**.

## Probar el flujo completo mensual → anual

Con la app abierta:

1. **Cargar un mes de IVA.** Andá a un cliente (p. ej. *Lobato*, que viene del seed) → *Períodos fiscales* →
   creá un período (ej. 2025 / mes 5) → entrá a **Liquidar IVA**.
2. Subí tus dos CSV de AFIP (compras y ventas). Revisá la grilla y destildá lo que no quieras.
3. **Calcular** → mirá los totales estilo F2002.
4. Cargá los **tres importes de AFIP** (débito, crédito, saldo) en el cotejo → si coinciden, **Guardar**
   (queda `CLOSED` / cotejada).
5. **Crear la DDJJ anual.** Andá a *Declaraciones* → creá una declaración para ese cliente y año 2025.
6. En el wizard, **Paso 2 (Ventas)**, vas a ver el botón **"Importar del módulo mensual (IVA)"**.
   Apretalo → confirmá → la página recarga y las ventas/compras del mes cotejado aparecen cargadas.
7. Avanzá los pasos y verificá la determinación.

## Comandos útiles

```powershell
docker compose ps          # ver si la base está corriendo
docker compose logs -f      # ver logs de la base
docker compose down         # apagar la base (los datos quedan en el volumen)
docker compose down -v      # apagar y BORRAR los datos (empezar de cero)
```

## Notas

- Esta base es **descartable**: si algo se ensucia, `docker compose down -v` + repetir los pasos 1–3.
- El `.env` del worktree apunta a `127.0.0.1:3318` (local). La guarda de deploy impide correr esto
  contra producción por accidente.
- Si el puerto 3318 está ocupado, cambialo en el `.env` (`JABA_TEST_DB_PORT` y el puerto del `DATABASE_URL`).
- **No** se commitea el `.env` (está en `.gitignore`).
