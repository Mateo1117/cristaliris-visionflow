import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const datos: Record<string, any> = {
  pacientes: { id: 'p1', nombres: 'Pepito', apellidos: 'Pérez', tipo_documento: 'CC', numero_documento: '102658553', telefono: '3152221111', fecha_nacimiento: '2013-06-12', empresas: null },
  historias_clinicas: [{ id: 'h1', fecha_consulta: '2026-10-13T15:00:00Z', optometra_id: 'u1', formula_od_esfera: -1.25, formula_oi_esfera: -1, diagnostico: 'Miopía', plan_manejo: 'Control en 1 año' }],
  profiles: [{ user_id: 'u1', nombre: 'Claudia martinez ' }],
};
// Constructor encadenable mínimo del cliente de Supabase.
const consulta = (tabla: string) => {
  const q: any = {};
  for (const m of ['select', 'eq', 'order', 'limit', 'in']) q[m] = () => q;
  q.maybeSingle = async () => ({ data: datos[tabla], error: null });
  q.then = (ok: any) => Promise.resolve({ data: datos[tabla], error: null }).then(ok);
  return q;
};
vi.mock('@/integrations/supabase/client', () => ({ supabase: { from: (t: string) => consulta(t) } }));

import { CitaPanel } from './CitaPanel';

const cita = { id: 'c1', paciente_id: 'p1', fecha: '2026-10-15', hora_inicio: '08:00:00', hora_fin: '08:20:00', estado: 'agendada', pacientes: { nombres: 'Pepito', apellidos: 'Pérez' } };

const montar = (props: Partial<Parameters<typeof CitaPanel>[0]> = {}) => {
  const onCambiarEstado = vi.fn();
  const onAtender = vi.fn();
  render(
    <QueryClientProvider client={new QueryClient()}>
      <CitaPanel cita={cita} medicoNombre="Claudia martinez" hoy="2026-10-15" puedeAgendar puedeAtender
        onOpenChange={vi.fn()} onCambiarEstado={onCambiarEstado} onAtender={onAtender} {...props} />
    </QueryClientProvider>,
  );
  return { onCambiarEstado, onAtender };
};

describe('CitaPanel', () => {
  it('muestra el paciente y la última historia clínica desplegada', async () => {
    montar();
    expect(await screen.findByText('Pepito Pérez')).toBeInTheDocument();
    expect((await screen.findAllByText(/Miopía/)).length).toBe(2); // resumen y detalle
    expect(screen.getByText('OD -1.25')).toBeInTheDocument();
    expect(screen.getByText(/Control en 1 año/)).toBeInTheDocument();
    expect(screen.getByText(/Claudia martinez · Miopía/)).toBeInTheDocument();
  });

  it('marca llegada, asistió o no asistió, y abre la consulta', async () => {
    const { onCambiarEstado, onAtender } = montar();
    fireEvent.click(await screen.findByRole('button', { name: /Llegó/ }));
    fireEvent.click(screen.getByRole('button', { name: /^Asistió/ }));
    fireEvent.click(screen.getByRole('button', { name: /No asistió/ }));
    expect(onCambiarEstado.mock.calls.map((c) => c[0])).toEqual(['en_espera', 'atendida', 'no_asistio']);
    fireEvent.click(screen.getByRole('button', { name: /Atender y abrir historia/ }));
    expect(onAtender).toHaveBeenCalled();
  });

  it('una cita cerrada se puede reabrir y ya no ofrece atender', async () => {
    montar({ cita: { ...cita, estado: 'no_asistio' } });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Reabrir cita' })).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: /Atender/ })).not.toBeInTheDocument();
  });

  it('sin permiso de historias no las muestra', async () => {
    montar({ puedeAtender: false });
    await screen.findByText('Pepito Pérez');
    expect(screen.queryByText(/Historias clínicas/)).not.toBeInTheDocument();
  });
});
