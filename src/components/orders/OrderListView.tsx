import { useState } from 'react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card } from '@/components/ui/card';
import { OrderDetailDialog } from './OrderDetailDialog';
import { ESTADOS_PRODUCTO } from '@/types';
import type { OrdenProducto } from '@/types';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Search, Filter, ArrowUpDown, Clock, AlertTriangle } from 'lucide-react';

const estadoColor: Record<string, string> = {
  pedido_creado: 'bg-muted text-muted-foreground',
  enviado_laboratorio: 'bg-primary/10 text-primary',
  recibido_laboratorio: 'bg-primary/15 text-primary',
  en_produccion: 'bg-warning/10 text-warning',
  producido: 'bg-info/10 text-info',
  en_transito: 'bg-accent/10 text-accent',
  recibido_optica: 'bg-secondary/10 text-secondary',
  control_calidad: 'bg-warning/10 text-warning',
  listo_entrega: 'bg-success/10 text-success',
  entregado: 'bg-success/15 text-success',
};

export function OrderListView() {
  const [selectedItem, setSelectedItem] = useState<OrdenProducto | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterEstado, setFilterEstado] = useState('all');
  const [filterTipo, setFilterTipo] = useState('all');
  const [sortField, setSortField] = useState<'fecha' | 'estado' | 'paciente' | 'utilidad'>('fecha');
  const [sortAsc, setSortAsc] = useState(false);
  const queryClient = useQueryClient();

  const { data: productos = [], isLoading } = useQuery({
    queryKey: ['orden-productos'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('orden_productos')
        .select('*, laboratorios(nombre, tiempo_promedio_entrega), ordenes(pacientes(nombres, apellidos))')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data.map((p: any) => ({
        id: p.id,
        orden_id: p.orden_id,
        paciente_nombre: `${p.ordenes?.pacientes?.nombres || ''} ${p.ordenes?.pacientes?.apellidos || ''}`.trim(),
        tipo_producto: p.tipo_producto,
        descripcion: p.descripcion,
        laboratorio_nombre: p.laboratorios?.nombre || 'N/A',
        estado_actual: p.estado_actual,
        fecha_creacion: p.created_at,
        dias_en_estado: Math.max(0, Math.floor((Date.now() - new Date(p.updated_at).getTime()) / 86400000)),
        tiempo_esperado_dias: p.laboratorios?.tiempo_promedio_entrega || 3,
        es_garantia: p.es_garantia || false,
        es_reproceso: p.es_reproceso || false,
        precio_venta: p.precio_venta || 0,
        costo_laboratorio: p.costo_laboratorio || 0,
        costo_montura: p.costo_montura || 0,
        costo_lente: p.costo_lente || 0,
        costo_insumos: p.costo_insumos || 0,
        comision_financiera: p.comision_financiera || 0,
        utilidad_calculada: p.utilidad_calculada || 0,
      }));
    },
  });

  // Filter + search
  const filtered = productos
    .filter((p: OrdenProducto) => {
      if (filterEstado !== 'all' && p.estado_actual !== filterEstado) return false;
      if (filterTipo !== 'all' && p.tipo_producto !== filterTipo) return false;
      if (searchTerm) {
        const term = searchTerm.toLowerCase();
        return p.paciente_nombre.toLowerCase().includes(term)
          || p.descripcion.toLowerCase().includes(term)
          || p.laboratorio_nombre.toLowerCase().includes(term);
      }
      return true;
    })
    .sort((a: OrdenProducto, b: OrdenProducto) => {
      const dir = sortAsc ? 1 : -1;
      switch (sortField) {
        case 'paciente': return a.paciente_nombre.localeCompare(b.paciente_nombre) * dir;
        case 'estado': return a.estado_actual.localeCompare(b.estado_actual) * dir;
        case 'utilidad': return (a.utilidad_calculada - b.utilidad_calculada) * dir;
        default: return (new Date(a.fecha_creacion).getTime() - new Date(b.fecha_creacion).getTime()) * dir;
      }
    });

  const toggleSort = (field: typeof sortField) => {
    if (sortField === field) setSortAsc(!sortAsc);
    else { setSortField(field); setSortAsc(false); }
  };

  const SortIcon = ({ field }: { field: typeof sortField }) => (
    <ArrowUpDown className={`h-3 w-3 ml-1 inline cursor-pointer ${sortField === field ? 'text-primary' : 'text-muted-foreground'}`} />
  );

  // Summary stats
  const totalProductos = productos.length;
  const enProduccion = productos.filter((p: OrdenProducto) => !['entregado', 'listo_entrega'].includes(p.estado_actual)).length;
  const demorados = productos.filter((p: OrdenProducto) => p.dias_en_estado > p.tiempo_esperado_dias && p.estado_actual !== 'entregado').length;
  const totalUtilidad = productos.reduce((s: number, p: OrdenProducto) => s + p.utilidad_calculada, 0);

  if (isLoading) {
    return <div className="text-center py-12 text-muted-foreground">Cargando órdenes...</div>;
  }

  return (
    <>
      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
        <Card className="p-3">
          <p className="text-xs text-muted-foreground">Total Productos</p>
          <p className="text-xl font-bold">{totalProductos}</p>
        </Card>
        <Card className="p-3">
          <p className="text-xs text-muted-foreground flex items-center gap-1"><Clock className="h-3 w-3" />En Proceso</p>
          <p className="text-xl font-bold text-primary">{enProduccion}</p>
        </Card>
        <Card className="p-3">
          <p className="text-xs text-muted-foreground flex items-center gap-1"><AlertTriangle className="h-3 w-3" />Demorados</p>
          <p className="text-xl font-bold text-destructive">{demorados}</p>
        </Card>
        <Card className="p-3">
          <p className="text-xs text-muted-foreground">Utilidad Total</p>
          <p className={`text-xl font-bold ${totalUtilidad >= 0 ? 'text-success' : 'text-destructive'}`}>${totalUtilidad.toLocaleString('es-CO')}</p>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-4">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar paciente, producto, laboratorio..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={filterEstado} onValueChange={setFilterEstado}>
          <SelectTrigger className="w-[180px]">
            <Filter className="h-3.5 w-3.5 mr-1" />
            <SelectValue placeholder="Estado" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos los estados</SelectItem>
            {ESTADOS_PRODUCTO.map(e => <SelectItem key={e.key} value={e.key}>{e.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filterTipo} onValueChange={setFilterTipo}>
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder="Tipo" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="lente">Lente</SelectItem>
            <SelectItem value="montura">Montura</SelectItem>
            <SelectItem value="insumo">Insumo</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="cursor-pointer" onClick={() => toggleSort('fecha')}>Fecha <SortIcon field="fecha" /></TableHead>
              <TableHead className="cursor-pointer" onClick={() => toggleSort('paciente')}>Paciente <SortIcon field="paciente" /></TableHead>
              <TableHead>Producto</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead>Laboratorio</TableHead>
              <TableHead className="cursor-pointer" onClick={() => toggleSort('estado')}>Estado <SortIcon field="estado" /></TableHead>
              <TableHead>Días</TableHead>
              <TableHead className="cursor-pointer text-right" onClick={() => toggleSort('utilidad')}>Utilidad <SortIcon field="utilidad" /></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">No se encontraron órdenes</TableCell></TableRow>
            ) : filtered.map((p: OrdenProducto) => {
              const estadoLabel = ESTADOS_PRODUCTO.find(e => e.key === p.estado_actual)?.label || p.estado_actual;
              const isDelayed = p.dias_en_estado > p.tiempo_esperado_dias && p.estado_actual !== 'entregado';
              return (
                <TableRow key={p.id} className="cursor-pointer hover:bg-muted/50" onClick={() => setSelectedItem(p)}>
                  <TableCell className="text-sm">{new Date(p.fecha_creacion).toLocaleDateString('es-CO')}</TableCell>
                  <TableCell className="font-medium">{p.paciente_nombre}</TableCell>
                  <TableCell className="text-sm max-w-[200px] truncate">{p.descripcion}</TableCell>
                  <TableCell><Badge variant="outline" className="text-[10px]">{p.tipo_producto}</Badge></TableCell>
                  <TableCell className="text-sm">{p.laboratorio_nombre}</TableCell>
                  <TableCell>
                    <Badge className={`text-[10px] ${estadoColor[p.estado_actual] || ''}`}>
                      {estadoLabel}
                    </Badge>
                    {p.es_garantia && <Badge variant="destructive" className="text-[9px] ml-1">Garantía</Badge>}
                  </TableCell>
                  <TableCell>
                    <span className={`text-sm font-medium ${isDelayed ? 'text-destructive' : ''}`}>
                      {p.dias_en_estado}d
                    </span>
                    {isDelayed && <AlertTriangle className="h-3 w-3 text-destructive inline ml-1" />}
                  </TableCell>
                  <TableCell className={`text-right font-medium text-sm ${p.utilidad_calculada >= 0 ? 'text-success' : 'text-destructive'}`}>
                    ${p.utilidad_calculada.toLocaleString('es-CO')}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Card>

      <OrderDetailDialog item={selectedItem} open={!!selectedItem} onOpenChange={(open) => { if (!open) setSelectedItem(null); }} />
    </>
  );
}
