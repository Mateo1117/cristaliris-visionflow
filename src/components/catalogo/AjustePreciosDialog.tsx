/**
 * Ajuste masivo de precios de una categoría: por porcentaje o por valor fijo,
 * eligiendo a qué productos se aplica y viendo antes el precio actual, el
 * nuevo y la diferencia de cada uno.
 */
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { useEffect, useState } from 'react';
import { etiquetaCategoria, formatoCOP, leerPrecio, precioAjustado, type ModoAjuste, type ProductoCatalogo } from '@/lib/catalogo';

const RAPIDOS: Record<ModoAjuste, number[]> = {
  porcentaje: [3, 5, 10, -5, -10],
  valor: [5000, 10000, 20000, -5000, -10000],
};

interface Props {
  categoria: string | null;
  productos: ProductoCatalogo[];
  aplicando: boolean;
  onCerrar: () => void;
  onAplicar: (cambios: Array<{ id: string; precio: number }>) => void;
}

export function AjustePreciosDialog({ categoria, productos, aplicando, onCerrar, onAplicar }: Props) {
  const [modo, setModo] = useState<ModoAjuste>('porcentaje');
  const [texto, setTexto] = useState('');
  const [elegidos, setElegidos] = useState<Set<string>>(new Set());

  // Al abrir: todos los productos activos marcados.
  useEffect(() => {
    if (!categoria) return;
    setModo('porcentaje');
    setTexto('');
    setElegidos(new Set(productos.filter((p) => p.activo).map((p) => p.id)));
  }, [categoria]); // eslint-disable-line react-hooks/exhaustive-deps

  const valor = modo === 'porcentaje'
    ? Number(texto.replace(',', '.'))
    : (texto.trim().startsWith('-') ? -1 : 1) * (leerPrecio(texto) ?? 0);
  const valido = Number.isFinite(valor) && valor !== 0;

  const filas = productos.map((p) => {
    const actual = Number(p.precio_full);
    const nuevo = valido ? precioAjustado(actual, modo, valor) : actual;
    return { p, actual, nuevo, dif: nuevo - actual, marcado: elegidos.has(p.id) };
  });
  const aAplicar = filas.filter((f) => f.marcado && f.dif !== 0);
  const totalDif = aAplicar.reduce((s, f) => s + f.dif, 0);

  const alternar = (id: string, v: boolean) => setElegidos((s) => {
    const n = new Set(s);
    if (v) n.add(id); else n.delete(id);
    return n;
  });
  const todosMarcados = filas.length > 0 && filas.every((f) => f.marcado);

  return (
    <Dialog open={!!categoria} onOpenChange={(o) => { if (!o) onCerrar(); }}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Ajustar precios · {categoria && etiquetaCategoria(categoria)}</DialogTitle>
          <DialogDescription>Marque los productos a los que se aplica el cambio y revise el precio nuevo antes de aplicar.</DialogDescription>
        </DialogHeader>

        {/* Tipo y valor del ajuste */}
        <div className="flex flex-wrap items-center gap-3">
          <ToggleGroup type="single" variant="outline" value={modo} onValueChange={(v) => { if (v) { setModo(v as ModoAjuste); setTexto(''); } }}>
            <ToggleGroupItem value="porcentaje" className="px-3">Porcentaje (%)</ToggleGroupItem>
            <ToggleGroupItem value="valor" className="px-3">Valor fijo ($)</ToggleGroupItem>
          </ToggleGroup>
          <div className="relative">
            <Input
              autoFocus inputMode="decimal" className="w-36 pr-8 text-base font-medium"
              value={texto} onChange={(e) => setTexto(e.target.value)}
              placeholder={modo === 'porcentaje' ? 'Ej: 5' : 'Ej: 10000'}
              aria-label={modo === 'porcentaje' ? 'Porcentaje de ajuste' : 'Valor de ajuste en pesos'}
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">{modo === 'porcentaje' ? '%' : '$'}</span>
          </div>
          <div className="flex flex-wrap gap-1">
            {RAPIDOS[modo].map((r) => (
              <Button key={r} type="button" size="sm" variant="secondary" className="h-7 px-2 text-xs tabular-nums"
                onClick={() => setTexto(String(r))}>
                {r > 0 ? '+' : ''}{modo === 'porcentaje' ? `${r}%` : formatoCOP(r)}
              </Button>
            ))}
          </div>
        </div>
        <p className="text-xs text-muted-foreground -mt-1">
          {modo === 'porcentaje' ? 'Use un número negativo para bajar precios. El resultado se redondea a $1.000.' : 'Se suma (o resta, con signo menos) el mismo valor a cada producto.'}
        </p>

        {/* Productos */}
        <div className="rounded-md border overflow-hidden">
          <div className="grid grid-cols-[28px_1fr_100px_100px_90px] gap-2 items-center px-3 py-2 bg-muted/60 text-xs font-medium text-muted-foreground">
            <Checkbox
              checked={todosMarcados}
              onCheckedChange={(v) => setElegidos(v ? new Set(filas.map((f) => f.p.id)) : new Set())}
              aria-label="Marcar todos"
            />
            <span>Producto</span>
            <span className="text-right">Actual</span>
            <span className="text-right">Nuevo</span>
            <span className="text-right">Diferencia</span>
          </div>
          <div className="max-h-[320px] overflow-y-auto divide-y">
            {filas.map(({ p, actual, nuevo, dif, marcado }) => (
              <label
                key={p.id}
                className={`grid grid-cols-[28px_1fr_100px_100px_90px] gap-2 items-center px-3 py-2 text-sm cursor-pointer hover:bg-muted/40 ${marcado ? '' : 'opacity-45'}`}
              >
                <Checkbox checked={marcado} onCheckedChange={(v) => alternar(p.id, v === true)} aria-label={`Aplicar a ${p.nombre}`} />
                <span className="truncate">
                  {p.nombre}
                  {!p.activo && <Badge variant="outline" className="ml-2 text-[10px]">Inactivo</Badge>}
                </span>
                <span className="text-right tabular-nums text-muted-foreground">{formatoCOP(actual)}</span>
                <span className={`text-right tabular-nums font-semibold ${marcado && dif !== 0 ? '' : 'text-muted-foreground font-normal'}`}>
                  {marcado ? formatoCOP(nuevo) : formatoCOP(actual)}
                </span>
                <span className={`text-right tabular-nums text-xs ${!marcado || dif === 0 ? 'text-muted-foreground' : dif > 0 ? 'text-success' : 'text-destructive'}`}>
                  {marcado && dif !== 0 ? `${dif > 0 ? '+' : '−'}${formatoCOP(Math.abs(dif))}` : '—'}
                </span>
              </label>
            ))}
          </div>
        </div>

        <DialogFooter className="items-center gap-2 sm:justify-between">
          <p className="text-sm text-muted-foreground">
            {valido
              ? <>Se cambiarán <span className="font-medium text-foreground">{aAplicar.length}</span> de {filas.length} productos{aAplicar.length > 0 && <> · promedio {totalDif / aAplicar.length > 0 ? '+' : '−'}{formatoCOP(Math.abs(totalDif / aAplicar.length))}</>}</>
              : 'Escriba el ajuste para ver los precios nuevos.'}
          </p>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onCerrar}>Cancelar</Button>
            <Button
              disabled={aAplicar.length === 0 || aplicando}
              onClick={() => onAplicar(aAplicar.map((f) => ({ id: f.p.id, precio: f.nuevo })))}
            >
              {aplicando ? 'Aplicando…' : `Aplicar a ${aAplicar.length} producto${aAplicar.length !== 1 ? 's' : ''}`}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
