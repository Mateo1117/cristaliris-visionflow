import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { useState } from 'react';
import { FormulaEditor, aFormula, aTexto, type FormulaTexto } from './FormulaEditor';

describe('FormulaEditor (garantía)', () => {
  it('parte de la fórmula actual y devuelve la corregida como números', () => {
    let ultimo: FormulaTexto | null = null;
    function Prueba() {
      const [v, setV] = useState(aTexto({ od: { esfera: -1, cilindro: null, eje: null, adicion: null, altura: 18 }, oi: { esfera: -0.75, cilindro: null, eje: null, adicion: null, altura: 18 }, dp: 62, tipo_lente: 'Monofocal' }));
      ultimo = v;
      return <FormulaEditor valor={v} onChange={setV} />;
    }
    render(<Prueba />);
    expect(screen.getByLabelText('OD Esfera')).toHaveValue('-1');
    fireEvent.change(screen.getByLabelText('OD Esfera'), { target: { value: '-1,50' } });
    fireEvent.change(screen.getByLabelText('OD Cilindro'), { target: { value: '-0.25' } });
    fireEvent.change(screen.getByLabelText('OD Eje'), { target: { value: '90' } });
    const f = aFormula(ultimo!);
    expect(f.od).toEqual({ esfera: -1.5, cilindro: -0.25, eje: 90, adicion: null, altura: 18 });
    expect(f.oi.esfera).toBe(-0.75);
    expect(f.dp).toBe(62);
    expect(f.tipo_lente).toBe('Monofocal');
  });
});
