import { useState } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { PageHeader } from '@/components/shared/PageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Plus, UserPlus, Calendar as CalendarIcon } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

const ROLES = [
  { value: 'admin', label: 'Administrador' },
  { value: 'optometra', label: 'Optómetra' },
  { value: 'asesor_comercial', label: 'Asesor Comercial' },
  { value: 'auxiliar_optica', label: 'Auxiliar Óptica' },
  { value: 'mensajero', label: 'Mensajero' },
  { value: 'contador', label: 'Contador' },
  { value: 'visualizador', label: 'Visualizador' },
];

const DIAS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

export default function UsersPage() {
  const [showCreateUser, setShowCreateUser] = useState(false);
  const [showSchedule, setShowSchedule] = useState<string | null>(null);
  const [scheduleDoctor, setScheduleDoctor] = useState<string>('');
  const queryClient = useQueryClient();

  const { data: profiles = [] } = useQuery({
    queryKey: ['all-profiles'],
    queryFn: async () => {
      const { data, error } = await supabase.from('profiles').select('*').order('nombre');
      if (error) throw error;
      return data;
    },
  });

  const { data: roles = [] } = useQuery({
    queryKey: ['all-roles'],
    queryFn: async () => {
      const { data, error } = await supabase.from('user_roles').select('*');
      if (error) throw error;
      return data;
    },
  });

  const { data: sedes = [] } = useQuery({
    queryKey: ['sedes-users'],
    queryFn: async () => {
      const { data, error } = await supabase.from('sedes').select('id, nombre').eq('estado_activa', true);
      if (error) throw error;
      return data;
    },
  });

  const { data: horarios = [] } = useQuery({
    queryKey: ['horarios', showSchedule],
    queryFn: async () => {
      if (!showSchedule) return [];
      const { data, error } = await supabase.from('horarios_medicos')
        .select('*, sedes(nombre)')
        .eq('medico_id', showSchedule)
        .order('dia_semana');
      if (error) throw error;
      return data;
    },
    enabled: !!showSchedule,
  });

  const getRoleForUser = (userId: string) => {
    const r = roles.find((r: any) => r.user_id === userId);
    return r ? (r as any).role : 'sin_rol';
  };

  const isDoctor = (userId: string) => getRoleForUser(userId) === 'optometra';

  const createUser = useMutation({
    mutationFn: async (formData: Record<string, string>) => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('No autenticado');

      const res = await supabase.functions.invoke('create-user', {
        body: {
          email: formData.email,
          password: formData.password,
          nombre: formData.nombre,
          rol: formData.rol,
          sedes_asignadas: formData.sede_id ? [formData.sede_id] : [],
        },
      });
      if (res.error) throw res.error;
      if (res.data?.error) throw new Error(res.data.error);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['all-profiles'] });
      queryClient.invalidateQueries({ queryKey: ['all-roles'] });
      setShowCreateUser(false);
      toast.success('Usuario creado exitosamente');
    },
    onError: (e: any) => toast.error(e.message),
  });

  const addSchedule = useMutation({
    mutationFn: async (data: any) => {
      const { error } = await supabase.from('horarios_medicos').insert(data);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['horarios'] });
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
      queryClient.invalidateQueries({ queryKey: ['horarios'] });
      toast.success('Horario eliminado');
    },
    onError: (e: any) => toast.error(e.message),
  });

  const handleCreateUser = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const data: Record<string, string> = {};
    fd.forEach((v, k) => { data[k] = v as string; });
    if (!data.email || !data.password || !data.nombre || !data.rol) {
      toast.error('Complete todos los campos requeridos');
      return;
    }
    createUser.mutate(data);
  };

  const handleAddSchedule = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    addSchedule.mutate({
      medico_id: showSchedule,
      dia_semana: parseInt(fd.get('dia_semana') as string),
      hora_inicio: fd.get('hora_inicio'),
      hora_fin: fd.get('hora_fin'),
      duracion_cita: parseInt(fd.get('duracion_cita') as string) || 30,
      sede_id: fd.get('sede_id') || null,
    });
  };

  const doctors = profiles.filter((p: any) => isDoctor(p.user_id));

  return (
    <AppLayout>
      <PageHeader title="Usuarios y Médicos" description="Gestión de usuarios, roles y horarios médicos">
        <Button onClick={() => setShowCreateUser(true)}><UserPlus className="h-4 w-4 mr-1" />Nuevo Usuario</Button>
      </PageHeader>

      <Tabs defaultValue="usuarios">
        <TabsList>
          <TabsTrigger value="usuarios">Usuarios</TabsTrigger>
          <TabsTrigger value="medicos">Médicos / Optómetras</TabsTrigger>
        </TabsList>

        <TabsContent value="usuarios">
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nombre</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Rol</TableHead>
                    <TableHead>Estado</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {profiles.map((p: any) => (
                    <TableRow key={p.id}>
                      <TableCell className="font-medium">{p.nombre}</TableCell>
                      <TableCell>{p.email}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{ROLES.find(r => r.value === getRoleForUser(p.user_id))?.label || getRoleForUser(p.user_id)}</Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant={p.estado_activo ? 'default' : 'secondary'}>{p.estado_activo ? 'Activo' : 'Inactivo'}</Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="medicos" className="space-y-4">
          {doctors.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">No hay médicos registrados. Cree un usuario con rol "Optómetra".</p>
          ) : (
            doctors.map((d: any) => (
              <Card key={d.id}>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base">{d.nombre}</CardTitle>
                    <Button size="sm" variant="outline" onClick={() => { setShowSchedule(d.user_id); setScheduleDoctor(d.nombre); }}>
                      <CalendarIcon className="h-3 w-3 mr-1" />Horarios
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">{d.email}</p>
                </CardContent>
              </Card>
            ))
          )}
        </TabsContent>
      </Tabs>

      {/* Create User Dialog */}
      <Dialog open={showCreateUser} onOpenChange={setShowCreateUser}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Crear Usuario</DialogTitle></DialogHeader>
          <form onSubmit={handleCreateUser} className="space-y-4">
            <div className="space-y-2"><Label>Nombre *</Label><Input name="nombre" required /></div>
            <div className="space-y-2"><Label>Email *</Label><Input name="email" type="email" required /></div>
            <div className="space-y-2"><Label>Contraseña *</Label><Input name="password" type="password" required minLength={6} /></div>
            <div className="space-y-2">
              <Label>Rol *</Label>
              <Select name="rol">
                <SelectTrigger><SelectValue placeholder="Seleccione rol" /></SelectTrigger>
                <SelectContent>
                  {ROLES.map(r => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Sede</Label>
              <Select name="sede_id">
                <SelectTrigger><SelectValue placeholder="Seleccione sede" /></SelectTrigger>
                <SelectContent>
                  {sedes.map((s: any) => <SelectItem key={s.id} value={s.id}>{s.nombre}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="flex justify-end gap-2 pt-4 border-t">
              <Button type="button" variant="outline" onClick={() => setShowCreateUser(false)}>Cancelar</Button>
              <Button type="submit" disabled={createUser.isPending}>{createUser.isPending ? 'Creando...' : 'Crear Usuario'}</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Schedule Dialog */}
      <Dialog open={!!showSchedule} onOpenChange={(o) => { if (!o) setShowSchedule(null); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Horarios — {scheduleDoctor}</DialogTitle></DialogHeader>

          <div className="space-y-3 max-h-60 overflow-y-auto">
            {horarios.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">Sin horarios configurados</p>
            ) : horarios.map((h: any) => (
              <div key={h.id} className="flex items-center justify-between text-sm border rounded-md p-2">
                <div>
                  <span className="font-medium">{DIAS[h.dia_semana]}</span>
                  <span className="text-muted-foreground ml-2">{h.hora_inicio} – {h.hora_fin}</span>
                  <span className="text-muted-foreground ml-2">({h.duracion_cita}min)</span>
                  {h.sedes?.nombre && <Badge variant="outline" className="ml-2 text-[10px]">{h.sedes.nombre}</Badge>}
                </div>
                <Button size="sm" variant="ghost" className="text-destructive" onClick={() => deleteSchedule.mutate(h.id)}>×</Button>
              </div>
            ))}
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
