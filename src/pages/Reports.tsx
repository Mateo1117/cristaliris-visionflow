import { AppLayout } from '@/components/layout/AppLayout';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { DeudaEmpresasCard } from '@/components/reports/DeudaEmpresasCard';
import { Building2, Package, TrendingUp } from 'lucide-react';

const COLORS = ['hsl(210,80%,45%)', 'hsl(170,55%,42%)', 'hsl(260,60%,55%)', 'hsl(38,92%,50%)', 'hsl(0,72%,51%)', 'hsl(150,60%,40%)'];

const fmt = (n: number) => `$${(n || 0).toLocaleString('es-CO')}`;

export default function Reports() {
  const { data: ordenes = [] } = useQuery({
    queryKey: ['reportes-ordenes'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('ordenes')
        .select('total_final, saldo_pendiente, estado_pago, modalidad_pago, created_at, empresa_id, empresas(razon_social, porcentaje_descuento)');
      if (error) throw error;
      return data;
    },
  });

  const { data: productos = [] } = useQuery({
    queryKey: ['reportes-productos'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('orden_productos')
        .select('estado_actual, tipo_producto, es_garantia, laboratorio_id, precio_venta, costo_laboratorio, utilidad_calculada, producto_catalogo_id, descripcion, laboratorios(nombre), productos_catalogo(nombre, categoria)');
      if (error) throw error;
      return data;
    },
  });

  const { data: pacientesCount = 0 } = useQuery({
    queryKey: ['reportes-pacientes-count'],
    queryFn: async () => {
      const { count, error } = await supabase.from('pacientes').select('*', { count: 'exact', head: true });
      if (error) throw error;
      return count || 0;
    },
  });

  // KPIs
  const totalVentas = ordenes.reduce((s, o: any) => s + (o.total_final || 0), 0);
  const totalPendiente = ordenes.reduce((s, o: any) => s + (o.saldo_pendiente || 0), 0);
  const garantiasCount = productos.filter((p: any) => p.es_garantia).length;

  // Productos por estado
  const estadoMap = new Map<string, number>();
  productos.forEach((p: any) => { estadoMap.set(p.estado_actual, (estadoMap.get(p.estado_actual) || 0) + 1); });
  const estadoData = Array.from(estadoMap.entries()).map(([name, value]) => ({ name: name.replace(/_/g, ' '), value }));

  // Productos por laboratorio
  const labMap = new Map<string, number>();
  productos.forEach((p: any) => { const n = p.laboratorios?.nombre || 'Sin lab'; labMap.set(n, (labMap.get(n) || 0) + 1); });
  const labData = Array.from(labMap.entries()).map(([name, value]) => ({ name, value }));

  // Empresas con más ventas
  const empresaMap = new Map<string, { nombre: string; total: number; pedidos: number; descuento: number }>();
  ordenes.forEach((o: any) => {
    if (!o.empresa_id || !o.empresas) return;
    const key = o.empresa_id;
    const cur = empresaMap.get(key) || { nombre: o.empresas.razon_social, total: 0, pedidos: 0, descuento: o.empresas.porcentaje_descuento || 0 };
    cur.total += o.total_final || 0;
    cur.pedidos += 1;
    empresaMap.set(key, cur);
  });
  const topEmpresas = Array.from(empresaMap.values()).sort((a, b) => b.total - a.total).slice(0, 10);

  // Producto más vendido (del catálogo, o descripción libre)
  const prodMap = new Map<string, { nombre: string; categoria: string; cantidad: number; ingreso: number; utilidad: number; costo: number }>();
  productos.forEach((p: any) => {
    const nombre = p.productos_catalogo?.nombre || p.descripcion || 'Sin nombre';
    const categoria = p.productos_catalogo?.categoria || p.tipo_producto || 'otros';
    const cur = prodMap.get(nombre) || { nombre, categoria, cantidad: 0, ingreso: 0, utilidad: 0, costo: 0 };
    cur.cantidad += 1;
    cur.ingreso += p.precio_venta || 0;
    cur.utilidad += p.utilidad_calculada || 0;
    cur.costo += p.costo_laboratorio || 0;
    prodMap.set(nombre, cur);
  });
  const topProductos = Array.from(prodMap.values()).sort((a, b) => b.cantidad - a.cantidad).slice(0, 10);

  // Utilidad por lente (solo tipo lente, ordenado por utilidad unitaria desc)
  const lentes = topProductos
    .filter(p => ['monofocal', 'bifocal', 'progresivo', 'lente_contacto', 'lente'].includes(p.categoria))
    .map(p => ({
      ...p,
      utilidad_unitaria: p.cantidad > 0 ? p.utilidad / p.cantidad : 0,
      margen: p.ingreso > 0 ? (p.utilidad / p.ingreso) * 100 : 0,
    }))
    .sort((a, b) => b.utilidad - a.utilidad);

  const categoriaLabel: Record<string, string> = {
    monofocal: 'Monofocal', bifocal: 'Bifocal', progresivo: 'Progresivo',
    lente_contacto: 'L. contacto', lente: 'Lente', otros: 'Otros',
  };

  return (
    <AppLayout>
      <PageHeader title="Reportes" description="Reportes operativos y gerenciales" />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {[
          { label: 'Total Ventas', value: fmt(totalVentas) },
          { label: 'Cartera Pendiente', value: fmt(totalPendiente) },
          { label: 'Pacientes', value: pacientesCount },
          { label: 'Garantías', value: garantiasCount },
        ].map(k => (
          <Card key={k.label}><CardContent className="p-4">
            <p className="text-xs text-muted-foreground uppercase tracking-wide">{k.label}</p>
            <p className="text-2xl font-bold mt-1">{k.value}</p>
          </CardContent></Card>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Productos por Estado</CardTitle></CardHeader>
          <CardContent>
            {estadoData.length > 0 ? (
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={estadoData}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="name" tick={{ fill: 'hsl(220,10%,46%)', fontSize: 10 }} angle={-30} textAnchor="end" height={60} />
                  <YAxis tick={{ fill: 'hsl(220,10%,46%)' }} />
                  <Tooltip />
                  <Bar dataKey="value" fill="hsl(210,80%,45%)" radius={[4, 4, 0, 0]} name="Cantidad" />
                </BarChart>
              </ResponsiveContainer>
            ) : <p className="text-center py-12 text-muted-foreground">Sin datos de productos</p>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Productos por Laboratorio</CardTitle></CardHeader>
          <CardContent>
            {labData.length > 0 ? (
              <ResponsiveContainer width="100%" height={280}>
                <PieChart>
                  <Pie data={labData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={100} label={({ name, value }) => `${name}: ${value}`} labelLine={false}>
                    {labData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            ) : <p className="text-center py-12 text-muted-foreground">Sin datos de laboratorios</p>}
          </CardContent>
        </Card>
      </div>

      {/* Empresas con más ventas */}
      <Card className="mb-4">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Building2 className="h-4 w-4 text-primary" />Empresas con Más Ventas (Convenio)
          </CardTitle>
        </CardHeader>
        <CardContent>
          {topEmpresas.length === 0 ? (
            <p className="text-center py-8 text-muted-foreground text-sm">Sin órdenes vinculadas a empresas</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">#</TableHead>
                  <TableHead>Empresa</TableHead>
                  <TableHead className="text-center">Convenio</TableHead>
                  <TableHead className="text-right">Pedidos</TableHead>
                  <TableHead className="text-right">Total Vendido</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {topEmpresas.map((e, i) => (
                  <TableRow key={e.nombre}>
                    <TableCell className="font-bold text-muted-foreground">{i + 1}</TableCell>
                    <TableCell className="font-medium">{e.nombre}</TableCell>
                    <TableCell className="text-center"><Badge variant="secondary">{e.descuento}%</Badge></TableCell>
                    <TableCell className="text-right">{e.pedidos}</TableCell>
                    <TableCell className="text-right font-semibold">{fmt(e.total)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
        {/* Producto más vendido */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Package className="h-4 w-4 text-primary" />Producto / Lente Más Vendido
            </CardTitle>
          </CardHeader>
          <CardContent>
            {topProductos.length === 0 ? (
              <p className="text-center py-8 text-muted-foreground text-sm">Sin productos vendidos</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Producto</TableHead>
                    <TableHead>Categoría</TableHead>
                    <TableHead className="text-right">Cant.</TableHead>
                    <TableHead className="text-right">Ingreso</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {topProductos.map((p) => (
                    <TableRow key={p.nombre}>
                      <TableCell className="font-medium text-sm">{p.nombre}</TableCell>
                      <TableCell><Badge variant="outline" className="text-[10px]">{categoriaLabel[p.categoria] || p.categoria}</Badge></TableCell>
                      <TableCell className="text-right">{p.cantidad}</TableCell>
                      <TableCell className="text-right">{fmt(p.ingreso)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* Utilidad por lente */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-success" />Utilidad por Lente
            </CardTitle>
          </CardHeader>
          <CardContent>
            {lentes.length === 0 ? (
              <p className="text-center py-8 text-muted-foreground text-sm">Sin lentes con utilidad registrada</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Lente</TableHead>
                    <TableHead className="text-right">Utilidad Total</TableHead>
                    <TableHead className="text-right">Unit.</TableHead>
                    <TableHead className="text-right">Margen</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lentes.map((l) => (
                    <TableRow key={l.nombre}>
                      <TableCell className="font-medium text-sm">{l.nombre}</TableCell>
                      <TableCell className={`text-right font-semibold ${l.utilidad >= 0 ? 'text-success' : 'text-destructive'}`}>{fmt(l.utilidad)}</TableCell>
                      <TableCell className="text-right text-sm">{fmt(l.utilidad_unitaria)}</TableCell>
                      <TableCell className="text-right text-xs text-muted-foreground">{l.margen.toFixed(1)}%</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      <DeudaEmpresasCard />
    </AppLayout>
  );
}
