import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import type { BloqueHorario } from '@/lib/disponibilidad';

vi.mock('@/integrations/supabase/client', () => ({ supabase: { from: vi.fn() } }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { EditorSemanal } from './EditorSemanal';

const lunes: BloqueHorario = {
  id: 'b1', medico_id: 'ana', dia_semana: 1, hora_inicio: '08:00:00', hora_fin: '12:00:00',
  duracion_cita: 30, sede_id: null, activo: true,
};

const envolver = (ui: ReactNode) => (
  <QueryClientProvider client={new QueryClient()}>{ui}</QueryClientProvider>
);

/** Tarjeta (Card) del día indicado. */
const tarjetaDe = (dia: string) => screen.getByText(dia, { selector: 'p' }).closest('.rounded-lg') as HTMLElement;

describe('EditorSemanal', () => {
  it('muestra las franjas guardadas y el total semanal', () => {
    render(envolver(<EditorSemanal medicoId="ana" medicoNombre="Ana" bloques={[lunes]} sedes={[]} puedeEditar />));
    expect(screen.getByText('4 h/semana')).toBeInTheDocument();
    expect(screen.getByText('8 turnos/semana')).toBeInTheDocument();
    expect(screen.getByDisplayValue('08:00')).toBeInTheDocument();
    expect(screen.getAllByText('No atiende')).toHaveLength(6);
    expect(screen.getByRole('button', { name: /guardar horario/i })).toBeDisabled();
  });

  it('activar un día agrega una franja y habilita guardar', () => {
    render(envolver(<EditorSemanal medicoId="ana" medicoNombre="Ana" bloques={[lunes]} sedes={[]} puedeEditar />));
    fireEvent.click(screen.getByRole('switch', { name: /atiende los martes/i }));
    expect(screen.getAllByDisplayValue('08:00')).toHaveLength(2);
    expect(screen.getByText('8 h/semana')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /guardar horario/i })).toBeEnabled();
  });

  it('marca franjas que se cruzan y no deja guardar', () => {
    render(envolver(<EditorSemanal medicoId="ana" medicoNombre="Ana" bloques={[lunes]} sedes={[]} puedeEditar />));
    const tarjeta = tarjetaDe('Lunes');
    fireEvent.click(within(tarjeta).getByRole('button', { name: /^franja$/i }));
    // La nueva franja arranca 1 h después (13:00); se lleva a 11:00 para que se cruce.
    const desde = within(tarjeta).getAllByLabelText('Desde');
    fireEvent.change(desde[1], { target: { value: '11:00' } });
    expect(screen.getByText(/se cruzan/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /guardar horario/i })).toBeDisabled();
  });

  it('no pierde lo editado cuando el padre vuelve a renderizar', () => {
    const { rerender } = render(envolver(<EditorSemanal medicoId="ana" medicoNombre="Ana" bloques={[lunes]} sedes={[]} puedeEditar />));
    fireEvent.change(screen.getByDisplayValue('12:00'), { target: { value: '13:00' } });
    rerender(envolver(<EditorSemanal medicoId="ana" medicoNombre="Ana" bloques={[{ ...lunes }]} sedes={[]} puedeEditar />));
    expect(screen.getByDisplayValue('13:00')).toBeInTheDocument();
  });

  it('en solo lectura no muestra acciones de edición', () => {
    render(envolver(<EditorSemanal medicoId="ana" medicoNombre="Ana" bloques={[lunes]} sedes={[]} puedeEditar={false} />));
    expect(screen.queryByRole('button', { name: /guardar horario/i })).not.toBeInTheDocument();
    expect(screen.getByDisplayValue('08:00')).toBeDisabled();
  });
});
