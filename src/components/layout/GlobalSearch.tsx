import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Search, Users, ClipboardList, Package } from 'lucide-react';

interface SearchResult {
  id: string;
  type: 'paciente' | 'orden' | 'inventario';
  title: string;
  subtitle: string;
}

/**
 * Sanea el término antes de interpolarlo en un filtro de PostgREST.
 *
 * En `or(col.ilike.%texto%,otra.ilike.%texto%)` la coma separa condiciones y
 * los paréntesis agrupan: si el usuario escribe `,`, `(`, `)`, `"` o `\` el
 * filtro deja de parsearse y la búsqueda devuelve error (antes fallaba en
 * silencio y no aparecía ningún resultado). Los caracteres estructurales se
 * cambian por espacio y se colapsan los espacios repetidos.
 */
const sanitizarTermino = (texto: string): string =>
  texto.replace(/[,()"\\]/g, ' ').replace(/\s+/g, ' ').trim();

export function GlobalSearch() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  // Keyboard shortcut
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') { e.preventDefault(); setOpen(true); }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, []);

  const termino = sanitizarTermino(query);

  useEffect(() => {
    if (termino.length < 2) { setResults([]); return; }
    const timeout = setTimeout(async () => {
      setLoading(true);
      try {
        const all: SearchResult[] = [];

        // Search pacientes
        const { data: pacientes } = await supabase.from('pacientes')
          .select('id, nombres, apellidos, numero_documento')
          .or(`nombres.ilike.%${termino}%,apellidos.ilike.%${termino}%,numero_documento.ilike.%${termino}%`)
          .limit(5);
        (pacientes || []).forEach(p => all.push({
          id: p.id, type: 'paciente',
          title: `${p.nombres} ${p.apellidos}`,
          subtitle: p.numero_documento,
        }));

        // Search orden_productos
        const { data: productos } = await supabase.from('orden_productos')
          .select('id, descripcion, ordenes(pacientes(nombres, apellidos))')
          .ilike('descripcion', `%${termino}%`)
          .limit(5);
        (productos || []).forEach((p: any) => all.push({
          id: p.id, type: 'orden',
          title: p.descripcion,
          subtitle: `${p.ordenes?.pacientes?.nombres || ''} ${p.ordenes?.pacientes?.apellidos || ''}`.trim(),
        }));

        // Search inventario
        const { data: inv } = await supabase.from('inventario')
          .select('id, marca, modelo, codigo_referencia, tipo')
          .or(`marca.ilike.%${termino}%,modelo.ilike.%${termino}%,codigo_referencia.ilike.%${termino}%`)
          .limit(5);
        (inv || []).forEach(i => all.push({
          id: i.id, type: 'inventario',
          title: `${i.marca || ''} ${i.modelo || ''}`.trim() || i.codigo_referencia || 'Sin nombre',
          subtitle: `${i.tipo} — ${i.codigo_referencia || ''}`,
        }));

        setResults(all);
      } catch { /* ignore */ }
      setLoading(false);
    }, 300);
    return () => clearTimeout(timeout);
  }, [termino]);

  /**
   * Navega a la página del resultado llevando el contexto en la URL.
   *
   * Se envían dos parámetros: `id` (registro exacto) y `q` (término de
   * búsqueda). NOTA: hoy ninguna de las páginas destino (Pacientes, Órdenes,
   * Inventario) lee `useSearchParams`, así que todavía no preseleccionan ni
   * resaltan el registro; en cuanto lo hagan, el contexto ya viaja en la URL y
   * `q` sirve además como filtro de texto de respaldo.
   */
  const handleSelect = (r: SearchResult) => {
    setOpen(false);
    const params = new URLSearchParams({ id: r.id });
    if (termino) params.set('q', termino);
    setQuery('');
    const ruta = r.type === 'paciente' ? '/pacientes' : r.type === 'orden' ? '/ordenes' : '/inventario';
    navigate(`${ruta}?${params.toString()}`);
  };

  const typeIcon: Record<string, any> = {
    paciente: <Users className="h-4 w-4 text-primary" />,
    orden: <ClipboardList className="h-4 w-4 text-accent" />,
    inventario: <Package className="h-4 w-4 text-secondary" />,
  };

  const typeLabel: Record<string, string> = {
    paciente: 'Paciente', orden: 'Orden', inventario: 'Inventario',
  };

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 px-3 py-1.5 rounded-md border bg-background text-sm text-muted-foreground hover:bg-muted transition-colors"
      >
        <Search className="h-3.5 w-3.5" />
        <span className="hidden sm:inline">Buscar...</span>
        <kbd className="hidden sm:inline-flex h-5 items-center gap-1 rounded border px-1.5 text-[10px] text-muted-foreground">⌘K</kbd>
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md p-0 gap-0 overflow-hidden">
          <div className="flex items-center border-b px-3">
            <Search className="h-4 w-4 text-muted-foreground mr-2 shrink-0" />
            <Input
              placeholder="Buscar pacientes, órdenes, inventario..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="border-0 focus-visible:ring-0 h-12"
              autoFocus
            />
          </div>
          <div className="max-h-[300px] overflow-y-auto">
            {loading && <p className="p-4 text-sm text-muted-foreground text-center">Buscando...</p>}
            {!loading && termino.length >= 2 && results.length === 0 && (
              <p className="p-4 text-sm text-muted-foreground text-center">Sin resultados para "{termino}"</p>
            )}
            {results.map((r) => (
              <button
                key={`${r.type}-${r.id}`}
                onClick={() => handleSelect(r)}
                className="flex items-center gap-3 w-full px-4 py-3 hover:bg-muted transition-colors text-left"
              >
                {typeIcon[r.type]}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{r.title}</p>
                  <p className="text-xs text-muted-foreground truncate">{r.subtitle}</p>
                </div>
                <Badge variant="outline" className="text-[10px] shrink-0">{typeLabel[r.type]}</Badge>
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
