/**
 * Vista de lista: las citas de los próximos días agrupadas por fecha, con
 * teléfono para confirmar o reprogramar. Se puede imprimir.
 */
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Phone, Printer } from 'lucide-react';
import { ESTADO_CITA_COLOR, ESTADO_CITA_LABEL } from '@/lib/flujoAtencion';
import { colorMedico, type Medico } from '@/lib/useAgendaDatos';
import { aHoraCorta } from '@/lib/agendaGrid';

interface Props {
  dias: string[];
  hoy: string;
  citas: any[];
  medicos: Medico[];
  medicoId: string | null;
  incluirCanceladas: boolean;
  onAbrirDia: (fecha: string) => void;
}

const titulo = (d: string) => {
  const t = new Date(`${d}T12:00:00`).toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long' });
  return t.charAt(0).toUpperCase() + t.slice(1);
};

export function AgendaLista({ dias, hoy, citas, medicos, medicoId, incluirCanceladas, onAbrirDia }: Props) {
  const visibles = citas.filter((c) =>
    (!medicoId || c.optometra_id === medicoId) && (incluirCanceladas || !['cancelada', 'no_asistio'].includes(c.estado)));
  const conCitas = dias.filter((d) => visibles.some((c) => c.fecha === d));

  return (
    <div className="space-y-4">
      <div className="flex justify-end print:hidden">
        <Button variant="outline" size="sm" onClick={() => window.print()}><Printer className="h-4 w-4 mr-1" />Imprimir</Button>
      </div>
      {conCitas.length === 0 && (
        <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">No hay citas en este período.</CardContent></Card>
      )}
      {conCitas.map((d) => {
        const delDia = visibles.filter((c) => c.fecha === d);
        return (
          <div key={d}>
            <button type="button" onClick={() => onAbrirDia(d)} className="flex items-center gap-2 mb-2 hover:underline">
              <h3 className={`text-sm font-semibold ${d === hoy ? 'text-primary' : ''}`}>{d === hoy ? 'Hoy · ' : ''}{titulo(d)}</h3>
              <Badge variant="secondary" className="text-[10px]">{delDia.length}</Badge>
            </button>
            <Card>
              <CardContent className="p-0 divide-y">
                {delDia.map((c) => {
                  const medico = medicos.find((m) => m.user_id === c.optometra_id)?.nombre ?? 'Sin asignar';
                  return (
                    <div key={c.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2.5 text-sm">
                      <span className="tabular-nums font-medium w-24 shrink-0">{aHoraCorta(c.hora_inicio)}–{aHoraCorta(c.hora_fin)}</span>
                      <span className="font-medium min-w-[160px] flex-1">{c.pacientes?.nombres} {c.pacientes?.apellidos}</span>
                      {c.pacientes?.telefono && (
                        <a href={`tel:${c.pacientes.telefono}`} className="text-muted-foreground flex items-center gap-1 hover:text-primary">
                          <Phone className="h-3.5 w-3.5" />{c.pacientes.telefono}
                        </a>
                      )}
                      <span className="flex items-center gap-1.5 text-muted-foreground text-xs">
                        <span className={`h-2 w-2 rounded-full ${colorMedico(medicos, c.optometra_id).punto}`} />{medico}
                      </span>
                      <Badge variant="outline" className={`text-[10px] ${ESTADO_CITA_COLOR[c.estado] ?? ''}`}>{ESTADO_CITA_LABEL[c.estado] ?? c.estado}</Badge>
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          </div>
        );
      })}
    </div>
  );
}
