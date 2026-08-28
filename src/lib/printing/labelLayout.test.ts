import { describe, it, expect } from 'vitest';
import {
  buildDefaultLayout,
  clampLayout,
  elementHeightMm,
  reflowLayout,
  rotateLayout90,
  scaleLayout,
  type LabelLayout,
} from './labelLayout';

const layout = (els: Array<Partial<LabelLayout['elements'][number]>>): LabelLayout => ({
  version: 1,
  elements: els.map((e, i) => ({
    id: `el${i}`,
    field: 'paciente',
    xMm: 0, yMm: 0, wMm: 10, hMm: 4, fontSize: 8,
    ...e,
  })) as LabelLayout['elements'],
});

describe('elementHeightMm', () => {
  it('usa el lado del QR como alto', () => {
    const el = layout([{ field: 'qr', wMm: 20, fontSize: 0 }]).elements[0];
    expect(elementHeightMm(el)).toBe(20);
  });

  it('deriva el alto del texto desde la fuente', () => {
    const el = layout([{ fontSize: 10 }]).elements[0];
    expect(elementHeightMm(el)).toBe(5);
  });
});

describe('scaleLayout', () => {
  it('duplica proporcionalmente al duplicar la etiqueta', () => {
    const l = layout([{ xMm: 10, yMm: 5, wMm: 20, fontSize: 8 }]);
    const out = scaleLayout(l, 40, 20, 80, 40);
    expect(out.elements[0].wMm).toBe(40);
    expect(out.elements[0].fontSize).toBe(16);
  });

  it('escala uniformemente: no deforma al cambiar la relación de aspecto', () => {
    // Dos elementos que se tocan deben seguir tocándose (misma proporción).
    const l = layout([
      { xMm: 0, yMm: 0, wMm: 20, fontSize: 8 },
      { xMm: 0, yMm: 4, wMm: 20, fontSize: 8 },
    ]);
    const out = scaleLayout(l, 50, 30, 30, 50);
    const sep = out.elements[1].yMm - out.elements[0].yMm;
    const s = Math.min(30 / 50, 50 / 30); // 0.6
    expect(sep).toBeCloseTo(4 * s, 1);
  });

  it('mantiene el QR cuadrado', () => {
    const l = layout([{ field: 'qr', xMm: 0, yMm: 0, wMm: 20, hMm: 20, fontSize: 0 }]);
    const out = scaleLayout(l, 40, 40, 20, 20);
    expect(out.elements[0].wMm).toBe(10);
    expect(out.elements[0].fontSize).toBe(0);
  });

  it('no altera nada si el tamaño no cambió', () => {
    const l = layout([{ xMm: 3, yMm: 4 }]);
    expect(scaleLayout(l, 50, 30, 50, 30)).toBe(l);
  });

  it('ignora medidas de origen inválidas', () => {
    const l = layout([{ xMm: 3 }]);
    expect(scaleLayout(l, 0, 0, 50, 30)).toBe(l);
  });
});

