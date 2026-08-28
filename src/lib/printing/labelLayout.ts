/**
 * Layout visual de la etiqueta — definido por el usuario en el diseñador.
 *
 * Coordenadas en MILÍMETROS sobre la página final (después de rotación).
 * El renderer (thermal.ts) recorta cada texto a wMm y dibuja a la fuente
 * indicada. El QR se dibuja como imagen cuadrada usando wMm como tamaño.
 */

export type LabelField =
  | 'qr'
  | 'optica'
  | 'numero'
  | 'paciente'
  | 'descripcion'
  | 'laboratorio'
  | 'numeroOrdenLab'
  | 'numeroMontura'
  | 'fechaEntrega'
  | 'sede'
  | 'formula'
  | 'custom';

export interface LabelElement {
  id: string;
  field: LabelField;
  xMm: number;
  yMm: number;
  wMm: number;
  hMm: number;            // sólo informativo para texto; QR usa wMm como lado
  fontSize: number;       // pt
  bold?: boolean;
  align?: 'left' | 'center' | 'right';
  prefix?: string;        // se antepone al valor, ej "M: "
  text?: string;          // para campo 'custom'
}

export interface LabelLayout {
  version: 1;
  elements: LabelElement[];
}

export const FIELD_LABELS: Record<LabelField, string> = {
  qr: 'QR',
  optica: 'Cristaliris',
  numero: 'Nº orden',
  paciente: 'Paciente',
  descripcion: 'Tipo de lente',
  laboratorio: 'Laboratorio',
  numeroOrdenLab: 'Nº orden lab',
  numeroMontura: 'Nº montura',
  fechaEntrega: 'Fecha',
  sede: 'Sede',
  formula: 'Fórmula',
  custom: 'Texto fijo',
};

export const SAMPLE_VALUES: Record<LabelField, string> = {
  qr: '',
  optica: 'Cristaliris',
  numero: 'ORD-00001',
  paciente: 'Juan Pérez',
  descripcion: 'Lente progresivo AR',
  laboratorio: 'Lab Óptico',
  numeroOrdenLab: 'LAB-4821',
  numeroMontura: 'M-123',
  fechaEntrega: '15/06/26',
  sede: 'Sede Centro',
  formula: 'OD -1.00 -0.50 x90 / OI -1.25 -0.75 x85',
  custom: 'Texto',
};

const uid = () => Math.random().toString(36).slice(2, 10);

/**
 * Diseño por defecto, adaptado a la forma y al tamaño real de la etiqueta.
 *
 * - Etiqueta apaisada (50×30, 60×40…): QR a la izquierda y los datos a la
 *   derecha, que es como mejor se aprovecha el ancho.
 * - Etiqueta vertical o cuadrada: QR arriba y los datos debajo.
 *
 * En ambos casos sólo se incluyen las líneas que CABEN: en una etiqueta
 * pequeña es preferible mostrar menos datos legibles que seis renglones
 * amontonados o saliéndose del papel.
 */
export const buildDefaultLayout = (widthMm: number, heightMm: number): LabelLayout => {
  // Margen mínimo: la etiqueta es pequeña y el objetivo es aprovecharla toda.
  const pad = Math.max(0.8, Math.min(widthMm, heightMm) * 0.03);
  const apaisada = widthMm >= heightMm * 1.2;

  // Contenido estándar de la etiqueta de la óptica, por orden de importancia.
  // Los tamaños son la proporción entre líneas; luego se amplían todos juntos
  // hasta llenar el alto disponible.
  const campos: Array<{ field: LabelField; fontSize: number; bold?: boolean; prefix?: string }> = [
    { field: 'optica', fontSize: 8, bold: true },
    { field: 'numero', fontSize: 8, bold: true },
    { field: 'paciente', fontSize: 7.5 },
    { field: 'descripcion', fontSize: 7 },
    { field: 'numeroOrdenLab', fontSize: 7, prefix: 'Lab: ' },
    { field: 'fechaEntrega', fontSize: 6.5 },
  ];

  // El QR ocupa todo el ancho que puede sin robarle espacio a los datos.
  const qrSize = apaisada
    ? Math.min(heightMm - pad * 2, widthMm * 0.44)
    : Math.min(widthMm - pad * 2, heightMm * 0.42);

  const qr: LabelElement = {
    id: uid(),
    field: 'qr',
    xMm: apaisada ? pad : round1((widthMm - qrSize) / 2),
    yMm: apaisada ? round1((heightMm - qrSize) / 2) : pad,
    wMm: round1(qrSize),
    hMm: round1(qrSize),
    fontSize: 0,
  };

  const textX = apaisada ? pad + qrSize + 1.2 : pad;
  const textW = Math.max(6, (apaisada ? widthMm - textX - pad : widthMm - pad * 2));
  const yInicio = apaisada ? pad : pad + qrSize + 1.2;
  const yTope = heightMm - pad;

  // Factor de escala de la tipografía: se AMPLÍA hasta llenar el alto libre
  // (no sólo se reduce cuando no cabe), para aprovechar toda la etiqueta.
  const altoNecesario = campos.reduce((acc, c) => acc + c.fontSize * 0.62, 0);
  const altoDisponible = Math.max(1, yTope - yInicio);
  const anchoDisponible = Math.max(6, (apaisada ? widthMm - (pad + qrSize + 1.2) - pad : widthMm - pad * 2));
  // Tope por ancho: en Helvetica un carácter mide ≈ 0,5 em, y 1 pt = 0,3528 mm,
  // así que cada carácter ocupa ≈ fontSize × 0,176 mm. Se toma una línea de
  // referencia de 20 caracteres ("Lente progresivo AR").
  const fontMax = Math.max(...campos.map(c => c.fontSize));
  const fontPorAncho = anchoDisponible / (20 * 0.176);
  const factor = clampNum(
    Math.min((altoDisponible / altoNecesario) * 0.98, fontPorAncho / fontMax),
    0.35,
    2.2,
  );

  const lineas: LabelElement[] = [];
  let y = yInicio;
  for (const c of campos) {
    const fontSize = round1(clampNum(c.fontSize * factor, 4, 48));
    const alto = fontSize * 0.62;
    if (y + alto > yTope + 0.01) break; // no cabe: se omite este campo y los siguientes
    lineas.push({
      id: uid(),
      field: c.field,
      xMm: round1(textX),
      yMm: round1(y),
      wMm: round1(textW),
      hMm: round1(fontSize * 0.5),
      fontSize,
      bold: c.bold,
      align: apaisada ? 'left' : 'center',
      prefix: c.prefix,
    });
    y += alto;
  }

  return { version: 1, elements: [qr, ...lineas] };
};

