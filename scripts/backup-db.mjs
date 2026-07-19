/**
 * Backup completo de la base de datos a un archivo SQL restaurable.
 *
 * - Descubre las tablas con SHOW TABLES (incluye _prisma_migrations), por lo que
 *   no requiere mantenimiento cuando el schema evoluciona.
 * - Solo ejecuta operaciones de LECTURA (SHOW / SELECT): no puede dañar la base.
 * - Escribe en ./backups/ganancias-jaba-AAAA-MM-DD-HHmm.sql y borra los backups
 *   con más de RETENTION_DAYS días.
 *
 * Uso:  node scripts/backup-db.mjs
 * Requiere DATABASE_URL en .env (la misma que usa la aplicación).
 */
import { createRequire } from 'node:module';
import { readFileSync, mkdirSync, writeFileSync, readdirSync, statSync, unlinkSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const require = createRequire(import.meta.url);
const mariadb = require('mariadb');

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const RETENTION_DAYS = 30;
const BACKUP_DIR = path.join(projectRoot, 'backups');

function readDatabaseUrl() {
  const envPath = path.join(projectRoot, '.env');
  const content = readFileSync(envPath, 'utf8');
  const line = content.split(/\r?\n/).find(l => l.trim().startsWith('DATABASE_URL='));
  if (!line) throw new Error('No se encontró DATABASE_URL en .env');
  return line.slice(line.indexOf('=') + 1).trim().replace(/^"|"$/g, '');
}

function sqlValue(value, escape) {
  if (value === null || value === undefined) return 'NULL';
  if (typeof value === 'number' || typeof value === 'bigint') return String(value);
  if (typeof value === 'boolean') return value ? '1' : '0';
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return 'NULL';
    return `'${value.toISOString().slice(0, 23).replace('T', ' ')}'`;
  }
  if (Buffer.isBuffer(value)) return `0x${value.toString('hex')}`;
  return escape(String(value));
}

async function main() {
  const url = new URL(readDatabaseUrl());
  const dbName = url.pathname.slice(1);
  const conn = await mariadb.createConnection({
    host: url.hostname,
    port: Number(url.port || 3306),
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: dbName,
    connectTimeout: 20000,
    // Los Decimal/BigInt llegan como string para no perder precisión.
    decimalAsNumber: false,
    bigIntAsNumber: false,
    dateStrings: false,
  });

  const escape = (v) => conn.escape(v);

  try {
    const now = new Date();
    const stamp = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}-${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}`;
    mkdirSync(BACKUP_DIR, { recursive: true });
    const outFile = path.join(BACKUP_DIR, `ganancias-jaba-${stamp}.sql`);

    const tablesRows = await conn.query('SHOW FULL TABLES WHERE Table_type = ?', ['BASE TABLE']);
    const tableKey = Object.keys(tablesRows[0] || {}).find(k => k.startsWith('Tables_in_'));
    const tables = tablesRows.map(r => r[tableKey]).sort();
    if (tables.length === 0) throw new Error('La base no tiene tablas: se aborta por seguridad.');

    const parts = [];
    parts.push(`-- Backup ganancias-jaba`);
    parts.push(`-- Base: ${dbName} @ ${url.hostname}`);
    parts.push(`-- Fecha: ${now.toISOString()}`);
    parts.push(`-- Tablas: ${tables.length}`);
    parts.push('SET NAMES utf8mb4;');
    parts.push('SET FOREIGN_KEY_CHECKS=0;');
    parts.push('');

    let totalRows = 0;
    for (const table of tables) {
      const createRows = await conn.query(`SHOW CREATE TABLE \`${table}\``);
      const createSql = createRows[0]['Create Table'];
      parts.push(`-- ----- ${table} -----`);
      parts.push(`DROP TABLE IF EXISTS \`${table}\`;`);
      parts.push(`${createSql};`);

      const rows = await conn.query(`SELECT * FROM \`${table}\``);
      if (rows.length > 0) {
        const columns = Object.keys(rows[0]);
        const columnList = columns.map(c => `\`${c}\``).join(', ');
        const CHUNK = 200;
        for (let i = 0; i < rows.length; i += CHUNK) {
          const chunk = rows.slice(i, i + CHUNK);
          const values = chunk
            .map(row => `(${columns.map(c => sqlValue(row[c], escape)).join(', ')})`)
            .join(',\n');
          parts.push(`INSERT INTO \`${table}\` (${columnList}) VALUES\n${values};`);
        }
        totalRows += rows.length;
      }
      parts.push('');
      console.log(`  ${table}: ${rows.length} fila(s)`);
    }

    parts.push('SET FOREIGN_KEY_CHECKS=1;');
    parts.push(`-- Fin del backup: ${tables.length} tablas, ${totalRows} filas.`);
    writeFileSync(outFile, parts.join('\n'), 'utf8');

    const sizeKb = Math.round(statSync(outFile).size / 1024);
    console.log(`\nBackup OK: ${outFile} (${sizeKb} KB, ${tables.length} tablas, ${totalRows} filas)`);

    // Retención: borrar backups viejos.
    const cutoff = Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000;
    for (const file of readdirSync(BACKUP_DIR)) {
      if (!file.endsWith('.sql')) continue;
      const full = path.join(BACKUP_DIR, file);
      if (statSync(full).mtimeMs < cutoff) {
        unlinkSync(full);
        console.log(`Retención: eliminado ${file} (más de ${RETENTION_DAYS} días)`);
      }
    }
  } finally {
    await conn.end();
  }
}

main().catch(err => {
  console.error('BACKUP FALLÓ:', err.message);
  process.exit(1);
});
