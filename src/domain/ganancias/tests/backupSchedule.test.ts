import { describe, expect, it } from 'vitest';
import { lastDueOccurrence } from '../../../../scripts/backupCore.mjs';

// Nota: importar backupCore no abre conexiones (solo exporta funciones).

describe('lastDueOccurrence (calendario del backup automático)', () => {
  it('DAILY: si ya pasó la hora de hoy, vence hoy a esa hora', () => {
    const now = new Date(2026, 6, 20, 22, 30); // lunes 20/07 22:30
    const due = lastDueOccurrence({ frequency: 'DAILY', hour: 21, weekday: 6 }, now);
    expect(due.getDate()).toBe(20);
    expect(due.getHours()).toBe(21);
  });

  it('DAILY: si todavía no llegó la hora, vence ayer (para que el runner corra al encender la PC)', () => {
    const now = new Date(2026, 6, 20, 8, 0); // lunes 08:00, backup configurado 21:00
    const due = lastDueOccurrence({ frequency: 'DAILY', hour: 21, weekday: 6 }, now);
    expect(due.getDate()).toBe(19); // domingo 21:00
    expect(due.getHours()).toBe(21);
  });

  it('WEEKLY: vence el último día configurado a la hora configurada', () => {
    const now = new Date(2026, 6, 22, 10, 0); // miércoles 22/07
    const due = lastDueOccurrence({ frequency: 'WEEKLY', hour: 21, weekday: 6 }, now); // sábados 21:00
    expect(due.getDay()).toBe(6);
    expect(due.getDate()).toBe(18); // sábado anterior
    expect(due.getHours()).toBe(21);
  });

  it('WEEKLY: el mismo día configurado antes de la hora, vence la semana anterior', () => {
    const now = new Date(2026, 6, 18, 9, 0); // sábado 18/07 09:00
    const due = lastDueOccurrence({ frequency: 'WEEKLY', hour: 21, weekday: 6 }, now);
    expect(due.getDate()).toBe(11); // sábado anterior 21:00
  });

  it('WEEKLY: el mismo día configurado después de la hora, vence hoy', () => {
    const now = new Date(2026, 6, 18, 22, 0); // sábado 18/07 22:00
    const due = lastDueOccurrence({ frequency: 'WEEKLY', hour: 21, weekday: 6 }, now);
    expect(due.getDate()).toBe(18);
    expect(due.getHours()).toBe(21);
  });
});
