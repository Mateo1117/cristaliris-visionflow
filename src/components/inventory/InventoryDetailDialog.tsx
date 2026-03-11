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
import { Minus, Plus, Printer, Package, ArrowDownCircle, ArrowUpCircle, RefreshCw } from 'lucide-react';
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
            <TabsTrigger value="stock" className="flex-1">Ajustar Stock</TabsTrigger>
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
