import { AppLayout } from '@/components/layout/AppLayout';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Plus, Search, AlertTriangle, QrCode, Download } from 'lucide-react';
import { exportToCSV } from '@/lib/export-csv';
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { InventoryDetailDialog } from '@/components/inventory/InventoryDetailDialog';

export default function Inventory() {
  const [showForm, setShowForm] = useState(false);
  const [search, setSearch] = useState('');
  const [tipoFilter, setTipoFilter] = useState('todos');
  const [selectedItem, setSelectedItem] = useState<any>(null);
  const queryClient = useQueryClient();

  const { data: items = [], isLoading } = useQuery({
    queryKey: ['inventario'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('inventario')
        .select('*, sedes(nombre)')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const { data: sedes = [] } = useQuery({
    queryKey: ['sedes'],
    queryFn: async () => {
      const { data, error } = await supabase.from('sedes').select('id, nombre').eq('estado_activa', true);
      if (error) throw error;
      return data;
    },
  });

  const createItem = useMutation({
    mutationFn: async (formData: Record<string, any>) => {
      const { error } = await supabase.from('inventario').insert({
        tipo: formData.tipo,
        codigo_referencia: formData.codigo_referencia || null,
        marca: formData.marca || null,
        modelo: formData.modelo || null,
        descripcion: formData.descripcion || null,
        cantidad_disponible: parseInt(formData.cantidad_disponible) || 0,
        stock_minimo: parseInt(formData.stock_minimo) || 5,
        costo_unitario: parseFloat(formData.costo_unitario) || 0,
        precio_venta: parseFloat(formData.precio_venta) || 0,
        sede_id: formData.sede_id || null,
        ubicacion_estante: formData.ubicacion_estante || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inventario'] });
      setShowForm(false);
      toast.success('Ítem agregado al inventario');
    },
    onError: (e: any) => toast.error(e.message),
  });

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const data: Record<string, any> = {};
    fd.forEach((v, k) => { data[k] = v; });
    createItem.mutate(data);
  };

  const filtered = items.filter((item: any) => {
    const matchSearch = !search || [item.descripcion, item.marca, item.modelo, item.codigo_referencia]
      .some(f => f?.toLowerCase().includes(search.toLowerCase()));
    const matchTipo = tipoFilter === 'todos' || item.tipo === tipoFilter;
    return matchSearch && matchTipo;
  });

  return (
    <AppLayout>
      <PageHeader title="Inventario" description="Gestión de monturas, lentes e insumos por sede">
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => exportToCSV(filtered, 'inventario', [
            { key: 'codigo_referencia', label: 'Código' },
            { key: 'descripcion', label: 'Descripción' },
            { key: 'tipo', label: 'Tipo' },
            { key: 'marca', label: 'Marca' },
            { key: 'modelo', label: 'Modelo' },
            { key: 'cantidad_disponible', label: 'Stock' },
            { key: 'costo_unitario', label: 'Costo' },
            { key: 'precio_venta', label: 'Precio Venta' },
          ])}><Download className="h-4 w-4 mr-1" />Exportar</Button>
          <Button onClick={() => setShowForm(true)}><Plus className="h-4 w-4 mr-1" />Nuevo Ítem</Button>
        </div>
      </PageHeader>

      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Buscar por marca, modelo, código..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>
        <Select value={tipoFilter} onValueChange={setTipoFilter}>
          <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos</SelectItem>
            <SelectItem value="montura">Monturas</SelectItem>
            <SelectItem value="lente">Lentes</SelectItem>
            <SelectItem value="insumo">Insumos</SelectItem>
            <SelectItem value="accesorio">Accesorios</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Código</TableHead>
              <TableHead>Descripción</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead className="hidden md:table-cell">Marca</TableHead>
              <TableHead>Stock</TableHead>
              <TableHead className="hidden md:table-cell">Precio Venta</TableHead>
              <TableHead className="hidden lg:table-cell">Sede</TableHead>
              <TableHead className="w-10"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">Cargando...</TableCell></TableRow>
            ) : filtered.length === 0 ? (
              <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">No hay ítems{search ? ' que coincidan' : ''}</TableCell></TableRow>
            ) : filtered.map((item: any) => {
              const lowStock = item.cantidad_disponible <= item.stock_minimo;
              return (
                <TableRow key={item.id} className="cursor-pointer hover:bg-muted/50" onClick={() => setSelectedItem(item)}>
                  <TableCell className="text-sm font-mono">{item.codigo_referencia || '—'}</TableCell>
                  <TableCell className="font-medium">{item.descripcion || `${item.marca || ''} ${item.modelo || ''}`}</TableCell>
                  <TableCell><Badge variant="outline" className="text-[10px]">{item.tipo}</Badge></TableCell>
                  <TableCell className="hidden md:table-cell text-sm">{item.marca || '—'}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      {lowStock && <AlertTriangle className="h-3.5 w-3.5 text-warning" />}
                      <span className={lowStock ? 'text-warning font-medium' : ''}>{item.cantidad_disponible}</span>
                    </div>
                  </TableCell>
                  <TableCell className="hidden md:table-cell text-sm">${item.precio_venta?.toLocaleString('es-CO') || '0'}</TableCell>
                  <TableCell className="hidden lg:table-cell text-sm">{(item as any).sedes?.nombre || '—'}</TableCell>
                  <TableCell>
                    <Button size="icon" variant="ghost" className="h-7 w-7" onClick={(e) => { e.stopPropagation(); setSelectedItem(item); }}>
                      <QrCode className="h-3.5 w-3.5" />
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Card>

      {/* Create Item Dialog */}
      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Nuevo Ítem de Inventario</DialogTitle></DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Tipo *</Label>
                <Select name="tipo" required defaultValue="montura">
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="montura">Montura</SelectItem>
                    <SelectItem value="lente">Lente</SelectItem>
                    <SelectItem value="insumo">Insumo</SelectItem>
                    <SelectItem value="accesorio">Accesorio</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Código Referencia</Label>
                <Input name="codigo_referencia" placeholder="REF-001" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2"><Label>Marca</Label><Input name="marca" placeholder="Ray-Ban" /></div>
              <div className="space-y-2"><Label>Modelo</Label><Input name="modelo" placeholder="RB5228" /></div>
            </div>
            <div className="space-y-2"><Label>Descripción</Label><Input name="descripcion" placeholder="Descripción del producto" /></div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-2"><Label>Cantidad</Label><Input name="cantidad_disponible" type="number" defaultValue="0" /></div>
              <div className="space-y-2"><Label>Stock Mín.</Label><Input name="stock_minimo" type="number" defaultValue="5" /></div>
              <div className="space-y-2">
                <Label>Sede</Label>
                <Select name="sede_id">
                  <SelectTrigger><SelectValue placeholder="Sede" /></SelectTrigger>
                  <SelectContent>
                    {sedes.map((s: any) => <SelectItem key={s.id} value={s.id}>{s.nombre}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2"><Label>Costo Unitario</Label><Input name="costo_unitario" type="number" step="100" defaultValue="0" /></div>
              <div className="space-y-2"><Label>Precio Venta</Label><Input name="precio_venta" type="number" step="100" defaultValue="0" /></div>
            </div>
            <div className="space-y-2"><Label>Ubicación / Estante</Label><Input name="ubicacion_estante" placeholder="Vitrina A-3" /></div>
            <div className="flex justify-end gap-2 pt-4 border-t">
              <Button type="button" variant="outline" onClick={() => setShowForm(false)}>Cancelar</Button>
              <Button type="submit" disabled={createItem.isPending}>{createItem.isPending ? 'Guardando...' : 'Guardar'}</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Inventory Detail with QR/Barcode */}
      {selectedItem && (
        <InventoryDetailDialog
          item={selectedItem}
          open={!!selectedItem}
          onOpenChange={(o) => { if (!o) setSelectedItem(null); }}
        />
      )}
    </AppLayout>
  );
}
