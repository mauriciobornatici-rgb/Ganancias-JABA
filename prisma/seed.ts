import 'dotenv/config';
import { PrismaClient } from '../src/generated/client/client';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
const mariadb = require('mariadb');

const parseConnectionString = (url: string) => {
  const regex = /^(?:mysql|mariadb):\/\/([^:]+):([^@]+)@([^:]+):(\d+)\/(.+)$/;
  const match = url.match(regex);
  if (match) {
    return {
      user: match[1],
      password: match[2],
      host: match[3],
      port: parseInt(match[4], 10),
      database: match[5]
    };
  }
  return {
    host: 'localhost',
    port: 3306,
    user: 'jaba',
    password: 'jaba_secure_pass',
    database: 'ganancias_jaba'
  };
};

const connConfig = parseConnectionString(process.env.DATABASE_URL!);
if (connConfig) {
  (connConfig as any).allowPublicKeyRetrieval = true;
}
console.log("Parsed config:", connConfig);
const adapter = new PrismaMariaDb(connConfig);
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log('Seeding impositive database parameters...');

  // 1. Crear Roles y Permisos maestros
  const roleAdmin = await prisma.role.upsert({
    where: { name: 'admin' },
    update: {},
    create: {
      name: 'admin',
      description: 'Administrador general y liquidador JABA',
    },
  });

  const roleContador = await prisma.role.upsert({
    where: { name: 'contador' },
    update: {},
    create: {
      name: 'contador',
      description: 'Usuario contador liquidador principal',
    },
  });

  // 2. Habilitar el Año Fiscal 2025
  const year2025 = await prisma.fiscalYear.upsert({
    where: { year: 2025 },
    update: {},
    create: {
      year: 2025,
      isEnabled: true,
    },
  });

  // 3. Insertar Deducciones y Parámetros del Artículo 30 para el año 2025
  await prisma.taxParameterSet.upsert({
    where: {
      fiscalYearId_version: {
        fiscalYearId: year2025.id,
        version: 1,
      },
    },
    update: {},
    create: {
      fiscalYearId: year2025.id,
      minimoNoImponible: 4507505.52,
      conyuge: 4245166.13,
      hijo: 2140852.77,
      hijoIncapacitado: 4281705.53,
      especialAutonomo: 15776269.32,
      especialEmprendedor: 18030022.08,
      especialDependiente: 21636026.50,
      topeServicioDomestico: 4507505.52,
      topeSeguroVida: 573817.13,
      topeSeguroRetiro: 573817.13,
      topeGastosSepelio: 996.23,
      topeInteresHipoteca: 20000.00,
      topeGastosEducativos: 1803002.21,
      status: 'validado',
      sourceLaw: 'Resolución de Escalas AFIP Período Fiscal 2025',
      version: 1,
    },
  });

  // 4. Cargar las 9 Escalas Progresivas del Artículo 94 (2025)
  const brackets = [
    { fromAmount: 0, toAmount: 1749901.45, fixedAmount: 0, percentage: 0.05, excessOf: 0 },
    { fromAmount: 1749901.45, toAmount: 3499802.89, fixedAmount: 87495.07, percentage: 0.09, excessOf: 1749901.45 },
    { fromAmount: 3499802.89, toAmount: 5249704.34, fixedAmount: 244986.20, percentage: 0.12, excessOf: 3499802.89 },
    { fromAmount: 5249704.34, toAmount: 7874556.52, fixedAmount: 454974.38, percentage: 0.15, excessOf: 5249704.34 },
    { fromAmount: 7874556.52, toAmount: 15749113.04, fixedAmount: 848702.20, percentage: 0.19, excessOf: 7874556.52 },
    { fromAmount: 15749113.04, toAmount: 23623669.56, fixedAmount: 2344867.94, percentage: 0.23, excessOf: 15749113.04 },
    { fromAmount: 23623669.56, toAmount: 35435504.34, fixedAmount: 4156015.94, percentage: 0.27, excessOf: 23623669.56 },
    { fromAmount: 35435504.34, toAmount: 53153256.52, fixedAmount: 7345211.33, percentage: 0.31, excessOf: 35435504.34 },
    { fromAmount: 53153256.52, toAmount: null, fixedAmount: 12837714.51, percentage: 0.35, excessOf: 53153256.52 },
  ];

  // Borrar previas para evitar duplicidad y regenerar de forma limpia
  await prisma.taxArt94Bracket.deleteMany({
    where: { fiscalYearId: year2025.id },
  });

  for (const b of brackets) {
    await prisma.taxArt94Bracket.create({
      data: {
        fiscalYearId: year2025.id,
        fromAmount: b.fromAmount,
        toAmount: b.toAmount,
        fixedAmount: b.fixedAmount,
        percentage: b.percentage,
        excessOf: b.excessOf,
      },
    });
  }

  // 5. Cargar Índices IPC Mensuales Mocks del Período 2025
  const ipcIndices = [
    { monthIndex: 1, monthName: 'Enero', ipcValue: 1.04 },
    { monthIndex: 2, monthName: 'Febrero', ipcValue: 1.08 },
    { monthIndex: 3, monthName: 'Marzo', ipcValue: 1.12 },
    { monthIndex: 4, monthName: 'Abril', ipcValue: 1.15 },
    { monthIndex: 5, monthName: 'Mayo', ipcValue: 1.18 },
    { monthIndex: 6, monthName: 'Junio', ipcValue: 1.21 },
    { monthIndex: 7, monthName: 'Julio', ipcValue: 1.24 },
    { monthIndex: 8, monthName: 'Agosto', ipcValue: 1.27 },
    { monthIndex: 9, monthName: 'Septiembre', ipcValue: 1.29 },
    { monthIndex: 10, monthName: 'Octubre', ipcValue: 1.31 },
    { monthIndex: 11, monthName: 'Noviembre', ipcValue: 1.33 },
    { monthIndex: 12, monthName: 'Diciembre', ipcValue: 1.35 },
  ];

  for (const idx of ipcIndices) {
    await prisma.updateIndex.upsert({
      where: {
        fiscalYearId_monthIndex: {
          fiscalYearId: year2025.id,
          monthIndex: idx.monthIndex,
        },
      },
      update: {
        ipcValue: idx.ipcValue,
      },
      create: {
        fiscalYearId: year2025.id,
        monthIndex: idx.monthIndex,
        monthName: idx.monthName,
        ipcValue: idx.ipcValue,
      },
    });
  }

  // 6. Crear Clientes maestros iniciales impositivos
  const clientLobato = await prisma.client.upsert({
    where: { cuit: '20-34590216-4' },
    update: {},
    create: {
      cuit: '20-34590216-4',
      name: 'Lobato Francisco',
      type: 'Persona Humana',
      fiscalCondition: 'Responsable Inscripto',
      mainActivity: 'CABA - Servicios de Informática',
      status: 'Activo',
    },
  });

  await prisma.client.upsert({
    where: { cuit: '27-95430211-3' },
    update: {},
    create: {
      cuit: '27-95430211-3',
      name: 'Maria Luz Gomez',
      type: 'Persona Humana',
      fiscalCondition: 'Responsable Inscripto / Monotributo',
      mainActivity: 'Provincia de Buenos Aires - Comercial Minorista',
      status: 'Activo',
    },
  });

  await prisma.client.upsert({
    where: { cuit: '20-11223344-9' },
    update: {},
    create: {
      cuit: '20-11223344-9',
      name: 'Estudio Metalúrgico SRL',
      type: 'Sociedad de Hecho',
      fiscalCondition: 'Responsable Inscripto',
      mainActivity: 'Convenio Multilateral - Fabricación',
      status: 'Inactivo',
    },
  });

  // 7. Crear año fiscal histórico 2024
  const year2024 = await prisma.fiscalYear.upsert({
    where: { year: 2024 },
    update: {},
    create: {
      year: 2024,
      isEnabled: true,
    },
  });

  // 8. Crear declaración jurada histórica 2024 de Lobato Francisco (Cerrada)
  const returnLobato2024 = await prisma.taxReturn.upsert({
    where: {
      clientId_fiscalYearId_version: {
        clientId: clientLobato.id,
        fiscalYearId: year2024.id,
        version: 0,
      },
    },
    update: {},
    create: {
      clientId: clientLobato.id,
      fiscalYearId: year2024.id,
      status: 'Cerrada',
      version: 0,
      notes: 'Declaración jurada original cerrada período fiscal 2024 (Seeding)',
    },
  });

  // Limpiar y poblar existencias de cierre 2024 de Lobato Francisco (para importar a stock inicial 2025)
  await prisma.inventoryValue.deleteMany({ where: { taxReturnId: returnLobato2024.id } });
  await prisma.inventoryValue.create({
    data: {
      taxReturnId: returnLobato2024.id,
      concept: 'Bienes de Cambio',
      initialStock: 1000000.00,
      finalStock: 2000000.00,
    },
  });

  // Limpiar y poblar cuentas bancarias de cierre 2024 (para importar a saldo inicial 2025)
  await prisma.bankAccountBalance.deleteMany({ where: { taxReturnId: returnLobato2024.id } });
  await prisma.bankAccountBalance.create({
    data: {
      taxReturnId: returnLobato2024.id,
      bankName: 'Banco Galicia',
      accountNumber: '00123-4-567-8',
      accountType: 'Cuenta Corriente',
      currency: 'ARS',
      nominalBalanceInitial: 480000.00,
      nominalBalanceFinal: 480000.00,
      tcInitial: 1.0,
      tcFinal: 1.0,
      balanceInitialArs: 480000.00,
      balanceFinalArs: 480000.00,
    },
  });

  // Limpiar y poblar calculation run para consolidar el Consumo calculado de 2024
  await prisma.calculationRun.deleteMany({ where: { taxReturnId: returnLobato2024.id } });
  await prisma.calculationRun.create({
    data: {
      taxReturnId: returnLobato2024.id,
      resultThirdCategory: 15000000.00,
      resultTotalNet: 15000000.00,
      totalGeneralDeductions: 500000.00,
      impositiveResultBeforeQuebrantos: 14500000.00,
      quebrantosApplied: 0,
      impositiveResultNet: 14500000.00,
      totalPersonalDeductions: 2000000.00,
      taxableIncome: 12500000.00,
      taxDetermined: 1500000.00,
      totalPaymentsOnAccount: 0,
      finalBalance: 1500000.00,
      computedConsumo: 18400000.00,
      justificationDiff: 0,
      axiStaticResult: 0,
      axiDynamicResult: 0,
      axiNetAdjustment: 0,
      variablesSnapshot: JSON.stringify({ currentStep: 10 }),
    },
  });

  console.log('Seeding completed successfully! Default impositive scales, index matrices, and dynamic client/return datasets are ready.');
}

main()
  .catch((e) => {
    console.error('Error seeding database:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
