import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import { Plus, Trash2, Clock, Calendar, MapPin } from 'lucide-react';
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

const DIAS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
const DIAS_CORTOS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

interface DoctorScheduleManagerProps {
  medicoId: string;
  medicoNombre: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function DoctorScheduleManager({ medicoId, medicoNombre, open, onOpenChange }: DoctorScheduleManagerProps) {
  const queryClient = useQueryClient();
  const [showAddForm, setShowAddForm] = useState(false);

  const { data: sedes = [] } = useQuery({
    queryKey: ['sedes-schedule'],
    queryFn: async () => {
      const { data, error } = await supabase.from('sedes').select('id, nombre').eq('estado_activa', true);
      if (error) throw error;
      return data || [];
    },
  });

  const { data: horarios = [], isLoading } = useQuery({
    queryKey: ['horarios-medico-full', medicoId],
    queryFn: async () => {
      const { data, error } = await supabase.from('horarios_medicos')
        .select('*, sedes(nombre)')
        .eq('medico_id', medicoId)
        .order('dia_semana')
        .order('hora_inicio');
      if (error) throw error;
      return data;
    },
    enabled: open && !!medicoId,
  });

  const addSchedule = useMutation({
    mutationFn: async (data: any) => {
      const { error } = await supabase.from('horarios_medicos').insert(data);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['horarios-medico-full', medicoId] });
      setShowAddForm(false);
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
      queryClient.invalidateQueries({ queryKey: ['horarios-medico-full', medicoId] });
      toast.success('Horario eliminado');
    },
    onError: (e: any) => toast.error(e.message),
  });

  const toggleActive = useMutation({
    mutationFn: async ({ id, activo }: { id: string; activo: boolean }) => {
      const { error } = await supabase.from('horarios_medicos').update({ activo }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['horarios-medico-full', medicoId] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const handleAdd = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const daysSelected = fd.getAll('dias') as string[];
    
    if (daysSelected.length === 0) {
      toast.error('Seleccione al menos un día');
      return;
    }

    const horaInicio = fd.get('hora_inicio') as string;
    const horaFin = fd.get('hora_fin') as string;
    if (horaInicio >= horaFin) {
      toast.error('La hora de fin debe ser mayor a la hora de inicio');
      return;
    }

    const base = {
      medico_id: medicoId,
      hora_inicio: horaInicio,
      hora_fin: horaFin,
      duracion_cita: parseInt(fd.get('duracion_cita') as string) || 30,
      sede_id: (fd.get('sede_id') as string) || null,
    };

    // Insert one record per day
    const inserts = daysSelected.map(d => ({ ...base, dia_semana: parseInt(d) }));
    Promise.all(inserts.map(i => addSchedule.mutateAsync(i))).catch(() => {});
  };

  // Group horarios by day
  const byDay = DIAS.map((dia, i) => ({
    dia,
    diaCorto: DIAS_CORTOS[i],
    index: i,
    slots: horarios.filter((h: any) => h.dia_semana === i),
  }));

  const totalSlots = horarios.length;
  const activeSlots = horarios.filter((h: any) => h.activo).length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5 text-primary" />
            Horarios — {medicoNombre}
          </DialogTitle>
        </DialogHeader>

        {/* Summary */}
        <div className="flex gap-4 text-sm">
          <div className="flex items-center gap-1.5">
            <div className="h-2 w-2 rounded-full bg-primary" />
            <span className="text-muted-foreground">{activeSlots} bloques activos</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="h-2 w-2 rounded-full bg-muted-foreground/30" />
            <span className="text-muted-foreground">{totalSlots - activeSlots} inactivos</span>
          </div>
        </div>

        {/* Weekly grid */}
        <div className="grid grid-cols-7 gap-1.5">
          {byDay.map(({ dia, diaCorto, index, slots }) => (
            <div key={index} className="min-h-[120px]">
              <div className={`text-center text-xs font-semibold py-1.5 rounded-t-md ${
                index === 0 ? 'bg-destructive/10 text-destructive' : 'bg-muted'
              }`}>
                <span className="hidden sm:inline">{dia}</span>
                <span className="sm:hidden">{diaCorto}</span>
              </div>
              <div className="border border-t-0 rounded-b-md p-1 space-y-1 min-h-[90px]">
                {slots.length === 0 ? (
                  <p className="text-[10px] text-muted-foreground/50 text-center pt-4">Sin horario</p>
                ) : (
                  slots.map((h: any) => (
                    <div
                      key={h.id}
                      className={`rounded px-1.5 py-1 text-[10px] space-y-0.5 group relative ${
                        h.activo
                          ? 'bg-primary/10 border border-primary/20'
                          : 'bg-muted/50 border border-muted opacity-60'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-medium">{h.hora_inicio.slice(0, 5)}–{h.hora_fin.slice(0, 5)}</span>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-4 w-4 opacity-0 group-hover:opacity-100 text-destructive"
                          onClick={() => deleteSchedule.mutate(h.id)}
                        >
                          <Trash2 className="h-2.5 w-2.5" />
                        </Button>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">{h.duracion_cita}min</span>
                        <Switch
                          checked={h.activo}
                          onCheckedChange={(checked) => toggleActive.mutate({ id: h.id, activo: checked })}
                          className="h-3 w-6 [&>span]:h-2.5 [&>span]:w-2.5"
                        />
                      </div>
                      {h.sedes?.nombre && (
                        <div className="flex items-center gap-0.5 text-muted-foreground">
                          <MapPin className="h-2 w-2" />{h.sedes.nombre}
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Add button */}
        {!showAddForm ? (
          <Button onClick={() => setShowAddForm(true)} className="w-full">
            <Plus className="h-4 w-4 mr-1" />Agregar Horario
          </Button>
        ) : (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Nuevo Bloque de Horario</CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleAdd} className="space-y-4">
                {/* Day multi-select as checkboxes */}
                <div className="space-y-2">
                  <Label className="text-xs">Días de atención</Label>
                  <div className="flex flex-wrap gap-2">
                    {DIAS.map((d, i) => (
                      <label key={i} className="flex items-center gap-1.5 text-sm cursor-pointer">
                        <input type="checkbox" name="dias" value={String(i)} defaultChecked={i >= 1 && i <= 5} className="rounded" />
                        <span className="text-xs">{d}</span>
                      </label>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">Hora Inicio</Label>
                    <Input name="hora_inicio" type="time" defaultValue="08:00" required />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Hora Fin</Label>
                    <Input name="hora_fin" type="time" defaultValue="12:00" required />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Duración (min)</Label>
                    <Input name="duracion_cita" type="number" defaultValue="30" min="10" max="120" />
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
                </div>

                <div className="flex justify-end gap-2">
                  <Button type="button" variant="outline" size="sm" onClick={() => setShowAddForm(false)}>Cancelar</Button>
                  <Button type="submit" size="sm" disabled={addSchedule.isPending}>
                    {addSchedule.isPending ? 'Guardando...' : 'Guardar'}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        )}
      </DialogContent>
    </Dialog>
  );
}
