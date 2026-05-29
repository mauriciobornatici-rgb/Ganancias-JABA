export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/domain/ganancias/prisma';
import { logAuditEvent } from '@/domain/ganancias/auditHelper';

export async function GET() {
  try {
    const clients = await prisma.client.findMany({
      orderBy: { name: 'asc' },
    });
    return NextResponse.json({ success: true, data: clients });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: `Error al obtener contribuyentes: ${err.message}` },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { cuit, name, type, fiscalCondition, mainActivity, status } = body;

    if (!cuit || !name) {
      return NextResponse.json(
        { success: false, error: 'CUIT y Nombre/Razón Social son requeridos.' },
        { status: 400 }
      );
    }

    // Validar formato y dígito verificador del CUIT (módulo 11)
    const cleanCuit = cuit.replace(/\D/g, '');
    if (cleanCuit.length !== 11) {
      return NextResponse.json(
        { success: false, error: 'El CUIT debe tener exactamente 11 dígitos numéricos (formato XX-XXXXXXXX-X).' },
        { status: 400 }
      );
    }
    const cuitFactors = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
    let cuitSum = 0;
    for (let i = 0; i < 10; i++) {
      cuitSum += parseInt(cleanCuit[i], 10) * cuitFactors[i];
    }
    const cuitVerifier = parseInt(cleanCuit[10], 10);
    const cuitCalc = 11 - (cuitSum % 11);
    const cuitValid = cuitCalc === 11 ? cuitVerifier === 0
      : cuitCalc === 10 ? (cuitVerifier === 9 || cuitVerifier === 4)
      : cuitVerifier === cuitCalc;
    if (!cuitValid) {
      return NextResponse.json(
        { success: false, error: 'El CUIT ingresado posee un dígito verificador inválido. Verifique el número e intente nuevamente.' },
        { status: 400 }
      );
    }

    // Validar si ya existe el CUIT
    const existing = await prisma.client.findUnique({
      where: { cuit },
    });

    if (existing) {
      return NextResponse.json(
        { success: false, error: 'El CUIT ya se encuentra registrado en el sistema.' },
        { status: 409 }
      );
    }

    const client = await prisma.client.create({
      data: {
        cuit,
        name,
        type: type || 'Persona Humana',
        fiscalCondition: fiscalCondition || 'Responsable Inscripto',
        mainActivity: mainActivity || 'Actividad General',
        status: status || 'Activo',
      },
    });

    // Registrar en auditoría
    logAuditEvent({
      action: 'CREATE',
      entityType: 'Client',
      entityId: client.id,
      clientCuit: cuit,
      clientName: name,
      details: `Alta de contribuyente: ${name} (${cuit}) — ${type || 'Persona Humana'} / ${fiscalCondition || 'Responsable Inscripto'}`,
    });

    return NextResponse.json({ success: true, data: client }, { status: 201 });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: `Error al registrar contribuyente: ${err.message}` },
      { status: 500 }
    );
  }
}
