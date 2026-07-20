# Base local aislada para pruebas

Todo corre en Docker y no puede modificar producciÃ³n. Requiere Docker Desktop abierto.

## PreparaciÃ³n inicial

Desde la raÃ­z del repositorio:

```powershell
npm run db:test:up
npm run db:test:migrate
npm run db:test:seed
npm run dev
```

Abrir `http://localhost:3000`. Debe verse una franja amarilla permanente:

> ENTORNO DE PRUEBA â€” Base Docker aislada: los datos no afectan producciÃ³n.

`npm run dev` y `npm run dev:testdb` son equivalentes. Ambos fuerzan:

- host `127.0.0.1`;
- puerto `3317` por defecto;
- base `ganancias_jaba_test`;
- entorno `APP_ENV=test-db`.

Aunque `.env` contenga una URL productiva, el runner la reemplaza. Como segunda barrera, el backend
rechaza cualquier conexiÃ³n a Hostinger fuera de Vercel Production desplegado desde `main`.

## Comandos Ãºtiles

```powershell
npm run db:test:up       # levantar MySQL Docker
npm run db:test:migrate  # aplicar migraciones sÃ³lo en Docker
npm run db:test:seed     # cargar datos ficticios
npm run db:test:validate # validar Prisma contra Docker
npm run db:test:studio   # Prisma Studio contra Docker
npm run db:test:down     # apagar sin borrar el volumen
npm run db:test:reset    # borrar y recrear sÃ³lo la base local
```

## Reglas

- No ejecutar `next dev`, `next start`, `prisma db push` ni `prisma migrate` directamente.
- Usar siempre los scripts `npm run ...` versionados en el proyecto.
- No copiar credenciales productivas a `.env.docker.example`.
- Los archivos `.env*` locales permanecen fuera de Git.
- La eliminaciÃ³n del volumen Docker nunca afecta Hostinger.
