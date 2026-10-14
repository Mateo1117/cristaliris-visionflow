import { AppLayout } from '@/components/layout/AppLayout';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Plus, ChevronLeft, ChevronRight, Calendar as CalendarIcon, MoreVertical, MapPin } from 'lucide-react';
import { DoctorScheduleManager } from '@/components/schedule/DoctorScheduleManager';
import { NuevaCitaDialog, type PrefijoCita } from '@/components/schedule/NuevaCitaDialog';
import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

import { aHoraCorta, hoyEnColombia, sumarDias } from '@/lib/agendaGrid';
import { DIAS_SEMANA, calcularTurnos, diaDeSemana, type BloqueHorario } from '@/lib/disponibilidad';

const estadoColor: Record<string, string> = {
  agendada: 'bg-info/20 text-info border-info/30',
  confirmada: 'bg-primary/20 text-primary border-primary/30',
  asistio: 'bg-success/20 text-success border-success/30',
  no_asistio: 'bg-destructive/20 text-destructive border-destructive/30',
  cancelada: 'bg-muted text-muted-foreground border-muted line-through',
};

const estadoLabel: Record<string, string> = {
  agendada: 'Agendada', confirmada: 'Confirmada', asistio: 'Asistió', no_asistio: 'No Asistió', cancelada: 'Cancelada',
};

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
  const [showScheduleFor, setShowScheduleFor] = useState<{ userId: string; nombre: string } | null>(null);
  const queryClient = useQueryClient();

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

  const { data: optometras = [] } = useQuery({
    queryKey: ['optometras'],
    queryFn: async () => {
      const { data: allRoles } = await supabase.from('user_roles').select('user_id').eq('role', 'optometra');
      if (!allRoles?.length) return [];
      const ids = allRoles.map(r => r.user_id);
      const { data, error } = await supabase.from('profiles').select('user_id, nombre, email').in('user_id', ids).eq('estado_activo', true).order('nombre');
      if (error) throw error;
      return data || [];
    },
  });

  const { data: horarios = [] } = useQuery({
    queryKey: ['horarios-medicos'],
    queryFn: async () => {
      const { data, error } = await supabase.from('horarios_medicos').select('*').order('hora_inicio');
      if (error) throw error;
      return data as BloqueHorario[];
    },
  });

  const { data: sedes = [] } = useQuery({
    queryKey: ['sedes-agenda'],
    queryFn: async () => {
      const { data, error } = await supabase.from('sedes').select('id, nombre').eq('estado_activa', true).order('nombre');
      if (error) throw error;
      return data || [];
    },
  });

  const cambiarEstado = useMutation({
    mutationFn: async ({ id, estado }: { id: string; estado: string }) => {
      const { error } = await supabase.from('citas').update({ estado }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: (_, { estado }) => {
      queryClient.invalidateQueries({ queryKey: ['citas'] });
      queryClient.invalidateQueries({ queryKey: ['citas-ocupacion'] });
      toast.success(`Cita marcada como ${estadoLabel[estado].toLowerCase()}`);
    },
    onError: (e: any) => toast.error(e.message),
  });

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

    return [...ids].map((id) => {
      const propias = citasSede.filter((c: any) => (c.optometra_id ?? SIN_ASIGNAR) === id);
      const libres = id === SIN_ASIGNAR || esPasado ? [] : calcularTurnos({
        fecha, horarios, citas: citas as any, medicoId: id, sedeId: sedeFiltro, desdeMinutos: desde,
      });
      const filas: Fila[] = [
        ...propias.map((c: any) => ({ tipo: 'cita' as const, hora: aHoraCorta(c.hora_inicio), cita: c })),
        ...libres.map((t) => ({ tipo: 'libre' as const, hora: t.hora_inicio, fin: t.hora_fin, sedeId: t.sede_id })),
      ].sort((a, b) => a.hora.localeCompare(b.hora));
      const activas = propias.filter((c: any) => !['cancelada', 'no_asistio'].includes(c.estado)).length;
      return { id, nombre: id === SIN_ASIGNAR ? 'Sin asignar' : nombreMedico(id), filas, activas, libres: libres.length };
    }).sort((a, b) => (a.id === SIN_ASIGNAR ? 1 : b.id === SIN_ASIGNAR ? -1 : a.nombre.localeCompare(b.nombre)));
  }, [citas, horarios, dia, sedeFiltro, fecha, today, esPasado, optometras]); // eslint-disable-line react-hooks/exhaustive-deps

  const resumenHorario = (medicoId: string) => {
    const propios = horarios.filter((h) => h.medico_id === medicoId && h.activo);
    if (propios.length === 0) return 'Sin horario configurado';
    const dias = [...new Set(propios.map((h) => h.dia_semana))].sort().map((d) => DIAS_SEMANA[d].slice(0, 3));
    return `${propios.length} bloque${propios.length !== 1 ? 's' : ''} · ${dias.join(', ')}`;
  };

  return (
    <AppLayout>
      <PageHeader title="Agenda" description="Gestión de citas, agenda y horarios de optómetras">
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

      <Tabs defaultValue="dia">
        <TabsList className="mb-4">
          <TabsTrigger value="dia">Día</TabsTrigger>
          <TabsTrigger value="horarios">Horarios Médicos</TabsTrigger>
        </TabsList>

        <TabsContent value="dia">
          <p className="text-sm text-muted-foreground mb-3 capitalize">
            {new Date(fecha + 'T12:00:00').toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
          </p>
          {columnas.length === 0 ? (
            <Card>
              <CardContent className="py-10 text-center text-sm text-muted-foreground space-y-2">
                <p>No hay médicos con horario los {DIAS_SEMANA[dia].toLowerCase()} ni citas este día.</p>
                <p>Configure los horarios en la pestaña <span className="font-medium">Horarios Médicos</span> para ver aquí los turnos disponibles.</p>
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
                        {col.id !== SIN_ASIGNAR && <Badge variant="outline" className="text-[10px]">{col.libres} libres</Badge>}
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
                          </div>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-7 w-7" aria-label="Cambiar estado"><MoreVertical className="h-4 w-4" /></Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuLabel className="text-xs">Cambiar estado</DropdownMenuLabel>
                              <DropdownMenuSeparator />
                              {Object.entries(estadoLabel).filter(([k]) => k !== fila.cita.estado).map(([k, label]) => (
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
        </TabsContent>

        <TabsContent value="horarios" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {optometras.length === 0 ? (
              <p className="text-muted-foreground col-span-full text-center py-8">No hay optómetras registrados. Cree un usuario con rol "Optómetra" en el módulo de Usuarios.</p>
            ) : (
              optometras.map((doc: any) => (
                <Card key={doc.user_id}>
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-sm font-medium">{doc.nombre}</CardTitle>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setShowScheduleFor({ userId: doc.user_id, nombre: doc.nombre })}
                      >
                        <CalendarIcon className="h-3 w-3 mr-1" />Configurar
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-1">
                    <p className="text-xs text-muted-foreground">{doc.email}</p>
                    <p className="text-xs flex items-center gap-1"><MapPin className="h-3 w-3 text-muted-foreground" />{resumenHorario(doc.user_id)}</p>
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        </TabsContent>
      </Tabs>

      <NuevaCitaDialog
        open={!!prefijo}
        onOpenChange={(o) => { if (!o) setPrefijo(null); }}
        prefijo={prefijo ?? { fecha }}
        medicos={optometras as any}
        horarios={horarios}
        sedes={sedes as any}
      />

      {showScheduleFor && (
        <DoctorScheduleManager
          medicoId={showScheduleFor.userId}
          medicoNombre={showScheduleFor.nombre}
          open={!!showScheduleFor}
          onOpenChange={(o) => { if (!o) setShowScheduleFor(null); }}
        />
      )}
    </AppLayout>
  );
}
