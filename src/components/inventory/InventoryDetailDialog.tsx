import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Separator } from '@/components/ui/separator';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { QRCodeSVG } from 'qrcode.react';
import Barcode from 'react-barcode';
import { Minus, Plus, Printer, Package, ArrowDownCircle, ArrowUpCircle, RefreshCw, Link2, Search } from 'lucide-react';
import { useState, useRef } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface InventoryDetailDialogProps {
  item: any;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function InventoryDetailDialog({ item, open, onOpenChange }: InventoryDetailDialogProps) {
  const [adjustQty, setAdjustQty] = useState(1);
  const [ordenSearch, setOrdenSearch] = useState('');
  const [assignQty, setAssignQty] = useState(1);
  const queryClient = useQueryClient();
  const printRef = useRef<HTMLDivElement>(null);

  const { data: movimientos = [] } = useQuery({
    queryKey: ['movimientos-inventario', item.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('movimientos_inventario')
        .select('*, orden_productos(descripcion)')
        .eq('inventario_id', item.id)
        .order('created_at', { ascending: false })
        .limit(20);
      if (error) throw error;
      return data;
    },
    enabled: open,
  });

  const { data: ordenes = [] } = useQuery({
    queryKey: ['ordenes-asignar', ordenSearch],
    queryFn: async () => {
      if (!ordenSearch || ordenSearch.length < 2) return [];
      const { data, error } = await supabase
        .from('ordenes')
        .select('id, created_at, pacientes(nombres, apellidos, numero_documento), orden_productos(id, descripcion, tipo_producto, estado_actual)')
        .or(`id.ilike.%${ordenSearch}%`)
        .order('created_at', { ascending: false })
        .limit(10);
      if (error) {
        // If UUID search fails, try by patient name
        const { data: byPatient, error: err2 } = await supabase
          .from('ordenes')
          .select('id, created_at, pacientes!inner(nombres, apellidos, numero_documento), orden_productos(id, descripcion, tipo_producto, estado_actual)')
          .or(`nombres.ilike.%${ordenSearch}%,apellidos.ilike.%${ordenSearch}%,numero_documento.ilike.%${ordenSearch}%`, { referencedTable: 'pacientes' })
          .order('created_at', { ascending: false })
          .limit(10);
        if (err2) throw err2;
        return byPatient;
      }
      return data;
    },
    enabled: open && ordenSearch.length >= 2,
  });

  const adjustStock = useMutation({
    mutationFn: async ({ delta }: { delta: number }) => {
      const newQty = item.cantidad_disponible + delta;
      if (newQty < 0) throw new Error('No puede quedar en negativo');
      const { error } = await supabase.from('inventario')
        .update({ cantidad_disponible: newQty })
        .eq('id', item.id);
      if (error) throw error;

      const { data: { user } } = await supabase.auth.getUser();
      await supabase.from('movimientos_inventario').insert({
        inventario_id: item.id,
        tipo_movimiento: delta > 0 ? 'entrada' : 'salida',
        cantidad: Math.abs(delta),
        cantidad_anterior: item.cantidad_disponible,
        cantidad_nueva: newQty,
        motivo: 'Ajuste manual desde detalle',
        usuario_id: user?.id || null,
      });
    },
    onSuccess: (_, { delta }) => {
      queryClient.invalidateQueries({ queryKey: ['inventario'] });
      queryClient.invalidateQueries({ queryKey: ['movimientos-inventario', item.id] });
      toast.success(`Stock ${delta > 0 ? 'aumentado' : 'disminuido'} correctamente`);
    },
    onError: (e: any) => toast.error(e.message),
  });

  const assignToOrder = useMutation({
    mutationFn: async ({ ordenProductoId, qty }: { ordenProductoId: string; qty: number }) => {
      const newQty = item.cantidad_disponible - qty;
      if (newQty < 0) throw new Error('Stock insuficiente');

      const { error } = await supabase.from('inventario')
        .update({ cantidad_disponible: newQty })
        .eq('id', item.id);
      if (error) throw error;

      // Update the orden_producto to link the montura if applicable
      if (item.tipo === 'montura') {
        await supabase.from('orden_productos')
          .update({ montura_id: item.id })
          .eq('id', ordenProductoId);
      }

      const { data: { user } } = await supabase.auth.getUser();
      await supabase.from('movimientos_inventario').insert({
        inventario_id: item.id,
        tipo_movimiento: 'salida',
        cantidad: qty,
        cantidad_anterior: item.cantidad_disponible,
        cantidad_nueva: newQty,
        motivo: 'Asignado a orden',
        orden_producto_id: ordenProductoId,
        usuario_id: user?.id || null,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inventario'] });
      queryClient.invalidateQueries({ queryKey: ['movimientos-inventario', item.id] });
      toast.success('Ítem asignado a la orden exitosamente');
      setOrdenSearch('');
    },
    onError: (e: any) => toast.error(e.message),
  });

  const codeValue = item.codigo_referencia || item.id.slice(0, 12);
  const qrData = JSON.stringify({ inv_id: item.id, ref: codeValue, tipo: item.tipo });

  const handlePrint = () => {
    const content = printRef.current;
    if (!content) return;
    const win = window.open('', '_blank', 'width=400,height=600');
    if (!win) return;
    win.document.write(`
      <html><head><title>Etiqueta - ${codeValue}</title>
      <style>body{font-family:sans-serif;text-align:center;padding:20px}
      .label{border:1px solid #ccc;padding:16px;display:inline-block;border-radius:8px}
      .ref{font-size:18px;font-weight:bold;margin:8px 0}
      .desc{font-size:12px;color:#666;margin-bottom:12px}
      @media print{body{padding:0}.label{border:none}}</style></head>
      <body><div class="label">${content.innerHTML}</div>
      <script>setTimeout(()=>{window.print();window.close()},500)<\/script></body></html>
    `);
    win.document.close();
  };

  const movIcon: Record<string, any> = {
    entrada: <ArrowUpCircle className="h-3.5 w-3.5 text-success" />,
    salida: <ArrowDownCircle className="h-3.5 w-3.5 text-destructive" />,
    ajuste: <RefreshCw className="h-3.5 w-3.5 text-warning" />,
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Package className="h-5 w-5 text-primary" />
            {item.descripcion || `${item.marca || ''} ${item.modelo || ''}`}
          </DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-3 text-sm">
          <div><span className="text-muted-foreground">Código:</span> <span className="font-mono font-medium">{codeValue}</span></div>
          <div><span className="text-muted-foreground">Tipo:</span> <Badge variant="outline">{item.tipo}</Badge></div>
          <div><span className="text-muted-foreground">Marca:</span> {item.marca || '—'}</div>
          <div><span className="text-muted-foreground">Modelo:</span> {item.modelo || '—'}</div>
          <div><span className="text-muted-foreground">Precio:</span> ${item.precio_venta?.toLocaleString('es-CO')}</div>
          <div><span className="text-muted-foreground">Costo:</span> ${item.costo_unitario?.toLocaleString('es-CO')}</div>
          <div><span className="text-muted-foreground">Stock:</span> <span className={`font-bold ${item.cantidad_disponible <= item.stock_minimo ? 'text-warning' : ''}`}>{item.cantidad_disponible}</span> (mín: {item.stock_minimo})</div>
          <div><span className="text-muted-foreground">Sede:</span> {item.sedes?.nombre || '—'}</div>
        </div>

        <Separator />

        <Tabs defaultValue="codigos">
          <TabsList className="w-full">
            <TabsTrigger value="codigos" className="flex-1">Códigos</TabsTrigger>
            <TabsTrigger value="asignar" className="flex-1">Asignar a Orden</TabsTrigger>
            <TabsTrigger value="stock" className="flex-1">Stock</TabsTrigger>
            <TabsTrigger value="historial" className="flex-1">Historial</TabsTrigger>
          </TabsList>

          <TabsContent value="codigos" className="space-y-4">
            <div ref={printRef} className="flex flex-col items-center gap-4 py-4">
              <div className="text-center">
                <p className="text-xs text-muted-foreground mb-2">Código QR</p>
                <QRCodeSVG value={qrData} size={160} level="M" includeMargin />
              </div>
              <div className="text-center">
                <p className="text-xs text-muted-foreground mb-2">Código de Barras</p>
                <Barcode value={codeValue.replace(/[^a-zA-Z0-9\-\.]/g, '').slice(0, 20) || 'NOREF'} width={2} height={60} fontSize={12} margin={4} />
              </div>
              <p className="font-mono text-sm font-bold">{codeValue}</p>
              <p className="text-xs text-muted-foreground">{item.descripcion || `${item.marca || ''} ${item.modelo || ''}`}</p>
            </div>
            <Button onClick={handlePrint} className="w-full" variant="outline">
              <Printer className="h-4 w-4 mr-1" />Imprimir Etiqueta
            </Button>
          </TabsContent>

          <TabsContent value="asignar" className="space-y-4 py-4">
            <div className="space-y-2">
              <Label className="text-sm">Buscar orden por paciente o ID</Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Nombre, documento o ID de orden..."
                  value={ordenSearch}
                  onChange={(e) => setOrdenSearch(e.target.value)}
                  className="pl-9"
                />
              </div>
            </div>

            <div className="flex items-center gap-3">
              <Label className="text-sm whitespace-nowrap">Cantidad a asignar:</Label>
              <Input
                type="number"
                min="1"
                max={item.cantidad_disponible}
                value={assignQty}
                onChange={(e) => setAssignQty(Math.max(1, parseInt(e.target.value) || 1))}
                className="w-20 text-center"
              />
              <span className="text-xs text-muted-foreground">de {item.cantidad_disponible} disponibles</span>
            </div>

            {ordenSearch.length >= 2 && ordenes.length === 0 && (
              <p className="text-center text-sm text-muted-foreground py-4">No se encontraron órdenes</p>
            )}

            {ordenes.length > 0 && (
              <div className="space-y-2 max-h-[300px] overflow-y-auto">
                {ordenes.map((orden: any) => {
                  const paciente = orden.pacientes;
                  const productos = orden.orden_productos || [];
                  return (
                    <div key={orden.id} className="border rounded-lg p-3 space-y-2">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-medium">
                            {paciente?.nombres} {paciente?.apellidos}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            Doc: {paciente?.numero_documento} · Orden: {orden.id.slice(0, 8)}… · {new Date(orden.created_at).toLocaleDateString('es-CO')}
                          </p>
                        </div>
                      </div>
                      {productos.length > 0 && (
                        <div className="space-y-1">
                          {productos.map((p: any) => (
                            <div key={p.id} className="flex items-center justify-between bg-muted/50 rounded px-2 py-1.5">
                              <div className="flex-1">
                                <p className="text-xs font-medium">{p.descripcion}</p>
                                <div className="flex items-center gap-2">
                                  <Badge variant="outline" className="text-[10px]">{p.tipo_producto}</Badge>
                                  <Badge variant="secondary" className="text-[10px]">{p.estado_actual?.replace(/_/g, ' ')}</Badge>
                                </div>
                              </div>
                              <Button
                                size="sm"
                                variant="outline"
                                className="ml-2 gap-1"
                                disabled={assignToOrder.isPending || item.cantidad_disponible < assignQty}
                                onClick={() => assignToOrder.mutate({ ordenProductoId: p.id, qty: assignQty })}
                              >
                                <Link2 className="h-3.5 w-3.5" />Asignar
                              </Button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </TabsContent>

          <TabsContent value="stock" className="space-y-4 py-4">
            <div className="text-center">
              <p className="text-4xl font-bold">{item.cantidad_disponible}</p>
              <p className="text-sm text-muted-foreground">unidades en stock</p>
            </div>
            <div className="flex items-center justify-center gap-4">
              <Label className="text-sm">Cantidad:</Label>
              <Input type="number" min="1" value={adjustQty} onChange={(e) => setAdjustQty(Math.max(1, parseInt(e.target.value) || 1))} className="w-20 text-center" />
            </div>
            <div className="flex gap-3">
              <Button variant="destructive" className="flex-1" onClick={() => adjustStock.mutate({ delta: -adjustQty })} disabled={adjustStock.isPending}>
                <Minus className="h-4 w-4 mr-1" />Descontar
              </Button>
              <Button className="flex-1" onClick={() => adjustStock.mutate({ delta: adjustQty })} disabled={adjustStock.isPending}>
                <Plus className="h-4 w-4 mr-1" />Agregar
              </Button>
            </div>
          </TabsContent>

          <TabsContent value="historial">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Cant.</TableHead>
                  <TableHead>Stock</TableHead>
                  <TableHead>Motivo</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {movimientos.length === 0 ? (
                  <TableRow><TableCell colSpan={5} className="text-center py-6 text-muted-foreground text-sm">Sin movimientos registrados</TableCell></TableRow>
                ) : movimientos.map((m: any) => (
                  <TableRow key={m.id}>
                    <TableCell className="text-xs">{new Date(m.created_at).toLocaleDateString('es-CO')}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        {movIcon[m.tipo_movimiento] || null}
                        <span className="text-xs capitalize">{m.tipo_movimiento}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-sm font-medium">{m.tipo_movimiento === 'salida' ? `-${m.cantidad}` : `+${m.cantidad}`}</TableCell>
                    <TableCell className="text-xs">{m.cantidad_anterior} → {m.cantidad_nueva}</TableCell>
                    <TableCell className="text-xs text-muted-foreground truncate max-w-[120px]">{m.motivo || '—'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
