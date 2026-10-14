import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import { Plus, Trash2, Calendar, MapPin, Pencil } from 'lucide-react';
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { DIAS_SEMANA, validarBloque, type BloqueHorario } from '@/lib/disponibilidad';

const DIAS_CORTOS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
const TODAS = 'todas';

interface DoctorScheduleManagerProps {
  medicoId: string;
  medicoNombre: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface Borrador {
  id?: string;
  dias: number[];
  hora_inicio: string;
  hora_fin: string;
  duracion_cita: number;
  sede_id: string;
}

const BORRADOR_NUEVO: Borrador = { dias: [1, 2, 3, 4, 5], hora_inicio: '08:00', hora_fin: '12:00', duracion_cita: 30, sede_id: TODAS };

export function DoctorScheduleManager({ medicoId, medicoNombre, open, onOpenChange }: DoctorScheduleManagerProps) {
  const queryClient = useQueryClient();
  const [borrador, setBorrador] = useState<Borrador | null>(null);
  const [error, setError] = useState<string | null>(null);

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

  const refrescar = () => {
    queryClient.invalidateQueries({ queryKey: ['horarios-medico-full', medicoId] });
    queryClient.invalidateQueries({ queryKey: ['horarios-medicos'] });
  };

  // Antes se hacía un insert por día en paralelo, con un aviso por cada uno y
  // sin revisar cruces: ahora se valida todo y se guarda en una sola operación.
  const guardar = useMutation({
    mutationFn: async (b: Borrador) => {
      const base = {
        medico_id: medicoId,
        hora_inicio: b.hora_inicio,
        hora_fin: b.hora_fin,
        duracion_cita: b.duracion_cita,
        sede_id: b.sede_id === TODAS ? null : b.sede_id,
      };
      if (b.id) {
        const { error } = await supabase.from('horarios_medicos').update({ ...base, dia_semana: b.dias[0] }).eq('id', b.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('horarios_medicos').insert(b.dias.map((d) => ({ ...base, dia_semana: d })));
        if (error) throw error;
      }
    },
    onSuccess: (_, b) => {
      refrescar();
      setBorrador(null);
      toast.success(b.id ? 'Horario actualizado' : `Horario agregado en ${b.dias.length} día${b.dias.length !== 1 ? 's' : ''}`);
    },
    onError: (e: any) => setError(e.message),
  });

  const eliminar = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('horarios_medicos').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => { refrescar(); toast.success('Horario eliminado'); },
    onError: (e: any) => toast.error(e.message),
  });

