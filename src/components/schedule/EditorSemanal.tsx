/**
 * Editor del horario semanal de un médico.
 *
 * Cada día tiene sus propias franjas (p. ej. lunes 8–12 y 14–18, sábado
 * 8–12), con su duración de cita y su sede. Se edita todo en borrador y se
 * guarda de una vez; antes cada bloque se creaba y borraba por separado en un
 * diálogo pequeño, sin poder copiar un día a otro ni ver el total semanal.
 */
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Copy, Plus, Trash2, Wand2, Save, Undo2, AlertTriangle } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { DIAS_SEMANA, aMinutos, dentroDeHorario, haySolape, resumenSemanal, type BloqueHorario } from '@/lib/disponibilidad';
import { hoyEnColombia } from '@/lib/agendaGrid';

const TODAS = 'todas';
/** Lunes primero: así se lee una semana de trabajo. */
const ORDEN_DIAS = [1, 2, 3, 4, 5, 6, 0];
const HABILES = [1, 2, 3, 4, 5];
const DURACIONES = [10, 15, 20, 30, 40, 45, 60];

interface Franja {
  k: string;
  id?: string;
  hora_inicio: string;
  hora_fin: string;
  duracion_cita: number;
  sede_id: string;
  activo: boolean;
}
type Semana = Record<number, Franja[]>;

