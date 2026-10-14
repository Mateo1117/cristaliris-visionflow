/**
 * Vista mensual de la agenda: cada día con el número de citas y las
 * primeras, coloreadas por médico. Clic en un día abre su vista diaria.
 */
import { diaCompletoBloqueado, type Excepcion } from '@/lib/disponibilidad';
import { colorMedico, type Medico } from '@/lib/useAgendaDatos';
import { aHoraCorta } from '@/lib/agendaGrid';

const ENCABEZADO = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
const INACTIVAS = ['cancelada', 'no_asistio'];
const MAX_VISIBLES = 3;

interface Props {
  semanas: string[][];
  /** Mes mostrado, 'yyyy-MM'. */
  mes: string;
  hoy: string;
  citas: any[];
  medicos: Medico[];
  excepciones: Excepcion[];
  medicoId: string | null;
  onAbrirDia: (fecha: string) => void;
}

export function AgendaMes({ semanas, mes, hoy, citas, medicos, excepciones, medicoId, onAbrirDia }: Props) {
  return (
    <div className="rounded-lg border overflow-hidden">
      <div className="grid grid-cols-7 bg-muted/40 border-b">
        {ENCABEZADO.map((d) => <div key={d} className="px-2 py-1.5 text-xs font-medium text-muted-foreground">{d}</div>)}
      </div>
      {semanas.map((semana) => (
        <div key={semana[0]} className="grid grid-cols-7 border-b last:border-b-0">
          {semana.map((d) => {
            const delMes = d.startsWith(mes);
            const delDia = citas.filter((c) => c.fecha === d && (!medicoId || c.optometra_id === medicoId));
            const activas = delDia.filter((c) => !INACTIVAS.includes(c.estado));
            const ausencia = medicoId ? diaCompletoBloqueado(medicoId, d, excepciones) : undefined;
            return (
              <button
                key={d}
                type="button"
                onClick={() => onAbrirDia(d)}
                className={`min-h-[96px] border-l first:border-l-0 p-1.5 text-left align-top hover:bg-muted/50 transition-colors ${!delMes ? 'bg-muted/20 text-muted-foreground' : ''}`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className={`text-xs font-medium h-6 w-6 flex items-center justify-center rounded-full ${d === hoy ? 'bg-primary text-primary-foreground' : ''}`}>
                    {Number(d.slice(8))}
                  </span>
                  {activas.length > 0 && <span className="text-[10px] text-muted-foreground tabular-nums">{activas.length}</span>}
                </div>
                {ausencia && <p className="text-[10px] text-warning truncate mb-0.5">{ausencia.motivo}</p>}
                <div className="space-y-0.5">
                  {activas.slice(0, MAX_VISIBLES).map((c) => (
                    <div key={c.id} className="flex items-center gap-1 text-[10px] leading-tight truncate">
                      <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${colorMedico(medicos, c.optometra_id).punto}`} />
                      <span className="tabular-nums text-muted-foreground">{aHoraCorta(c.hora_inicio)}</span>
                      <span className="truncate">{c.pacientes?.nombres} {c.pacientes?.apellidos}</span>
                    </div>
                  ))}
                  {activas.length > MAX_VISIBLES && (
                    <p className="text-[10px] text-primary">+{activas.length - MAX_VISIBLES} más</p>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}
