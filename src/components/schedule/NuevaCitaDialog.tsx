import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Search, X, Clock, AlertTriangle } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { filtroBusquedaPacientes } from '@/components/patients/patientUtils';
import {
  DIAS_SEMANA, aHora, aMinutos, buscarCruce, calcularTurnos, dentroDeHorario, diaDeSemana,
  type BloqueHorario, type CitaOcupada, type Turno,
} from '@/lib/disponibilidad';
import { hoyEnColombia } from '@/lib/agendaGrid';

const TODOS = 'todos';

export interface Medico { user_id: string; nombre: string }

/** Datos con los que se abre el diálogo (p. ej. al hacer clic en un turno libre de la agenda). */
export interface PrefijoCita { fecha: string; medicoId?: string; horaInicio?: string; horaFin?: string; sedeId?: string | null }

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  prefijo: PrefijoCita;
  medicos: Medico[];
  horarios: BloqueHorario[];
  sedes: Array<{ id: string; nombre: string }>;
}

/** Minutos transcurridos hoy en Colombia (UTC−5). */
const minutosAhoraColombia = () => {
  const co = new Date(Date.now() - 5 * 60 * 60 * 1000);
  return co.getUTCHours() * 60 + co.getUTCMinutes();
};

export function NuevaCitaDialog({ open, onOpenChange, prefijo, medicos, horarios, sedes }: Props) {
  const queryClient = useQueryClient();
  const [fecha, setFecha] = useState(prefijo.fecha);
  const [sedeId, setSedeId] = useState<string>(TODOS);
  const [medicoFiltro, setMedicoFiltro] = useState<string>(TODOS);
  const [turno, setTurno] = useState<Turno | null>(null);
  const [manual, setManual] = useState(false);
  const [manualMedico, setManualMedico] = useState('');
  const [manualInicio, setManualInicio] = useState('08:00');
  const [manualFin, setManualFin] = useState('08:30');
  const [paciente, setPaciente] = useState<any>(null);
  const [busqueda, setBusqueda] = useState('');
  const [termino, setTermino] = useState('');
  const [observaciones, setObservaciones] = useState('');

  // Cada apertura parte del prefijo recibido.
  useEffect(() => {
    if (!open) return;
    setFecha(prefijo.fecha);
    setSedeId(prefijo.sedeId ?? TODOS);
    setMedicoFiltro(prefijo.medicoId ?? TODOS);
    setTurno(prefijo.medicoId && prefijo.horaInicio && prefijo.horaFin
      ? { medico_id: prefijo.medicoId, sede_id: prefijo.sedeId ?? null, hora_inicio: prefijo.horaInicio, hora_fin: prefijo.horaFin }
      : null);
    setManual(false);
    setManualMedico(prefijo.medicoId ?? '');
    setPaciente(null);
    setBusqueda('');
    setObservaciones('');
  }, [open, prefijo]);

  useEffect(() => {
    const t = setTimeout(() => setTermino(busqueda.trim()), 300);
    return () => clearTimeout(t);
  }, [busqueda]);

  // Búsqueda en el servidor: antes el select cargaba todos los pacientes.
  const { data: resultados = [], isFetching: buscando } = useQuery({
    queryKey: ['pacientes-busqueda-cita', termino],
    queryFn: async () => {
      const filtro = filtroBusquedaPacientes(termino);
      if (!filtro) return [];
      const { data, error } = await supabase.from('pacientes')
        .select('id, nombres, apellidos, numero_documento, tipo_documento, telefono, sede_id')
        .or(filtro).order('nombres').limit(8);
      if (error) throw error;
      return data;
    },
    enabled: open && termino.length >= 2 && !paciente,
  });

  const { data: citasDia = [] } = useQuery({
    queryKey: ['citas-ocupacion', fecha],
    queryFn: async () => {
      const { data, error } = await supabase.from('citas')
        .select('id, optometra_id, hora_inicio, hora_fin, estado')
        .eq('fecha', fecha);
      if (error) throw error;
      return data as Array<CitaOcupada & { id: string }>;
    },
    enabled: open && !!fecha,
  });

  const hoy = hoyEnColombia();
  const esPasado = fecha < hoy;
  const turnos = useMemo(() => calcularTurnos({
    fecha,
    horarios,
    citas: citasDia,
    sedeId: sedeId === TODOS ? null : sedeId,
    medicoId: medicoFiltro === TODOS ? null : medicoFiltro,
    desdeMinutos: fecha === hoy ? minutosAhoraColombia() : 0,
  }), [fecha, horarios, citasDia, sedeId, medicoFiltro, hoy]);

  const nombreMedico = (id: string) => medicos.find((m) => m.user_id === id)?.nombre ?? 'Médico';
  const turnosPorMedico = useMemo(() => {
    const grupos = new Map<string, Turno[]>();
    for (const t of turnos) grupos.set(t.medico_id, [...(grupos.get(t.medico_id) ?? []), t]);
    return [...grupos.entries()];
  }, [turnos]);

  const medicosConHorarioHoy = new Set(horarios.filter((h) => h.activo && h.dia_semana === diaDeSemana(fecha)).map((h) => h.medico_id));

  // Si se cambia la fecha o un filtro y el turno elegido ya no existe, se descarta.
  useEffect(() => {
    if (turno && !manual && !turnos.some((t) => t.medico_id === turno.medico_id && t.hora_inicio === turno.hora_inicio)) setTurno(null);
  }, [turnos]); // eslint-disable-line react-hooks/exhaustive-deps

  const crear = useMutation({
    mutationFn: async () => {
      const elegido = manual
        ? { medico_id: manualMedico, hora_inicio: manualInicio, hora_fin: manualFin, sede_id: sedeId === TODOS ? null : sedeId }
        : turno!;
      // Se relee la ocupación justo antes de guardar: otra persona pudo tomar el turno.
      const { data: actuales, error: e1 } = await supabase.from('citas')
        .select('id, optometra_id, hora_inicio, hora_fin, estado').eq('fecha', fecha).eq('optometra_id', elegido.medico_id);
      if (e1) throw e1;
      const cruce = buscarCruce(elegido.medico_id, elegido.hora_inicio, elegido.hora_fin, actuales as any);
      if (cruce) throw new Error(`Ese horario ya está ocupado (${cruce.hora_inicio.slice(0, 5)}–${cruce.hora_fin.slice(0, 5)}). Elija otro turno.`);
      const { error } = await supabase.from('citas').insert({
        paciente_id: paciente.id,
        optometra_id: elegido.medico_id,
        sede_id: elegido.sede_id ?? (sedeId === TODOS ? paciente.sede_id ?? null : sedeId),
        fecha,
        hora_inicio: elegido.hora_inicio,
        hora_fin: elegido.hora_fin,
        observaciones: observaciones.trim() || null,
        origen: 'manual',
      });
      if (error) throw error;
      return elegido;
    },
    onSuccess: (elegido) => {
      queryClient.invalidateQueries({ queryKey: ['citas'] });
      queryClient.invalidateQueries({ queryKey: ['citas-ocupacion'] });
      toast.success(`Cita agendada con ${nombreMedico(elegido.medico_id)} a las ${elegido.hora_inicio.slice(0, 5)}`);
      onOpenChange(false);
    },
    onError: (e: any) => {
      toast.error(e.message);
      queryClient.invalidateQueries({ queryKey: ['citas-ocupacion', fecha] });
    },
  });

  const avisoManual = (() => {
    if (!manual || !manualMedico) return null;
    if (aMinutos(manualInicio) >= aMinutos(manualFin)) return 'La hora de fin debe ser mayor a la de inicio';
    if (buscarCruce(manualMedico, manualInicio, manualFin, citasDia)) return 'Se cruza con otra cita de este médico';
    if (!dentroDeHorario(manualMedico, fecha, manualInicio, manualFin, horarios)) return 'Está fuera del horario configurado del médico';
    return null;
  })();
  const bloqueaManual = !!avisoManual && avisoManual !== 'Está fuera del horario configurado del médico';

  const puedeGuardar = !!paciente && !esPasado && (manual ? !!manualMedico && !bloqueaManual : !!turno);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Nueva Cita</DialogTitle></DialogHeader>
        <form onSubmit={(e) => { e.preventDefault(); if (puedeGuardar) crear.mutate(); }} className="space-y-4">
          {/* Paciente */}
          <div className="space-y-2">
            <Label>Paciente *</Label>
            {paciente ? (
              <div className="flex items-center justify-between rounded-md border px-3 py-2 bg-muted/40">
                <div className="text-sm">
                  <span className="font-medium">{paciente.nombres} {paciente.apellidos}</span>
                  <span className="text-muted-foreground ml-2">{paciente.tipo_documento} {paciente.numero_documento}</span>
                  {paciente.telefono && <span className="text-muted-foreground ml-2">· {paciente.telefono}</span>}
                </div>
                <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={() => setPaciente(null)} aria-label="Cambiar paciente">
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ) : (
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input autoFocus placeholder="Buscar por documento, nombre o teléfono…" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} className="pl-9" />
                {termino.length >= 2 && (
                  <div className="absolute z-50 mt-1 w-full rounded-md border bg-popover shadow-md max-h-64 overflow-y-auto">
                    {resultados.length === 0 ? (
                      <p className="text-sm text-muted-foreground px-3 py-2">{buscando ? 'Buscando…' : 'Sin resultados. Registre al paciente en el módulo Pacientes.'}</p>
                    ) : resultados.map((p: any) => (
                      <button
                        type="button" key={p.id}
                        className="w-full text-left px-3 py-2 text-sm hover:bg-accent"
                        onClick={() => { setPaciente(p); setBusqueda(''); }}
                      >
                        <span className="font-medium">{p.nombres} {p.apellidos}</span>
                        <span className="text-muted-foreground ml-2">{p.numero_documento}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Fecha y filtros */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="space-y-1">
              <Label>Fecha *</Label>
              <Input type="date" value={fecha} min={hoy} onChange={(e) => setFecha(e.target.value)} required />
            </div>
            <div className="space-y-1">
              <Label>Sede</Label>
              <Select value={sedeId} onValueChange={setSedeId}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={TODOS}>Todas las sedes</SelectItem>
                  {sedes.map((s) => <SelectItem key={s.id} value={s.id}>{s.nombre}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Médico</Label>
              <Select value={medicoFiltro} onValueChange={setMedicoFiltro}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={TODOS}>Cualquier médico</SelectItem>
                  {medicos.map((m) => <SelectItem key={m.user_id} value={m.user_id}>{m.nombre}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          {esPasado && <p className="text-sm text-destructive">No se pueden agendar citas en fechas pasadas.</p>}

          {/* Turnos disponibles */}
          {!manual && !esPasado && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="flex items-center gap-1.5"><Clock className="h-4 w-4" />Turnos disponibles — {DIAS_SEMANA[diaDeSemana(fecha)]}</Label>
                <Badge variant="secondary">{turnos.length} libres</Badge>
              </div>
              {turnosPorMedico.length === 0 ? (
                <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground text-center">
                  {medicosConHorarioHoy.size === 0
                    ? `Ningún médico tiene horario configurado los ${DIAS_SEMANA[diaDeSemana(fecha)].toLowerCase()}. Configúrelo en la pestaña "Horarios Médicos".`
                    : 'No quedan turnos libres con estos filtros. Pruebe otra fecha, sede o médico.'}
                </div>
              ) : (
                <div className="space-y-3 max-h-72 overflow-y-auto pr-1">
                  {turnosPorMedico.map(([medicoId, lista]) => (
                    <div key={medicoId} className="space-y-1.5">
                      <p className="text-sm font-medium">{nombreMedico(medicoId)} <span className="text-xs text-muted-foreground font-normal">· {lista.length} turnos</span></p>
                      <div className="flex flex-wrap gap-1.5">
                        {lista.map((t) => {
                          const activo = turno?.medico_id === t.medico_id && turno?.hora_inicio === t.hora_inicio;
                          return (
                            <Button
                              type="button" key={t.hora_inicio} size="sm"
                              variant={activo ? 'default' : 'outline'}
                              className="h-8 px-2.5 tabular-nums"
                              onClick={() => setTurno(t)}
                              title={`${t.hora_inicio}–${t.hora_fin}${t.sede_id ? ' · ' + (sedes.find((s) => s.id === t.sede_id)?.nombre ?? '') : ''}`}
                            >
                              {t.hora_inicio}
                            </Button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Hora manual: para sobrecupos o médicos sin horario configurado */}
          <button type="button" className="text-xs text-primary underline-offset-2 hover:underline" onClick={() => { setManual(!manual); setTurno(null); }}>
            {manual ? '← Volver a los turnos disponibles' : 'Agendar en otra hora (sobrecupo)'}
          </button>
          {manual && !esPasado && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 rounded-md border p-3">
              <div className="space-y-1">
                <Label>Médico *</Label>
                <Select value={manualMedico} onValueChange={setManualMedico}>
                  <SelectTrigger><SelectValue placeholder="Seleccione" /></SelectTrigger>
                  <SelectContent>
                    {medicos.map((m) => <SelectItem key={m.user_id} value={m.user_id}>{m.nombre}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Hora inicio *</Label>
                <Input type="time" value={manualInicio} onChange={(e) => {
                  setManualInicio(e.target.value);
                  if (e.target.value) setManualFin(aHora(Math.min(aMinutos(e.target.value) + 30, 23 * 60 + 59)));
                }} />
              </div>
              <div className="space-y-1">
                <Label>Hora fin *</Label>
                <Input type="time" value={manualFin} onChange={(e) => setManualFin(e.target.value)} />
              </div>
              {avisoManual && (
                <p className={`sm:col-span-3 text-xs flex items-center gap-1 ${bloqueaManual ? 'text-destructive' : 'text-warning'}`}>
                  <AlertTriangle className="h-3.5 w-3.5" />{avisoManual}{!bloqueaManual && ' (se puede agendar como sobrecupo)'}
                </p>
              )}
            </div>
          )}

          <div className="space-y-1">
            <Label>Observaciones</Label>
            <Textarea rows={2} value={observaciones} onChange={(e) => setObservaciones(e.target.value)} placeholder="Motivo de consulta, notas para el médico…" />
          </div>

          <div className="flex items-center justify-between gap-2 pt-4 border-t">
            <p className="text-sm text-muted-foreground">
              {!manual && turno && <>Con <span className="font-medium text-foreground">{nombreMedico(turno.medico_id)}</span> · {turno.hora_inicio}–{turno.hora_fin}</>}
            </p>
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
              <Button type="submit" disabled={!puedeGuardar || crear.isPending}>{crear.isPending ? 'Agendando...' : 'Agendar Cita'}</Button>
            </div>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
