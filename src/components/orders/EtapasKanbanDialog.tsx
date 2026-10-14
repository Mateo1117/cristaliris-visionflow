/**
 * Configuración de las etapas del tablero: nombre, orden, color, responsable,
 * si cuenta como "en laboratorio", visibilidad, y etapas nuevas.
 * Las etapas del sistema se pueden renombrar, mover u ocultar, no borrar.
 */
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { COLORES_ETAPA, nombreCorto, type EtapaKanban } from '@/lib/etapasKanban';
import { claveCategoria } from '@/lib/catalogo';

const NADIE = 'nadie';

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  etapas: EtapaKanban[];
  perfiles: Array<{ user_id: string; nombre: string | null }>;
  trabajosPorEtapa: Record<string, number>;
}

type Borrador = EtapaKanban & { nueva?: boolean };

export function EtapasKanbanDialog({ open, onOpenChange, etapas, perfiles, trabajosPorEtapa }: Props) {
  const queryClient = useQueryClient();
  const [lista, setLista] = useState<Borrador[]>([]);
  const [nombreNueva, setNombreNueva] = useState('');

  useEffect(() => {
    if (open) { setLista([...etapas].sort((a, b) => a.orden - b.orden)); setNombreNueva(''); }
  }, [open, etapas]);

  const editar = (clave: string, cambios: Partial<Borrador>) =>
    setLista((l) => l.map((e) => (e.clave === clave ? { ...e, ...cambios } : e)));

  const mover = (i: number, paso: -1 | 1) => setLista((l) => {
    const j = i + paso;
    if (j < 0 || j >= l.length) return l;
    const copia = [...l];
    [copia[i], copia[j]] = [copia[j], copia[i]];
    return copia;
  });

  const agregar = () => {
    const nombre = nombreNueva.trim();
    if (!nombre) return;
    let clave = claveCategoria(nombre) || 'etapa';
    while (lista.some((e) => e.clave === clave)) clave = `${clave}_${Math.floor(Math.random() * 1000)}`;
    // Antes de "Entregado", que suele ser la última.
    const posFinal = lista.findIndex((e) => e.clave === 'entregado');
    const nueva: Borrador = { clave, nombre, orden: 0, color: 'gris', visible: true, responsable_id: null, es_laboratorio: false, sistema: false, nueva: true };
    setLista((l) => (posFinal < 0 ? [...l, nueva] : [...l.slice(0, posFinal), nueva, ...l.slice(posFinal)]));
    setNombreNueva('');
  };

  const guardar = useMutation({
    mutationFn: async () => {
      if (lista.some((e) => !e.nombre.trim())) throw new Error('Todas las etapas deben tener nombre');
      if (!lista.some((e) => e.visible)) throw new Error('Deje al menos una etapa visible');
      const tabla = () => (supabase as any).from('kanban_etapas');
      const borradas = etapas.filter((e) => !lista.some((x) => x.clave === e.clave));
      for (const e of borradas) {
        const { error } = await tabla().delete().eq('clave', e.clave);
        if (error) throw new Error(error.code === '23503' ? `"${e.nombre}" tiene trabajos: muévalos antes de eliminarla` : error.message);
      }
      for (const [i, e] of lista.entries()) {
        const fila = {
          clave: e.clave, nombre: e.nombre.trim(), orden: i + 1, color: e.color, visible: e.visible,
          responsable_id: e.responsable_id, es_laboratorio: e.es_laboratorio, sistema: e.sistema,
        };
        const { error } = e.nueva ? await tabla().insert(fila) : await tabla().update(fila).eq('clave', e.clave);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['kanban-etapas'] });
      queryClient.invalidateQueries({ queryKey: ['orden-productos'] });
      toast.success('Etapas del tablero guardadas');
      onOpenChange(false);
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Etapas del tablero</DialogTitle>
          <DialogDescription>
            Ordene, renombre, asigne responsable y color. Las etapas marcadas "Sistema" tienen comportamiento propio (calidad, entrega, laboratorio): se pueden renombrar u ocultar, no eliminar.
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-md border divide-y">
          <div className="hidden md:grid grid-cols-[56px_1fr_150px_170px_70px_64px_36px] gap-2 px-3 py-2 text-xs text-muted-foreground bg-muted/50">
            <span>Orden</span><span>Nombre</span><span>Color</span><span>Responsable</span><span title="Cuenta como 'en laboratorio' (resumen y alertas)">Lab.</span><span>Visible</span><span />
          </div>
          {lista.map((e, i) => {
            const trabajos = trabajosPorEtapa[e.clave] ?? 0;
            return (
              <div key={e.clave} className={`grid grid-cols-2 md:grid-cols-[56px_1fr_150px_170px_70px_64px_36px] gap-2 items-center px-3 py-2 ${e.visible ? '' : 'opacity-60'}`}>
                <div className="flex">
                  <Button variant="ghost" size="icon" className="h-7 w-7" disabled={i === 0} onClick={() => mover(i, -1)} aria-label="Subir"><ArrowUp className="h-3.5 w-3.5" /></Button>
                  <Button variant="ghost" size="icon" className="h-7 w-7" disabled={i === lista.length - 1} onClick={() => mover(i, 1)} aria-label="Bajar"><ArrowDown className="h-3.5 w-3.5" /></Button>
                </div>
                <div className="flex items-center gap-2 min-w-0 col-span-2 md:col-span-1">
                  <Input className="h-8" value={e.nombre} onChange={(ev) => editar(e.clave, { nombre: ev.target.value })} aria-label="Nombre de la etapa" />
                  {e.sistema && <Badge variant="outline" className="text-[10px] shrink-0">Sistema</Badge>}
                  {trabajos > 0 && <Badge variant="secondary" className="text-[10px] shrink-0">{trabajos}</Badge>}
                </div>
                <Select value={e.color} onValueChange={(v) => editar(e.clave, { color: v })}>
                  <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(COLORES_ETAPA).map(([k, c]) => (
                      <SelectItem key={k} value={k}><span className="flex items-center gap-2"><span className={`h-2.5 w-2.5 rounded-full ${c.punto}`} />{c.etiqueta}</span></SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={e.responsable_id ?? NADIE} onValueChange={(v) => editar(e.clave, { responsable_id: v === NADIE ? null : v })}>
                  <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NADIE}>Sin responsable</SelectItem>
                    {perfiles.map((p) => <SelectItem key={p.user_id} value={p.user_id}>{nombreCorto(p.nombre)}</SelectItem>)}
                  </SelectContent>
                </Select>
                <label className="flex items-center gap-1.5 text-xs md:justify-center" title="Cuenta como 'en laboratorio'">
                  <Switch checked={e.es_laboratorio} onCheckedChange={(v) => editar(e.clave, { es_laboratorio: v })} aria-label="Etapa de laboratorio" />
                  <span className="md:hidden">Laboratorio</span>
                </label>
                <label className="flex items-center gap-1.5 text-xs md:justify-center">
                  <Switch checked={e.visible} onCheckedChange={(v) => editar(e.clave, { visible: v })} aria-label="Visible" />
                  <span className="md:hidden">Visible</span>
                </label>
                <div className="flex justify-end">
                  {!e.sistema && (
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" aria-label="Eliminar etapa"
                      disabled={trabajos > 0} title={trabajos > 0 ? 'Tiene trabajos: muévalos antes de eliminarla' : 'Eliminar'}
                      onClick={() => setLista((l) => l.filter((x) => x.clave !== e.clave))}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <div className="flex gap-2">
          <Input placeholder="Nombre de la nueva etapa (ej: Biselado)" value={nombreNueva}
            onChange={(e) => setNombreNueva(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); agregar(); } }} />
          <Button variant="outline" onClick={agregar} disabled={!nombreNueva.trim()}><Plus className="h-4 w-4 mr-1" />Agregar etapa</Button>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={() => guardar.mutate()} disabled={guardar.isPending}>{guardar.isPending ? 'Guardando…' : 'Guardar etapas'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
