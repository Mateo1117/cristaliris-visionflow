/**
 * Fórmula del paciente en el detalle de la orden (pestaña Detalle), para que
 * quien envía al laboratorio o revisa la calidad la tenga a la vista.
 */
import { useQuery } from '@tanstack/react-query';
import { Eye } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { elegirFormula, textoCorto, valorDioptria, type Formula, type FormulaOrden, type GarantiaFormula, type HistoriaFormula } from './formulaOrden';

const COLUMNAS = 'id, orden_id, fecha_consulta, optometra_id, formula_od_esfera, formula_od_cilindro, formula_od_eje, formula_od_adicion, formula_oi_esfera, formula_oi_cilindro, formula_oi_eje, formula_oi_adicion, distancia_pupilar, altura_pupilar_od, altura_pupilar_oi, formula_tipo_lente, formula_filtros, formula_observaciones';

export function useFormulaOrden(ordenId?: string | null, pacienteId?: string | null, productoId?: string | null) {
  return useQuery({
    queryKey: ['formula-orden', ordenId, pacienteId, productoId],
    enabled: !!pacienteId,
    queryFn: async (): Promise<FormulaOrden> => {
      const [{ data: historias }, { data: orden }, { data: garantias }] = await Promise.all([
        supabase.from('historias_clinicas').select(COLUMNAS).eq('paciente_id', pacienteId!).order('fecha_consulta', { ascending: false }).limit(10),
        ordenId ? supabase.from('ordenes').select('observaciones').eq('id', ordenId).maybeSingle() : Promise.resolve({ data: null }),
        productoId
          ? (supabase as any).from('garantias').select('subcodigo, fecha_solicitud, formula_nueva').eq('orden_producto_id', productoId).order('fecha_solicitud', { ascending: false })
          : Promise.resolve({ data: [] }),
      ]);
      const lista = (historias ?? []) as any[];
      const ids = [...new Set(lista.map((h) => h.optometra_id).filter(Boolean))];
      const { data: perfiles } = ids.length ? await supabase.from('profiles').select('user_id, nombre').in('user_id', ids) : { data: [] as any[] };
      const conNombre = lista.map((h) => ({ ...h, optometra_nombre: perfiles?.find((p: any) => p.user_id === h.optometra_id)?.nombre?.trim() ?? null })) as HistoriaFormula[];
      return elegirFormula(conNombre, ordenId, (orden as any)?.observaciones, (garantias ?? []) as GarantiaFormula[]);
    },
  });
}

/** Texto corto para la etiqueta: "OD -1.25 -0.50 x180 / OI -1.00". */
export function textoEtiqueta(f: FormulaOrden): string | undefined {
  if (!f) return undefined;
  if (f.origen === 'externa') return f.texto.split('\n').find((l) => l.startsWith('OD '))?.replace(/ · DP.*$/, '');
  return textoCorto(f.formula);
}

export function FormulaOrdenCard({ formula, cargando }: { formula: FormulaOrden | undefined; cargando: boolean }) {
  return (
    <div className={`rounded-lg border p-3 space-y-2 ${formula?.origen === 'garantia' ? 'border-warning/50 bg-warning/5' : 'bg-muted/30'}`}>
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
        <Eye className="h-3.5 w-3.5" />{formula?.origen === 'garantia' ? 'Fórmula nueva (garantía)' : 'Fórmula del paciente'}
      </p>
      {cargando ? <p className="text-xs text-muted-foreground">Cargando…</p>
        : !formula ? <p className="text-xs text-muted-foreground">El paciente no tiene fórmula registrada (ni historia clínica ni fórmula externa).</p>
        : formula.origen === 'externa' ? <p className="text-sm whitespace-pre-line">{formula.texto}</p>
        : <TablaFormula f={formula.formula} pie={
          `${formula.origen === 'garantia' ? `Garantía ${formula.subcodigo ?? ''}` : formula.origen === 'orden' ? 'Historia clínica de esta orden' : 'Última historia clínica del paciente'}`
          + ` · ${new Date(formula.fecha).toLocaleDateString('es-CO', { day: 'numeric', month: 'short', year: 'numeric' })}`
          + (formula.origen !== 'garantia' && formula.autor ? ` · ${formula.autor}` : '')
        } />}
    </div>
  );
}

export function TablaFormula({ f, pie }: { f: Formula; pie?: string }) {
  const fila = (lado: string, o: Formula['od']) => (
    <tr className="border-t">
      <td className="py-1 pr-2 font-semibold">{lado}</td>
      <td className="py-1 px-2 font-mono">{valorDioptria(o.esfera)}</td>
      <td className="py-1 px-2 font-mono">{valorDioptria(o.cilindro)}</td>
      <td className="py-1 px-2 font-mono">{o.eje != null ? `${o.eje}°` : '—'}</td>
      <td className="py-1 px-2 font-mono">{o.adicion ? valorDioptria(o.adicion) : '—'}</td>
      <td className="py-1 pl-2 font-mono">{o.altura ?? '—'}</td>
    </tr>
  );
  return (
    <>
      <table className="w-full text-sm">
        <thead><tr className="text-xs text-muted-foreground text-left">
          <th className="font-normal pr-2" /><th className="font-normal px-2">Esfera</th><th className="font-normal px-2">Cilindro</th>
          <th className="font-normal px-2">Eje</th><th className="font-normal px-2">Adición</th><th className="font-normal pl-2">Altura</th>
        </tr></thead>
        <tbody>{fila('OD', f.od)}{fila('OI', f.oi)}</tbody>
      </table>
      {(f.dp != null || f.tipo_lente || f.filtros) && (
        <p className="text-xs">
          {[f.dp != null ? `DP: ${f.dp} mm` : null, f.tipo_lente ? `Lente: ${f.tipo_lente}` : null, f.filtros ? `Filtros: ${f.filtros}` : null].filter(Boolean).join(' · ')}
        </p>
      )}
      {f.notas && <p className="text-xs"><span className="text-muted-foreground">Obs.:</span> {f.notas}</p>}
      {pie && <p className="text-[11px] text-muted-foreground">{pie}</p>}
    </>
  );
}
