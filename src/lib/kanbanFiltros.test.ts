import { describe, it, expect } from 'vitest';
import { SIN_LABORATORIO, filtrarKanban, monturasPorOrden, resumenLaboratorios, textoMontura, unirMonturas, type ItemKanban } from './kanbanFiltros';

const item = (x: Partial<ItemKanban>): ItemKanban => ({
  id: Math.random().toString(), orden_id: 'o1', numero_orden: 11, paciente_nombre: 'Pepito Pérez',
  tipo_producto: 'lente', descripcion: 'Lente Super HD', laboratorio_id: 'aliens', laboratorio_nombre: 'Aliens',
  estado_actual: 'enviado_laboratorio', dias_en_estado: 0, tiempo_esperado_dias: 3, ...x,
});

const items = [
  item({}),
  item({ tipo_producto: 'montura', descripcion: 'Montura · Ray-Ban RB5154 · Ref. 001', laboratorio_id: null, laboratorio_nombre: 'N/A', estado_actual: 'pedido_creado' }),
  item({ orden_id: 'o2', numero_orden: 12, paciente_nombre: 'Ana Gil', laboratorio_id: 'hoya', laboratorio_nombre: 'Hoya', estado_actual: 'en_produccion', dias_en_estado: 5 }),
  item({ orden_id: 'o3', numero_orden: 13, laboratorio_id: 'hoya', laboratorio_nombre: 'Hoya', estado_actual: 'entregado' }),
];

describe('tablero por laboratorio', () => {
  it('resume trabajos activos, en laboratorio y atrasados (sin contar entregados)', () => {
    const r = resumenLaboratorios(items);
    expect(r.map((x) => x.nombre)).toEqual(['Aliens', 'Hoya', 'Sin laboratorio']);
    expect(r.find((x) => x.id === 'hoya')).toMatchObject({ activos: 1, enLaboratorio: 1, atrasados: 1 });
    expect(r.find((x) => x.id === SIN_LABORATORIO)).toMatchObject({ activos: 1, enLaboratorio: 0 });
  });

  it('filtra por laboratorio, tipo y texto (orden, paciente o referencia, sin tildes)', () => {
    expect(filtrarKanban(items, { laboratorioId: 'hoya', tipo: 'todos', texto: '' })).toHaveLength(2);
    expect(filtrarKanban(items, { laboratorioId: SIN_LABORATORIO, tipo: 'todos', texto: '' })).toHaveLength(1);
    expect(filtrarKanban(items, { laboratorioId: null, tipo: 'montura', texto: '' })).toHaveLength(1);
    expect(filtrarKanban(items, { laboratorioId: null, tipo: 'todos', texto: 'ORD-00012' })[0].paciente_nombre).toBe('Ana Gil');
    expect(filtrarKanban(items, { laboratorioId: null, tipo: 'todos', texto: 'perez' })).toHaveLength(3);
    expect(filtrarKanban(items, { laboratorioId: null, tipo: 'todos', texto: 'ref. 001' })).toHaveLength(1);
  });

  it('asocia la montura a su orden para mostrarla en la tarjeta del lente', () => {
    expect(monturasPorOrden(items).get('o1')).toEqual(['Ray-Ban RB5154 · Ref. 001']);
    expect(textoMontura('Montura · Montura · Ref. 001')).toBe('Montura · Ref. 001');
  });
});

describe('una tarjeta por trabajo', () => {
  const lente = item({ id: 'L', orden_id: 'o9', estado_actual: 'pedido_creado' });
  const montura = item({ id: 'M', orden_id: 'o9', tipo_producto: 'montura', descripcion: 'Montura · Tous · Ref. 2969', estado_actual: 'pedido_creado' });

  it('la montura en la misma etapa que el lente va dentro de su tarjeta', () => {
    const r = unirMonturas([lente, montura]);
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ id: 'L', montura_orden: 'Tous · Ref. 2969', monturas_unidas: ['M'] });
  });

  it('si la montura quedó en otra etapa, o va sola, conserva su tarjeta', () => {
    expect(unirMonturas([lente, { ...montura, estado_actual: 'enviado_laboratorio' }])).toHaveLength(2);
    expect(unirMonturas([montura])).toHaveLength(1);
  });

  it('el filtro "Monturas" incluye los lentes que llevan montura; "Lentes" no muestra monturas sueltas', () => {
    const r = unirMonturas([lente, montura, item({ id: 'S', orden_id: 'o8', tipo_producto: 'montura', descripcion: 'Montura · Sola' })]);
    expect(filtrarKanban(r, { laboratorioId: null, tipo: 'montura', texto: '' }).map((x) => x.id)).toEqual(['L', 'S']);
    expect(filtrarKanban(r, { laboratorioId: null, tipo: 'lente', texto: '' }).map((x) => x.id)).toEqual(['L']);
    expect(filtrarKanban(r, { laboratorioId: null, tipo: 'todos', texto: 'tous' }).map((x) => x.id)).toEqual(['L']);
  });
});
