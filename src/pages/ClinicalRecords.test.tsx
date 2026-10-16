import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';

const paciente = { id: 'p1', nombres: 'Magnolia', apellidos: 'Cano', tipo_documento: 'CC', numero_documento: '52975896', fecha_nacimiento: null, ocupacion: null, direccion: '', referido_por: null };
const insertados: any[] = [];
const actualizados: any[] = [];

// Constructor encadenable mínimo del cliente de Supabase.
const consulta = (tabla: string) => {
  const q: any = {};
  for (const m of ['select', 'eq', 'order', 'limit', 'in', 'ilike', 'or']) q[m] = () => q;
  const datos = tabla === 'pacientes' ? paciente : [];
  q.maybeSingle = async () => ({ data: datos, error: null });
  q.then = (ok: any) => Promise.resolve({ data: tabla === 'pacientes' ? [paciente] : [], error: null }).then(ok);
  q.insert = async (fila: any) => { insertados.push({ tabla, fila }); return { error: null }; };
  q.update = (fila: any) => { actualizados.push({ tabla, fila }); return { eq: async () => ({ error: null }) }; };
  return q;
};
vi.mock('@/integrations/supabase/client', () => ({
  supabase: { from: (t: string) => consulta(t), auth: { getUser: async () => ({ data: { user: { id: 'u1' } } }) } },
}));
vi.mock('@/components/layout/AppLayout', () => ({ AppLayout: ({ children }: any) => <div>{children}</div> }));

import ClinicalRecords from './ClinicalRecords';

const pestaña = (nombre: RegExp) => {
  const tab = screen.getByRole('tab', { name: nombre });
  fireEvent.mouseDown(tab, { button: 0 });
  fireEvent.click(tab);
};

describe('Nueva historia clínica', () => {
  it('guarda lo escrito en todas las pestañas, no solo en la abierta, y actualiza la ficha del paciente', async () => {
    const { container } = render(
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter initialEntries={['/historias?nueva=1&paciente=p1']}>
          <ClinicalRecords />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    const campo = (name: string) => document.querySelector(`[name="${name}"]`) as HTMLInputElement;

    await waitFor(() => expect(campo('pac_fecha_nacimiento')).toBeTruthy());
    fireEvent.change(campo('pac_fecha_nacimiento'), { target: { value: '1991-03-14' } });
    expect(screen.getByDisplayValue(/^3\d años$/)).toBeInTheDocument(); // la edad se calcula al momento
    fireEvent.change(campo('pac_direccion'), { target: { value: 'Carrera 11 # 73-44' } });
    fireEvent.change(campo('anamnesis'), { target: { value: 'Visión borrosa de lejos' } });

    pestaña(/Fórmula Óptica/);
    fireEvent.change(campo('formula_od_esfera'), { target: { value: '-1.25' } });
    pestaña(/Diagnóstico/);
    fireEvent.change(campo('diagnostico'), { target: { value: 'Miopía y astigmatismo' } });

    fireEvent.submit(container.ownerDocument.querySelector('form')!);

    await waitFor(() => expect(insertados).toHaveLength(1));
    const hc = insertados[0].fila;
    expect(hc.anamnesis).toBe('Visión borrosa de lejos');
    expect(hc.formula_od_esfera).toBe(-1.25);
    expect(hc.diagnostico).toBe('Miopía y astigmatismo');
    await waitFor(() => expect(actualizados.find((a) => a.tabla === 'pacientes')?.fila).toEqual({
      fecha_nacimiento: '1991-03-14', direccion: 'Carrera 11 # 73-44',
    }));
  });
});
