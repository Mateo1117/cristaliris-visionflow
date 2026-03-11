import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line } from 'recharts';
import { mockVentasMensuales, mockLaboratoriosCumplimiento, mockProductosPorEstado } from '@/lib/mock-data';
import { ESTADOS_PRODUCTO } from '@/types';

const COLORS = ['hsl(210,80%,45%)', 'hsl(170,55%,42%)', 'hsl(260,60%,55%)', 'hsl(38,92%,50%)', 'hsl(0,72%,51%)'];

const formatCOP = (v: number) => `$${(v / 1000000).toFixed(1)}M`;

const estadosResumen = mockProductosPorEstado.map((e) => ({
  ...e,
  label: ESTADOS_PRODUCTO.find((s) => s.key === e.estado)?.label ?? e.estado,
}));

export function DashboardCharts() {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Ventas vs Utilidad</CardTitle></CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={mockVentasMensuales}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
              <XAxis dataKey="mes" className="text-xs" tick={{ fill: 'hsl(220,10%,46%)' }} />
              <YAxis tickFormatter={formatCOP} className="text-xs" tick={{ fill: 'hsl(220,10%,46%)' }} />
              <Tooltip formatter={(v: number) => `$${v.toLocaleString('es-CO')}`} />
              <Bar dataKey="ventas" fill="hsl(210,80%,45%)" radius={[4, 4, 0, 0]} name="Ventas" />
              <Bar dataKey="utilidad" fill="hsl(170,55%,42%)" radius={[4, 4, 0, 0]} name="Utilidad" />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Cumplimiento por Laboratorio</CardTitle></CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={mockLaboratoriosCumplimiento} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
              <XAxis type="number" domain={[0, 100]} tick={{ fill: 'hsl(220,10%,46%)' }} />
              <YAxis dataKey="nombre" type="category" width={110} className="text-xs" tick={{ fill: 'hsl(220,10%,46%)' }} />
              <Tooltip formatter={(v: number) => `${v}%`} />
              <Bar dataKey="cumplimiento" fill="hsl(260,60%,55%)" radius={[0, 4, 4, 0]} name="Cumplimiento" />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Tendencia de Ventas</CardTitle></CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={mockVentasMensuales}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
              <XAxis dataKey="mes" tick={{ fill: 'hsl(220,10%,46%)' }} />
              <YAxis tickFormatter={formatCOP} tick={{ fill: 'hsl(220,10%,46%)' }} />
              <Tooltip formatter={(v: number) => `$${v.toLocaleString('es-CO')}`} />
              <Line type="monotone" dataKey="ventas" stroke="hsl(210,80%,45%)" strokeWidth={2} dot={{ r: 4 }} name="Ventas" />
              <Line type="monotone" dataKey="utilidad" stroke="hsl(170,55%,42%)" strokeWidth={2} dot={{ r: 4 }} name="Utilidad" />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Productos por Estado</CardTitle></CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={260}>
            <PieChart>
              <Pie data={estadosResumen} dataKey="cantidad" nameKey="label" cx="50%" cy="50%" outerRadius={100} label={({ label, cantidad }) => `${label}: ${cantidad}`} labelLine={false}>
                {estadosResumen.map((_, i) => (
                  <Cell key={i} fill={COLORS[i % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  );
}
