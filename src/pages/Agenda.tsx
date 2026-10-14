import { AppLayout } from '@/components/layout/AppLayout';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Plus, ChevronLeft, ChevronRight, Calendar as CalendarIcon, MoreVertical, MapPin, LogIn, Stethoscope, CheckCircle2 } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { usePermissions } from '@/hooks/usePermissions';
import { ESTADO_CITA_COLOR, ESTADO_CITA_LABEL, ESTADOS_CITA_MANUALES } from '@/lib/flujoAtencion';
import { NuevaCitaDialog, type PrefijoCita } from '@/components/schedule/NuevaCitaDialog';
import { useEffect, useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

import { aHoraCorta, hoyEnColombia, sumarDias } from '@/lib/agendaGrid';
import { DIAS_SEMANA, calcularTurnos, diaCompletoBloqueado, diaDeSemana } from '@/lib/disponibilidad';
import { useExcepciones, useHorariosMedicos, useOptometras, useSedesActivas } from '@/lib/useAgendaDatos';

const estadoColor = ESTADO_CITA_COLOR;
const estadoLabel = ESTADO_CITA_LABEL;

const SIN_ASIGNAR = 'sin-asignar';
const TODAS = 'todas';

/** Fila de la columna de un médico: una cita o un turno libre. */
type Fila =
  | { tipo: 'cita'; hora: string; cita: any }
  | { tipo: 'libre'; hora: string; fin: string; sedeId: string | null };

export default function Agenda() {
  const today = hoyEnColombia();
  const [fecha, setFecha] = useState(today);
  const [sedeId, setSedeId] = useState<string>(TODAS);
  const [prefijo, setPrefijo] = useState<PrefijoCita | null>(null);
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { role, canWrite, canView } = usePermissions();
  const esOptometra = role === 'optometra';
  // La optómetra entra viendo solo sus pacientes; puede quitar el filtro.
  const [soloMias, setSoloMias] = useState(false);
  useEffect(() => { if (esOptometra) setSoloMias(true); }, [esOptometra]);
  const puedeAgendar = canWrite('agenda');
  const puedeAtender = canView('historias') && (role === 'admin' || role === 'optometra');

  const { data: citas = [] } = useQuery({
    queryKey: ['citas', fecha],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('citas')
        .select('*, pacientes(nombres, apellidos, telefono, numero_documento)')
        .eq('fecha', fecha)
        .order('hora_inicio');
      if (error) throw error;
      return data;
    },
  });

  const { data: optometras = [] } = useOptometras();
  const { data: horarios = [] } = useHorariosMedicos();
  const { data: excepciones = [] } = useExcepciones();
  const { data: sedes = [] } = useSedesActivas();

  const cambiarEstado = useMutation({
    mutationFn: async ({ id, estado }: { id: string; estado: string; silencioso?: boolean }) => {
      const cambios: Record<string, unknown> = { estado };
      if (estado === 'en_espera') cambios.hora_llegada = new Date().toISOString();
      const { error } = await supabase.from('citas').update(cambios as any).eq('id', id);
      if (error) {
        if (error.code === '23514' || error.code === 'PGRST204') {
          throw new Error('Falta aplicar la migración del flujo de atención (20261014000000) para usar este estado.');
        }
        throw error;
      }
    },
    onSuccess: (_, { estado, silencioso }) => {
      queryClient.invalidateQueries({ queryKey: ['citas'] });
      queryClient.invalidateQueries({ queryKey: ['citas-ocupacion'] });
      if (!silencioso) toast.success(estado === 'en_espera' ? 'Paciente en sala de espera' : `Cita: ${estadoLabel[estado].toLowerCase()}`);
    },
    onError: (e: any) => toast.error(e.message),
  });

  /** La optómetra toma al paciente: la cita pasa a "en consulta" y se abre su historia clínica. */
  const atender = async (cita: any) => {
    if (cita.estado !== 'en_consulta') {
      try {
        await cambiarEstado.mutateAsync({ id: cita.id, estado: 'en_consulta', silencioso: true });
      } catch {
        return;
      }
    }
    navigate(`/historias?nueva=1&paciente=${cita.paciente_id}&cita=${cita.id}`);
  };

  const changeDate = (days: number) => setFecha(sumarDias(fecha, days));
  const esPasado = fecha < today;
  const dia = diaDeSemana(fecha);
  const sedeFiltro = sedeId === TODAS ? null : sedeId;
  const nombreMedico = (id: string) => optometras.find((o: any) => o.user_id === id)?.nombre ?? 'Médico';

  // Columnas: médicos con horario este día (en la sede elegida) o con citas,
  // y "Sin asignar" si hay citas sin médico.
  const columnas = useMemo(() => {
    const citasSede = citas.filter((c: any) => !sedeFiltro || !c.sede_id || c.sede_id === sedeFiltro);
    const ids = new Set<string>();
    for (const h of horarios) {
      if (h.activo && h.dia_semana === dia && (!sedeFiltro || !h.sede_id || h.sede_id === sedeFiltro)) ids.add(h.medico_id);
    }
    for (const c of citasSede) ids.add((c as any).optometra_id ?? SIN_ASIGNAR);

    const desde = fecha === today
      ? (() => { const co = new Date(Date.now() - 5 * 3600 * 1000); return co.getUTCHours() * 60 + co.getUTCMinutes(); })()
      : 0;

    if (soloMias && user?.id) {
      for (const id of [...ids]) if (id !== user.id) ids.delete(id);
    }

    return [...ids].map((id) => {
      const propias = citasSede.filter((c: any) => (c.optometra_id ?? SIN_ASIGNAR) === id);
      const libres = id === SIN_ASIGNAR || esPasado ? [] : calcularTurnos({
        fecha, horarios, citas: citas as any, medicoId: id, sedeId: sedeFiltro, desdeMinutos: desde, excepciones,
      });
      const ausencia = id === SIN_ASIGNAR ? undefined : diaCompletoBloqueado(id, fecha, excepciones);
      const filas: Fila[] = [
        ...propias.map((c: any) => ({ tipo: 'cita' as const, hora: aHoraCorta(c.hora_inicio), cita: c })),
        ...libres.map((t) => ({ tipo: 'libre' as const, hora: t.hora_inicio, fin: t.hora_fin, sedeId: t.sede_id })),
      ].sort((a, b) => a.hora.localeCompare(b.hora));
      const activas = propias.filter((c: any) => !['cancelada', 'no_asistio'].includes(c.estado)).length;
      return { id, nombre: id === SIN_ASIGNAR ? 'Sin asignar' : nombreMedico(id), filas, activas, libres: libres.length, ausencia };
    }).sort((a, b) => (a.id === SIN_ASIGNAR ? 1 : b.id === SIN_ASIGNAR ? -1 : a.nombre.localeCompare(b.nombre)));
  }, [citas, horarios, excepciones, dia, sedeFiltro, fecha, today, esPasado, optometras, soloMias, user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Resumen del flujo del día (todas las citas, sin importar el filtro).
  const resumen = useMemo(() => {
    const c = (estados: string[]) => citas.filter((x: any) => estados.includes(x.estado)).length;
    return [
      { label: 'Por llegar', valor: c(['agendada', 'confirmada']), clase: 'text-info' },
      { label: 'En sala', valor: c(['en_espera']), clase: 'text-warning' },
      { label: 'En consulta', valor: c(['en_consulta']), clase: 'text-primary' },
      { label: 'Atendidos', valor: c(['atendida', 'asistio']), clase: 'text-success' },
    ];
  }, [citas]);



  return (
    <AppLayout>
      <PageHeader title="Agenda" description="Gestión de citas, agenda y horarios de optómetras">
        {canView('horarios') && (
          <Button variant="outline" onClick={() => navigate('/horarios')}><CalendarIcon className="h-4 w-4 mr-1" />Horarios médicos</Button>
        )}
        <Button onClick={() => setPrefijo({ fecha: esPasado ? today : fecha, sedeId: sedeFiltro })}><Plus className="h-4 w-4 mr-1" />Nueva Cita</Button>
      </PageHeader>

      <div className="flex flex-wrap items-center gap-3 mb-4">
        <Button variant="outline" size="icon" onClick={() => changeDate(-1)} aria-label="Día anterior"><ChevronLeft className="h-4 w-4" /></Button>
        <Input type="date" value={fecha} onChange={(e) => e.target.value && setFecha(e.target.value)} className="w-[180px]" />
        <Button variant="outline" size="icon" onClick={() => changeDate(1)} aria-label="Día siguiente"><ChevronRight className="h-4 w-4" /></Button>
        <Button variant="ghost" size="sm" onClick={() => setFecha(today)}>Hoy</Button>
        <Select value={sedeId} onValueChange={setSedeId}>
          <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value={TODAS}>Todas las sedes</SelectItem>
            {sedes.map((s: any) => <SelectItem key={s.id} value={s.id}>{s.nombre}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-wrap items-center gap-2 mb-4">
        {resumen.map((r) => (
          <div key={r.label} className="rounded-md border px-3 py-1.5 text-xs flex items-center gap-2">
            <span className={`text-base font-semibold tabular-nums ${r.clase}`}>{r.valor}</span>
            <span className="text-muted-foreground">{r.label}</span>
          </div>
        ))}
        {(esOptometra || role === 'admin') && (
          <div className="flex items-center gap-2 ml-auto">
            <Switch id="solo-mias" checked={soloMias} onCheckedChange={setSoloMias} />
            <Label htmlFor="solo-mias" className="text-sm cursor-pointer">Solo mis citas</Label>
          </div>
        )}
      </div>


          <p className="text-sm text-muted-foreground mb-3 capitalize">
            {new Date(fecha + 'T12:00:00').toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
          </p>
          {columnas.length === 0 ? (
            <Card>
              <CardContent className="py-10 text-center text-sm text-muted-foreground space-y-2">
                <p>No hay médicos con horario los {DIAS_SEMANA[dia].toLowerCase()} ni citas este día.</p>
                <p>Configure los horarios en <Button variant="link" className="p-0 h-auto" onClick={() => navigate('/horarios')}>Horarios médicos</Button> para ver aquí los turnos disponibles.</p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
              {columnas.map((col) => (
                <Card key={col.id}>
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between gap-2">
                      <CardTitle className="text-sm font-medium">{col.nombre}</CardTitle>
                      <div className="flex gap-1">
                        <Badge variant="secondary" className="text-[10px]">{col.activas} citas</Badge>
                        {col.ausencia
                          ? <Badge variant="outline" className="text-[10px] border-warning/50 text-warning">{col.ausencia.motivo}</Badge>
                          : col.id !== SIN_ASIGNAR && <Badge variant="outline" className="text-[10px]">{col.libres} libres</Badge>}
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="p-0">
                    <div className="divide-y max-h-[32rem] overflow-y-auto">
                      {col.filas.length === 0 && <p className="text-xs text-muted-foreground text-center py-6">Sin turnos para este día</p>}
                      {col.filas.map((fila) => fila.tipo === 'cita' ? (
                        <div key={fila.cita.id} className="flex items-center px-4 py-2 min-h-[3rem] gap-2">
                          <span className="text-xs text-muted-foreground w-12 flex-shrink-0 tabular-nums">{fila.hora}</span>
                          <div className={`flex-1 rounded-md border px-3 py-1.5 ${estadoColor[fila.cita.estado] || ''}`}>
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-sm font-medium">{fila.cita.pacientes?.nombres} {fila.cita.pacientes?.apellidos}</span>
                              <Badge variant="outline" className="text-[10px] h-5 no-underline">{estadoLabel[fila.cita.estado] || fila.cita.estado}</Badge>
                            </div>
                            <span className="text-[10px] opacity-70">
                              {aHoraCorta(fila.cita.hora_inicio)}–{aHoraCorta(fila.cita.hora_fin)} · {fila.cita.origen}
                              {fila.cita.pacientes?.telefono && ` · ${fila.cita.pacientes.telefono}`}
                            </span>
                            {fila.cita.observaciones && <p className="text-[11px] opacity-80 mt-0.5">{fila.cita.observaciones}</p>}
                            {fila.cita.hora_llegada && ['en_espera', 'en_consulta'].includes(fila.cita.estado) && (
                              <p className="text-[11px] mt-0.5">Llegó {new Date(fila.cita.hora_llegada).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })}</p>
                            )}
                            <div className="flex flex-wrap gap-1.5 mt-1.5">
                              {puedeAgendar && ['agendada', 'confirmada'].includes(fila.cita.estado) && fecha === today && (
                                <Button size="sm" variant="secondary" className="h-7 text-xs" onClick={() => cambiarEstado.mutate({ id: fila.cita.id, estado: 'en_espera' })}>
                                  <LogIn className="h-3.5 w-3.5 mr-1" />Llegó
                                </Button>
                              )}
                              {puedeAtender && ['en_espera', 'en_consulta'].includes(fila.cita.estado) && (
                                <Button size="sm" className="h-7 text-xs" onClick={() => atender(fila.cita)}>
                                  <Stethoscope className="h-3.5 w-3.5 mr-1" />{fila.cita.estado === 'en_consulta' ? 'Continuar consulta' : 'Atender'}
                                </Button>
                              )}
                              {fila.cita.estado === 'atendida' && (
                                <span className="text-[11px] flex items-center gap-1"><CheckCircle2 className="h-3.5 w-3.5" />Pasó a facturación</span>
                              )}
                            </div>
                          </div>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-7 w-7" aria-label="Cambiar estado"><MoreVertical className="h-4 w-4" /></Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuLabel className="text-xs">Cambiar estado</DropdownMenuLabel>
                              <DropdownMenuSeparator />
                              {ESTADOS_CITA_MANUALES.filter((k) => k !== fila.cita.estado).map((k) => [k, estadoLabel[k]] as const).map(([k, label]) => (
                                <DropdownMenuItem
                                  key={k}
                                  className={k === 'cancelada' ? 'text-destructive' : ''}
                                  onClick={() => {
                                    if (k === 'cancelada' && !confirm('¿Cancelar esta cita? El turno quedará libre.')) return;
                                    cambiarEstado.mutate({ id: fila.cita.id, estado: k });
                                  }}
                                >
                                  {label}
                                </DropdownMenuItem>
                              ))}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      ) : (
                        <div key={`libre-${fila.hora}`} className="flex items-center px-4 py-1.5 gap-2">
                          <span className="text-xs text-muted-foreground w-12 flex-shrink-0 tabular-nums">{fila.hora}</span>
                          <button
                            type="button"
                            onClick={() => setPrefijo({ fecha, medicoId: col.id, horaInicio: fila.hora, horaFin: fila.fin, sedeId: fila.sedeId ?? sedeFiltro })}
                            className="flex-1 h-8 rounded-md border border-dashed border-border/70 text-xs text-muted-foreground hover:border-primary hover:text-primary hover:bg-primary/5 transition-colors text-left px-3"
                          >
                            Libre · clic para agendar
                          </button>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

      <NuevaCitaDialog
        open={!!prefijo}
        onOpenChange={(o) => { if (!o) setPrefijo(null); }}
        prefijo={prefijo ?? { fecha }}
        medicos={optometras as any}
        horarios={horarios}
        excepciones={excepciones}
        sedes={sedes as any}
      />

    </AppLayout>
  );
}
