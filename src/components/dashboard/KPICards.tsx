import { Card, CardContent } from '@/components/ui/card';
import { mockKPIs } from '@/lib/mock-data';
import { TrendingUp, TrendingDown, DollarSign, ShoppingCart, Users, Target, Clock, AlertTriangle } from 'lucide-react';

const icons = [DollarSign, ShoppingCart, DollarSign, Users, Target, Clock, AlertTriangle, DollarSign];

export function KPICards() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
      {mockKPIs.map((kpi, i) => {
        const Icon = icons[i];
        const isPositive = (kpi.change ?? 0) > 0;
        const isNeutral = kpi.change === undefined;
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
              {!isNeutral && (
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
