/**
 * Runner del backup automático (arquitectura elegida 2026-07-19).
 *
 * Corre cada hora desde el Programador de tareas de Windows. Lee la fila de
 * BackupConfig (que el usuario administra desde la app, en /configuracion) y:
 *  - si el backup está desactivado o todavía no venció la próxima corrida, no hace nada;
 *  - si corresponde, ejecuta el backup hacia la carpeta configurada (típicamente la
 *    carpeta local de Google Drive, que sincroniza sola a la nube), aplica la
 *    retención y reporta el resultado en la misma fila (visible en la app).
 *
 * Registra su actividad en backups/runner.log dentro del proyecto.
 */
import { appendFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { runBackup, openConnection, projectRoot, lastDueOccurrence } from './backupCore.mjs';

const LOG_DIR = path.join(projectRoot, 'backups');
const LOG_FILE = path.join(LOG_DIR, 'runner.log');

function log(message) {
  mkdirSync(LOG_DIR, { recursive: true });
  const line = `[${new Date().toISOString()}] ${message}`;
  appendFileSync(LOG_FILE, line + '\n', 'utf8');
  console.log(line);
}

async function main() {
  const { conn } = await openConnection();
  let config;
  try {
    const rows = await conn.query(
      'SELECT id, enabled, destinationPath, frequency, hour, weekday, retentionDays, lastRunAt FROM BackupConfig ORDER BY createdAt ASC LIMIT 1'
    );
    config = rows[0];
  } finally {
    await conn.end();
  }

  if (!config || !config.enabled) {
    // Sin configuración o desactivado: salida silenciosa (el runner corre cada hora).
    return;
  }
  if (!config.destinationPath || config.destinationPath.trim() === '') {
    log('OMITIDO: el backup está activado pero no hay carpeta de destino configurada.');
    return;
  }

  const due = lastDueOccurrence(config);
  const lastRun = config.lastRunAt ? new Date(config.lastRunAt) : null;
  if (lastRun && lastRun >= due) {
    // Ya se corrió la ocurrencia vigente.
    return;
  }

  log(`Backup automático iniciado (vencimiento ${due.toLocaleString('es-AR')}, destino ${config.destinationPath}).`);

  const update = async (status, file) => {
    const { conn: reportConn } = await openConnection();
    try {
      await reportConn.query(
        'UPDATE BackupConfig SET lastRunAt = ?, lastRunStatus = ?, lastRunFile = ? WHERE id = ?',
        [new Date(), status, file, config.id]
      );
    } finally {
      await reportConn.end();
    }
  };

  try {
    const result = await runBackup({
      destinationDir: config.destinationPath,
      retentionDays: config.retentionDays,
      log: () => {},
    });
    await update('OK', path.basename(result.outFile));
    log(`Backup OK: ${result.outFile} (${result.sizeKb} KB, ${result.tables} tablas, ${result.totalRows} filas).`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await update(`ERROR: ${message.slice(0, 160)}`, null).catch(() => {});
    log(`BACKUP FALLÓ: ${message}`);
    process.exit(1);
  }
}

main().catch(err => {
  log(`RUNNER FALLÓ: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
