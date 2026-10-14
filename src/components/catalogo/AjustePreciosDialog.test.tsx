import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { AjustePreciosDialog } from './AjustePreciosDialog';

const productos = [
  { id: 'a', nombre: 'Lente Super HD', categoria: 'monofocal', precio_full: 180000, aplica_descuento: true, activo: true, orden_display: 1 },
  { id: 'b', nombre: 'Lente Super HD Talla', categoria: 'monofocal', precio_full: 260000, aplica_descuento: true, activo: true, orden_display: 2 },
  { id: 'c', nombre: 'Lente Viejo', categoria: 'monofocal', precio_full: 100000, aplica_descuento: true, activo: false, orden_display: 3 },
];

describe('AjustePreciosDialog', () => {
  it('aplica el porcentaje solo a los productos marcados (los inactivos empiezan sin marcar)', () => {
    const onAplicar = vi.fn();
    render(<AjustePreciosDialog categoria="monofocal" productos={productos} aplicando={false} onCerrar={vi.fn()} onAplicar={onAplicar} />);
    fireEvent.change(screen.getByLabelText('Porcentaje de ajuste'), { target: { value: '6' } });
    expect(screen.getByRole('button', { name: 'Aplicar a 2 productos' })).toBeEnabled();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Aplicar a Lente Super HD Talla' }));
    fireEvent.click(screen.getByRole('button', { name: 'Aplicar a 1 producto' }));
    expect(onAplicar).toHaveBeenCalledWith([{ id: 'a', precio: 191000 }]);
  });

  it('valor fijo suma pesos y los botones rápidos llenan el campo', () => {
    const onAplicar = vi.fn();
    render(<AjustePreciosDialog categoria="monofocal" productos={productos} aplicando={false} onCerrar={vi.fn()} onAplicar={onAplicar} />);
    fireEvent.click(screen.getByRole('radio', { name: 'Valor fijo ($)' }));
    fireEvent.change(screen.getByLabelText('Valor de ajuste en pesos'), { target: { value: '10000' } });
    fireEvent.click(screen.getByRole('button', { name: 'Aplicar a 2 productos' }));
    expect(onAplicar).toHaveBeenCalledWith([{ id: 'a', precio: 190000 }, { id: 'b', precio: 270000 }]);
  });

  it('sin valor no deja aplicar', () => {
    render(<AjustePreciosDialog categoria="monofocal" productos={productos} aplicando={false} onCerrar={vi.fn()} onAplicar={vi.fn()} />);
    expect(screen.getByText('Escriba el ajuste para ver los precios nuevos.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Aplicar a 0/ })).toBeDisabled();
  });
});
