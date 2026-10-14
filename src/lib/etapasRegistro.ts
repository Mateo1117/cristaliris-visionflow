/**
 * Registro de las etapas del tablero, sin dependencias de Supabase para que
 * `businessDays` y `@/types` (que se prueban sin conexión) puedan leerlo.
 * Lo llena `useEtapasKanban` (etapasKanban.ts) al cargar la configuración.
 */

export interface EtapaKanban {
  clave: string;
  nombre: string;
  orden: number;
  color: string;
  visible: boolean;
  responsable_id: string | null;
  es_laboratorio: boolean;
  sistema: boolean;
}

/** Colores disponibles: clases literales para que Tailwind las incluya. */
export const COLORES_ETAPA: Record<string, { etiqueta: string; insignia: string; punto: string }> = {
  gris: { etiqueta: 'Gris', insignia: 'bg-muted text-muted-foreground border-muted-foreground/30', punto: 'bg-slate-400' },
  morado: { etiqueta: 'Morado', insignia: 'bg-violet-500/15 text-violet-700 dark:text-violet-300 border-violet-500/30', punto: 'bg-violet-500' },
  azul: { etiqueta: 'Azul', insignia: 'bg-info/15 text-info border-info/30', punto: 'bg-sky-500' },
  amarillo: { etiqueta: 'Amarillo', insignia: 'bg-warning/15 text-warning border-warning/30', punto: 'bg-amber-500' },
  naranja: { etiqueta: 'Naranja', insignia: 'bg-orange-500/15 text-orange-700 dark:text-orange-300 border-orange-500/30', punto: 'bg-orange-500' },
  cian: { etiqueta: 'Cian', insignia: 'bg-primary/15 text-primary border-primary/30', punto: 'bg-cyan-500' },
  verde: { etiqueta: 'Verde', insignia: 'bg-success/15 text-success border-success/30', punto: 'bg-emerald-500' },
  rojo: { etiqueta: 'Rojo', insignia: 'bg-destructive/15 text-destructive border-destructive/30', punto: 'bg-rose-500' },
};

/** Etapas si la tabla aún no existe: las 11 originales. */
export const ETAPAS_POR_DEFECTO: EtapaKanban[] = [
  ['pedido_creado', 'Pedido Creado', 'gris', false],
  ['alistamiento', 'Alistamiento', 'morado', false],
  ['enviado_laboratorio', 'Envío a Laboratorio', 'azul', true],
  ['recibido_laboratorio', 'Recibido en Laboratorio', 'azul', true],
  ['en_produccion', 'Producción', 'amarillo', true],
  ['producido', 'Producido', 'amarillo', true],
  ['en_transito', 'En Tránsito', 'cian', false],
  ['recibido_optica', 'Recibido en Óptica', 'cian', false],
  ['control_calidad', 'Control de Calidad', 'naranja', false],
  ['listo_entrega', 'Listo para Entrega', 'verde', false],
  ['entregado', 'Entregado', 'verde', false],
].map(([clave, nombre, color, lab], i) => ({
  clave: clave as string, nombre: nombre as string, orden: i + 1, color: color as string,
  visible: true, responsable_id: null, es_laboratorio: lab as boolean, sistema: true,
}));

let registro: EtapaKanban[] = ETAPAS_POR_DEFECTO;

/** Llamado al cargar las etapas; las funciones de abajo leen este registro. */
export function registrarEtapas(etapas: EtapaKanban[]) {
  if (etapas.length) registro = [...etapas].sort((a, b) => a.orden - b.orden);
}

export const todasLasEtapas = () => registro;
export const etapasVisibles = () => registro.filter((e) => e.visible);
export const buscarEtapa = (clave: string) => registro.find((e) => e.clave === clave);
export const indiceEtapa = (clave: string) => registro.findIndex((e) => e.clave === clave);
export const claseColorEtapa = (clave: string) => COLORES_ETAPA[buscarEtapa(clave)?.color ?? 'gris']?.insignia ?? COLORES_ETAPA.gris.insignia;
