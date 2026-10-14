import { describe, it, expect, afterAll } from 'vitest';
import { ETAPAS_POR_DEFECTO, registrarEtapas, etapasVisibles } from './etapasRegistro';
import { esEstadoLaboratorio, esRetroceso, siguienteEstado } from './businessDays';
import { colorEstadoProducto, etiquetaEstadoProducto } from '@/types';

// Flujo pedido por la óptica: 8 visibles, 3 ocultas y una etapa nueva.
const flujo = ETAPAS_POR_DEFECTO.map((e) => ({
  ...e,
  visible: !['recibido_laboratorio', 'en_produccion', 'en_transito'].includes(e.clave),
  nombre: ({ alistamiento: 'Recoge mensajero', enviado_laboratorio: 'Entregado a laboratorio', recibido_optica: 'Entregado en óptica' } as Record<string, string>)[e.clave] ?? e.nombre,
}));
flujo.push({ clave: 'biselado', nombre: 'Biselado', orden: 7.5, color: 'rojo', visible: true, responsable_id: null, es_laboratorio: true, sistema: false });

describe('etapas configurables', () => {
  registrarEtapas(flujo);
  afterAll(() => registrarEtapas(ETAPAS_POR_DEFECTO));

  it('usa los nombres y colores configurados', () => {
    expect(etiquetaEstadoProducto('alistamiento')).toBe('Recoge mensajero');
    expect(colorEstadoProducto('biselado')).toContain('destructive');
  });

  it('la siguiente etapa salta las ocultas y respeta las nuevas', () => {
    expect(siguienteEstado('enviado_laboratorio')?.label).toBe('Producido');
    expect(siguienteEstado('producido')?.label).toBe('Biselado');
    expect(siguienteEstado('biselado')?.label).toBe('Entregado en óptica');
    expect(etapasVisibles()).toHaveLength(9);
  });

  it('retroceso y laboratorio según la configuración', () => {
    expect(esRetroceso('biselado', 'producido')).toBe(true);
    expect(esRetroceso('producido', 'biselado')).toBe(false);
    expect(esEstadoLaboratorio('biselado')).toBe(true);
    expect(esEstadoLaboratorio('recibido_optica')).toBe(false);
  });
});
