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
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from '@/components/ui/dropdown-menu';
import { Plus, UserPlus, Calendar as CalendarIcon, MoreHorizontal, Shield, KeyRound, UserX, UserCheck, Pencil } from 'lucide-react';
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
  const [showChangeRole, setShowChangeRole] = useState<{ userId: string; nombre: string; currentRole: string } | null>(null);
  const [showResetPassword, setShowResetPassword] = useState<{ userId: string; nombre: string } | null>(null);
  const [showEditProfile, setShowEditProfile] = useState<any | null>(null);
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

  const invokeAdmin = async (body: Record<string, any>) => {
    const res = await supabase.functions.invoke('create-user', { body });
    if (res.error) throw res.error;
    if (res.data?.error) throw new Error(res.data.error);
    return res.data;
  };

  const createUser = useMutation({
    mutationFn: async (formData: Record<string, string>) => invokeAdmin({ action: 'create', ...formData, sedes_asignadas: formData.sede_id ? [formData.sede_id] : [] }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['all-profiles'] });
      queryClient.invalidateQueries({ queryKey: ['all-roles'] });
      setShowCreateUser(false);
      toast.success('Usuario creado exitosamente');
    },
    onError: (e: any) => toast.error(e.message),
  });

  const changeRole = useMutation({
    mutationFn: async ({ target_user_id, new_role }: { target_user_id: string; new_role: string }) =>
      invokeAdmin({ action: 'change_role', target_user_id, new_role }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['all-roles'] });
      setShowChangeRole(null);
      toast.success('Rol actualizado');
    },
    onError: (e: any) => toast.error(e.message),
  });

  const resetPassword = useMutation({
    mutationFn: async ({ target_user_id, new_password }: { target_user_id: string; new_password: string }) =>
      invokeAdmin({ action: 'reset_password', target_user_id, new_password }),
    onSuccess: () => {
      setShowResetPassword(null);
      toast.success('Contraseña actualizada');
    },
    onError: (e: any) => toast.error(e.message),
  });

  const toggleActive = useMutation({
    mutationFn: async ({ target_user_id, active }: { target_user_id: string; active: boolean }) =>
      invokeAdmin({ action: 'toggle_active', target_user_id, active }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['all-profiles'] });
      toast.success('Estado del usuario actualizado');
    },
    onError: (e: any) => toast.error(e.message),
  });

  const updateProfile = useMutation({
    mutationFn: async (data: any) => invokeAdmin({ action: 'update_profile', ...data }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['all-profiles'] });
      setShowEditProfile(null);
      toast.success('Perfil actualizado');
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
      <PageHeader title="Usuarios y Médicos" description="Gestión de usuarios, roles, contraseñas y horarios médicos">
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
                    <TableHead>Teléfono</TableHead>
                    <TableHead>Rol</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead className="w-10"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {profiles.map((p: any) => {
                    const role = getRoleForUser(p.user_id);
                    const roleLabel = ROLES.find(r => r.value === role)?.label || role;
                    return (
                      <TableRow key={p.id}>
                        <TableCell className="font-medium">{p.nombre}</TableCell>
                        <TableCell>{p.email}</TableCell>
                        <TableCell>{p.telefono || '—'}</TableCell>
                        <TableCell>
                          <Badge variant={role === 'admin' ? 'default' : 'outline'}>{roleLabel}</Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant={p.estado_activo ? 'default' : 'secondary'}>
                            {p.estado_activo ? 'Activo' : 'Inactivo'}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-8 w-8">
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => setShowEditProfile(p)}>
                                <Pencil className="h-4 w-4 mr-2" />Editar Perfil
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => setShowChangeRole({ userId: p.user_id, nombre: p.nombre, currentRole: role })}>
                                <Shield className="h-4 w-4 mr-2" />Cambiar Rol
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => setShowResetPassword({ userId: p.user_id, nombre: p.nombre })}>
                                <KeyRound className="h-4 w-4 mr-2" />Cambiar Contraseña
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                onClick={() => toggleActive.mutate({ target_user_id: p.user_id, active: !p.estado_activo })}
                                className={p.estado_activo ? 'text-destructive' : 'text-green-600'}
                              >
                                {p.estado_activo ? (
                                  <><UserX className="h-4 w-4 mr-2" />Desactivar</>
                                ) : (
                                  <><UserCheck className="h-4 w-4 mr-2" />Activar</>
                                )}
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    );
                  })}
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

      {/* Change Role Dialog */}
      <Dialog open={!!showChangeRole} onOpenChange={(o) => { if (!o) setShowChangeRole(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Cambiar Rol — {showChangeRole?.nombre}</DialogTitle></DialogHeader>
          <form onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            const newRole = fd.get('new_role') as string;
            if (!newRole || !showChangeRole) return;
            changeRole.mutate({ target_user_id: showChangeRole.userId, new_role: newRole });
          }} className="space-y-4">
            <div className="space-y-2">
              <Label>Nuevo Rol</Label>
              <Select name="new_role" defaultValue={showChangeRole?.currentRole}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ROLES.map(r => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="flex justify-end gap-2 pt-4 border-t">
              <Button type="button" variant="outline" onClick={() => setShowChangeRole(null)}>Cancelar</Button>
              <Button type="submit" disabled={changeRole.isPending}>{changeRole.isPending ? 'Guardando...' : 'Guardar'}</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Reset Password Dialog */}
      <Dialog open={!!showResetPassword} onOpenChange={(o) => { if (!o) setShowResetPassword(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Cambiar Contraseña — {showResetPassword?.nombre}</DialogTitle></DialogHeader>
          <form onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            const pw = fd.get('new_password') as string;
            if (!pw || pw.length < 6 || !showResetPassword) {
              toast.error('La contraseña debe tener al menos 6 caracteres');
              return;
            }
            resetPassword.mutate({ target_user_id: showResetPassword.userId, new_password: pw });
          }} className="space-y-4">
            <div className="space-y-2">
              <Label>Nueva Contraseña</Label>
              <Input name="new_password" type="password" required minLength={6} placeholder="Mínimo 6 caracteres" />
            </div>
            <div className="flex justify-end gap-2 pt-4 border-t">
              <Button type="button" variant="outline" onClick={() => setShowResetPassword(null)}>Cancelar</Button>
              <Button type="submit" disabled={resetPassword.isPending}>{resetPassword.isPending ? 'Guardando...' : 'Cambiar'}</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit Profile Dialog */}
      <Dialog open={!!showEditProfile} onOpenChange={(o) => { if (!o) setShowEditProfile(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Editar Perfil — {showEditProfile?.nombre}</DialogTitle></DialogHeader>
          <form onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            updateProfile.mutate({
              target_user_id: showEditProfile?.user_id,
              nombre: fd.get('nombre') as string,
              telefono: fd.get('telefono') as string || null,
            });
          }} className="space-y-4">
            <div className="space-y-2"><Label>Nombre</Label><Input name="nombre" defaultValue={showEditProfile?.nombre} required /></div>
            <div className="space-y-2"><Label>Teléfono</Label><Input name="telefono" defaultValue={showEditProfile?.telefono || ''} /></div>
            <div className="flex justify-end gap-2 pt-4 border-t">
              <Button type="button" variant="outline" onClick={() => setShowEditProfile(null)}>Cancelar</Button>
              <Button type="submit" disabled={updateProfile.isPending}>{updateProfile.isPending ? 'Guardando...' : 'Guardar'}</Button>
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
