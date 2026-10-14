/**
 * Montura de la orden: del inventario (con su precio y descuento de stock),
 * otra montura escrita a mano, o sin montura. Permite adjuntar fotos (en el
 * celular abre la cámara); se suben a la carpeta de la orden al crearla.
 */
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Camera, Glasses, X } from 'lucide-react';
import { useEffect, useMemo, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { MONTURA_VACIA, type ModoMontura, type MonturaOrdenValor } from './montura';

interface Props {
  valor: MonturaOrdenValor;
  onChange: (v: MonturaOrdenValor) => void;
}

export function MonturaOrden({ valor, onChange }: Props) {
  const archivo = useRef<HTMLInputElement>(null);
  const set = (patch: Partial<MonturaOrdenValor>) => onChange({ ...valor, ...patch });

  const { data: monturas = [] } = useQuery({
    queryKey: ['inventario-monturas'],
    queryFn: async () => {
      const { data, error } = await supabase.from('inventario')
        .select('id, codigo_referencia, marca, modelo, descripcion, precio_venta, costo_unitario, cantidad_disponible')
        .eq('tipo', 'montura').eq('estado', 'activo').gt('cantidad_disponible', 0).order('marca');
      if (error) throw error;
      return data ?? [];
    },
  });

  const vistas = useMemo(() => valor.fotos.map((f) => ({ f, url: URL.createObjectURL(f) })), [valor.fotos]);
  useEffect(() => () => vistas.forEach((v) => URL.revokeObjectURL(v.url)), [vistas]);

  const elegirInventario = (id: string) => {
    const m = monturas.find((x: any) => x.id === id);
    if (!m) return;
    set({
      inventario_id: m.id,
      descripcion: [m.marca, m.modelo].filter(Boolean).join(' ') || m.descripcion || 'Montura',
      referencia: m.codigo_referencia ?? '',
      precio: String(Number(m.precio_venta) || 0),
      costo: Number(m.costo_unitario) || 0,
    });
  };

  return (
    <div className="rounded-lg border p-3 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold flex items-center gap-1.5"><Glasses className="h-4 w-4 text-primary" />Montura</p>
        <ToggleGroup type="single" variant="outline" size="sm" value={valor.modo}
          onValueChange={(v) => v && onChange({ ...MONTURA_VACIA, modo: v as ModoMontura, fotos: valor.fotos })}>
          <ToggleGroupItem value="inventario" className="px-3 text-xs">Del inventario</ToggleGroupItem>
          <ToggleGroupItem value="otra" className="px-3 text-xs">Otra montura</ToggleGroupItem>
          <ToggleGroupItem value="ninguna" className="px-3 text-xs">Sin montura</ToggleGroupItem>
        </ToggleGroup>
      </div>

      {valor.modo !== 'ninguna' && (
        <div className="grid grid-cols-1 md:grid-cols-12 gap-2 items-end">
          {valor.modo === 'inventario' ? (
            <div className="md:col-span-6 space-y-1">
              <Label className="text-xs">Montura en stock</Label>
              <Select value={valor.inventario_id ?? ''} onValueChange={elegirInventario}>
                <SelectTrigger><SelectValue placeholder={monturas.length ? 'Seleccione la montura' : 'No hay monturas con stock'} /></SelectTrigger>
                <SelectContent>
                  {monturas.map((m: any) => (
                    <SelectItem key={m.id} value={m.id}>
                      {[m.marca, m.modelo].filter(Boolean).join(' ') || m.descripcion} {m.codigo_referencia ? `· ${m.codigo_referencia}` : ''} — ${Number(m.precio_venta).toLocaleString('es-CO')} ({m.cantidad_disponible} disp.)
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : (
            <>
              <div className="md:col-span-4 space-y-1">
                <Label className="text-xs">Marca / modelo *</Label>
                <Input value={valor.descripcion} onChange={(e) => set({ descripcion: e.target.value })} placeholder="Ej: Ray-Ban RB5154" />
              </div>
              <div className="md:col-span-2 space-y-1">
                <Label className="text-xs">Referencia</Label>
                <Input value={valor.referencia} onChange={(e) => set({ referencia: e.target.value })} placeholder="Ej: M-1234" />
              </div>
            </>
          )}
          <div className="md:col-span-3 space-y-1">
            <Label className="text-xs">Precio *</Label>
            <Input inputMode="numeric" value={valor.precio} placeholder="0"
              onChange={(e) => set({ precio: e.target.value.replace(/[^\d]/g, '') })} />
          </div>
          <label className="md:col-span-3 flex items-center gap-2 text-xs pb-2 cursor-pointer">
            <Checkbox checked={valor.aplica_descuento} onCheckedChange={(v) => set({ aplica_descuento: v === true })} />
            Aplica descuento de convenio
          </label>
        </div>
      )}

      {/* Fotos */}
      <div className="flex flex-wrap items-center gap-2">
        {vistas.map(({ f, url }) => (
          <div key={url} className="relative">
            <img src={url} alt={`Foto ${f.name}`} className="h-16 w-16 rounded-md object-cover border" />
            <button type="button" aria-label="Quitar foto"
              className="absolute -top-1.5 -right-1.5 rounded-full bg-destructive text-destructive-foreground p-0.5"
              onClick={() => set({ fotos: valor.fotos.filter((x) => x !== f) })}>
              <X className="h-3 w-3" />
            </button>
          </div>
        ))}
        <input
          ref={archivo} type="file" accept="image/*" capture="environment" multiple className="hidden"
          onChange={(e) => { const nuevas = Array.from(e.target.files ?? []); if (nuevas.length) set({ fotos: [...valor.fotos, ...nuevas] }); e.target.value = ''; }}
        />
        <Button type="button" variant="outline" size="sm" onClick={() => archivo.current?.click()}>
          <Camera className="h-4 w-4 mr-1" />{valor.fotos.length ? 'Agregar otra foto' : 'Foto de la montura'}
        </Button>
        {valor.fotos.length > 0 && <span className="text-xs text-muted-foreground">Se guardan con la orden.</span>}
      </div>
    </div>
  );
}
