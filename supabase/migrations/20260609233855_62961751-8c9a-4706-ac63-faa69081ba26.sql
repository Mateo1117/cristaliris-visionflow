ALTER TABLE public.print_settings
  ADD COLUMN IF NOT EXISTS receipt_rotate_content boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS label_rotate_content boolean NOT NULL DEFAULT false;