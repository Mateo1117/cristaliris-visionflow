
CREATE TABLE public.print_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  singleton boolean NOT NULL DEFAULT true UNIQUE,
  receipt_width_mm numeric NOT NULL DEFAULT 30,
  receipt_height_mm numeric NOT NULL DEFAULT 50,
  receipt_orientation text NOT NULL DEFAULT 'portrait',
  label_width_mm numeric NOT NULL DEFAULT 60,
  label_height_mm numeric NOT NULL DEFAULT 40,
  label_orientation text NOT NULL DEFAULT 'landscape',
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT print_settings_receipt_orientation_chk CHECK (receipt_orientation IN ('portrait','landscape')),
  CONSTRAINT print_settings_label_orientation_chk   CHECK (label_orientation   IN ('portrait','landscape'))
);

GRANT SELECT, INSERT, UPDATE ON public.print_settings TO authenticated;
GRANT ALL ON public.print_settings TO service_role;

ALTER TABLE public.print_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read print settings"
  ON public.print_settings FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins can insert print settings"
  ON public.print_settings FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update print settings"
  ON public.print_settings FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER trg_print_settings_updated_at
  BEFORE UPDATE ON public.print_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.print_settings (singleton) VALUES (true)
ON CONFLICT (singleton) DO NOTHING;