describe('rotateLayout90', () => {
  it('un elemento suelto queda centrado y dentro del papel girado', () => {
    const l = layout([{ xMm: 2, yMm: 1, wMm: 10, fontSize: 6 }]);
    const out = rotateLayout90(l, 50, 30); // la página pasa a 30×50
    const el = out.elements[0];
    expect(el.wMm).toBe(10);
    expect(el.xMm).toBeGreaterThanOrEqual(0);
    expect(el.xMm + el.wMm).toBeLessThanOrEqual(30 + 0.01);
    // Sin más elementos que lo anclen, el recentrado lo deja en el eje central.
    expect(el.xMm + el.wMm / 2).toBeCloseTo(15, 1);
  });

  it('conserva el orden vertical de los elementos como orden horizontal', () => {
    const l = layout([
      { xMm: 5, yMm: 2, wMm: 10, fontSize: 6 },   // arriba
      { xMm: 5, yMm: 20, wMm: 10, fontSize: 6 },  // abajo
    ]);
    const out = rotateLayout90(l, 50, 30);
    // El que estaba arriba queda más a la derecha que el que estaba abajo.
    expect(out.elements[0].xMm).toBeGreaterThan(out.elements[1].xMm);
  });

  it('no deja elementos fuera del papel tras girar y encajar', () => {
    const base = buildDefaultLayout(50, 30);
    const out = clampLayout(rotateLayout90(base, 50, 30), 30, 50);
    for (const el of out.elements) {
      expect(el.xMm).toBeGreaterThanOrEqual(0);
      expect(el.yMm).toBeGreaterThanOrEqual(0);
      expect(el.xMm + el.wMm).toBeLessThanOrEqual(30 + 0.01);
      expect(el.yMm + elementHeightMm(el)).toBeLessThanOrEqual(50 + 0.01);
    }
  });

  it('girar dos veces devuelve una composición equivalente', () => {
    const l = layout([{ xMm: 4, yMm: 3, wMm: 12, fontSize: 6 }]);
    const unaVez = rotateLayout90(l, 50, 30);
    const dosVeces = rotateLayout90(unaVez, 30, 50);
    expect(dosVeces.elements[0].wMm).toBeCloseTo(12, 1);
  });
});

describe('clampLayout', () => {
  it('encaja los elementos que se salen del papel', () => {
    const l = layout([{ xMm: 60, yMm: 40, wMm: 20, fontSize: 8 }]);
    const out = clampLayout(l, 50, 30);
    expect(out.elements[0].xMm).toBe(30); // 50 - 20
    expect(out.elements[0].yMm).toBe(26); // 30 - 4
  });

  it('recorta el ancho al del papel', () => {
    const out = clampLayout(layout([{ wMm: 80 }]), 50, 30);
    expect(out.elements[0].wMm).toBe(50);
    expect(out.elements[0].xMm).toBe(0);
  });

  it('no toca un diseño que ya cabe', () => {
    const l = layout([{ xMm: 2, yMm: 2, wMm: 10, fontSize: 6 }]);
    const out = clampLayout(l, 50, 30);
    expect(out.elements[0]).toMatchObject({ xMm: 2, yMm: 2, wMm: 10 });
  });
});

describe('buildDefaultLayout', () => {
  const cabeTodo = (l: LabelLayout, w: number, h: number) =>
    l.elements.every(el =>
      el.xMm >= -0.01 && el.yMm >= -0.01 &&
      el.xMm + el.wMm <= w + 0.01 &&
      el.yMm + elementHeightMm(el) <= h + 0.01);

  it.each([
    [50, 30], [30, 50], [40, 30], [60, 40], [100, 50], [50, 50], [25, 15],
  ])('todo el contenido cabe en una etiqueta de %i×%i mm', (w, h) => {
    expect(cabeTodo(buildDefaultLayout(w, h), w, h)).toBe(true);
  });

  it('en etiqueta apaisada pone el QR a la izquierda y el texto a su derecha', () => {
    const l = buildDefaultLayout(50, 30);
    const qr = l.elements.find(e => e.field === 'qr')!;
    const texto = l.elements.find(e => e.field === 'numero')!;
    expect(texto.xMm).toBeGreaterThan(qr.xMm + qr.wMm - 0.01);
  });

  it('en etiqueta vertical pone el QR arriba y el texto debajo', () => {
    const l = buildDefaultLayout(30, 50);
    const qr = l.elements.find(e => e.field === 'qr')!;
    const texto = l.elements.find(e => e.field === 'numero')!;
    expect(texto.yMm).toBeGreaterThan(qr.yMm + qr.wMm - 0.01);
  });

  it('mantiene una tipografía legible al comprimir', () => {
    for (const el of buildDefaultLayout(50, 30).elements) {
      if (el.field !== 'qr') expect(el.fontSize).toBeGreaterThanOrEqual(3.5);
    }
  });

  it('siempre incluye el QR y el número de orden', () => {
    const campos = buildDefaultLayout(40, 25).elements.map(e => e.field);
    expect(campos).toContain('qr');
    expect(campos).toContain('numero');
  });
});

