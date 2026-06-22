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

const upsertTaxProfile = async (conn, profile) => {
  const existing = await conn.query(
    'SELECT id FROM ClientTaxProfileVersion WHERE clientId = ? AND validFrom = ? LIMIT 1',
    [profile.clientId, profile.validFrom],
  );

  if (existing.length > 0) {
    const id = existing[0].id;
    await conn.query(
      `UPDATE ClientTaxProfileVersion
       SET validTo = ?, vatCondition = ?, grossIncomeRegime = ?, conventionRegime = ?,
           arbaRegistrationNumber = ?, cmRegistrationNumber = ?, sourceReference = ?,
           approvedBy = ?, approvedAt = ?, notes = ?, updatedAt = NOW()
       WHERE id = ?`,
      [
        profile.validTo,
        profile.vatCondition,
        profile.grossIncomeRegime,
        profile.conventionRegime,
        profile.arbaRegistrationNumber,
        profile.cmRegistrationNumber,
        profile.sourceReference,
        profile.approvedBy,
        profile.approvedAt,
        profile.notes,
        id,
      ],
    );
    return id;
  }

  await conn.query(
    `INSERT INTO ClientTaxProfileVersion (
      id, clientId, validFrom, validTo, vatCondition, grossIncomeRegime, conventionRegime,
      arbaRegistrationNumber, cmRegistrationNumber, sourceReference, approvedBy, approvedAt,
      notes, createdAt, updatedAt
    ) VALUES (UUID(), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
    [
      profile.clientId,
      profile.validFrom,
      profile.validTo,
      profile.vatCondition,
      profile.grossIncomeRegime,
      profile.conventionRegime,
      profile.arbaRegistrationNumber,
      profile.cmRegistrationNumber,
      profile.sourceReference,
      profile.approvedBy,
      profile.approvedAt,
      profile.notes,
    ],
  );

  const created = await conn.query(
    'SELECT id FROM ClientTaxProfileVersion WHERE clientId = ? AND validFrom = ? LIMIT 1',
    [profile.clientId, profile.validFrom],
  );
  return created[0].id;
};

const replaceProfileActivities = async (conn, taxProfileId, activities) => {
  await conn.query('DELETE FROM ClientTaxActivity WHERE taxProfileId = ?', [taxProfileId]);

  for (const activity of activities) {
    await conn.query(
      `INSERT INTO ClientTaxActivity (
        id, taxProfileId, activityCode, description, isPrimary, createdAt, updatedAt
      ) VALUES (UUID(), ?, ?, ?, ?, NOW(), NOW())`,
      [taxProfileId, activity.activityCode, activity.description, activity.isPrimary],
    );
  }
};

const replaceProfileJurisdictions = async (conn, taxProfileId, jurisdictions) => {
  await conn.query('DELETE FROM ClientTaxJurisdiction WHERE taxProfileId = ?', [taxProfileId]);

  for (const jurisdiction of jurisdictions) {
    await conn.query(
      `INSERT INTO ClientTaxJurisdiction (
        id, taxProfileId, jurisdictionCode, registrationNumber, isActive, createdAt, updatedAt
      ) VALUES (UUID(), ?, ?, ?, ?, NOW(), NOW())`,
      [taxProfileId, jurisdiction.jurisdictionCode, jurisdiction.registrationNumber, jurisdiction.isActive],
    );
  }
};

const upsertCoefficientVersion = async (conn, coefficientVersion) => {
  const existing = await conn.query(
    'SELECT id FROM ConventionCoefficientVersion WHERE clientId = ? AND year = ? LIMIT 1',
    [coefficientVersion.clientId, coefficientVersion.year],
  );

  if (existing.length > 0) {
    const id = existing[0].id;
    await conn.query(
      `UPDATE ConventionCoefficientVersion
       SET sourceReference = ?, approvedBy = ?, approvedAt = ?, notes = ?, updatedAt = NOW()
       WHERE id = ?`,
      [
        coefficientVersion.sourceReference,
        coefficientVersion.approvedBy,
        coefficientVersion.approvedAt,
        coefficientVersion.notes,
        id,
      ],
    );
    return id;
  }

  await conn.query(
    `INSERT INTO ConventionCoefficientVersion (
      id, clientId, year, sourceReference, approvedBy, approvedAt, notes, createdAt, updatedAt
    ) VALUES (UUID(), ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
    [
      coefficientVersion.clientId,
      coefficientVersion.year,
      coefficientVersion.sourceReference,
      coefficientVersion.approvedBy,
      coefficientVersion.approvedAt,
      coefficientVersion.notes,
    ],
  );

  const created = await conn.query(
    'SELECT id FROM ConventionCoefficientVersion WHERE clientId = ? AND year = ? LIMIT 1',
    [coefficientVersion.clientId, coefficientVersion.year],
  );
  return created[0].id;
};

const replaceCoefficientLines = async (conn, coefficientVersionId, coefficientLines) => {
  await conn.query('DELETE FROM ConventionCoefficientLine WHERE coefficientVersionId = ?', [coefficientVersionId]);

  for (const coefficientLine of coefficientLines) {
    await conn.query(
      `INSERT INTO ConventionCoefficientLine (
        id, coefficientVersionId, jurisdictionCode, incomeCoefficient, expenseCoefficient,
        unifiedCoefficient, createdAt, updatedAt
      ) VALUES (UUID(), ?, ?, ?, ?, ?, NOW(), NOW())`,
      [
        coefficientVersionId,
        coefficientLine.jurisdictionCode,
        coefficientLine.incomeCoefficient,
        coefficientLine.expenseCoefficient,
        coefficientLine.unifiedCoefficient,
      ],
    );
  }
};

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

    const arbaClientId = await upsertByUnique(conn, 'Client', 'cuit', '27-95430211-3', {
      cuit: '27-95430211-3',
      name: 'Maria Luz Gomez',
      type: 'Persona Humana',
      fiscalCondition: 'Responsable Inscripto / Monotributo',
      mainActivity: 'Provincia de Buenos Aires - Comercial Minorista',
      status: 'Activo',
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const cmClientId = await upsertByUnique(conn, 'Client', 'cuit', '30-71451236-3', {
      cuit: '30-71451236-3',
      name: 'Cliente Convenio General SA',
      type: 'Persona Juridica',
      fiscalCondition: 'Responsable Inscripto',
      mainActivity: 'Convenio Multilateral - Actividad general',
      status: 'Activo',
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const validFrom = new Date('2025-01-01T00:00:00.000Z');
    const approvedAt = new Date('2025-01-02T00:00:00.000Z');
    const arbaProfileId = await upsertTaxProfile(conn, {
      clientId: arbaClientId,
      validFrom,
      validTo: null,
      vatCondition: 'RESPONSABLE_INSCRIPTO',
      grossIncomeRegime: 'ARBA_LOCAL',
      conventionRegime: 'NONE',
      arbaRegistrationNumber: 'ARBA-TEST-902-001',
      cmRegistrationNumber: null,
      sourceReference: 'Seed Docker ARBA local 2025',
      approvedBy: 'seed-test-db',
      approvedAt,
      notes: 'Perfil ficticio exclusivo para pruebas Docker.',
    });
    await replaceProfileActivities(conn, arbaProfileId, [
      {
        activityCode: '471120',
        description: 'Venta al por menor en comercios no especializados',
        isPrimary: true,
      },
    ]);
    await replaceProfileJurisdictions(conn, arbaProfileId, [
      {
        jurisdictionCode: '902',
        registrationNumber: 'ARBA-TEST-902-001',
        isActive: true,
      },
    ]);

    const cmProfileId = await upsertTaxProfile(conn, {
      clientId: cmClientId,
      validFrom,
      validTo: null,
      vatCondition: 'RESPONSABLE_INSCRIPTO',
      grossIncomeRegime: 'CM_REGIMEN_GENERAL',
      conventionRegime: 'GENERAL',
      arbaRegistrationNumber: null,
      cmRegistrationNumber: 'CM-TEST-901-902',
      sourceReference: 'Seed Docker CM regimen general 2025',
      approvedBy: 'seed-test-db',
      approvedAt,
      notes: 'Perfil ficticio exclusivo para pruebas Docker.',
    });
    await replaceProfileActivities(conn, cmProfileId, [
      {
        activityCode: '259900',
        description: 'Fabricacion de productos elaborados de metal',
        isPrimary: true,
      },
    ]);
    await replaceProfileJurisdictions(conn, cmProfileId, [
      {
        jurisdictionCode: '901',
        registrationNumber: 'CM-TEST-901-902',
        isActive: true,
      },
      {
        jurisdictionCode: '902',
        registrationNumber: 'CM-TEST-901-902',
        isActive: true,
      },
    ]);

    const cmCoefficientVersionId = await upsertCoefficientVersion(conn, {
      clientId: cmClientId,
      year: 2025,
      sourceReference: 'CM05 de prueba 2025',
      approvedBy: 'seed-test-db',
      approvedAt,
      notes: 'Coeficientes ficticios para validar el regimen general.',
    });
    await replaceCoefficientLines(conn, cmCoefficientVersionId, [
      {
        jurisdictionCode: '901',
        incomeCoefficient: 0.4,
        expenseCoefficient: 0.4,
        unifiedCoefficient: 0.4,
      },
      {
        jurisdictionCode: '902',
        incomeCoefficient: 0.6,
        expenseCoefficient: 0.6,
        unifiedCoefficient: 0.6,
      },
    ]);

    const counts = await conn.query(`
      SELECT
        (SELECT COUNT(*) FROM Client) AS clients,
        (SELECT COUNT(*) FROM FiscalYear) AS fiscalYears,
        (SELECT COUNT(*) FROM TaxParameterSet) AS parameterSets,
        (SELECT COUNT(*) FROM TaxArt94Bracket) AS brackets,
        (SELECT COUNT(*) FROM UpdateIndex) AS indices,
        (SELECT COUNT(*) FROM ClientTaxProfileVersion) AS taxProfiles,
        (SELECT COUNT(*) FROM ConventionCoefficientLine) AS coefficientLines
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
