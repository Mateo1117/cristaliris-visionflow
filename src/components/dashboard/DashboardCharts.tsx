import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { ESTADOS_PRODUCTO } from '@/types';
import { subMonths, format, startOfMonth } from 'date-fns';
import { es } from 'date-fns/locale';

const COLORS = ['hsl(210,80%,45%)', 'hsl(170,55%,42%)', 'hsl(260,60%,55%)', 'hsl(38,92%,50%)', 'hsl(0,72%,51%)', 'hsl(190,70%,50%)', 'hsl(320,60%,50%)', 'hsl(150,60%,40%)', 'hsl(30,80%,55%)', 'hsl(270,50%,60%)'];

const formatCOP = (v: number) => `$${(v / 1000000).toFixed(1)}M`;

export function DashboardCharts() {
  // Ventas últimos 6 meses
  const { data: ventasMensuales = [], isLoading: loadingVentas } = useQuery({
    queryKey: ['dashboard-ventas-mensuales'],
    queryFn: async () => {
      const now = new Date();
      const meses = [];
      for (let i = 5; i >= 0; i--) {
        const d = subMonths(now, i);
        const inicio = format(startOfMonth(d), 'yyyy-MM-dd');
        const fin = format(new Date(d.getFullYear(), d.getMonth() + 1, 0), 'yyyy-MM-dd');
        meses.push({ mes: format(d, 'MMM', { locale: es }), inicio, fin });
      }

      const results = await Promise.all(
        meses.map(async (m) => {
          const { data } = await supabase.from('ordenes')
            .select('total_final')
            .gte('created_at', m.inicio)
            .lte('created_at', m.fin + 'T23:59:59');
          const ventas = (data || []).reduce((s, o) => s + (o.total_final || 0), 0);
          return { mes: m.mes.charAt(0).toUpperCase() + m.mes.slice(1), ventas };
        })
      );
      return results;
    },
  });

  // Productos por estado
  const { data: productosPorEstado = [], isLoading: loadingEstados } = useQuery({
    queryKey: ['dashboard-productos-estado'],
    queryFn: async () => {
      const { data } = await supabase.from('orden_productos').select('estado_actual');
      if (!data) return [];
      const counts: Record<string, number> = {};
      data.forEach((p) => { counts[p.estado_actual] = (counts[p.estado_actual] || 0) + 1; });
      return ESTADOS_PRODUCTO
        .map((e) => ({ estado: e.key, label: e.label, cantidad: counts[e.key] || 0 }))
        .filter((e) => e.cantidad > 0);
    },
  });

  // Laboratorios con órdenes activas
  const { data: labData = [], isLoading: loadingLabs } = useQuery({
    queryKey: ['dashboard-labs'],
    queryFn: async () => {
      const { data } = await supabase.from('orden_productos')
        .select('laboratorio_id, laboratorios(nombre)')
        .not('laboratorio_id', 'is', null)
        .neq('estado_actual', 'entregado');
      if (!data) return [];
      const counts: Record<string, { nombre: string; total: number }> = {};
      data.forEach((p: any) => {
        const id = p.laboratorio_id;
        if (!counts[id]) counts[id] = { nombre: p.laboratorios?.nombre || 'N/A', total: 0 };
        counts[id].total++;
      });
      return Object.values(counts).sort((a, b) => b.total - a.total);
    },
  });

  const ChartSkeleton = () => <Skeleton className="h-[260px] w-full" />;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Ventas Mensuales</CardTitle></CardHeader>
        <CardContent>
          {loadingVentas ? <ChartSkeleton /> : (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={ventasMensuales}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="mes" tick={{ fill: 'hsl(220,10%,46%)' }} />
                <YAxis tickFormatter={formatCOP} tick={{ fill: 'hsl(220,10%,46%)' }} />
                <Tooltip formatter={(v: number) => `$${v.toLocaleString('es-CO')}`} />
                <Bar dataKey="ventas" fill="hsl(210,80%,45%)" radius={[4, 4, 0, 0]} name="Ventas" />
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Órdenes por Laboratorio</CardTitle></CardHeader>
        <CardContent>
          {loadingLabs ? <ChartSkeleton /> : labData.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-20">Sin datos</p>
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={labData} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis type="number" tick={{ fill: 'hsl(220,10%,46%)' }} />
                <YAxis dataKey="nombre" type="category" width={110} tick={{ fill: 'hsl(220,10%,46%)' }} />
                <Tooltip />
                <Bar dataKey="total" fill="hsl(260,60%,55%)" radius={[0, 4, 4, 0]} name="Órdenes activas" />
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      <Card className="lg:col-span-2">
        <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Productos por Estado</CardTitle></CardHeader>
        <CardContent>
          {loadingEstados ? <ChartSkeleton /> : productosPorEstado.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-20">Sin datos</p>
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie data={productosPorEstado} dataKey="cantidad" nameKey="label" cx="50%" cy="50%" outerRadius={110} label={({ label, cantidad }) => `${label}: ${cantidad}`}>
                  {productosPorEstado.map((_, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
