# JABA Ganancias

## Desarrollo local seguro

Todo desarrollo local usa exclusivamente la base MySQL Docker `ganancias_jaba_test`.
La aplicaciÃ³n bloquea por cÃ³digo cualquier intento de abrir la base productiva fuera de
Vercel Production.

```powershell
npm run db:test:up
npm run db:test:migrate
npm run db:test:seed
npm run dev
```

Abrir [http://localhost:3000](http://localhost:3000). La pantalla debe mostrar una franja amarilla
con el texto `ENTORNO DE PRUEBA`.

`npm run dev`, `npm run dev:testdb`, `npm run dev:turbopack` y `npm start` pasan por el runner
seguro y fuerzan `127.0.0.1:3317/ganancias_jaba_test`, aunque `.env` contenga otra URL.

No ejecutar `next dev` o `next start` directamente. Si se hiciera por error, la guardia del backend
igualmente rechaza la base productiva.

## ProducciÃ³n

La base real sÃ³lo puede abrirse cuando Vercel declara `VERCEL_ENV=production` y el despliegue
proviene de `main`. Preview, tests, builds locales y servidores locales quedan bloqueados.
