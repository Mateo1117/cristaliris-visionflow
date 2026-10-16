/**
 * Fórmula del paciente en el detalle de la orden (pestaña Detalle), para que
 * quien envía al laboratorio o revisa la calidad la tenga a la vista.
 */
import { useQuery } from '@tanstack/react-query';
import { Eye } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { elegirFormula, etiquetaAjuste, formulaVigente, textoCorto, valorDioptria, type AjusteFormula, type Formula, type FormulasTrabajo, type HistoriaFormula } from './formulaOrden';

const COLUMNAS = 'id, orden_id, fecha_consulta, optometra_id, formula_od_esfera, formula_od_cilindro, formula_od_eje, formula_od_adicion, formula_oi_esfera, formula_oi_cilindro, formula_oi_eje, formula_oi_adicion, distancia_pupilar, altura_pupilar_od, altura_pupilar_oi, formula_tipo_lente, formula_filtros, formula_observaciones';

export function useFormulaOrden(ordenId?: string | null, pacienteId?: string | null, productoId?: string | null) {
  return useQuery({
    queryKey: ['formula-orden', ordenId, pacienteId, productoId],
    enabled: !!pacienteId,
    queryFn: async (): Promise<FormulasTrabajo> => {
      const [{ data: historias }, { data: orden }, { data: ajustes }] = await Promise.all([
        supabase.from('historias_clinicas').select(COLUMNAS).eq('paciente_id', pacienteId!).order('fecha_consulta', { ascending: false }).limit(10),
        ordenId ? supabase.from('ordenes').select('observaciones').eq('id', ordenId).maybeSingle() : Promise.resolve({ data: null }),
        productoId
          ? (supabase as any).from('formulas_ajuste').select('id, origen, referencia, formula, motivo, created_at, usuario_id').eq('orden_producto_id', productoId).order('created_at', { ascending: false })
          : Promise.resolve({ data: [] }),
      ]);
      const lista = (historias ?? []) as any[];
      const listaAjustes = (ajustes ?? []) as any[];
      const ids = [...new Set([...lista.map((h) => h.optometra_id), ...listaAjustes.map((a) => a.usuario_id)].filter(Boolean))];
      const { data: perfiles } = ids.length ? await supabase.from('profiles').select('user_id, nombre').in('user_id', ids) : { data: [] as any[] };
      const nombre = (id?: string | null) => perfiles?.find((p: any) => p.user_id === id)?.nombre?.trim() ?? null;
      const conNombre = lista.map((h) => ({ ...h, optometra_nombre: nombre(h.optometra_id) })) as HistoriaFormula[];
      return {
        original: elegirFormula(conNombre, ordenId, (orden as any)?.observaciones),
        ajustes: listaAjustes.map((a) => ({ ...a, autor: nombre(a.usuario_id) })) as AjusteFormula[],
      };
    },
  });
}

/** Texto corto de la fórmula VIGENTE para la etiqueta: "OD -1.25 -0.50 x180 / OI -1.00". */
export function textoEtiqueta(f: FormulasTrabajo | null | undefined): string | undefined {
  const vigente = formulaVigente(f);
  if (vigente) return textoCorto(vigente);
  if (f?.original?.origen === 'externa') return f.original.texto.split('\n').find((l) => l.startsWith('OD '))?.replace(/ · DP.*$/, '');
  return undefined;
}

const fechaCorta = (iso: string) => new Date(iso).toLocaleDateString('es-CO', { day: 'numeric', month: 'short', year: 'numeric' });

/**
 * Fórmulas del trabajo: la vigente arriba (resaltada si es una fórmula nueva
 * por garantía o reproceso) y debajo las anteriores, hasta la original.
 */
export function FormulaOrdenCard({ formula, cargando }: { formula: FormulasTrabajo | undefined; cargando: boolean }) {
  if (cargando) return <div className="rounded-lg border bg-muted/30 p-3 text-xs text-muted-foreground">Cargando fórmula…</div>;
  const ajustes = formula?.ajustes ?? [];
  const original = formula?.original ?? null;
  const tituloOriginal = ajustes.length ? 'Fórmula original' : 'Fórmula del paciente';
  return (
    <div className="space-y-2">
      {ajustes.map((a, i) => (
        <div key={a.id} className={`rounded-lg border p-3 space-y-2 ${i === 0 ? 'border-warning/60 bg-warning/5' : 'bg-muted/20 opacity-80'}`}>
          <p className="text-xs font-medium uppercase tracking-wide flex items-center gap-1.5">
            <Eye className="h-3.5 w-3.5" />{etiquetaAjuste(a)}
            {i === 0 ? <span className="ml-auto rounded bg-warning/20 px-1.5 py-0.5 text-[10px] normal-case">Vigente</span>
              : <span className="ml-auto text-[10px] normal-case text-muted-foreground">Reemplazada</span>}
          </p>
          <TablaFormula f={a.formula} pie={`${fechaCorta(a.created_at)}${a.autor ? ` · ${a.autor}` : ''}${a.motivo ? ` · ${a.motivo}` : ''}`} />
        </div>
      ))}
      <div className={`rounded-lg border p-3 space-y-2 ${ajustes.length ? 'bg-muted/20 opacity-80' : 'bg-muted/30'}`}>
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
          <Eye className="h-3.5 w-3.5" />{tituloOriginal}
          {ajustes.length > 0 && <span className="ml-auto text-[10px] normal-case">Reemplazada</span>}
        </p>
        {!original ? <p className="text-xs text-muted-foreground">El paciente no tiene fórmula registrada (ni historia clínica ni fórmula externa).</p>
          : original.origen === 'externa' ? <p className="text-sm whitespace-pre-line">{original.texto}</p>
          : <TablaFormula f={original.formula} pie={
            `${original.origen === 'orden' ? 'Historia clínica de esta orden' : 'Última historia clínica del paciente'} · ${fechaCorta(original.fecha)}${original.autor ? ` · ${original.autor}` : ''}`
          } />}
      </div>
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
