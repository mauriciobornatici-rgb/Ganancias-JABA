/**
 * Backup MANUAL de la base de datos: node scripts/backup-db.mjs
 * Escribe en ./backups con retención de 30 días. Solo LECTURA sobre la base.
 * (La versión automática configurable desde la app es scripts/backup-runner.mjs.)
 */
import path from 'node:path';
import { runBackup, projectRoot } from './backupCore.mjs';

const destinationDir = path.join(projectRoot, 'backups');

runBackup({ destinationDir, retentionDays: 30, log: line => console.log(line) })
  .then(result => {
    console.log(`\nBackup OK: ${result.outFile} (${result.sizeKb} KB, ${result.tables} tablas, ${result.totalRows} filas)`);
  })
  .catch(err => {
    console.error('BACKUP FALLÓ:', err.message);
    process.exit(1);
  });
