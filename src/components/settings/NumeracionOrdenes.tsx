/**
 * Configuración → Numeración: desde qué número siguen las órdenes nuevas,
 * para continuar la numeración que la óptica traía de su sistema anterior.
 */
import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Hash } from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { supabase } from '@/integrations/supabase/client';
import { etiquetaOrden } from '@/lib/kanbanFiltros';

export function NumeracionOrdenes() {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ['numeracion-ordenes'],
    queryFn: async () => {
      const { data, error } = await (supabase.rpc as any)('numeracion_ordenes');
      if (error) throw error;
      return data as { siguiente: number; mayor: number };
    },
  });
  const [siguiente, setSiguiente] = useState('');
  useEffect(() => { if (data) setSiguiente(String(data.siguiente)); }, [data]);

  const guardar = useMutation({
    mutationFn: async () => {
      const n = parseInt(siguiente, 10);
      if (!Number.isFinite(n)) throw new Error('Escriba un número');
      const { error } = await (supabase.rpc as any)('fijar_siguiente_numero_orden', { p_siguiente: n });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['numeracion-ordenes'] });
      toast.success(`La próxima orden será ${etiquetaOrden(parseInt(siguiente, 10))}`);
    },
    onError: (e: any) => toast.error(e.message),
  });

  const n = parseInt(siguiente, 10);
  return (
    <Card className="max-w-xl">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base"><Hash className="h-4 w-4" />Numeración de órdenes</CardTitle>
        <CardDescription>
          Para seguir con el número en el que va la óptica hoy. Las órdenes nuevas toman el número siguiente; las ya creadas no cambian
          (su número se corrige una por una desde el detalle de la orden).
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading || !data ? <p className="text-sm text-muted-foreground">Cargando…</p> : (
          <>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="rounded-md bg-muted/50 p-3">
                <p className="text-xs text-muted-foreground">Número más alto usado</p>
                <p className="font-semibold">{data.mayor ? etiquetaOrden(data.mayor) : '—'}</p>
              </div>
              <div className="rounded-md bg-muted/50 p-3">
                <p className="text-xs text-muted-foreground">Próxima orden</p>
                <p className="font-semibold text-primary">{etiquetaOrden(data.siguiente)}</p>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="sig-orden">Siguiente número de orden</Label>
              <div className="flex gap-2">
                <Input id="sig-orden" type="number" min={data.mayor + 1} value={siguiente} onChange={(e) => setSiguiente(e.target.value)} className="max-w-[160px]" />
                <Button onClick={() => guardar.mutate()} disabled={guardar.isPending || !Number.isFinite(n) || n === data.siguiente}>
                  {guardar.isPending ? 'Guardando…' : 'Guardar'}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                {Number.isFinite(n) && n > data.mayor ? `La próxima orden será ${etiquetaOrden(n)}.` : `Debe ser mayor que ${data.mayor}.`}
              </p>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
