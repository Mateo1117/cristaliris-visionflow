import { AppLayout } from '@/components/layout/AppLayout';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Plus, ChevronLeft, ChevronRight, Calendar as CalendarIcon, Trash2 } from 'lucide-react';
import { DoctorScheduleManager } from '@/components/schedule/DoctorScheduleManager';
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

const horas = Array.from({ length: 20 }, (_, i) => {
  const h = Math.floor(i / 2) + 8;
  const m = i % 2 === 0 ? '00' : '20';
  return `${h.toString().padStart(2, '0')}:${m}`;
}).filter(h => parseInt(h.split(':')[0]) < 18);

const estadoColor: Record<string, string> = {
  agendada: 'bg-info/20 text-info border-info/30',
  confirmada: 'bg-primary/20 text-primary border-primary/30',
  asistio: 'bg-success/20 text-success border-success/30',
  no_asistio: 'bg-destructive/20 text-destructive border-destructive/30',
  cancelada: 'bg-muted text-muted-foreground border-muted',
};

const estadoLabel: Record<string, string> = {
  agendada: 'Agendada', confirmada: 'Confirmada', asistio: 'Asistió', no_asistio: 'No Asistió', cancelada: 'Cancelada',
};

const DIAS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

export default function Agenda() {
  const today = new Date().toISOString().split('T')[0];
  const [fecha, setFecha] = useState(today);
  const [showForm, setShowForm] = useState(false);
  const [selectedPaciente, setSelectedPaciente] = useState('');
  const [showScheduleFor, setShowScheduleFor] = useState<{ userId: string; nombre: string } | null>(null);
  const queryClient = useQueryClient();

  const { data: citas = [] } = useQuery({
    queryKey: ['citas', fecha],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('citas')
        .select('*, pacientes(nombres, apellidos), profiles:optometra_id(nombre)')
        .eq('fecha', fecha)
        .order('hora_inicio');
      if (error) throw error;
      return data;
    },
  });

  const { data: pacientes = [] } = useQuery({
    queryKey: ['pacientes-agenda'],
    queryFn: async () => {
      const { data, error } = await supabase.from('pacientes').select('id, nombres, apellidos, numero_documento').order('nombres');
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
      const { data, error } = await supabase.from('profiles').select('user_id, nombre, email').in('user_id', ids).eq('estado_activo', true);
      if (error) throw error;
      return data || [];
    },
  });

  const { data: sedes = [] } = useQuery({
    queryKey: ['sedes-agenda'],
    queryFn: async () => {
      const { data, error } = await supabase.from('sedes').select('id, nombre').eq('estado_activa', true);
      if (error) throw error;
      return data || [];
    },
  });

  const { data: horarios = [] } = useQuery({
    queryKey: ['horarios-medico', showScheduleFor?.userId],
    queryFn: async () => {
      if (!showScheduleFor) return [];
      const { data, error } = await supabase.from('horarios_medicos')
        .select('*, sedes(nombre)')
        .eq('medico_id', showScheduleFor.userId)
        .order('dia_semana');
      if (error) throw error;
      return data;
    },
    enabled: !!showScheduleFor,
  });

  const createCita = useMutation({
    mutationFn: async (formData: Record<string, any>) => {
      const { error } = await supabase.from('citas').insert({
        paciente_id: formData.paciente_id,
        optometra_id: formData.optometra_id || null,
        fecha: formData.fecha,
        hora_inicio: formData.hora_inicio,
        hora_fin: formData.hora_fin,
        origen: 'manual',
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['citas'] });
      setShowForm(false);
      toast.success('Cita agendada exitosamente');
    },
    onError: (e: any) => toast.error(e.message),
  });

  const addSchedule = useMutation({
    mutationFn: async (data: any) => {
      const { error } = await supabase.from('horarios_medicos').insert(data);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['horarios-medico'] });
      toast.success('Horario agregado');
    },
    onError: (e: any) => toast.error(e.message),
  });

  const deleteSchedule = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('horarios_medicos').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['horarios-medico'] });
      toast.success('Horario eliminado');
    },
    onError: (e: any) => toast.error(e.message),
  });

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const data: Record<string, any> = {};
    fd.forEach((v, k) => { data[k] = v; });
    data.paciente_id = selectedPaciente;
    if (!selectedPaciente) { toast.error('Seleccione un paciente'); return; }
    createCita.mutate(data);
  };

  const handleAddSchedule = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    addSchedule.mutate({
      medico_id: showScheduleFor!.userId,
      dia_semana: parseInt(fd.get('dia_semana') as string),
      hora_inicio: fd.get('hora_inicio'),
      hora_fin: fd.get('hora_fin'),
      duracion_cita: parseInt(fd.get('duracion_cita') as string) || 30,
      sede_id: fd.get('sede_id') || null,
    });
  };

  const changeDate = (days: number) => {
    const d = new Date(fecha);
    d.setDate(d.getDate() + days);
    setFecha(d.toISOString().split('T')[0]);
  };

  const optNames = [...new Set(citas.map((c: any) => (c as any).profiles?.nombre || 'Sin asignar'))];
  if (optNames.length === 0) optNames.push('Sin asignar');

  return (
    <AppLayout>
      <PageHeader title="Agenda" description="Gestión de citas, agenda y horarios de optómetras">
        <Button onClick={() => setShowForm(true)}><Plus className="h-4 w-4 mr-1" />Nueva Cita</Button>
      </PageHeader>

      <div className="flex items-center gap-3 mb-4">
        <Button variant="outline" size="icon" onClick={() => changeDate(-1)}><ChevronLeft className="h-4 w-4" /></Button>
        <Input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} className="w-[180px]" />
        <Button variant="outline" size="icon" onClick={() => changeDate(1)}><ChevronRight className="h-4 w-4" /></Button>
        <Button variant="ghost" size="sm" onClick={() => setFecha(today)}>Hoy</Button>
      </div>

      <Tabs defaultValue="dia">
        <TabsList className="mb-4">
          <TabsTrigger value="dia">Día</TabsTrigger>
          <TabsTrigger value="horarios">Horarios Médicos</TabsTrigger>
        </TabsList>

        <TabsContent value="dia">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {optNames.map((opt) => (
              <Card key={opt}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">{opt}</CardTitle>
                  <p className="text-xs text-muted-foreground">{new Date(fecha + 'T12:00:00').toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</p>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="divide-y">
                    {horas.map((hora) => {
                      const cita = citas.find((c: any) => c.hora_inicio === hora + ':00' && ((c as any).profiles?.nombre || 'Sin asignar') === opt);
                      return (
                        <div key={hora} className="flex items-center px-4 py-2 min-h-[3rem]">
                          <span className="text-xs text-muted-foreground w-12 flex-shrink-0">{hora}</span>
                          {cita ? (
                            <div className={`flex-1 rounded-md border px-3 py-1.5 ${estadoColor[(cita as any).estado] || ''}`}>
                              <div className="flex items-center justify-between">
                                <span className="text-sm font-medium">{(cita as any).pacientes?.nombres} {(cita as any).pacientes?.apellidos}</span>
                                <Badge variant="outline" className="text-[10px] h-5">{estadoLabel[(cita as any).estado] || (cita as any).estado}</Badge>
                              </div>
                              <span className="text-[10px] opacity-70">{(cita as any).hora_inicio} - {(cita as any).hora_fin} · {(cita as any).origen}</span>
                            </div>
                          ) : (
                            <div className="flex-1 h-8 rounded-md border border-dashed border-border/50" />
                          )}
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
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
                  <CardContent>
                    <p className="text-xs text-muted-foreground">{doc.email}</p>
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        </TabsContent>
      </Tabs>

      {/* New Appointment Dialog */}
      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Nueva Cita</DialogTitle></DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label>Paciente *</Label>
              <Select onValueChange={setSelectedPaciente}>
                <SelectTrigger><SelectValue placeholder="Seleccione paciente" /></SelectTrigger>
                <SelectContent>
                  {pacientes.map((p: any) => (
                    <SelectItem key={p.id} value={p.id}>{p.numero_documento} — {p.nombres} {p.apellidos}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Optómetra</Label>
              <Select name="optometra_id">
                <SelectTrigger><SelectValue placeholder="Seleccione optómetra" /></SelectTrigger>
                <SelectContent>
                  {optometras.map((o: any) => (
                    <SelectItem key={o.user_id} value={o.user_id}>{o.nombre}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2"><Label>Fecha *</Label><Input name="fecha" type="date" required defaultValue={fecha} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2"><Label>Hora Inicio *</Label><Input name="hora_inicio" type="time" required defaultValue="08:00" /></div>
              <div className="space-y-2"><Label>Hora Fin *</Label><Input name="hora_fin" type="time" required defaultValue="08:20" /></div>
            </div>
            <div className="flex justify-end gap-2 pt-4 border-t">
              <Button type="button" variant="outline" onClick={() => setShowForm(false)}>Cancelar</Button>
              <Button type="submit" disabled={createCita.isPending}>{createCita.isPending ? 'Agendando...' : 'Agendar Cita'}</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Doctor Schedule Dialog */}
      <Dialog open={!!showScheduleFor} onOpenChange={(o) => { if (!o) setShowScheduleFor(null); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Horarios — {showScheduleFor?.nombre}</DialogTitle></DialogHeader>

          <div className="space-y-3 max-h-60 overflow-y-auto">
            {horarios.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">Sin horarios configurados</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Día</TableHead>
                    <TableHead>Horario</TableHead>
                    <TableHead>Duración</TableHead>
                    <TableHead>Sede</TableHead>
                    <TableHead className="w-8"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {horarios.map((h: any) => (
                    <TableRow key={h.id}>
                      <TableCell className="font-medium">{DIAS[h.dia_semana]}</TableCell>
                      <TableCell>{h.hora_inicio} – {h.hora_fin}</TableCell>
                      <TableCell>{h.duracion_cita} min</TableCell>
                      <TableCell>{h.sedes?.nombre || 'Todas'}</TableCell>
                      <TableCell>
                        <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => deleteSchedule.mutate(h.id)}>
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>

          <form onSubmit={handleAddSchedule} className="grid grid-cols-2 gap-3 pt-4 border-t">
            <div className="space-y-1">
              <Label className="text-xs">Día</Label>
              <Select name="dia_semana" defaultValue="1">
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {DIAS.map((d, i) => <SelectItem key={i} value={String(i)}>{d}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Sede</Label>
              <Select name="sede_id">
                <SelectTrigger><SelectValue placeholder="Todas" /></SelectTrigger>
                <SelectContent>
                  {sedes.map((s: any) => <SelectItem key={s.id} value={s.id}>{s.nombre}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1"><Label className="text-xs">Hora Inicio</Label><Input name="hora_inicio" type="time" defaultValue="08:00" required /></div>
            <div className="space-y-1"><Label className="text-xs">Hora Fin</Label><Input name="hora_fin" type="time" defaultValue="12:00" required /></div>
            <div className="space-y-1"><Label className="text-xs">Duración (min)</Label><Input name="duracion_cita" type="number" defaultValue="30" min="10" max="120" /></div>
            <div className="flex items-end">
              <Button type="submit" size="sm" className="w-full" disabled={addSchedule.isPending}>
                <Plus className="h-3 w-3 mr-1" />Agregar
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
