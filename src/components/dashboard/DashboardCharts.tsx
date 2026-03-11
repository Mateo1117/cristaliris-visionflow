import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line, Legend, AreaChart, Area } from 'recharts';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { ESTADOS_PRODUCTO } from '@/types';
import { subMonths, subWeeks, format, startOfMonth, startOfWeek, endOfWeek } from 'date-fns';
import { es } from 'date-fns/locale';

const COLORS = ['hsl(210,80%,45%)', 'hsl(170,55%,42%)', 'hsl(260,60%,55%)', 'hsl(38,92%,50%)', 'hsl(0,72%,51%)', 'hsl(190,70%,50%)', 'hsl(320,60%,50%)', 'hsl(150,60%,40%)', 'hsl(30,80%,55%)', 'hsl(270,50%,60%)'];

const formatCOP = (v: number) => `$${(v / 1000000).toFixed(1)}M`;
const formatCOPK = (v: number) => `$${(v / 1000).toFixed(0)}K`;

export function DashboardCharts() {
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
          const { data } = await supabase.from('ordenes').select('total_final').gte('created_at', m.inicio).lte('created_at', m.fin + 'T23:59:59');
          const ventas = (data || []).reduce((s, o) => s + (o.total_final || 0), 0);
          return { mes: m.mes.charAt(0).toUpperCase() + m.mes.slice(1), ventas };
        })
      );
      return results;
    },
  });

  // Utility by month
  const { data: utilidadMensual = [], isLoading: loadingUtilidad } = useQuery({
    queryKey: ['dashboard-utilidad-mensual'],
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
          const { data } = await supabase.from('orden_productos')
            .select('precio_venta, costo_laboratorio, costo_montura, costo_lente, costo_insumos, comision_financiera, utilidad_calculada')
            .gte('created_at', m.inicio).lte('created_at', m.fin + 'T23:59:59');
          const ventas = (data || []).reduce((s, p) => s + (p.precio_venta || 0), 0);
          const utilidad = (data || []).reduce((s, p) => s + (p.utilidad_calculada || 0), 0);
          return { mes: m.mes.charAt(0).toUpperCase() + m.mes.slice(1), ventas, utilidad };
        })
      );
      return results;
    },
  });

  // Utility by lab
  const { data: utilidadPorLab = [], isLoading: loadingUtLab } = useQuery({
    queryKey: ['dashboard-utilidad-lab'],
    queryFn: async () => {
      const { data } = await supabase.from('orden_productos')
        .select('laboratorio_id, laboratorios(nombre), utilidad_calculada, precio_venta')
        .not('laboratorio_id', 'is', null);
      if (!data) return [];
      const labs: Record<string, { nombre: string; utilidad: number; ventas: number; count: number }> = {};
      data.forEach((p: any) => {
        const id = p.laboratorio_id;
        if (!labs[id]) labs[id] = { nombre: p.laboratorios?.nombre || 'N/A', utilidad: 0, ventas: 0, count: 0 };
        labs[id].utilidad += p.utilidad_calculada || 0;
        labs[id].ventas += p.precio_venta || 0;
        labs[id].count++;
      });
      return Object.values(labs).sort((a, b) => b.utilidad - a.utilidad);
    },
  });

  const { data: productosPorEstado = [], isLoading: loadingEstados } = useQuery({
    queryKey: ['dashboard-productos-estado'],
    queryFn: async () => {
      const { data } = await supabase.from('orden_productos').select('estado_actual');
      if (!data) return [];
      const counts: Record<string, number> = {};
      data.forEach((p) => { counts[p.estado_actual] = (counts[p.estado_actual] || 0) + 1; });
      return ESTADOS_PRODUCTO.map((e) => ({ estado: e.key, label: e.label, cantidad: counts[e.key] || 0 })).filter((e) => e.cantidad > 0);
    },
  });

  const { data: citasTendencia = [], isLoading: loadingCitas } = useQuery({
    queryKey: ['dashboard-citas-tendencia'],
    queryFn: async () => {
      const now = new Date();
      const semanas = [];
      for (let i = 7; i >= 0; i--) {
        const weekStart = startOfWeek(subWeeks(now, i), { weekStartsOn: 1 });
        const weekEnd = endOfWeek(subWeeks(now, i), { weekStartsOn: 1 });
        semanas.push({ label: format(weekStart, 'dd MMM', { locale: es }), inicio: format(weekStart, 'yyyy-MM-dd'), fin: format(weekEnd, 'yyyy-MM-dd') });
      }
      return Promise.all(semanas.map(async (s) => {
        const { data } = await supabase.from('citas').select('estado').gte('fecha', s.inicio).lte('fecha', s.fin);
        const rows = data || [];
        return { semana: s.label, total: rows.length, asistió: rows.filter(c => c.estado === 'asistio').length, noAsistió: rows.filter(c => c.estado === 'no_asistio').length };
      }));
    },
  });

  const ChartSkeleton = () => <Skeleton className="h-[260px] w-full" />;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {/* Ventas mensuales */}
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

      {/* Utilidad mensual */}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Utilidad vs Ventas por Mes</CardTitle></CardHeader>
        <CardContent>
          {loadingUtilidad ? <ChartSkeleton /> : (
            <ResponsiveContainer width="100%" height={260}>
              <AreaChart data={utilidadMensual}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="mes" tick={{ fill: 'hsl(220,10%,46%)' }} />
                <YAxis tickFormatter={formatCOP} tick={{ fill: 'hsl(220,10%,46%)' }} />
                <Tooltip formatter={(v: number) => `$${v.toLocaleString('es-CO')}`} />
                <Legend />
                <Area type="monotone" dataKey="ventas" fill="hsl(210,80%,45%)" fillOpacity={0.15} stroke="hsl(210,80%,45%)" name="Ventas" />
                <Area type="monotone" dataKey="utilidad" fill="hsl(170,55%,42%)" fillOpacity={0.2} stroke="hsl(170,55%,42%)" name="Utilidad" />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* Citas tendencia */}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Citas por Semana — Asistencia vs No-Shows</CardTitle></CardHeader>
        <CardContent>
          {loadingCitas ? <ChartSkeleton /> : (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={citasTendencia}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="semana" tick={{ fill: 'hsl(220,10%,46%)', fontSize: 11 }} />
                <YAxis tick={{ fill: 'hsl(220,10%,46%)' }} allowDecimals={false} />
                <Tooltip />
                <Legend />
                <Bar dataKey="total" fill="hsl(210,80%,45%)" name="Total" radius={[4, 4, 0, 0]} />
                <Bar dataKey="asistió" fill="hsl(170,55%,42%)" name="Asistió" radius={[4, 4, 0, 0]} />
                <Bar dataKey="noAsistió" fill="hsl(0,72%,51%)" name="No Asistió" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* Utilidad por laboratorio */}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Utilidad por Laboratorio</CardTitle></CardHeader>
        <CardContent>
          {loadingUtLab ? <ChartSkeleton /> : utilidadPorLab.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-20">Sin datos</p>
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={utilidadPorLab} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis type="number" tickFormatter={formatCOPK} tick={{ fill: 'hsl(220,10%,46%)' }} />
                <YAxis dataKey="nombre" type="category" width={110} tick={{ fill: 'hsl(220,10%,46%)', fontSize: 11 }} />
                <Tooltip formatter={(v: number) => `$${v.toLocaleString('es-CO')}`} />
                <Legend />
                <Bar dataKey="ventas" fill="hsl(210,80%,45%)" radius={[0, 4, 4, 0]} name="Ventas" />
                <Bar dataKey="utilidad" fill="hsl(170,55%,42%)" radius={[0, 4, 4, 0]} name="Utilidad" />
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* Productos por estado */}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Productos por Estado</CardTitle></CardHeader>
        <CardContent>
          {loadingEstados ? <ChartSkeleton /> : productosPorEstado.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-20">Sin datos</p>
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie data={productosPorEstado} dataKey="cantidad" nameKey="label" cx="50%" cy="50%" outerRadius={100} label={({ label, cantidad }) => `${label}: ${cantidad}`}>
                  {productosPorEstado.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
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
