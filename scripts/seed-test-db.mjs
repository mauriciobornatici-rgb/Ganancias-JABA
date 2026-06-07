import * as mariadb from 'mariadb';
import { TEST_DATABASE_URL } from './run-test-db-command.mjs';

const parseDatabaseUrl = (databaseUrl) => {
  const parsed = new URL(databaseUrl);
  return {
    host: parsed.hostname,
    port: Number(parsed.port || 3306),
    user: decodeURIComponent(parsed.username),
    password: decodeURIComponent(parsed.password),
    database: decodeURIComponent(parsed.pathname.replace(/^\//, '')),
  };
};

const connectionConfig = parseDatabaseUrl(TEST_DATABASE_URL);

const upsertByUnique = async (conn, tableName, uniqueColumn, uniqueValue, data) => {
  const existing = await conn.query(
    `SELECT id FROM ${tableName} WHERE ${uniqueColumn} = ? LIMIT 1`,
    [uniqueValue],
  );

  if (existing.length > 0) {
    return existing[0].id;
  }

  const columns = Object.keys(data);
  const placeholders = columns.map(() => '?').join(', ');
  const values = columns.map((column) => data[column]);
  await conn.query(
    `INSERT INTO ${tableName} (id, ${columns.join(', ')}) VALUES (UUID(), ${placeholders})`,
    values,
  );

  const created = await conn.query(
    `SELECT id FROM ${tableName} WHERE ${uniqueColumn} = ? LIMIT 1`,
    [uniqueValue],
  );
  return created[0].id;
};

const upsertFiscalYear = async (conn, year) => (
  upsertByUnique(conn, 'FiscalYear', 'year', year, {
    year,
    isEnabled: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  })
);

const seed = async () => {
  const conn = await mariadb.createConnection(connectionConfig);

  try {
    console.log(`Seeding test DB: ${connectionConfig.database} at ${connectionConfig.host}:${connectionConfig.port}`);

    await upsertByUnique(conn, 'Role', 'name', 'admin', {
      name: 'admin',
      description: 'Administrador general y liquidador JABA',
    });

    const fiscalYear2025Id = await upsertFiscalYear(conn, 2025);
    await upsertFiscalYear(conn, 2024);

    const parameterSets = await conn.query(
      'SELECT id FROM TaxParameterSet WHERE fiscalYearId = ? AND version = 1 LIMIT 1',
      [fiscalYear2025Id],
    );

    let parameterSetId = parameterSets[0]?.id;
    if (!parameterSetId) {
      await conn.query(
        `INSERT INTO TaxParameterSet (
          id, fiscalYearId, minimoNoImponible, conyuge, hijo, hijoIncapacitado,
          especialAutonomo, especialEmprendedor, especialDependiente,
          topeServicioDomestico, topeSeguroVida, topeSeguroRetiro,
          topeGastosSepelio, topeInteresHipoteca, topeGastosEducativos,
          status, sourceLaw, version, createdAt, updatedAt
        ) VALUES (
          UUID(), ?, 4507505.52, 4245166.13, 2140852.77, 4281705.53,
          15776269.32, 18030022.08, 21636026.50,
          4507505.52, 573817.13, 573817.13,
          996.23, 20000.00, 1803002.21,
          'validado', 'Seed Docker de pruebas 2025', 1, NOW(), NOW()
        )`,
        [fiscalYear2025Id],
      );
      const created = await conn.query(
        'SELECT id FROM TaxParameterSet WHERE fiscalYearId = ? AND version = 1 LIMIT 1',
        [fiscalYear2025Id],
      );
      parameterSetId = created[0].id;
    }

    await conn.query('DELETE FROM TaxArt94Bracket WHERE fiscalYearId = ?', [fiscalYear2025Id]);
    const brackets = [
      [0, 1749901.45, 0, 0.05, 0],
      [1749901.45, 3499802.89, 87495.07, 0.09, 1749901.45],
      [3499802.89, 5249704.34, 244986.20, 0.12, 3499802.89],
      [5249704.34, 7874556.52, 454974.38, 0.15, 5249704.34],
      [7874556.52, 15749113.04, 848702.20, 0.19, 7874556.52],
      [15749113.04, 23623669.56, 2344867.94, 0.23, 15749113.04],
      [23623669.56, 35435504.34, 4156015.94, 0.27, 23623669.56],
      [35435504.34, 53153256.52, 7345211.33, 0.31, 35435504.34],
      [53153256.52, null, 12837714.51, 0.35, 53153256.52],
    ];

    for (const [fromAmount, toAmount, fixedAmount, percentage, excessOf] of brackets) {
      await conn.query(
        `INSERT INTO TaxArt94Bracket (
          id, fiscalYearId, taxParameterSetId, fromAmount, toAmount, fixedAmount, percentage, excessOf
        ) VALUES (UUID(), ?, ?, ?, ?, ?, ?, ?)`,
        [fiscalYear2025Id, parameterSetId, fromAmount, toAmount, fixedAmount, percentage, excessOf],
      );
    }

    const indices = [
      [1, 'Enero', 1.04],
      [2, 'Febrero', 1.08],
      [3, 'Marzo', 1.12],
      [4, 'Abril', 1.15],
      [5, 'Mayo', 1.18],
      [6, 'Junio', 1.21],
      [7, 'Julio', 1.24],
      [8, 'Agosto', 1.27],
      [9, 'Septiembre', 1.29],
      [10, 'Octubre', 1.31],
      [11, 'Noviembre', 1.33],
      [12, 'Diciembre', 1.35],
    ];

    for (const [monthIndex, monthName, ipcValue] of indices) {
      await conn.query(
        `INSERT INTO UpdateIndex (
          id, fiscalYearId, monthIndex, monthName, ipcValue, createdAt, updatedAt
        ) VALUES (UUID(), ?, ?, ?, ?, NOW(), NOW())
        ON DUPLICATE KEY UPDATE monthName = VALUES(monthName), ipcValue = VALUES(ipcValue), updatedAt = NOW()`,
        [fiscalYear2025Id, monthIndex, monthName, ipcValue],
      );
    }

    await upsertByUnique(conn, 'Client', 'cuit', '20-34590216-4', {
      cuit: '20-34590216-4',
      name: 'Lobato Francisco',
      type: 'Persona Humana',
      fiscalCondition: 'Responsable Inscripto',
      mainActivity: 'CABA - Servicios de Informatica',
      status: 'Activo',
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await upsertByUnique(conn, 'Client', 'cuit', '27-95430211-3', {
      cuit: '27-95430211-3',
      name: 'Maria Luz Gomez',
      type: 'Persona Humana',
      fiscalCondition: 'Responsable Inscripto / Monotributo',
      mainActivity: 'Provincia de Buenos Aires - Comercial Minorista',
      status: 'Activo',
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const counts = await conn.query(`
      SELECT
        (SELECT COUNT(*) FROM Client) AS clients,
        (SELECT COUNT(*) FROM FiscalYear) AS fiscalYears,
        (SELECT COUNT(*) FROM TaxParameterSet) AS parameterSets,
        (SELECT COUNT(*) FROM TaxArt94Bracket) AS brackets,
        (SELECT COUNT(*) FROM UpdateIndex) AS indices
    `);

    console.log('Seed test DB completed:', counts[0]);
  } finally {
    await conn.end();
  }
};

seed().catch((error) => {
  console.error('Error seeding test DB:', error);
  process.exit(1);
});
