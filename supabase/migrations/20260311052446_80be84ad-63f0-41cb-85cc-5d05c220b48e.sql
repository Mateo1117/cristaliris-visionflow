
INSERT INTO storage.buckets (id, name, public) VALUES ('orden-fotos', 'orden-fotos', true);

CREATE POLICY "Authenticated can upload order photos"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'orden-fotos');

CREATE POLICY "Public can view order photos"
ON storage.objects FOR SELECT
USING (bucket_id = 'orden-fotos');

CREATE POLICY "Authenticated can delete order photos"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'orden-fotos');