describe('reflowLayout (girar la etiqueta)', () => {
  const alto = (el: any) => elementHeightMm(el);

  it('los textos no se superponen tras girar', () => {
    const base = buildDefaultLayout(50, 30);
    const out = reflowLayout(base, 30, 50);
    const textos = out.elements.filter(e => e.field !== 'qr');
    for (let i = 1; i < textos.length; i++) {
      // Cada renglón empieza donde termina el anterior o más abajo.
      expect(textos[i].yMm).toBeGreaterThanOrEqual(textos[i - 1].yMm + alto(textos[i - 1]) - 0.5);
    }
  });

  it('todo cabe dentro del papel girado', () => {
    const out = reflowLayout(buildDefaultLayout(50, 30), 30, 50);
    for (const el of out.elements) {
      expect(el.xMm).toBeGreaterThanOrEqual(-0.01);
      expect(el.xMm + el.wMm).toBeLessThanOrEqual(30 + 0.01);
      expect(el.yMm + alto(el)).toBeLessThanOrEqual(50 + 0.01);
    }
  });

  it('conserva los campos y su estilo', () => {
    const base = buildDefaultLayout(50, 30);
    const out = reflowLayout(base, 30, 50);
    expect(out.elements.map(e => e.field)).toEqual(base.elements.map(e => e.field));
    const numeroAntes = base.elements.find(e => e.field === 'numero')!;
    const numeroDespues = out.elements.find(e => e.field === 'numero')!;
    expect(numeroDespues.bold).toBe(numeroAntes.bold);
  });

  it('conserva prefijos y textos fijos personalizados', () => {
    const base: LabelLayout = {
      version: 1,
      elements: [
        { id: 'a', field: 'qr', xMm: 1, yMm: 1, wMm: 20, hMm: 20, fontSize: 0 },
        { id: 'b', field: 'custom', xMm: 24, yMm: 2, wMm: 20, hMm: 3, fontSize: 6, text: 'Mi óptica', prefix: '» ' },
      ],
    };
    const out = reflowLayout(base, 30, 50);
    const custom = out.elements.find(e => e.field === 'custom')!;
    expect(custom.text).toBe('Mi óptica');
    expect(custom.prefix).toBe('» ');
  });

  it('reubica el QR según la nueva forma', () => {
    const apaisado = reflowLayout(buildDefaultLayout(30, 50), 50, 30);
    const qr = apaisado.elements.find(e => e.field === 'qr')!;
    const texto = apaisado.elements.find(e => e.field !== 'qr')!;
    // En apaisada el QR queda a la izquierda del texto.
    expect(qr.xMm).toBeLessThan(texto.xMm);
  });

  it('sin elementos devuelve el diseño por defecto', () => {
    const out = reflowLayout({ version: 1, elements: [] }, 50, 30);
    expect(out.elements.length).toBeGreaterThan(0);
  });
});

describe('buildDefaultLayout + escalado', () => {
  it('el diseño por defecto cabe tras reescalar a otra medida', () => {
    const base = buildDefaultLayout(72, 50);
    const out = clampLayout(scaleLayout(base, 72, 50, 50, 30), 50, 30);
    for (const el of out.elements) {
      expect(el.xMm).toBeGreaterThanOrEqual(0);
      expect(el.yMm).toBeGreaterThanOrEqual(0);
      expect(el.xMm + el.wMm).toBeLessThanOrEqual(50 + 0.01);
      expect(el.yMm + elementHeightMm(el)).toBeLessThanOrEqual(30 + 0.01);
    }
  });
});