  const cambiarActivo = useMutation({
    mutationFn: async ({ id, activo }: { id: string; activo: boolean }) => {
      const { error } = await supabase.from('horarios_medicos').update({ activo }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: refrescar,
    onError: (e: any) => toast.error(e.message),
  });

  const handleGuardar = (e: React.FormEvent) => {
    e.preventDefault();
    if (!borrador) return;
    if (borrador.dias.length === 0) { setError('Seleccione al menos un día'); return; }
    for (const dia of borrador.dias) {
      const msg = validarBloque({ ...borrador, dia_semana: dia }, horarios as BloqueHorario[]);
      if (msg) { setError(msg); return; }
    }
    setError(null);
    guardar.mutate(borrador);
  };

  const abrirNuevo = () => { setError(null); setBorrador({ ...BORRADOR_NUEVO }); };
  const abrirEdicion = (h: any) => {
    setError(null);
    setBorrador({
      id: h.id,
      dias: [h.dia_semana],
      hora_inicio: h.hora_inicio.slice(0, 5),
      hora_fin: h.hora_fin.slice(0, 5),
      duracion_cita: h.duracion_cita,
      sede_id: h.sede_id ?? TODAS,
    });
  };

  const toggleDia = (d: number) => {
    if (!borrador) return;
    // Al editar, el bloque pertenece a un solo día.
    if (borrador.id) { setBorrador({ ...borrador, dias: [d] }); return; }
    const dias = borrador.dias.includes(d) ? borrador.dias.filter((x) => x !== d) : [...borrador.dias, d].sort();
    setBorrador({ ...borrador, dias });
  };

  const byDay = DIAS_SEMANA.map((dia, i) => ({
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

        <div className="flex flex-wrap gap-4 text-sm">
          <div className="flex items-center gap-1.5">
            <div className="h-2 w-2 rounded-full bg-primary" />
            <span className="text-muted-foreground">{activeSlots} bloques activos</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="h-2 w-2 rounded-full bg-muted-foreground/30" />
            <span className="text-muted-foreground">{totalSlots - activeSlots} inactivos</span>
          </div>
          <span className="text-xs text-muted-foreground">Clic en un bloque para editarlo. Estos horarios definen los turnos que se ofrecen al agendar.</span>
        </div>

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
                {isLoading ? (
                  <p className="text-[10px] text-muted-foreground/50 text-center pt-4">…</p>
                ) : slots.length === 0 ? (
                  <p className="text-[10px] text-muted-foreground/50 text-center pt-4">Sin horario</p>
                ) : (
                  slots.map((h: any) => (
                    <div
                      key={h.id}
                      role="button"
                      tabIndex={0}
                      onClick={() => abrirEdicion(h)}
                      onKeyDown={(e) => { if (e.key === 'Enter') abrirEdicion(h); }}
                      className={`rounded px-1.5 py-1 text-[10px] space-y-0.5 group relative cursor-pointer hover:ring-1 hover:ring-primary/40 ${
                        borrador?.id === h.id ? 'ring-2 ring-primary' : ''
                      } ${h.activo
                        ? 'bg-primary/10 border border-primary/20'
                        : 'bg-muted/50 border border-muted opacity-60'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-medium">{h.hora_inicio.slice(0, 5)}–{h.hora_fin.slice(0, 5)}</span>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-4 w-4 opacity-0 group-hover:opacity-100 focus:opacity-100 text-destructive"
                          aria-label="Eliminar bloque"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (confirm(`¿Eliminar el bloque ${dia} ${h.hora_inicio.slice(0, 5)}–${h.hora_fin.slice(0, 5)}?`)) eliminar.mutate(h.id);
                          }}
                        >
                          <Trash2 className="h-2.5 w-2.5" />
                        </Button>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">{h.duracion_cita}min</span>
                        <Switch
                          checked={h.activo}
                          onClick={(e) => e.stopPropagation()}
                          onCheckedChange={(checked) => cambiarActivo.mutate({ id: h.id, activo: checked })}
                          className="h-3 w-6 [&>span]:h-2.5 [&>span]:w-2.5"
                          aria-label={h.activo ? 'Desactivar bloque' : 'Activar bloque'}
                        />
                      </div>
                      <div className="flex items-center gap-0.5 text-muted-foreground">
                        <MapPin className="h-2 w-2" />{h.sedes?.nombre ?? 'Todas las sedes'}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          ))}
        </div>

        {!borrador ? (
          <Button onClick={abrirNuevo} className="w-full">
            <Plus className="h-4 w-4 mr-1" />Agregar Horario
          </Button>
        ) : (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-1.5">
                {borrador.id ? <><Pencil className="h-3.5 w-3.5" />Editar Bloque</> : 'Nuevo Bloque de Horario'}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleGuardar} className="space-y-4">
                <div className="space-y-2">
                  <Label className="text-xs">{borrador.id ? 'Día' : 'Días de atención'}</Label>
                  <div className="flex flex-wrap gap-2">
                    {DIAS_SEMANA.map((d, i) => (
                      <label key={i} className="flex items-center gap-1.5 text-sm cursor-pointer">
                        <input
                          type={borrador.id ? 'radio' : 'checkbox'}
                          checked={borrador.dias.includes(i)}
                          onChange={() => toggleDia(i)}
                          className="rounded"
                        />
                        <span className="text-xs">{d}</span>
                      </label>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">Hora Inicio</Label>
                    <Input type="time" value={borrador.hora_inicio} onChange={(e) => setBorrador({ ...borrador, hora_inicio: e.target.value })} required />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Hora Fin</Label>
                    <Input type="time" value={borrador.hora_fin} onChange={(e) => setBorrador({ ...borrador, hora_fin: e.target.value })} required />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Duración cita (min)</Label>
                    <Input
                      type="number" min={5} max={240} step={5}
                      value={borrador.duracion_cita}
                      onChange={(e) => setBorrador({ ...borrador, duracion_cita: parseInt(e.target.value) || 0 })}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Sede</Label>
                    <Select value={borrador.sede_id} onValueChange={(v) => setBorrador({ ...borrador, sede_id: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value={TODAS}>Todas las sedes</SelectItem>
                        {sedes.map((s: any) => <SelectItem key={s.id} value={s.id}>{s.nombre}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {error && <p className="text-sm text-destructive">{error}</p>}

                <div className="flex justify-end gap-2">
                  <Button type="button" variant="outline" size="sm" onClick={() => { setBorrador(null); setError(null); }}>Cancelar</Button>
                  <Button type="submit" size="sm" disabled={guardar.isPending}>
                    {guardar.isPending ? 'Guardando...' : 'Guardar'}
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
