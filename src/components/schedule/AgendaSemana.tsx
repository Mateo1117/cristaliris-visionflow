/**
 * Vista semanal de la agenda: lunes a domingo en columnas y las horas en
 * filas, con cada cita ubicada según su hora y duración. Con un médico
 * elegido se sombrea su horario de atención y sus ausencias; clic en un
 * espacio vacío agenda ahí.
 */
import { Badge } from '@/components/ui/badge';
import { useMemo } from 'react';
import { aMinutos, aHora, diaCompletoBloqueado, excepcionesDelDia, type BloqueHorario, type Excepcion } from '@/lib/disponibilidad';
import { ESTADO_CITA_LABEL } from '@/lib/flujoAtencion';
import { colorMedico, type Medico } from '@/lib/useAgendaDatos';
import { aHoraCorta } from '@/lib/agendaGrid';
import type { PrefijoCita } from './NuevaCitaDialog';

const PX_POR_MIN = 0.9; // 54 px por hora
const DIAS_CORTOS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
const INACTIVAS = ['cancelada', 'no_asistio'];

interface Props {
  dias: string[];
  hoy: string;
  citas: any[];
  medicos: Medico[];
  horarios: BloqueHorario[];
  excepciones: Excepcion[];
  /** Médico elegido; null = todos. */
  medicoId: string | null;
  puedeAgendar: boolean;
  onNuevaCita: (p: PrefijoCita) => void;
  onAbrirDia: (fecha: string) => void;
}

/** Reparte citas que se cruzan en carriles lado a lado. */
function carriles(citas: any[]) {
  const orden = [...citas].sort((a, b) => a.hora_inicio.localeCompare(b.hora_inicio));
  const finCarril: number[] = [];
  const asignadas = orden.map((c) => {
    const ini = aMinutos(c.hora_inicio);
    let carril = finCarril.findIndex((fin) => fin <= ini);
    if (carril < 0) { carril = finCarril.length; finCarril.push(0); }
    finCarril[carril] = aMinutos(c.hora_fin);
    return { cita: c, carril };
  });
  return { asignadas, total: Math.max(1, finCarril.length) };
}

