import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { mockCitas } from '@/lib/mock-data';
import type { EstadoCita } from '@/types';

const horas = Array.from({ length: 24 }, (_, i) => {
  const h = Math.floor(i / 2) + 8;
  const m = i % 2 === 0 ? '00' : '20';
  return `${h.toString().padStart(2, '0')}:${m}`;
}).filter((h) => {
  const hour = parseInt(h.split(':')[0]);
  return hour >= 8 && hour < 18;
});

const estadoColor: Record<EstadoCita, string> = {
  agendada: 'bg-info/20 text-info border-info/30',
  confirmada: 'bg-primary/20 text-primary border-primary/30',
  asistio: 'bg-success/20 text-success border-success/30',
  no_asistio: 'bg-destructive/20 text-destructive border-destructive/30',
  cancelada: 'bg-muted text-muted-foreground border-muted',
};

const estadoLabel: Record<EstadoCita, string> = {
  agendada: 'Agendada',
  confirmada: 'Confirmada',
  asistio: 'Asistió',
  no_asistio: 'No Asistió',
  cancelada: 'Cancelada',
};

export function AgendaCalendar() {
  const [fecha] = useState('2026-03-11');
  const citasHoy = mockCitas.filter((c) => c.fecha === fecha);

  return (
    <Tabs defaultValue="dia">
      <TabsList className="mb-4">
        <TabsTrigger value="dia">Día</TabsTrigger>
        <TabsTrigger value="semana">Semana</TabsTrigger>
        <TabsTrigger value="mes">Mes</TabsTrigger>
      </TabsList>

      <TabsContent value="dia">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {['Dr. Ramírez', 'Dra. López'].map((opt) => (
            <Card key={opt}>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">{opt}</CardTitle>
                <p className="text-xs text-muted-foreground">11/03/2026</p>
              </CardHeader>
              <CardContent className="p-0">
                <div className="divide-y">
                  {horas.map((hora) => {
                    const cita = citasHoy.find((c) => c.hora_inicio === hora && c.optometra_nombre === opt);
                    return (
                      <div key={hora} className="flex items-center px-4 py-2 min-h-[3rem]">
                        <span className="text-xs text-muted-foreground w-12 flex-shrink-0">{hora}</span>
                        {cita ? (
                          <div className={`flex-1 rounded-md border px-3 py-1.5 ${estadoColor[cita.estado]}`}>
                            <div className="flex items-center justify-between">
                              <span className="text-sm font-medium">{cita.paciente_nombre}</span>
                              <Badge variant="outline" className="text-[10px] h-5">{estadoLabel[cita.estado]}</Badge>
                            </div>
                            <span className="text-[10px] opacity-70">{cita.hora_inicio} - {cita.hora_fin} · {cita.origen}</span>
                          </div>
                        ) : (
                          <div className="flex-1 h-8 rounded-md border border-dashed border-border/50" />
                        )}
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </TabsContent>

      <TabsContent value="semana">
        <Card><CardContent className="p-8 text-center text-muted-foreground">Vista semanal — próximamente</CardContent></Card>
      </TabsContent>

      <TabsContent value="mes">
        <Card><CardContent className="p-8 text-center text-muted-foreground">Vista mensual — próximamente</CardContent></Card>
      </TabsContent>
    </Tabs>
  );
}
