ALTER TABLE public.print_settings
  ADD COLUMN IF NOT EXISTS label_layout jsonb;