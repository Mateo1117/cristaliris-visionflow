/**
 * Fórmula del paciente en el detalle de la orden (pestaña Detalle), para que
 * quien envía al laboratorio o revisa la calidad la tenga a la vista.
 */
import { useQuery } from '@tanstack/react-query';
import { Eye } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { elegirFormula, valorDioptria, type FormulaOrden, type HistoriaFormula } from './formulaOrden';

const COLUMNAS = 'id, orden_id, fecha_consulta, optometra_id, formula_od_esfera, formula_od_cilindro, formula_od_eje, formula_od_adicion, formula_oi_esfera, formula_oi_cilindro, formula_oi_eje, formula_oi_adicion, distancia_pupilar, altura_pupilar_od, altura_pupilar_oi, formula_tipo_lente, formula_filtros, formula_observaciones';

export function useFormulaOrden(ordenId?: string | null, pacienteId?: string | null) {
  return useQuery({
    queryKey: ['formula-orden', ordenId, pacienteId],
    enabled: !!pacienteId,
    queryFn: async (): Promise<FormulaOrden> => {
      const [{ data: historias }, { data: orden }] = await Promise.all([
        supabase.from('historias_clinicas').select(COLUMNAS).eq('paciente_id', pacienteId!).order('fecha_consulta', { ascending: false }).limit(10),
        ordenId ? supabase.from('ordenes').select('observaciones').eq('id', ordenId).maybeSingle() : Promise.resolve({ data: null }),
      ]);
      const lista = (historias ?? []) as any[];
      const ids = [...new Set(lista.map((h) => h.optometra_id).filter(Boolean))];
      const { data: perfiles } = ids.length ? await supabase.from('profiles').select('user_id, nombre').in('user_id', ids) : { data: [] as any[] };
      const conNombre = lista.map((h) => ({ ...h, optometra_nombre: perfiles?.find((p: any) => p.user_id === h.optometra_id)?.nombre?.trim() ?? null })) as HistoriaFormula[];
      return elegirFormula(conNombre, ordenId, (orden as any)?.observaciones);
    },
  });
}

/** Texto corto para la etiqueta: "OD -1.25 -0.50 x180 / OI -1.00". */
export function textoEtiqueta(f: FormulaOrden): string | undefined {
  if (!f) return undefined;
  if (f.origen === 'externa') return f.texto.split('\n').find((l) => l.startsWith('OD '))?.replace(/ · DP.*$/, '');
  const h = f.historia;
  const ojo = (lado: 'OD' | 'OI', esf: any, cil: any, eje: any, add: any) =>
    `${lado} ${valorDioptria(esf)}${cil != null && Number(cil) !== 0 ? ` ${valorDioptria(cil)} x${eje ?? '—'}` : ''}${add ? ` Add ${valorDioptria(add)}` : ''}`;
  return `${ojo('OD', h.formula_od_esfera, h.formula_od_cilindro, h.formula_od_eje, h.formula_od_adicion)} / ${ojo('OI', h.formula_oi_esfera, h.formula_oi_cilindro, h.formula_oi_eje, h.formula_oi_adicion)}`;
}

export function FormulaOrdenCard({ formula, cargando }: { formula: FormulaOrden | undefined; cargando: boolean }) {
  return (
    <div className="rounded-lg border bg-muted/30 p-3 space-y-2">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
        <Eye className="h-3.5 w-3.5" />Fórmula del paciente
      </p>
      {cargando ? <p className="text-xs text-muted-foreground">Cargando…</p>
        : !formula ? <p className="text-xs text-muted-foreground">El paciente no tiene fórmula registrada (ni historia clínica ni fórmula externa).</p>
        : formula.origen === 'externa' ? <p className="text-sm whitespace-pre-line">{formula.texto}</p>
        : <TablaFormula f={formula} />}
    </div>
  );
}

function TablaFormula({ f }: { f: Extract<FormulaOrden, { historia: HistoriaFormula }> }) {
  const h = f.historia;
  const fila = (lado: string, esf: any, cil: any, eje: any, add: any, alt: any) => (
    <tr className="border-t">
      <td className="py-1 pr-2 font-semibold">{lado}</td>
      <td className="py-1 px-2 font-mono">{valorDioptria(esf)}</td>
      <td className="py-1 px-2 font-mono">{valorDioptria(cil)}</td>
      <td className="py-1 px-2 font-mono">{eje != null ? `${eje}°` : '—'}</td>
      <td className="py-1 px-2 font-mono">{add ? valorDioptria(add) : '—'}</td>
      <td className="py-1 pl-2 font-mono">{alt ?? '—'}</td>
    </tr>
  );
  return (
    <>
      <table className="w-full text-sm">
        <thead><tr className="text-xs text-muted-foreground text-left">
          <th className="font-normal pr-2" /><th className="font-normal px-2">Esfera</th><th className="font-normal px-2">Cilindro</th>
          <th className="font-normal px-2">Eje</th><th className="font-normal px-2">Adición</th><th className="font-normal pl-2">Altura</th>
        </tr></thead>
        <tbody>
          {fila('OD', h.formula_od_esfera, h.formula_od_cilindro, h.formula_od_eje, h.formula_od_adicion, h.altura_pupilar_od)}
          {fila('OI', h.formula_oi_esfera, h.formula_oi_cilindro, h.formula_oi_eje, h.formula_oi_adicion, h.altura_pupilar_oi)}
        </tbody>
      </table>
      <p className="text-xs">
        {h.distancia_pupilar != null && <><span className="text-muted-foreground">DP:</span> {h.distancia_pupilar} mm · </>}
        {h.formula_tipo_lente && <><span className="text-muted-foreground">Lente:</span> {h.formula_tipo_lente} · </>}
        {h.formula_filtros && <><span className="text-muted-foreground">Filtros:</span> {h.formula_filtros}</>}
      </p>
      {h.formula_observaciones && <p className="text-xs"><span className="text-muted-foreground">Obs.:</span> {h.formula_observaciones}</p>}
      <p className="text-[11px] text-muted-foreground">
        {f.origen === 'orden' ? 'Historia clínica de esta orden' : 'Última historia clínica del paciente'}
        {' · '}{new Date(h.fecha_consulta).toLocaleDateString('es-CO', { day: 'numeric', month: 'short', year: 'numeric' })}
        {h.optometra_nombre ? ` · ${h.optometra_nombre}` : ''}
      </p>
    </>
  );
}