const nuevaClave = () => (globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`);
const corta = (h: string) => h.slice(0, 5);

const PLANTILLAS: Array<{ nombre: string; franjas: Array<[string, string]>; dias: number[] }> = [
  { nombre: 'Jornada partida (8–12 y 14–18), lunes a viernes', franjas: [['08:00', '12:00'], ['14:00', '18:00']], dias: HABILES },
  { nombre: 'Jornada continua (8–17), lunes a viernes', franjas: [['08:00', '17:00']], dias: HABILES },
  { nombre: 'Solo mañanas (8–12), lunes a sábado', franjas: [['08:00', '12:00']], dias: [...HABILES, 6] },
  { nombre: 'Solo tardes (14–18), lunes a viernes', franjas: [['14:00', '18:00']], dias: HABILES },
  { nombre: 'Sábado medio día (8–13)', franjas: [['08:00', '13:00']], dias: [6] },
];

const semanaVacia = (): Semana => Object.fromEntries(ORDEN_DIAS.map((d) => [d, []])) as Semana;

const desdeBloques = (bloques: BloqueHorario[]): Semana => {
  const s = semanaVacia();
  for (const b of [...bloques].sort((a, c) => a.hora_inicio.localeCompare(c.hora_inicio))) {
    s[b.dia_semana].push({
      k: b.id ?? nuevaClave(), id: b.id, hora_inicio: corta(b.hora_inicio), hora_fin: corta(b.hora_fin),
      duracion_cita: b.duracion_cita, sede_id: b.sede_id ?? TODAS, activo: b.activo,
    });
  }
  return s;
};

/** Errores de un día: horas invertidas, duración que no cabe o franjas que se cruzan. */
function erroresDelDia(franjas: Franja[]): string[] {
  const errores: string[] = [];
  franjas.forEach((f, i) => {
    if (!f.hora_inicio || !f.hora_fin || aMinutos(f.hora_inicio) >= aMinutos(f.hora_fin)) {
      errores.push(`Franja ${i + 1}: la hora de fin debe ser mayor a la de inicio`);
    } else if (f.duracion_cita > aMinutos(f.hora_fin) - aMinutos(f.hora_inicio)) {
      errores.push(`Franja ${i + 1}: la duración de la cita no cabe`);
    }
    for (let j = i + 1; j < franjas.length; j++) {
      const g = franjas[j];
      if (f.hora_inicio && f.hora_fin && g.hora_inicio && g.hora_fin && haySolape(f.hora_inicio, f.hora_fin, g.hora_inicio, g.hora_fin)) {
        errores.push(`Las franjas ${corta(f.hora_inicio)}–${corta(f.hora_fin)} y ${corta(g.hora_inicio)}–${corta(g.hora_fin)} se cruzan`);
      }
    }
  });
  return errores;
}

interface Props {
  medicoId: string;
  medicoNombre: string;
  bloques: BloqueHorario[];
  sedes: Array<{ id: string; nombre: string }>;
  puedeEditar: boolean;
  /** Avisa al padre si hay cambios sin guardar (para confirmar al cambiar de médico). */
  onCambiosPendientes?: (pendientes: boolean) => void;
}

export function EditorSemanal({ medicoId, medicoNombre, bloques, sedes, puedeEditar, onCambiosPendientes }: Props) {
  const queryClient = useQueryClient();
  // La lista llega recalculada en cada render: se compara por contenido para
  // no reiniciar el borrador mientras se edita.
  const firmaBloques = JSON.stringify(bloques);
  const original = useMemo(() => desdeBloques(JSON.parse(firmaBloques)), [firmaBloques]);
  const [semana, setSemana] = useState<Semana>(original);
  const [duracionDefecto, setDuracionDefecto] = useState(30);
  const [sedeDefecto, setSedeDefecto] = useState(TODAS);

  useEffect(() => { setSemana(original); }, [original]);

  const firma = (s: Semana) => JSON.stringify(ORDEN_DIAS.map((d) => s[d].map(({ k: _k, ...f }) => f)));
  const hayCambios = firma(semana) !== firma(original);
  useEffect(() => { onCambiosPendientes?.(hayCambios); }, [hayCambios, onCambiosPendientes]);

  const errores = Object.fromEntries(ORDEN_DIAS.map((d) => [d, erroresDelDia(semana[d])])) as Record<number, string[]>;
  const hayErrores = ORDEN_DIAS.some((d) => errores[d].length > 0);
  const todas = ORDEN_DIAS.flatMap((d) => semana[d].map((f) => ({ ...f, dia_semana: d })));
  const total = resumenSemanal(todas);

  const nuevaFranja = (inicio = '08:00', fin = '12:00'): Franja => ({
    k: nuevaClave(), hora_inicio: inicio, hora_fin: fin, duracion_cita: duracionDefecto, sede_id: sedeDefecto, activo: true,
  });

  const setDia = (dia: number, franjas: Franja[]) => setSemana((s) => ({ ...s, [dia]: franjas }));
  const editar = (dia: number, k: string, cambios: Partial<Franja>) =>
    setDia(dia, semana[dia].map((f) => (f.k === k ? { ...f, ...cambios } : f)));

  const agregarFranja = (dia: number) => {
    const ultimas = semana[dia];
    // La siguiente franja arranca donde termina la anterior + 1 h (p. ej. almuerzo).
    if (ultimas.length === 0) return setDia(dia, [nuevaFranja()]);
    const fin = aMinutos(ultimas[ultimas.length - 1].hora_fin);
    const ini = Math.min(fin + 60, 22 * 60);
    const hh = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
    setDia(dia, [...ultimas, nuevaFranja(hh(ini), hh(Math.min(ini + 240, 23 * 60)))]);
  };

  const copiarDia = (origen: number, destinos: number[]) => {
    setSemana((s) => {
      const copia = { ...s };
      for (const d of destinos) {
        if (d === origen) continue;
        // Las franjas del destino se reemplazan; las filas existentes se reutilizan para no perder su id.
        const existentes = s[d];
        copia[d] = s[origen].map((f, i) => ({ ...f, k: nuevaClave(), id: existentes[i]?.id }));
      }
      return copia;
    });
    toast.success(`${DIAS_SEMANA[origen]} copiado a ${destinos.filter((d) => d !== origen).length} día(s). Recuerde guardar.`);
  };

  const aplicarPlantilla = (p: (typeof PLANTILLAS)[number]) => {
    setSemana((s) => {
      const copia = { ...s };
      for (const d of p.dias) {
        const existentes = s[d];
        copia[d] = p.franjas.map(([a, b], i) => ({ ...nuevaFranja(a, b), id: existentes[i]?.id }));
      }
      return copia;
    });
  };

  const guardar = useMutation({
    mutationFn: async () => {
      const filas = ORDEN_DIAS.flatMap((d) => semana[d].map((f) => ({
        id: f.id, medico_id: medicoId, dia_semana: d, hora_inicio: f.hora_inicio, hora_fin: f.hora_fin,
        duracion_cita: f.duracion_cita, sede_id: f.sede_id === TODAS ? null : f.sede_id, activo: f.activo,
      })));

      // Citas futuras que quedarían fuera del horario nuevo: se avisa antes de guardar.
      const { data: futuras, error: ce } = await supabase.from('citas')
        .select('id, fecha, hora_inicio, hora_fin, estado')
        .eq('optometra_id', medicoId).gte('fecha', hoyEnColombia())
        .in('estado', ['agendada', 'confirmada']);
      if (ce) throw ce;
      const fuera = (futuras ?? []).filter((c) => !dentroDeHorario(medicoId, c.fecha, corta(c.hora_inicio), corta(c.hora_fin), filas as BloqueHorario[]));
      if (fuera.length > 0 && !confirm(
        `Hay ${fuera.length} cita(s) futura(s) de ${medicoNombre} que quedan fuera del horario nuevo (la primera: ${fuera[0].fecha} ${corta(fuera[0].hora_inicio)}).\n\nLas citas NO se borran, pero conviene reprogramarlas. ¿Guardar de todas formas?`,
      )) throw new Error('cancelado');

      const idsVivos = new Set(filas.filter((f) => f.id).map((f) => f.id));
      const borrar = bloques.filter((b) => b.id && !idsVivos.has(b.id)).map((b) => b.id as string);
      if (borrar.length) {
        const { error } = await supabase.from('horarios_medicos').delete().in('id', borrar);
        if (error) throw error;
      }
      for (const f of filas.filter((x) => x.id)) {
        const { id, ...cambios } = f;
        const { error } = await supabase.from('horarios_medicos').update(cambios).eq('id', id as string);
        if (error) throw error;
      }
      const nuevas = filas.filter((x) => !x.id).map(({ id: _id, ...f }) => f);
      if (nuevas.length) {
        const { error } = await supabase.from('horarios_medicos').insert(nuevas);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['horarios-medicos'] });
      toast.success(`Horario de ${medicoNombre} guardado`);
    },
    onError: (e: any) => { if (e.message !== 'cancelado') toast.error(e.message); },
  });

  const nombreSede = (id: string) => (id === TODAS ? 'Todas las sedes' : sedes.find((s) => s.id === id)?.nombre ?? 'Sede');

  return (
    <div className="space-y-4">
      {/* Resumen y herramientas */}
      <div className="flex flex-wrap items-end gap-3 justify-between">
        <div className="flex flex-wrap gap-2">
          <Badge variant="secondary" className="text-sm font-normal">{total.horas} h/semana</Badge>
          <Badge variant="secondary" className="text-sm font-normal">{total.turnos} turnos/semana</Badge>
          <Badge variant="secondary" className="text-sm font-normal">{total.dias} días de atención</Badge>
        </div>
        {puedeEditar && (
          <div className="flex flex-wrap items-end gap-2">
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Duración por defecto</Label>
              <Select value={String(duracionDefecto)} onValueChange={(v) => setDuracionDefecto(Number(v))}>
                <SelectTrigger className="h-9 w-[110px]"><SelectValue /></SelectTrigger>
                <SelectContent>{DURACIONES.map((d) => <SelectItem key={d} value={String(d)}>{d} min</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Sede por defecto</Label>
              <Select value={sedeDefecto} onValueChange={setSedeDefecto}>
                <SelectTrigger className="h-9 w-[150px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={TODAS}>Todas las sedes</SelectItem>
                  {sedes.map((s) => <SelectItem key={s.id} value={s.id}>{s.nombre}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="h-9"><Wand2 className="h-4 w-4 mr-1" />Plantillas</Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuLabel className="text-xs">Aplica a los días indicados (reemplaza sus franjas)</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {PLANTILLAS.map((p) => <DropdownMenuItem key={p.nombre} onClick={() => aplicarPlantilla(p)}>{p.nombre}</DropdownMenuItem>)}
                <DropdownMenuSeparator />
                <DropdownMenuItem className="text-destructive" onClick={() => setSemana(semanaVacia())}>Vaciar toda la semana</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )}
      </div>

      {/* Días */}
      <div className="space-y-2">
        {ORDEN_DIAS.map((dia) => {
          const franjas = semana[dia];
          const atiende = franjas.length > 0;
          const r = resumenSemanal(franjas.map((f) => ({ ...f, dia_semana: dia })));
          return (
            <Card key={dia} className={!atiende ? 'bg-muted/30' : errores[dia].length ? 'border-destructive/50' : ''}>
              <CardContent className="p-3">
                <div className="flex flex-col md:flex-row md:items-start gap-3">
                  <div className="flex items-center gap-3 md:w-44 shrink-0 md:pt-1.5">
                    <Switch
                      checked={atiende}
                      disabled={!puedeEditar}
                      onCheckedChange={(v) => setDia(dia, v ? [nuevaFranja()] : [])}
                      aria-label={`Atiende los ${DIAS_SEMANA[dia]}`}
                    />
                    <div>
                      <p className={`font-medium text-sm ${dia === 0 ? 'text-destructive' : ''}`}>{DIAS_SEMANA[dia]}</p>
                      <p className="text-[11px] text-muted-foreground">{atiende ? `${r.horas} h · ${r.turnos} turnos` : 'No atiende'}</p>
                    </div>
                  </div>

                  <div className="flex-1 space-y-2 min-w-0">
                    {franjas.map((f) => (
                      <div key={f.k} className={`flex flex-wrap items-center gap-2 ${!f.activo ? 'opacity-50' : ''}`}>
                        <Input type="time" value={f.hora_inicio} disabled={!puedeEditar} onChange={(e) => editar(dia, f.k, { hora_inicio: e.target.value })} className="h-9 w-[112px]" aria-label="Desde" />
                        <span className="text-muted-foreground text-sm">a</span>
                        <Input type="time" value={f.hora_fin} disabled={!puedeEditar} onChange={(e) => editar(dia, f.k, { hora_fin: e.target.value })} className="h-9 w-[112px]" aria-label="Hasta" />
                        <Select value={String(f.duracion_cita)} disabled={!puedeEditar} onValueChange={(v) => editar(dia, f.k, { duracion_cita: Number(v) })}>
                          <SelectTrigger className="h-9 w-[100px]" aria-label="Duración de la cita"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {[...new Set([...DURACIONES, f.duracion_cita])].sort((a, b) => a - b).map((d) => <SelectItem key={d} value={String(d)}>{d} min</SelectItem>)}
                          </SelectContent>
                        </Select>
                        <Select value={f.sede_id} disabled={!puedeEditar} onValueChange={(v) => editar(dia, f.k, { sede_id: v })}>
                          <SelectTrigger className="h-9 w-[150px]" aria-label="Sede"><SelectValue>{nombreSede(f.sede_id)}</SelectValue></SelectTrigger>
                          <SelectContent>
                            <SelectItem value={TODAS}>Todas las sedes</SelectItem>
                            {sedes.map((s) => <SelectItem key={s.id} value={s.id}>{s.nombre}</SelectItem>)}
                          </SelectContent>
                        </Select>
                        {puedeEditar && (
                          <>
                            <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer" title="Pausar esta franja sin borrarla">
                              <Switch checked={f.activo} onCheckedChange={(v) => editar(dia, f.k, { activo: v })} className="scale-75" />
                              {f.activo ? 'Activa' : 'Pausada'}
                            </label>
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" aria-label="Quitar franja"
                              onClick={() => setDia(dia, franjas.filter((x) => x.k !== f.k))}>
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </>
                        )}
                      </div>
                    ))}
                    {errores[dia].map((e) => (
                      <p key={e} className="text-xs text-destructive flex items-center gap-1"><AlertTriangle className="h-3.5 w-3.5" />{e}</p>
                    ))}
                  </div>

                  {puedeEditar && (
                    <div className="flex gap-1 shrink-0">
                      {atiende && (
                        <Button variant="ghost" size="sm" className="h-8" onClick={() => agregarFranja(dia)}>
                          <Plus className="h-4 w-4 mr-1" />Franja
                        </Button>
                      )}
                      {atiende && (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="sm" className="h-8"><Copy className="h-4 w-4 mr-1" />Copiar</Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuLabel className="text-xs">Copiar {DIAS_SEMANA[dia].toLowerCase()} a…</DropdownMenuLabel>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onClick={() => copiarDia(dia, HABILES)}>Lunes a viernes</DropdownMenuItem>
                            <DropdownMenuItem onClick={() => copiarDia(dia, [...HABILES, 6])}>Lunes a sábado</DropdownMenuItem>
                            <DropdownMenuSeparator />
                            {ORDEN_DIAS.filter((d) => d !== dia).map((d) => (
                              <DropdownMenuItem key={d} onClick={() => copiarDia(dia, [d])}>{DIAS_SEMANA[d]}</DropdownMenuItem>
                            ))}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {puedeEditar && (
        <div className="sticky bottom-0 -mx-1 px-1 py-3 bg-background/95 backdrop-blur border-t flex items-center justify-between gap-2">
          <p className="text-sm text-muted-foreground">
            {hayErrores ? 'Corrija los errores marcados para guardar.' : hayCambios ? 'Tiene cambios sin guardar.' : 'Sin cambios.'}
          </p>
          <div className="flex gap-2">
            <Button variant="outline" disabled={!hayCambios || guardar.isPending} onClick={() => setSemana(original)}>
              <Undo2 className="h-4 w-4 mr-1" />Descartar
            </Button>
            <Button disabled={!hayCambios || hayErrores || guardar.isPending} onClick={() => guardar.mutate()}>
              <Save className="h-4 w-4 mr-1" />{guardar.isPending ? 'Guardando…' : 'Guardar horario'}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
