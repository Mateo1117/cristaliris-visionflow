import { AppLayout } from '@/components/layout/AppLayout';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { Badge } from '@/components/ui/badge';
import { DeudaEmpresasCard } from '@/components/reports/DeudaEmpresasCard';

const COLORS = ['hsl(210,80%,45%)', 'hsl(170,55%,42%)', 'hsl(260,60%,55%)', 'hsl(38,92%,50%)', 'hsl(0,72%,51%)', 'hsl(150,60%,40%)'];

export default function Reports() {
  const { data: ordenes = [] } = useQuery({
    queryKey: ['reportes-ordenes'],
    queryFn: async () => {
      const { data, error } = await supabase.from('ordenes').select('total_final, saldo_pendiente, estado_pago, modalidad_pago, created_at');
      if (error) throw error;
      return data;
    },
  });

  const { data: productos = [] } = useQuery({
    queryKey: ['reportes-productos'],
    queryFn: async () => {
      const { data, error } = await supabase.from('orden_productos').select('estado_actual, tipo_producto, es_garantia, laboratorio_id, laboratorios(nombre)');
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

  // Stats
  const totalVentas = ordenes.reduce((s, o: any) => s + (o.total_final || 0), 0);
  const totalPendiente = ordenes.reduce((s, o: any) => s + (o.saldo_pendiente || 0), 0);
  const garantiasCount = productos.filter((p: any) => p.es_garantia).length;

  // By estado
  const estadoMap = new Map<string, number>();
  productos.forEach((p: any) => { estadoMap.set(p.estado_actual, (estadoMap.get(p.estado_actual) || 0) + 1); });
  const estadoData = Array.from(estadoMap.entries()).map(([name, value]) => ({ name: name.replace(/_/g, ' '), value }));

  // By lab
  const labMap = new Map<string, number>();
  productos.forEach((p: any) => { const n = (p as any).laboratorios?.nombre || 'Sin lab'; labMap.set(n, (labMap.get(n) || 0) + 1); });
  const labData = Array.from(labMap.entries()).map(([name, value]) => ({ name, value }));

  return (
    <AppLayout>
      <PageHeader title="Reportes" description="Reportes operativos y gerenciales" />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {[
          { label: 'Total Ventas', value: `$${totalVentas.toLocaleString('es-CO')}` },
          { label: 'Cartera Pendiente', value: `$${totalPendiente.toLocaleString('es-CO')}` },
          { label: 'Pacientes', value: pacientesCount },
          { label: 'Garantías', value: garantiasCount },
        ].map(k => (
          <Card key={k.label}><CardContent className="p-4">
            <p className="text-xs text-muted-foreground uppercase tracking-wide">{k.label}</p>
            <p className="text-2xl font-bold mt-1">{k.value}</p>
          </CardContent></Card>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
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

      <div className="mt-4">
        <DeudaEmpresasCard />
      </div>
    </AppLayout>
  );
}
