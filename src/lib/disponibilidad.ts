/**
 * Disponibilidad de la agenda: cruza los horarios configurados de cada médico
 * con las citas ya tomadas y devuelve los turnos libres de un día.
 *
 * Antes la cita se agendaba escribiendo la hora a mano, sin mirar los horarios
 * ni las citas existentes, así que se podía agendar fuera del horario del
 * médico o encima de otra cita.
 */

export interface BloqueHorario {
  id?: string;
  medico_id: string;
  dia_semana: number;
  hora_inicio: string;
  hora_fin: string;
  duracion_cita: number;
  sede_id: string | null;
  activo: boolean;
}

export interface CitaOcupada {
  optometra_id: string | null;
  hora_inicio: string;
  hora_fin: string;
  estado: string;
}

/** Ausencia o bloqueo (tabla horarios_excepciones). Sin horas = día completo. */
export interface Excepcion {
  id?: string;
  medico_id: string;
  fecha_inicio: string;
  fecha_fin: string;
  hora_inicio?: string | null;
  hora_fin?: string | null;
  motivo?: string | null;
}

export interface Turno {
  medico_id: string;
  sede_id: string | null;
  hora_inicio: string;
  hora_fin: string;
}

/** Una cita cancelada o en la que el paciente no llegó libera el turno. */
export const ESTADOS_QUE_LIBERAN = ['cancelada', 'no_asistio'];

export const DIAS_SEMANA = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

/** 'HH:MM[:SS]' → minutos desde la medianoche. */
export const aMinutos = (hora: string): number => {
  const [h, m] = hora.split(':').map(Number);
  return h * 60 + (m || 0);
};

/** Minutos desde la medianoche → 'HH:MM'. */
export const aHora = (minutos: number): string =>
  `${String(Math.floor(minutos / 60)).padStart(2, '0')}:${String(minutos % 60).padStart(2, '0')}`;

/** Día de la semana (0 = domingo) de una fecha 'yyyy-MM-dd', sin zonas horarias. */
export const diaDeSemana = (fecha: string): number => {
  const [a, m, d] = fecha.split('-').map(Number);
  return new Date(Date.UTC(a, m - 1, d)).getUTCDay();
};

/** ¿Se cruzan los rangos [inicioA, finA) y [inicioB, finB)? */
export const haySolape = (inicioA: string, finA: string, inicioB: string, finB: string): boolean =>
  aMinutos(inicioA) < aMinutos(finB) && aMinutos(inicioB) < aMinutos(finA);

/** Un bloque sin sede atiende en todas las sedes. */
const atiendeEnSede = (bloque: { sede_id: string | null }, sedeId?: string | null): boolean =>
  !sedeId || !bloque.sede_id || bloque.sede_id === sedeId;

/**
 * Valida un bloque nuevo (o editado) contra los ya configurados del médico.
 * Devuelve el mensaje de error, o null si es válido. Un médico no puede estar
 * en dos bloques a la vez aunque sean en sedes distintas.
 */
export function validarBloque(
  nuevo: Pick<BloqueHorario, 'dia_semana' | 'hora_inicio' | 'hora_fin' | 'duracion_cita'> & { id?: string },
  existentes: BloqueHorario[],
): string | null {
  const inicio = aMinutos(nuevo.hora_inicio);
  const fin = aMinutos(nuevo.hora_fin);
  if (inicio >= fin) return 'La hora de fin debe ser mayor a la hora de inicio';
  if (!Number.isFinite(nuevo.duracion_cita) || nuevo.duracion_cita < 5) {
    return 'La duración de la cita debe ser de al menos 5 minutos';
  }
  if (nuevo.duracion_cita > fin - inicio) {
    return 'La duración de la cita no cabe en el bloque';
  }
  const choque = existentes.find((b) =>
    (!nuevo.id || b.id !== nuevo.id) &&
    b.dia_semana === nuevo.dia_semana &&
    haySolape(b.hora_inicio, b.hora_fin, nuevo.hora_inicio, nuevo.hora_fin));
  if (choque) {
    return `${DIAS_SEMANA[nuevo.dia_semana]}: se cruza con el bloque ${choque.hora_inicio.slice(0, 5)}–${choque.hora_fin.slice(0, 5)}`;
  }
  return null;
}

interface OpcionesTurnos {
  fecha: string;
  horarios: BloqueHorario[];
  citas: CitaOcupada[];
  sedeId?: string | null;
  medicoId?: string | null;
  /** Minutos desde la medianoche; los turnos que empiezan antes no se ofrecen (p. ej. la hora actual si la fecha es hoy). */
  desdeMinutos?: number;
  /** Ausencias y bloqueos: los turnos que caen dentro no se ofrecen. */
  excepciones?: Excepcion[];
}

