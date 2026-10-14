import { describe, it, expect } from 'vitest';
import { agruparClientes, filtrarClientes, mensajeWhatsApp, sumarMesesISO, telefonoWhatsApp, type ProductoEntregado, type Seguimiento } from './crm';

const paciente = (id: string, nombres = 'Ana', telefono = '3001234567') => ({
  id, nombres, apellidos: 'Gómez', tipo_documento: 'CC', numero_documento: `10${id}`, telefono,
  email: null, ciudad: 'Bogotá', fecha_nacimiento: null, empresa: null,
});

const fila = (p: Partial<ProductoEntregado> & { pacienteId: string; ordenId: string; entrega: string; saldo?: number; total?: number }): ProductoEntregado => ({
  id: `${p.ordenId}-${Math.random()}`,
  orden_id: p.ordenId,
  descripcion: p.descripcion ?? 'Lente Super HD',
  tipo_producto: 'lente',
  numero_montura: p.numero_montura ?? null,
  precio_venta: 100000,
  fecha_entrega_real: p.entrega,
  laboratorio_nombre: 'Aliens',
  orden: { id: p.ordenId, numero_orden: '11', created_at: '2026-01-01T10:00:00Z', total_final: p.total ?? 300000, saldo_pendiente: p.saldo ?? 0, paciente_id: p.pacienteId },
  paciente: paciente(p.pacienteId),
});

const seg = (s: Partial<Seguimiento> & { paciente_id: string; created_at: string }): Seguimiento => ({
  id: Math.random().toString(), orden_id: null, tipo: 'llamada', motivo: 'satisfaccion', resultado: 'satisfecho',
  nota: null, proximo_contacto: null, usuario_id: null, ...s,
});

describe('agruparClientes', () => {
  it('agrupa productos por paciente y orden, con totales y saldo', () => {
    const c = agruparClientes([
      fila({ pacienteId: 'a', ordenId: 'o1', entrega: '2026-10-01T10:00:00Z', total: 300000, saldo: 50000 }),
      fila({ pacienteId: 'a', ordenId: 'o1', entrega: '2026-10-02T10:00:00Z', total: 300000, saldo: 50000, descripcion: 'Montura' }),
      fila({ pacienteId: 'a', ordenId: 'o2', entrega: '2026-05-01T10:00:00Z', total: 200000 }),
      fila({ pacienteId: 'b', ordenId: 'o3', entrega: '2026-09-01T10:00:00Z' }),
    ], [], '2026-10-14');
    expect(c).toHaveLength(2);
    const a = c.find((x) => x.paciente.id === 'a')!;
    expect(a.compras).toHaveLength(2);
    expect(a.compras[0].productos).toHaveLength(2);
    expect(a.totalComprado).toBe(500000);
    expect(a.saldo).toBe(50000);
    expect(a.ultimaEntrega.slice(0, 10)).toBe('2026-10-02');
    expect(a.proximoControl).toBe('2027-10-02');
    expect(c[0].paciente.id).toBe('a'); // entrega más reciente primero
  });

  it('pide llamada de satisfacción después de 8 días si no se ha hecho', () => {
    const filas = [fila({ pacienteId: 'a', ordenId: 'o1', entrega: '2026-10-01T10:00:00Z' })];
    expect(agruparClientes(filas, [], '2026-10-05')[0].pendientes).toEqual([]);
    expect(agruparClientes(filas, [], '2026-10-10')[0].pendientes).toEqual(['satisfaccion']);
    const hecha = [seg({ paciente_id: 'a', created_at: '2026-10-09T15:00:00Z' })];
    expect(agruparClientes(filas, hecha, '2026-10-10')[0].pendientes).toEqual([]);
    // "No contesta" no cuenta como hecha.
    const sinRespuesta = [seg({ paciente_id: 'a', created_at: '2026-10-09T15:00:00Z', resultado: 'no_contesta' })];
    expect(agruparClientes(filas, sinRespuesta, '2026-10-10')[0].pendientes).toEqual(['satisfaccion']);
  });

  it('avisa el control anual 30 días antes y lo marca vencido después', () => {
    const filas = [fila({ pacienteId: 'a', ordenId: 'o1', entrega: '2025-10-20T10:00:00Z' })];
    const satisfecho = [seg({ paciente_id: 'a', created_at: '2025-10-28T10:00:00Z' })];
    expect(agruparClientes(filas, satisfecho, '2026-09-01')[0].pendientes).toEqual([]);
    expect(agruparClientes(filas, satisfecho, '2026-10-01')[0].pendientes).toEqual(['control_anual']);
    expect(agruparClientes(filas, satisfecho, '2026-11-01')[0].pendientes).toEqual(['control_vencido']);
    const contactado = [...satisfecho, seg({ paciente_id: 'a', created_at: '2026-10-05T10:00:00Z', motivo: 'control_anual', resultado: 'agendo_cita' })];
    expect(agruparClientes(filas, contactado, '2026-11-01')[0].pendientes).toEqual([]);
  });

  it('marca el contacto programado vencido y el saldo', () => {
    const filas = [fila({ pacienteId: 'a', ordenId: 'o1', entrega: '2026-10-01T10:00:00Z', saldo: 20000 })];
    const s = [seg({ paciente_id: 'a', created_at: '2026-10-09T10:00:00Z', proximo_contacto: '2026-10-12' })];
    expect(agruparClientes(filas, s, '2026-10-14')[0].pendientes).toEqual(['contacto_programado', 'saldo']);
  });
});

describe('filtrarClientes', () => {
  const clientes = agruparClientes([
    fila({ pacienteId: 'a', ordenId: 'o1', entrega: '2026-10-01T10:00:00Z', saldo: 1000, numero_montura: 'RB-22' }),
    fila({ pacienteId: 'b', ordenId: 'o2', entrega: '2026-10-13T10:00:00Z' }),
  ], [], '2026-10-14');

  it('busca por nombre, documento, montura', () => {
    expect(filtrarClientes(clientes, 'todos', 'rb-22').map((c) => c.paciente.id)).toEqual(['a']);
    expect(filtrarClientes(clientes, 'todos', '10b').map((c) => c.paciente.id)).toEqual(['b']);
  });

  it('filtra por lo que toca hacer', () => {
    expect(filtrarClientes(clientes, 'por_contactar', '').map((c) => c.paciente.id)).toEqual(['a']);
    expect(filtrarClientes(clientes, 'saldo', '').map((c) => c.paciente.id)).toEqual(['a']);
    expect(filtrarClientes(clientes, 'al_dia', '').map((c) => c.paciente.id)).toEqual(['b']);
  });
});

describe('utilidades', () => {
  it('suma meses y arma el número de WhatsApp', () => {
    expect(sumarMesesISO('2026-01-31T10:00:00Z', 12)).toBe('2027-01-31');
    expect(telefonoWhatsApp('315 222 1111')).toBe('573152221111');
    expect(telefonoWhatsApp('573152221111')).toBe('573152221111');
    expect(telefonoWhatsApp('')).toBeNull();
  });

  it('el mensaje usa el primer nombre y el motivo', () => {
    const [c] = agruparClientes([fila({ pacienteId: 'a', ordenId: 'o1', entrega: '2026-10-01T10:00:00Z', saldo: 50000 })], [], '2026-10-14');
    expect(mensajeWhatsApp(c, 'satisfaccion')).toMatch(/^Hola Ana, .*gafas nuevas/);
    expect(mensajeWhatsApp(c, 'control_anual')).toMatch(/control visual/);
    expect(mensajeWhatsApp(c, 'cobro')).toMatch(/50\.000/);
  });
});
