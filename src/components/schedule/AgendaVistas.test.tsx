import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { AgendaSemana } from './AgendaSemana';
import { AgendaMes } from './AgendaMes';
import { AgendaLista } from './AgendaLista';
import { cuadriculaMes, diasDeSemana } from '@/lib/agendaGrid';

const medicos = [{ user_id: 'ana', nombre: 'Ana Ruiz' }, { user_id: 'luis', nombre: 'Luis Peña' }];
const cita = (extra: Record<string, unknown> = {}) => ({
  id: Math.random().toString(), fecha: '2026-10-14', hora_inicio: '09:00:00', hora_fin: '09:30:00',
  estado: 'agendada', optometra_id: 'ana', pacientes: { nombres: 'Pepito', apellidos: 'Pérez', telefono: '3101234567' }, ...extra,
});

describe('AgendaSemana', () => {
  const dias = diasDeSemana('2026-10-14');
  it('ubica la cita en su día y abre ese día al hacer clic', () => {
    const onAbrirDia = vi.fn();
    render(<AgendaSemana dias={dias} hoy="2026-10-13" citas={[cita()]} medicos={medicos} horarios={[]} excepciones={[]}
      medicoId={null} puedeAgendar onNuevaCita={vi.fn()} onAbrirDia={onAbrirDia} />);
    fireEvent.click(screen.getByText(/Pepito Pérez/));
    expect(onAbrirDia).toHaveBeenCalledWith('2026-10-14');
    expect(screen.getByText('Ana Ruiz')).toBeInTheDocument(); // leyenda con todos los médicos
  });
  it('filtra por médico y muestra su ausencia', () => {
    render(<AgendaSemana dias={dias} hoy="2026-10-13" citas={[cita({ optometra_id: 'luis' })]} medicos={medicos} horarios={[]}
      excepciones={[{ medico_id: 'ana', fecha_inicio: '2026-10-15', fecha_fin: '2026-10-15', motivo: 'Vacaciones' }]}
      medicoId="ana" puedeAgendar onNuevaCita={vi.fn()} onAbrirDia={vi.fn()} />);
    expect(screen.queryByText(/Pepito/)).not.toBeInTheDocument();
    expect(screen.getAllByText('Vacaciones').length).toBeGreaterThan(0);
  });
});

describe('AgendaMes', () => {
  it('muestra las citas del día y el "+N más"', () => {
    const citas = ['08:00', '09:00', '10:00', '11:00'].map((h) => cita({ hora_inicio: `${h}:00`, hora_fin: `${h}:30` }));
    render(<AgendaMes semanas={cuadriculaMes('2026-10-14')} mes="2026-10" hoy="2026-10-13" citas={citas}
      medicos={medicos} excepciones={[]} medicoId={null} onAbrirDia={vi.fn()} />);
    expect(screen.getAllByText(/Pepito Pérez/)).toHaveLength(3);
    expect(screen.getByText('+1 más')).toBeInTheDocument();
  });
});

describe('AgendaLista', () => {
  it('agrupa por día y oculta canceladas salvo que se pidan', () => {
    const citas = [cita(), cita({ estado: 'cancelada', pacientes: { nombres: 'Ana', apellidos: 'Gil' } })];
    const props = { dias: ['2026-10-14'], hoy: '2026-10-13', citas, medicos, medicoId: null, onAbrirDia: vi.fn() };
    const { rerender } = render(<AgendaLista {...props} incluirCanceladas={false} />);
    expect(screen.getByText(/Pepito Pérez/)).toBeInTheDocument();
    expect(screen.queryByText(/Ana Gil/)).not.toBeInTheDocument();
    rerender(<AgendaLista {...props} incluirCanceladas />);
    expect(screen.getByText(/Ana Gil/)).toBeInTheDocument();
  });
});
