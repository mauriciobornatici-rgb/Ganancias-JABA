# Backup y Restauracion Operativa

Ultima actualizacion: 2026-06-08

Objetivo: proteger la base productiva de Hostinger y tener un camino simple para verificar que un backup puede restaurarse sin tocar produccion.

## Regla principal

- Produccion vive en Hostinger MySQL y Vercel `main`.
- Las pruebas de restauracion se hacen primero en Docker local: `ganancias_jaba_test`.
- No restaurar un `.sql` directo sobre Hostinger si antes no fue probado en Docker.
- No usar `prisma db push` contra produccion.
- Antes de una migracion productiva, descargar backup SQL y registrar fecha/archivo.

## Backup manual en Hostinger

Frecuencia recomendada para uso personal:

- Antes de publicar cambios que puedan tocar base o migraciones.
- Antes de cerrar una DDJJ importante.
- Al menos una vez por semana durante uso activo.

Pasos sugeridos:

1. Entrar a Hostinger hPanel.
2. Ir a `Bases de datos` > `phpMyAdmin`.
3. Abrir la base productiva `u669600172_ganancias_jaba`.
4. Ir a `Exportar`.
5. Elegir metodo `Rapido` y formato `SQL`.
6. Descargar el archivo `.sql`.
7. Renombrar el archivo con este formato:

```text
ganancias_jaba_prod_YYYY-MM-DD_HHMM.sql
```

Ejemplo:

```text
ganancias_jaba_prod_2026-06-08_1530.sql
```

## Resguardo del archivo

Guardar al menos dos copias:

- una copia local en una carpeta de backups fuera del repositorio;
- una copia en nube o disco externo.

No guardar backups `.sql` dentro del repo GitHub. Pueden contener CUITs, importes, credenciales accidentales o datos personales.

## Restauracion de prueba en Docker

Preparar Docker:

```powershell
npm run db:test:up
npm run db:test:migrate
```

Restaurar el SQL en la base local de pruebas:

```powershell
docker exec -i ganancias-jaba-test-db mysql -ujaba_test -pjaba_test_pass ganancias_jaba_test < C:\ruta\al\backup.sql
```

Luego iniciar la app contra Docker:

```powershell
npm run dev:testdb
```

Verificar:

- dashboard carga;
- clientes aparecen;
- DDJJ existentes abren;
- papel de trabajo/informe cliente cargan;
- `/api/health` responde `success: true`.

## Health check

La app expone:

```text
/api/health
```

Respuesta esperada cuando la base responde:

```json
{
  "success": true,
  "data": {
    "status": "ok",
    "checks": {
      "database": {
        "status": "ok"
      }
    }
  }
}
```

Si la base no responde, devuelve HTTP 503 y `status: degraded`.

El reporte muestra host/base para diagnostico, pero no expone usuario ni password.

## Registro obligatorio

Cada backup o restauracion importante debe registrarse en `docs/REGISTRO_PROYECTO.md` con:

- fecha y hora;
- nombre del archivo;
- origen: Hostinger produccion o Docker;
- resultado: descargado, restaurado OK, restauracion fallida;
- observaciones.

## Checklist antes de tocar produccion

- Backup SQL descargado.
- Nombre de archivo registrado.
- Restauracion probada en Docker si hay migracion o cambio sensible.
- `vitest run` OK.
- `tsc --noEmit` OK.
- `next build --webpack` OK.
- Publicacion solo desde `main`.
