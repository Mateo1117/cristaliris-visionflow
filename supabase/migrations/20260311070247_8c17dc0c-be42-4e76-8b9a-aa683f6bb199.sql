
-- Inventory movements history table
CREATE TABLE public.movimientos_inventario (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  inventario_id UUID NOT NULL REFERENCES public.inventario(id) ON DELETE CASCADE,
  tipo_movimiento TEXT NOT NULL CHECK (tipo_movimiento IN ('entrada', 'salida', 'ajuste')),
  cantidad INTEGER NOT NULL,
  cantidad_anterior INTEGER NOT NULL,
  cantidad_nueva INTEGER NOT NULL,
  motivo TEXT,
  orden_producto_id UUID REFERENCES public.orden_productos(id),
  usuario_id UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.movimientos_inventario ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Movimientos viewable" ON public.movimientos_inventario FOR SELECT TO authenticated USING (true);
CREATE POLICY "Insert movimientos" ON public.movimientos_inventario FOR INSERT TO authenticated WITH CHECK (true);
