/**
 * Ausencias y bloqueos de la agenda de un médico (vacaciones, incapacidad,
 * permisos de unas horas). La agenda deja de ofrecer esos turnos; las citas
 * ya agendadas en el período no se tocan, pero se avisa para reprogramarlas.
 */
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertTriangle, CalendarOff, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { hoyEnColombia } from '@/lib/agendaGrid';
import type { Excepcion } from '@/lib/disponibilidad';

const MOTIVOS = ['Vacaciones', 'Incapacidad', 'Permiso', 'Capacitación', 'Calamidad', 'Otro'];
const tabla = () => (supabase as any).from('horarios_excepciones');

const fechaLarga = (f: string) =>
  new Date(`${f}T12:00:00`).toLocaleDateString('es-CO', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });

interface Props {
  medicoId: string;
  medicoNombre: string;
  excepciones: Excepcion[];
  puedeEditar: boolean;
}

export function AusenciasMedico({ medicoId, medicoNombre, excepciones, puedeEditar }: Props) {
  const queryClient = useQueryClient();
  const hoy = hoyEnColombia();
  const [tipo, setTipo] = useState<'dia' | 'horas'>('dia');
  const [desde, setDesde] = useState(hoy);
  const [hasta, setHasta] = useState(hoy);
  const [horaInicio, setHoraInicio] = useState('14:00');
  const [horaFin, setHoraFin] = useState('18:00');
  const [motivo, setMotivo] = useState('Vacaciones');
  const [detalle, setDetalle] = useState('');

  const propias = excepciones
    .filter((e) => e.medico_id === medicoId)
    .sort((a, b) => a.fecha_inicio.localeCompare(b.fecha_inicio));
  const vigentes = propias.filter((e) => e.fecha_fin >= hoy);
  const pasadas = propias.filter((e) => e.fecha_fin < hoy).slice(-5);

  // Citas ya agendadas en el período elegido: hay que reprogramarlas.
  const rangoValido = !!desde && !!hasta && hasta >= desde;
  const { data: afectadas = [] } = useQuery({
    queryKey: ['citas-afectadas', medicoId, desde, hasta, tipo, horaInicio, horaFin],
    queryFn: async () => {
      const { data, error } = await supabase.from('citas')
        .select('id, fecha, hora_inicio, hora_fin, pacientes(nombres, apellidos, telefono)')
        .eq('optometra_id', medicoId).gte('fecha', desde).lte('fecha', hasta)
        .in('estado', ['agendada', 'confirmada']).order('fecha').order('hora_inicio');
      if (error) throw error;
      return (data ?? []).filter((c: any) =>
        tipo === 'dia' || (c.hora_inicio.slice(0, 5) < horaFin && horaInicio < c.hora_fin.slice(0, 5)));
    },
    enabled: rangoValido && puedeEditar,
  });

  const crear = useMutation({
    mutationFn: async () => {
      const { error } = await tabla().insert({
        medico_id: medicoId,
        fecha_inicio: desde,
        fecha_fin: hasta,
        hora_inicio: tipo === 'horas' ? horaInicio : null,
        hora_fin: tipo === 'horas' ? horaFin : null,
        motivo: detalle.trim() ? `${motivo}: ${detalle.trim()}` : motivo,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['horarios-excepciones'] });
      setDetalle('');
      toast.success(`Agenda de ${medicoNombre} bloqueada en ese período`);
    },
    onError: (e: any) => toast.error(e.message),
  });

  const eliminar = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await tabla().delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['horarios-excepciones'] });
      toast.success('Bloqueo eliminado: los turnos vuelven a estar disponibles');
    },
    onError: (e: any) => toast.error(e.message),
  });

  const error = !rangoValido
    ? 'La fecha final debe ser igual o posterior a la inicial'
    : tipo === 'horas' && horaInicio >= horaFin ? 'La hora final debe ser mayor a la inicial' : null;

  const fila = (e: Excepcion, vigente: boolean) => (
    <div key={e.id} className="flex items-center justify-between gap-2 py-2 text-sm">
      <div className="min-w-0">
        <p className="font-medium">{e.motivo}</p>
        <p className="text-xs text-muted-foreground">
          {e.fecha_inicio === e.fecha_fin ? fechaLarga(e.fecha_inicio) : `${fechaLarga(e.fecha_inicio)} → ${fechaLarga(e.fecha_fin)}`}
          {' · '}{e.hora_inicio ? `${e.hora_inicio.slice(0, 5)}–${e.hora_fin?.slice(0, 5)}` : 'Día completo'}
        </p>
      </div>
      {vigente && puedeEditar && (
        <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" aria-label="Eliminar bloqueo"
          onClick={() => { if (confirm('¿Eliminar este bloqueo? Los turnos vuelven a ofrecerse.')) eliminar.mutate(e.id!); }}>
          <Trash2 className="h-4 w-4" />
        </Button>
      )}
    </div>
  );

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {puedeEditar && (
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-base flex items-center gap-2"><CalendarOff className="h-4 w-4" />Bloquear agenda</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <RadioGroup value={tipo} onValueChange={(v) => setTipo(v as 'dia' | 'horas')} className="flex gap-4">
              <label className="flex items-center gap-2 text-sm cursor-pointer"><RadioGroupItem value="dia" />Días completos</label>
              <label className="flex items-center gap-2 text-sm cursor-pointer"><RadioGroupItem value="horas" />Solo unas horas</label>
            </RadioGroup>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1"><Label className="text-xs">Desde</Label><Input type="date" value={desde} min={hoy} onChange={(e) => { setDesde(e.target.value); if (e.target.value > hasta) setHasta(e.target.value); }} /></div>
              <div className="space-y-1"><Label className="text-xs">Hasta</Label><Input type="date" value={hasta} min={desde} onChange={(e) => setHasta(e.target.value)} /></div>
              {tipo === 'horas' && (
                <>
                  <div className="space-y-1"><Label className="text-xs">De</Label><Input type="time" value={horaInicio} onChange={(e) => setHoraInicio(e.target.value)} /></div>
                  <div className="space-y-1"><Label className="text-xs">A</Label><Input type="time" value={horaFin} onChange={(e) => setHoraFin(e.target.value)} /></div>
                </>
              )}
              <div className="space-y-1">
                <Label className="text-xs">Motivo</Label>
                <Select value={motivo} onValueChange={setMotivo}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{MOTIVOS.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1"><Label className="text-xs">Detalle (opcional)</Label><Input value={detalle} onChange={(e) => setDetalle(e.target.value)} placeholder="Ej: cita médica" /></div>
            </div>

            {afectadas.length > 0 && (
              <div className="rounded-md border border-warning/50 bg-warning/10 p-3 text-xs space-y-1">
                <p className="font-medium flex items-center gap-1"><AlertTriangle className="h-3.5 w-3.5" />{afectadas.length} cita(s) ya agendada(s) en ese período: no se cancelan, reprográmelas.</p>
                {afectadas.slice(0, 5).map((c: any) => (
                  <p key={c.id}>{c.fecha} {c.hora_inicio.slice(0, 5)} · {c.pacientes?.nombres} {c.pacientes?.apellidos}{c.pacientes?.telefono ? ` · ${c.pacientes.telefono}` : ''}</p>
                ))}
                {afectadas.length > 5 && <p>… y {afectadas.length - 5} más.</p>}
              </div>
            )}

            {error && <p className="text-xs text-destructive">{error}</p>}
            <Button className="w-full" disabled={!!error || crear.isPending} onClick={() => crear.mutate()}>
              {crear.isPending ? 'Guardando…' : 'Bloquear agenda'}
            </Button>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center justify-between">
            Próximas ausencias <Badge variant="secondary">{vigentes.length}</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="divide-y">
          {vigentes.length === 0
            ? <p className="text-sm text-muted-foreground py-4 text-center">Sin ausencias programadas.</p>
            : vigentes.map((e) => fila(e, true))}
          {pasadas.length > 0 && (
            <div className="pt-3">
              <p className="text-xs text-muted-foreground mb-1">Recientes</p>
              <div className="opacity-60 divide-y">{pasadas.map((e) => fila(e, false))}</div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