export const LABEL_PX_PER_MM = 8;

/** Alto ocupado por un elemento (mm). El QR es cuadrado; el texto deriva de la fuente. */
export const elementHeightMm = (el: LabelElement): number =>
  el.field === 'qr' ? el.wMm : Math.max(2, el.fontSize * 0.5);

/**
 * Reescala un diseño de un tamaño de etiqueta a otro.
 *
 * El factor es UNIFORME (el mismo en X y en Y) y luego el conjunto se recentra
 * en la página nueva. Escalar cada eje por separado deformaría la composición:
 * al pasar de 50×30 a 30×50 los elementos se aplastarían de ancho y se
 * separarían de alto, dejando huecos en mitad de la etiqueta.
 */
export const scaleLayout = (
  layout: LabelLayout,
  fromW: number,
  fromH: number,
  toW: number,
  toH: number,
): LabelLayout => {
  if (!layout?.elements?.length) return layout;
  if (fromW <= 0 || fromH <= 0) return layout;
  if (Math.abs(fromW - toW) < 0.01 && Math.abs(fromH - toH) < 0.01) return layout;

  const s = Math.min(toW / fromW, toH / fromH);

  const escalados = layout.elements.map((el) => ({
    ...el,
    xMm: el.xMm * s,
    yMm: el.yMm * s,
    wMm: el.wMm * s,
    hMm: el.hMm * s,
    fontSize: el.field === 'qr' ? 0 : clampNum(el.fontSize * s, 3, 48),
  }));

  return { ...layout, elements: recentrar(escalados, toW, toH) };
};

/**
 * Gira el diseño 90° en sentido horario para adaptarlo a una etiqueta cuya
 * orientación cambió (p. ej. 50×30 → 30×50).
 *
 * Se rotan las POSICIONES pero los elementos siguen en horizontal, para que
 * los textos continúen siendo legibles; sólo se recorta el ancho al de la
 * página nueva cuando haga falta.
 */
export const rotateLayout90 = (layout: LabelLayout, fromW: number, fromH: number): LabelLayout => {
  if (!layout?.elements?.length) return layout;
  const toW = fromH;
  const toH = fromW;

  const rotados = layout.elements.map((el) => {
    const h = elementHeightMm(el);
    // Centro del elemento en la página original.
    const cx = el.xMm + el.wMm / 2;
    const cy = el.yMm + h / 2;
    // Giro horario: (x, y) → (altoOriginal − y, x)
    const ncx = fromH - cy;
    const ncy = cx;

    const wMm = Math.min(el.wMm, toW);
    const nh = el.field === 'qr' ? wMm : h;
    return {
      ...el,
      wMm,
      xMm: ncx - wMm / 2,
      yMm: ncy - nh / 2,
    };
  });

  return { ...layout, elements: recentrar(rotados, toW, toH) };
};

