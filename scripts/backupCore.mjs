/**
 * Núcleo compartido de backup: volcado completo de la base a un .sql restaurable.
 * Lo usan scripts/backup-db.mjs (manual) y scripts/backup-runner.mjs (automático).
 * Solo operaciones de LECTURA sobre la base de origen.
 */
import { createRequire } from 'node:module';
import { readFileSync, mkdirSync, writeFileSync, readdirSync, statSync, unlinkSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const require = createRequire(import.meta.url);
const mariadb = require('mariadb');

export const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export function readDatabaseUrl() {
  const envPath = path.join(projectRoot, '.env');
  const content = readFileSync(envPath, 'utf8');
  const line = content.split(/\r?\n/).find(l => l.trim().startsWith('DATABASE_URL='));
  if (!line) throw new Error('No se encontró DATABASE_URL en .env');
  return line.slice(line.indexOf('=') + 1).trim().replace(/^"|"$/g, '');
}

export async function openConnection() {
  const url = new URL(readDatabaseUrl());
  const conn = await mariadb.createConnection({
    host: url.hostname,
    port: Number(url.port || 3306),
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: url.pathname.slice(1),
    connectTimeout: 20000,
    decimalAsNumber: false,
    bigIntAsNumber: false,
    dateStrings: false,
  });
  return { conn, dbName: url.pathname.slice(1), host: url.hostname };
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

/**
 * Última ocurrencia programada (hora local) que ya venció según la configuración.
 * DAILY: hoy a config.hour (o ayer si todavía no llegó la hora).
 * WEEKLY: el último config.weekday a config.hour.
 */
export function lastDueOccurrence(config, now = new Date()) {
  const due = new Date(now.getFullYear(), now.getMonth(), now.getDate(), config.hour, 0, 0, 0);
  if (config.frequency === 'WEEKLY') {
    const diff = (now.getDay() - config.weekday + 7) % 7;
    due.setDate(due.getDate() - diff);
    if (due > now) due.setDate(due.getDate() - 7);
    return due;
  }
  if (due > now) due.setDate(due.getDate() - 1);
  return due;
}

/**
 * Ejecuta el backup completo. Devuelve { outFile, tables, totalRows, sizeKb }.
 * @param {object} opts
 * @param {string} opts.destinationDir carpeta de destino (se crea si no existe)
 * @param {number} opts.retentionDays  antigüedad máxima de los .sql a conservar
 * @param {(line: string) => void} [opts.log]
 */
export async function runBackup({ destinationDir, retentionDays, log = () => {} }) {
  const { conn, dbName, host } = await openConnection();
  const escape = (v) => conn.escape(v);

  try {
    const now = new Date();
    const stamp = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}-${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}`;
    mkdirSync(destinationDir, { recursive: true });
    const outFile = path.join(destinationDir, `ganancias-jaba-${stamp}.sql`);

    const tablesRows = await conn.query('SHOW FULL TABLES WHERE Table_type = ?', ['BASE TABLE']);
    const tableKey = Object.keys(tablesRows[0] || {}).find(k => k.startsWith('Tables_in_'));
    const tables = tablesRows.map(r => r[tableKey]).sort();
    if (tables.length === 0) throw new Error('La base no tiene tablas: se aborta por seguridad.');

    const parts = [];
    parts.push(`-- Backup ganancias-jaba`);
    parts.push(`-- Base: ${dbName} @ ${host}`);
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
      log(`  ${table}: ${rows.length} fila(s)`);
    }

    parts.push('SET FOREIGN_KEY_CHECKS=1;');
    parts.push(`-- Fin del backup: ${tables.length} tablas, ${totalRows} filas.`);
    writeFileSync(outFile, parts.join('\n'), 'utf8');

    const sizeKb = Math.round(statSync(outFile).size / 1024);

    // Retención en la carpeta de destino.
    const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
    for (const file of readdirSync(destinationDir)) {
      if (!file.endsWith('.sql') || !file.startsWith('ganancias-jaba-')) continue;
      const full = path.join(destinationDir, file);
      if (statSync(full).mtimeMs < cutoff) {
        unlinkSync(full);
        log(`Retención: eliminado ${file} (más de ${retentionDays} días)`);
      }
    }

    return { outFile, tables: tables.length, totalRows, sizeKb };
  } finally {
    await conn.end();
  }
}