/** Excepciones de un médico que aplican a una fecha. */
export const excepcionesDelDia = (medicoId: string, fecha: string, excepciones: Excepcion[] = []) =>
  excepciones.filter((e) => e.medico_id === medicoId && e.fecha_inicio <= fecha && fecha <= e.fecha_fin);

/** ¿El rango cae en una ausencia o bloqueo del médico ese día? */
export function estaBloqueado(medicoId: string, fecha: string, horaInicio: string, horaFin: string, excepciones: Excepcion[] = []): Excepcion | undefined {
  return excepcionesDelDia(medicoId, fecha, excepciones).find((e) =>
    !e.hora_inicio || !e.hora_fin || haySolape(e.hora_inicio, e.hora_fin, horaInicio, horaFin));
}

/** ¿El médico tiene bloqueado el día completo? */
export const diaCompletoBloqueado = (medicoId: string, fecha: string, excepciones: Excepcion[] = []) =>
  excepcionesDelDia(medicoId, fecha, excepciones).find((e) => !e.hora_inicio || !e.hora_fin);

/** Turnos libres del día, ordenados por hora y luego por médico. */
export function calcularTurnos({ fecha, horarios, citas, sedeId, medicoId, desdeMinutos = 0, excepciones = [] }: OpcionesTurnos): Turno[] {
  const dia = diaDeSemana(fecha);
  const ocupadas = citas.filter((c) => c.optometra_id && !ESTADOS_QUE_LIBERAN.includes(c.estado));
  const vistos = new Set<string>();
  const turnos: Turno[] = [];

  for (const b of horarios) {
    if (!b.activo || b.dia_semana !== dia) continue;
    if (medicoId && b.medico_id !== medicoId) continue;
    if (!atiendeEnSede(b, sedeId)) continue;
    const duracion = b.duracion_cita > 0 ? b.duracion_cita : 30;
    const fin = aMinutos(b.hora_fin);

    for (let t = aMinutos(b.hora_inicio); t + duracion <= fin; t += duracion) {
      if (t < desdeMinutos) continue;
      const turno: Turno = { medico_id: b.medico_id, sede_id: b.sede_id, hora_inicio: aHora(t), hora_fin: aHora(t + duracion) };
      const clave = `${turno.medico_id}|${turno.hora_inicio}`;
      if (vistos.has(clave)) continue;
      if (estaBloqueado(b.medico_id, fecha, turno.hora_inicio, turno.hora_fin, excepciones)) continue;
      const ocupado = ocupadas.some((c) =>
        c.optometra_id === b.medico_id && haySolape(c.hora_inicio, c.hora_fin, turno.hora_inicio, turno.hora_fin));
      if (ocupado) continue;
      vistos.add(clave);
      turnos.push(turno);
    }
  }

  return turnos.sort((a, b) => a.hora_inicio.localeCompare(b.hora_inicio) || a.medico_id.localeCompare(b.medico_id));
}

/** Busca una cita activa del mismo médico que se cruce con el rango indicado. */
export function buscarCruce(
  medicoId: string,
  horaInicio: string,
  horaFin: string,
  citas: Array<CitaOcupada & { id?: string }>,
  excluirId?: string,
): (CitaOcupada & { id?: string }) | undefined {
  return citas.find((c) =>
    c.id !== excluirId &&
    c.optometra_id === medicoId &&
    !ESTADOS_QUE_LIBERAN.includes(c.estado) &&
    haySolape(c.hora_inicio, c.hora_fin, horaInicio, horaFin));
}

/** ¿El rango cae dentro de algún bloque activo del médico ese día? */
export function dentroDeHorario(medicoId: string, fecha: string, horaInicio: string, horaFin: string, horarios: BloqueHorario[]): boolean {
  const dia = diaDeSemana(fecha);
  return horarios.some((b) =>
    b.activo && b.medico_id === medicoId && b.dia_semana === dia &&
    aMinutos(b.hora_inicio) <= aMinutos(horaInicio) && aMinutos(horaFin) <= aMinutos(b.hora_fin));
}

/** Horas de atención y turnos posibles por semana de un conjunto de bloques activos. */
export function resumenSemanal(bloques: Array<Pick<BloqueHorario, 'hora_inicio' | 'hora_fin' | 'duracion_cita' | 'activo' | 'dia_semana'>>) {
  let minutos = 0;
  let turnos = 0;
  const dias = new Set<number>();
  for (const b of bloques) {
    if (!b.activo) continue;
    const largo = aMinutos(b.hora_fin) - aMinutos(b.hora_inicio);
    if (largo <= 0) continue;
    minutos += largo;
    turnos += b.duracion_cita > 0 ? Math.floor(largo / b.duracion_cita) : 0;
    dias.add(b.dia_semana);
  }
  return { horas: Math.round((minutos / 60) * 10) / 10, turnos, dias: dias.size };
}
