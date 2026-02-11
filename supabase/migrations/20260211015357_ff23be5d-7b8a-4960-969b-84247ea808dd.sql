
-- Add public SELECT policies for the newly public buckets
CREATE POLICY "Public read access for container-photos"
ON storage.objects FOR SELECT
USING (bucket_id = 'container-photos');

CREATE POLICY "Public read access for repeat-order-photos"
ON storage.objects FOR SELECT
USING (bucket_id = 'repeat-order-photos');

CREATE POLICY "Public read access for resume-letters"
ON storage.objects FOR SELECT
USING (bucket_id = 'resume-letters');

CREATE POLICY "Public read access for med-cert-photos"
ON storage.objects FOR SELECT
USING (bucket_id = 'med-cert-photos');