export function AgendaSemana({ dias, hoy, citas, medicos, horarios, excepciones, medicoId, puedeAgendar, onNuevaCita, onAbrirDia }: Props) {
  const horariosVisibles = horarios.filter((h) => h.activo && (!medicoId || h.medico_id === medicoId));

  // Rango de horas: el de los horarios y las citas de la semana, mínimo 7:00–19:00.
  const [inicio, fin] = useMemo(() => {
    let ini = 7 * 60;
    let f = 19 * 60;
    for (const h of horariosVisibles) { ini = Math.min(ini, aMinutos(h.hora_inicio)); f = Math.max(f, aMinutos(h.hora_fin)); }
    for (const c of citas) { ini = Math.min(ini, aMinutos(c.hora_inicio)); f = Math.max(f, aMinutos(c.hora_fin)); }
    return [Math.floor(ini / 60) * 60, Math.ceil(f / 60) * 60];
  }, [horariosVisibles, citas]);
  const alto = (fin - inicio) * PX_POR_MIN;
  const horas = Array.from({ length: (fin - inicio) / 60 }, (_, i) => inicio + i * 60);

  const clicEnDia = (fecha: string, e: React.MouseEvent<HTMLDivElement>) => {
    if (!puedeAgendar || fecha < hoy) return;
    const y = e.clientY - e.currentTarget.getBoundingClientRect().top;
    const min = inicio + Math.floor(y / PX_POR_MIN / 15) * 15;
    if (!medicoId) return onNuevaCita({ fecha });
    const dia = new Date(`${fecha}T12:00:00`).getDay();
    const bloque = horariosVisibles.find((h) => h.dia_semana === dia && aMinutos(h.hora_inicio) <= min && min < aMinutos(h.hora_fin));
    const dur = bloque?.duracion_cita ?? 30;
    onNuevaCita({ fecha, medicoId, horaInicio: aHora(min), horaFin: aHora(min + dur), sedeId: bloque?.sede_id ?? null });
  };

  return (
    <div className="rounded-lg border overflow-x-auto">
      <div className="min-w-[760px]">
        {/* Encabezado */}
        <div className="grid grid-cols-[56px_repeat(7,1fr)] border-b bg-muted/40 sticky top-0 z-10">
          <div />
          {dias.map((d) => {
            const n = citas.filter((c) => c.fecha === d && !INACTIVAS.includes(c.estado)).length;
            const ausencia = medicoId ? diaCompletoBloqueado(medicoId, d, excepciones) : undefined;
            return (
              <button key={d} type="button" onClick={() => onAbrirDia(d)}
                className={`px-2 py-2 text-left border-l hover:bg-muted ${d === hoy ? 'bg-primary/10' : ''}`}>
                <p className="text-xs text-muted-foreground">{DIAS_CORTOS[new Date(`${d}T12:00:00`).getDay()]}</p>
                <p className={`text-lg font-semibold leading-tight ${d === hoy ? 'text-primary' : ''}`}>{Number(d.slice(8))}</p>
                <p className="text-[10px] text-muted-foreground">{ausencia ? ausencia.motivo : `${n} cita${n !== 1 ? 's' : ''}`}</p>
              </button>
            );
          })}
        </div>

        {/* Cuerpo */}
        <div className="grid grid-cols-[56px_repeat(7,1fr)]">
          <div className="relative" style={{ height: alto }}>
            {horas.map((h) => (
              <span key={h} className="absolute right-2 text-[10px] text-muted-foreground -translate-y-1/2" style={{ top: (h - inicio) * PX_POR_MIN }}>
                {h > inicio ? aHora(h) : ''}
              </span>
            ))}
          </div>

          {dias.map((d) => {
            const diaSemana = new Date(`${d}T12:00:00`).getDay();
            const delDia = citas.filter((c) => c.fecha === d && (!medicoId || c.optometra_id === medicoId));
            const { asignadas, total } = carriles(delDia);
            const franjas = medicoId ? horariosVisibles.filter((h) => h.dia_semana === diaSemana) : [];
            const bloqueos = medicoId ? excepcionesDelDia(medicoId, d, excepciones) : [];
            return (
              <div
                key={d}
                className={`relative border-l ${d < hoy ? 'bg-muted/30' : ''} ${puedeAgendar && d >= hoy ? 'cursor-copy' : ''}`}
                style={{ height: alto }}
                onClick={(e) => clicEnDia(d, e)}
              >
                {/* Líneas de hora */}
                {horas.map((h) => <div key={h} className="absolute inset-x-0 border-t border-border/50" style={{ top: (h - inicio) * PX_POR_MIN }} />)}
                {/* Horario de atención del médico */}
                {franjas.map((f) => (
                  <div key={f.id ?? f.hora_inicio} className="absolute inset-x-0 bg-primary/[0.06]"
                    style={{ top: (aMinutos(f.hora_inicio) - inicio) * PX_POR_MIN, height: (aMinutos(f.hora_fin) - aMinutos(f.hora_inicio)) * PX_POR_MIN }} />
                ))}
                {/* Ausencias y bloqueos */}
                {bloqueos.map((b) => {
                  const ini = b.hora_inicio ? aMinutos(b.hora_inicio) : inicio;
                  const f = b.hora_fin ? aMinutos(b.hora_fin) : fin;
                  return (
                    <div key={b.id} className="absolute inset-x-0 bg-[repeating-linear-gradient(135deg,hsl(var(--muted))_0_6px,transparent_6px_12px)] border-y border-warning/40 flex items-start justify-center"
                      style={{ top: (ini - inicio) * PX_POR_MIN, height: (f - ini) * PX_POR_MIN }}>
                      <span className="mt-1 text-[10px] bg-background/90 px-1 rounded text-warning">{b.motivo}</span>
                    </div>
                  );
                })}
                {/* Citas */}
                {asignadas.map(({ cita, carril }) => {
                  const top = (aMinutos(cita.hora_inicio) - inicio) * PX_POR_MIN;
                  const h = Math.max(18, (aMinutos(cita.hora_fin) - aMinutos(cita.hora_inicio)) * PX_POR_MIN - 2);
                  const color = colorMedico(medicos, cita.optometra_id);
                  const inactiva = INACTIVAS.includes(cita.estado);
                  const medico = medicos.find((m) => m.user_id === cita.optometra_id)?.nombre ?? 'Sin asignar';
                  return (
                    <button
                      key={cita.id}
                      type="button"
                      onClick={(e) => { e.stopPropagation(); onAbrirDia(d); }}
                      title={`${aHoraCorta(cita.hora_inicio)}–${aHoraCorta(cita.hora_fin)} · ${cita.pacientes?.nombres} ${cita.pacientes?.apellidos}\n${medico} · ${ESTADO_CITA_LABEL[cita.estado] ?? cita.estado}`}
                      className={`absolute rounded border px-1 py-0.5 text-left overflow-hidden text-[10px] leading-tight hover:z-20 hover:shadow-md ${color.bloque} ${inactiva ? 'opacity-50 line-through' : ''}`}
                      style={{ top, height: h, left: `calc(${(carril / total) * 100}% + 1px)`, width: `calc(${100 / total}% - 3px)` }}
                    >
                      <span className="font-semibold">{aHoraCorta(cita.hora_inicio)}</span>{' '}
                      <span className="font-medium">{cita.pacientes?.nombres} {cita.pacientes?.apellidos}</span>
                      {h > 32 && <span className="block opacity-75">{ESTADO_CITA_LABEL[cita.estado] ?? cita.estado}</span>}
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>

      {/* Leyenda de médicos */}
      {!medicoId && medicos.length > 1 && (
        <div className="flex flex-wrap gap-3 border-t px-3 py-2">
          {medicos.map((m) => (
            <Badge key={m.user_id} variant="outline" className="gap-1.5 font-normal">
              <span className={`h-2 w-2 rounded-full ${colorMedico(medicos, m.user_id).punto}`} />{m.nombre}
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}