/**
 * Reorganiza el diseño para una etiqueta con otra forma, CONSERVANDO los
 * campos elegidos y su estilo (negrita, prefijo, texto fijo, orden).
 *
 * Es lo que se usa al girar la etiqueta: una rotación geométrica pura dejaría
 * los renglones convertidos en columnas superpuestas, porque un texto de 25 mm
 * de ancho no cabe seis veces a lo largo de 30 mm. Aquí se recoloca el QR y se
 * vuelven a apilar los textos según la nueva forma.
 */
export const reflowLayout = (layout: LabelLayout, toW: number, toH: number): LabelLayout => {
  if (!layout?.elements?.length) return buildDefaultLayout(toW, toH);

  const qrOriginal = layout.elements.find(e => e.field === 'qr');
  const textos = layout.elements.filter(e => e.field !== 'qr');
  if (!textos.length) return clampLayout(scaleLayout(layout, toW, toH, toW, toH), toW, toH);

  const pad = Math.max(1, Math.min(toW, toH) * 0.05);
  const apaisada = toW >= toH * 1.2;

  // Referencia: el diseño por defecto de esta forma, del que se toman las
  // posiciones; sobre ellas se vuelcan los campos reales del usuario.
  const molde = buildDefaultLayout(toW, toH);
  const moldeTextos = molde.elements.filter(e => e.field !== 'qr');
  const moldeQr = molde.elements.find(e => e.field === 'qr')!;

  const qr: LabelElement | null = qrOriginal
    ? { ...qrOriginal, xMm: moldeQr.xMm, yMm: moldeQr.yMm, wMm: moldeQr.wMm, hMm: moldeQr.hMm }
    : null;

  const textX = apaisada ? (qr ? pad + qr.wMm + 1.5 : pad) : pad;
  const textW = Math.max(6, toW - textX - pad);

  // Alto disponible para los textos y reparto proporcional a su fuente.
  // El 0,97 es holgura: sin él, el redondeo de la última línea la dejaba fuera
  // y el campo desaparecía al girar la etiqueta.
  const yInicio = apaisada ? pad : (qr ? qr.yMm + qr.wMm + 1.5 : pad);
  const disponible = Math.max(1, toH - pad - yInicio);
  const sumaFuentes = textos.reduce((a, t) => a + Math.max(3, t.fontSize), 0);
  const factor = clampNum((disponible / (sumaFuentes * 0.62)) * 0.97, 0.35, 1.6);

  let y = yInicio;
  const colocados: LabelElement[] = [];
  for (const t of textos) {
    const fontSize = round1(clampNum(t.fontSize * factor, 3.5, 48));
    const alto = fontSize * 0.62;
    if (y + alto > toH + 0.01) break;
    colocados.push({
      ...t,
      xMm: round1(textX),
      yMm: round1(y),
      wMm: round1(textW),
      hMm: round1(fontSize * 0.5),
      fontSize,
      align: t.align ?? (apaisada ? 'left' : 'center'),
    });
    y += alto;
  }

  return { ...layout, elements: qr ? [qr, ...colocados] : colocados };
};

/** Centra el conjunto de elementos dentro de la página, conservando su composición. */
const recentrar = (elements: LabelElement[], toW: number, toH: number): LabelElement[] => {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const el of elements) {
    const h = elementHeightMm(el);
    minX = Math.min(minX, el.xMm);
    minY = Math.min(minY, el.yMm);
    maxX = Math.max(maxX, el.xMm + el.wMm);
    maxY = Math.max(maxY, el.yMm + h);
  }
  if (!Number.isFinite(minX)) return elements;

  const dx = (toW - (maxX - minX)) / 2 - minX;
  const dy = (toH - (maxY - minY)) / 2 - minY;

  return elements.map((el) => ({
    ...el,
    xMm: round1(el.xMm + dx),
    yMm: round1(el.yMm + dy),
    wMm: round1(el.wMm),
    hMm: round1(el.hMm),
    fontSize: el.field === 'qr' ? 0 : round1(el.fontSize),
  }));
};

/**
 * Encaja los elementos dentro de los límites del papel sin destruir el diseño.
 * Devuelve el layout original si ya cabe.
 */
export const clampLayout = (layout: LabelLayout, widthMm: number, heightMm: number): LabelLayout => {
  if (!layout?.elements?.length) return layout;
  return {
    ...layout,
    elements: layout.elements.map((el) => {
      const wMm = Math.min(el.wMm, widthMm);
      const h = el.field === 'qr' ? wMm : elementHeightMm(el);
      return {
        ...el,
        wMm: round1(wMm),
        xMm: round1(clampNum(el.xMm, 0, Math.max(0, widthMm - wMm))),
        yMm: round1(clampNum(el.yMm, 0, Math.max(0, heightMm - h))),
      };
    }),
  };
};

const round1 = (n: number) => Math.round(n * 10) / 10;
const clampNum = (n: number, min: number, max: number) =>
  !Number.isFinite(n) ? min : Math.max(min, Math.min(max, n));
