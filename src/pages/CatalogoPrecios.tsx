import { AppLayout } from '@/components/layout/AppLayout';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ArrowDown, ArrowUp, Copy, MoreVertical, Pencil, Percent, Plus, Search, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { usePermissions } from '@/hooks/usePermissions';
import { AjustePreciosDialog } from '@/components/catalogo/AjustePreciosDialog';
import {
  CATEGORIAS, claveCategoria, etiquetaCategoria, formatoCOP, leerPrecio, ordenarCategorias,
  type ProductoCatalogo,
} from '@/lib/catalogo';

const NUEVA = '__nueva__';
type Borrador = Omit<ProductoCatalogo, 'id' | 'orden_display'> & { id?: string; orden_display?: number };

/**
 * Catálogo de lentes y sus precios. Antes no había pantalla para esto: la
 * lista de Órdenes y Cotizaciones salía de la base de datos y solo se podía
 * cambiar desde Lovable.
 */
export default function CatalogoPrecios() {
  const queryClient = useQueryClient();
  const { canWrite } = usePermissions();
  const puedeEditar = canWrite('catalogo');
  const [busqueda, setBusqueda] = useState('');
  const [verInactivos, setVerInactivos] = useState(false);
  const [editando, setEditando] = useState<Borrador | null>(null);
  const [categoriaNueva, setCategoriaNueva] = useState('');
  const [precioTexto, setPrecioTexto] = useState('');
  const [ajusteCategoria, setAjusteCategoria] = useState<string | null>(null);
  const [precioEnLinea, setPrecioEnLinea] = useState<{ id: string; texto: string } | null>(null);

  const { data: productos = [], isLoading } = useQuery({
    queryKey: ['productos-catalogo-admin'],
    queryFn: async () => {
      const { data, error } = await supabase.from('productos_catalogo').select('*').order('orden_display').order('nombre');
      if (error) throw error;
      return data as ProductoCatalogo[];
    },
  });

  const refrescar = () => {
    queryClient.invalidateQueries({ queryKey: ['productos-catalogo-admin'] });
    // Listas de Órdenes y Cotizaciones.
    queryClient.invalidateQueries({ queryKey: ['productos-catalogo'] });
    queryClient.invalidateQueries({ queryKey: ['productos-catalogo-ordenes'] });
  };

  const categorias = useMemo(() => ordenarCategorias([...CATEGORIAS.map((c) => c.valor).filter((c) => c !== 'otros'), ...productos.map((p) => p.categoria)]), [productos]);
  const q = busqueda.trim().toLowerCase();
  const visibles = productos.filter((p) => (verInactivos || p.activo) && (!q || p.nombre.toLowerCase().includes(q)));
  const grupos = ordenarCategorias(productos.map((p) => p.categoria))
    .map((cat) => ({ cat, items: visibles.filter((p) => p.categoria === cat) }))
    .filter((g) => g.items.length > 0);

  const guardar = useMutation({
    mutationFn: async (b: Borrador) => {
      const categoria = b.categoria === NUEVA ? claveCategoria(categoriaNueva) : b.categoria;
      if (!b.nombre.trim()) throw new Error('Escriba el nombre del producto');
      if (!categoria) throw new Error('Indique la categoría');
      const precio = leerPrecio(precioTexto);
      if (precio === null) throw new Error('Escriba el precio');
      const fila = { nombre: b.nombre.trim(), categoria, precio_full: precio, aplica_descuento: b.aplica_descuento, activo: b.activo };
      if (b.id) {
        const { error } = await supabase.from('productos_catalogo').update(fila).eq('id', b.id);
        if (error) throw error;
      } else {
        // Al final de su categoría.
        const orden = Math.max(0, ...productos.filter((p) => p.categoria === categoria).map((p) => p.orden_display)) + 1;
        const { error } = await supabase.from('productos_catalogo').insert({ ...fila, orden_display: orden });
        if (error) throw error;
      }
    },
    onSuccess: (_, b) => {
      refrescar();
      setEditando(null);
      toast.success(b.id ? 'Producto actualizado' : 'Producto agregado al catálogo');
    },
    onError: (e: any) => toast.error(e.message),
  });

  const actualizar = useMutation({
    mutationFn: async ({ id, cambios }: { id: string; cambios: Partial<ProductoCatalogo> }) => {
      const { error } = await supabase.from('productos_catalogo').update(cambios).eq('id', id);
      if (error) throw error;
    },
    onSuccess: refrescar,
    onError: (e: any) => toast.error(e.message),
  });

  const eliminar = useMutation({
    mutationFn: async (p: ProductoCatalogo) => {
      // Las órdenes que lo usaban se conservan; solo pierden el vínculo al catálogo (conservan la descripción).
      const { error } = await supabase.from('productos_catalogo').delete().eq('id', p.id);
      if (error) throw error;
    },
    onSuccess: (_, p) => {
      refrescar();
      toast.success(`"${p.nombre}" eliminado del catálogo`);
    },
    onError: (e: any) => toast.error(e.message),
  });

  const ajustarPrecios = useMutation({
    mutationFn: async (cambios: Array<{ id: string; precio: number }>) => {
      for (const c of cambios) {
        const { error } = await supabase.from('productos_catalogo').update({ precio_full: c.precio }).eq('id', c.id);
        if (error) throw error;
      }
      return cambios.length;
    },
    onSuccess: (n) => {
      refrescar();
      setAjusteCategoria(null);
      toast.success(`Precios actualizados (${n} producto${n !== 1 ? 's' : ''})`);
    },
    onError: (e: any) => toast.error(e.message),
  });

  /** Sube o baja un producto dentro de su categoría (intercambia el orden). */
  const mover = async (lista: ProductoCatalogo[], i: number, paso: -1 | 1) => {
    const a = lista[i];
    const b = lista[i + paso];
    if (!a || !b) return;
    // Si ambos tienen el mismo número de orden, se separan.
    const ordenA = b.orden_display === a.orden_display ? a.orden_display + paso : b.orden_display;
    await Promise.all([
      supabase.from('productos_catalogo').update({ orden_display: ordenA }).eq('id', a.id),
      supabase.from('productos_catalogo').update({ orden_display: a.orden_display }).eq('id', b.id),
    ]);
    refrescar();
  };

  const abrir = (b: Borrador) => {
    setCategoriaNueva('');
    setPrecioTexto(b.precio_full ? String(b.precio_full) : '');
    setEditando(b);
  };

  const guardarPrecioEnLinea = (p: ProductoCatalogo) => {
    if (!precioEnLinea) return;
    const precio = leerPrecio(precioEnLinea.texto);
    setPrecioEnLinea(null);
    if (precio === null || precio === Number(p.precio_full)) return;
    actualizar.mutate({ id: p.id, cambios: { precio_full: precio } }, {
      onSuccess: () => toast.success(`${p.nombre}: ${formatoCOP(precio)}`),
    });
  };

  return (
    <AppLayout>
      <PageHeader title="Catálogo y precios" description="Lentes que aparecen al crear órdenes y cotizaciones">
        {puedeEditar && (
          <Button onClick={() => abrir({ nombre: '', categoria: 'monofocal', precio_full: 0, aplica_descuento: true, activo: true })}>
            <Plus className="h-4 w-4 mr-1" />Producto
          </Button>
        )}
      </PageHeader>

      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="relative w-full sm:w-72">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input className="pl-9" placeholder="Buscar producto…" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} />
        </div>
        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <Switch checked={verInactivos} onCheckedChange={setVerInactivos} />Mostrar inactivos
        </label>
        <p className="text-xs text-muted-foreground sm:ml-auto">
          Las monturas y accesorios con stock se manejan en <span className="font-medium">Inventario</span>.
        </p>
      </div>

      {isLoading ? <p className="text-sm text-muted-foreground">Cargando…</p> : grupos.length === 0 ? (
        <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">No hay productos{q ? ' que coincidan' : ''}.</CardContent></Card>
      ) : (
        <div className="space-y-4">
          {grupos.map(({ cat, items }) => (
            <Card key={cat}>
              <CardHeader className="pb-2 flex-row items-center justify-between space-y-0">
                <CardTitle className="text-base flex items-center gap-2">
                  {etiquetaCategoria(cat)} <Badge variant="secondary">{items.length}</Badge>
                </CardTitle>
                {puedeEditar && (
                  <div className="flex gap-1">
                    <Button variant="ghost" size="sm" onClick={() => setAjusteCategoria(cat)}>
                      <Percent className="h-4 w-4 mr-1" />Ajustar precios
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => abrir({ nombre: '', categoria: cat, precio_full: 0, aplica_descuento: true, activo: true })}>
                      <Plus className="h-4 w-4 mr-1" />Agregar
                    </Button>
                  </div>
                )}
              </CardHeader>
              <CardContent className="p-0">
                <div className="divide-y">
                  <div className="hidden md:grid grid-cols-[1fr_150px_130px_90px_88px] gap-3 px-4 py-2 text-xs text-muted-foreground">
                    <span>Producto</span><span>Precio</span><span>Descuento convenio</span><span>Activo</span><span />
                  </div>
                  {items.map((p, i) => (
                    <div key={p.id} className={`grid grid-cols-[1fr_auto] md:grid-cols-[1fr_150px_130px_90px_88px] gap-3 items-center px-4 py-2 ${!p.activo ? 'opacity-50' : ''}`}>
                      <span className="text-sm font-medium">{p.nombre}</span>

                      {precioEnLinea?.id === p.id ? (
                        <Input
                          autoFocus inputMode="numeric" className="h-8"
                          value={precioEnLinea.texto}
                          onChange={(e) => setPrecioEnLinea({ id: p.id, texto: e.target.value })}
                          onBlur={() => guardarPrecioEnLinea(p)}
                          onKeyDown={(e) => { if (e.key === 'Enter') guardarPrecioEnLinea(p); if (e.key === 'Escape') setPrecioEnLinea(null); }}
                          aria-label={`Precio de ${p.nombre}`}
                        />
                      ) : (
                        <button
                          type="button" disabled={!puedeEditar}
                          onClick={() => setPrecioEnLinea({ id: p.id, texto: String(Number(p.precio_full)) })}
                          className="text-sm tabular-nums text-left rounded px-2 py-1 -mx-2 enabled:hover:bg-muted"
                          title={puedeEditar ? 'Clic para cambiar el precio' : undefined}
                        >
                          {formatoCOP(Number(p.precio_full))}
                        </button>
                      )}

                      <div className="hidden md:block">
                        <Switch checked={p.aplica_descuento} disabled={!puedeEditar} aria-label="Aplica descuento de convenio"
                          onCheckedChange={(v) => actualizar.mutate({ id: p.id, cambios: { aplica_descuento: v } })} />
                      </div>
                      <div className="hidden md:block">
                        <Switch checked={p.activo} disabled={!puedeEditar} aria-label="Activo"
                          onCheckedChange={(v) => actualizar.mutate({ id: p.id, cambios: { activo: v } })} />
                      </div>

                      {puedeEditar && (
                        <div className="hidden md:flex items-center justify-end gap-0.5">
                          <Button variant="ghost" size="icon" className="h-7 w-7" disabled={i === 0} onClick={() => mover(items, i, -1)} aria-label="Subir"><ArrowUp className="h-3.5 w-3.5" /></Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7" disabled={i === items.length - 1} onClick={() => mover(items, i, 1)} aria-label="Bajar"><ArrowDown className="h-3.5 w-3.5" /></Button>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-7 w-7" aria-label="Más acciones"><MoreVertical className="h-4 w-4" /></Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => abrir({ ...p })}><Pencil className="h-4 w-4 mr-2" />Editar</DropdownMenuItem>
                              <DropdownMenuItem onClick={() => abrir({ ...p, id: undefined, nombre: `${p.nombre} (copia)` })}><Copy className="h-4 w-4 mr-2" />Duplicar</DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem className="text-destructive" onClick={() => { if (confirm(`¿Eliminar "${p.nombre}" del catálogo definitivamente?\n\nLas órdenes que ya lo tienen se conservan con su descripción y precio.`)) eliminar.mutate(p); }}>
                                <Trash2 className="h-4 w-4 mr-2" />Eliminar
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Crear / editar */}
      <Dialog open={!!editando} onOpenChange={(o) => { if (!o) setEditando(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{editando?.id ? 'Editar producto' : 'Nuevo producto'}</DialogTitle></DialogHeader>
          {editando && (
            <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); guardar.mutate(editando); }}>
              <div className="space-y-1">
                <Label>Nombre *</Label>
                <Input autoFocus value={editando.nombre} onChange={(e) => setEditando({ ...editando, nombre: e.target.value })} placeholder="Ej: Lente Super HD Talla" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>Categoría *</Label>
                  <Select value={editando.categoria} onValueChange={(v) => setEditando({ ...editando, categoria: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {categorias.map((c) => <SelectItem key={c} value={c}>{etiquetaCategoria(c)}</SelectItem>)}
                      <SelectItem value={NUEVA}>+ Nueva categoría…</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>Precio *</Label>
                  <Input inputMode="numeric" value={precioTexto} onChange={(e) => setPrecioTexto(e.target.value)} placeholder="180000" />
                  {leerPrecio(precioTexto) !== null && <p className="text-[11px] text-muted-foreground">{formatoCOP(leerPrecio(precioTexto)!)}</p>}
                </div>
              </div>
              {editando.categoria === NUEVA && (
                <div className="space-y-1">
                  <Label>Nombre de la nueva categoría *</Label>
                  <Input value={categoriaNueva} onChange={(e) => setCategoriaNueva(e.target.value)} placeholder="Ej: Ocupacionales" />
                </div>
              )}
              <label className="flex items-center justify-between gap-3 text-sm">
                <span>Aplica descuento de convenio<span className="block text-xs text-muted-foreground">Se le resta el % de la empresa del paciente.</span></span>
                <Switch checked={editando.aplica_descuento} onCheckedChange={(v) => setEditando({ ...editando, aplica_descuento: v })} />
              </label>
              <label className="flex items-center justify-between gap-3 text-sm">
                <span>Activo<span className="block text-xs text-muted-foreground">Los inactivos no aparecen al crear órdenes ni cotizaciones.</span></span>
                <Switch checked={editando.activo} onCheckedChange={(v) => setEditando({ ...editando, activo: v })} />
              </label>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setEditando(null)}>Cancelar</Button>
                <Button type="submit" disabled={guardar.isPending}>{guardar.isPending ? 'Guardando…' : 'Guardar'}</Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>

      {/* Ajuste masivo de precios */}
      <AjustePreciosDialog
        categoria={ajusteCategoria}
        productos={productos.filter((p) => p.categoria === ajusteCategoria)}
        aplicando={ajustarPrecios.isPending}
        onCerrar={() => setAjusteCategoria(null)}
        onAplicar={(cambios) => ajustarPrecios.mutate(cambios)}
      />
    </AppLayout>
  );
}
