import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { TrendingUp, TrendingDown, DollarSign, ShoppingCart, Users, Clock, AlertTriangle, Package } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { startOfMonth, endOfMonth, subMonths, format } from 'date-fns';

const formatCOP = (v: number) => {
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `$${(v / 1_000).toFixed(0)}K`;
  return `$${v.toLocaleString('es-CO')}`;
};

export function KPICards() {
  const now = new Date();
  const mesActualInicio = format(startOfMonth(now), 'yyyy-MM-dd');
  const mesActualFin = format(endOfMonth(now), 'yyyy-MM-dd');
  const mesAnteriorInicio = format(startOfMonth(subMonths(now, 1)), 'yyyy-MM-dd');
  const mesAnteriorFin = format(endOfMonth(subMonths(now, 1)), 'yyyy-MM-dd');

  const { data, isLoading } = useQuery({
    queryKey: ['dashboard-kpis', mesActualInicio],
    queryFn: async () => {
      const [
        ordenesActualesRes,
        ordenesAnterioresRes,
        productosRes,
        pacientesActualesRes,
        pacientesAnterioresRes,
        garantiasActualesRes,
        garantiasAnterioresRes,
        carteraRes,
        citasHoyRes,
      ] = await Promise.all([
        supabase.from('ordenes').select('total_final, saldo_pendiente').gte('created_at', mesActualInicio).lte('created_at', mesActualFin + 'T23:59:59'),
        supabase.from('ordenes').select('total_final').gte('created_at', mesAnteriorInicio).lte('created_at', mesAnteriorFin + 'T23:59:59'),
        supabase.from('orden_productos').select('estado_actual, created_at, updated_at').neq('estado_actual', 'entregado'),
        supabase.from('pacientes').select('id', { count: 'exact', head: true }).gte('created_at', mesActualInicio),
        supabase.from('pacientes').select('id', { count: 'exact', head: true }).gte('created_at', mesAnteriorInicio).lte('created_at', mesAnteriorFin + 'T23:59:59'),
        supabase.from('garantias').select('id', { count: 'exact', head: true }).gte('fecha_solicitud', mesActualInicio),
        supabase.from('garantias').select('id', { count: 'exact', head: true }).gte('fecha_solicitud', mesAnteriorInicio).lte('fecha_solicitud', mesAnteriorFin + 'T23:59:59'),
        supabase.from('ordenes').select('saldo_pendiente').gt('saldo_pendiente', 0),
        supabase.from('citas').select('id', { count: 'exact', head: true }).eq('fecha', format(now, 'yyyy-MM-dd')),
      ]);

      const ventasActuales = (ordenesActualesRes.data || []).reduce((s, o) => s + (o.total_final || 0), 0);
      const ventasAnteriores = (ordenesAnterioresRes.data || []).reduce((s, o) => s + (o.total_final || 0), 0);
      const ventasChange = ventasAnteriores > 0 ? ((ventasActuales - ventasAnteriores) / ventasAnteriores * 100) : 0;

      const ordenesActivas = (productosRes.data || []).length;

      const pacientesNuevos = pacientesActualesRes.count || 0;
      const pacientesAnteriores = pacientesAnterioresRes.count || 0;
      const pacientesChange = pacientesAnteriores > 0 ? ((pacientesNuevos - pacientesAnteriores) / pacientesAnteriores * 100) : 0;

      const garantiasActuales = garantiasActualesRes.count || 0;
      const garantiasAnterioresCount = garantiasAnterioresRes.count || 0;
      const garantiasChange = garantiasAnterioresCount > 0 ? ((garantiasActuales - garantiasAnterioresCount) / garantiasAnterioresCount * 100) : 0;

      const carteraTotal = (carteraRes.data || []).reduce((s, o) => s + (o.saldo_pendiente || 0), 0);

      // Avg delivery time from productos that are delivered this month
      const citasHoy = citasHoyRes.count || 0;

      return [
        { label: 'Ventas del Mes', value: formatCOP(ventasActuales), change: Math.round(ventasChange * 10) / 10, changeLabel: 'vs mes anterior', icon: DollarSign },
        { label: 'Órdenes Activas', value: ordenesActivas, icon: ShoppingCart },
        { label: 'Citas Hoy', value: citasHoy, icon: Clock },
        { label: 'Pacientes Nuevos', value: pacientesNuevos, change: Math.round(pacientesChange * 10) / 10, changeLabel: 'vs mes anterior', icon: Users },
        { label: 'Garantías del Mes', value: garantiasActuales, change: Math.round(garantiasChange * 10) / 10, changeLabel: 'vs mes anterior', icon: AlertTriangle },
        { label: 'Cartera Pendiente', value: formatCOP(carteraTotal), icon: Package },
      ];
    },
    refetchInterval: 30000,
  });

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <Card key={i}><CardContent className="p-4"><Skeleton className="h-16 w-full" /></CardContent></Card>
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
      {(data || []).map((kpi) => {
        const Icon = kpi.icon;
        const hasChange = kpi.change !== undefined && kpi.change !== 0;
        const isPositive = (kpi.change ?? 0) > 0;
        return (
          <Card key={kpi.label}>
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{kpi.label}</span>
                <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
                  <Icon className="h-4 w-4 text-primary" />
                </div>
              </div>
              <p className="text-2xl font-bold">{kpi.value}</p>
              {hasChange && (
                <div className="flex items-center gap-1 mt-1">
                  {isPositive ? (
                    <TrendingUp className="h-3 w-3 text-success" />
                  ) : (
                    <TrendingDown className="h-3 w-3 text-destructive" />
                  )}
                  <span className={`text-xs font-medium ${isPositive ? 'text-success' : 'text-destructive'}`}>
                    {isPositive ? '+' : ''}{kpi.change}%
                  </span>
                  <span className="text-xs text-muted-foreground">{kpi.changeLabel}</span>
                </div>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
