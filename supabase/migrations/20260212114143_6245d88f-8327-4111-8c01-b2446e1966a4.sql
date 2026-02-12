
-- Fix resume-letters INSERT policy to include assistant
DROP POLICY "Admin Staff and HR can upload resume letter photos" ON storage.objects;
CREATE POLICY "Admin Staff HR Assistant can upload resume letter photos"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'resume-letters'
  AND auth.uid() IS NOT NULL
  AND (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'staff'::app_role)
    OR has_role(auth.uid(), 'hr'::app_role)
    OR has_role(auth.uid(), 'assistant'::app_role)
  )
);

-- Fix resume-letters UPDATE policy to include assistant
DROP POLICY "Admin Staff and HR can update resume letter photos" ON storage.objects;
CREATE POLICY "Admin Staff HR Assistant can update resume letter photos"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'resume-letters'
  AND auth.uid() IS NOT NULL
  AND (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'staff'::app_role)
    OR has_role(auth.uid(), 'hr'::app_role)
    OR has_role(auth.uid(), 'assistant'::app_role)
  )
);

-- Fix med-cert-photos INSERT policy to include assistant
DROP POLICY "Admin Staff and HR can upload med cert photos" ON storage.objects;
CREATE POLICY "Admin Staff HR Assistant can upload med cert photos"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'med-cert-photos'
  AND (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'staff'::app_role)
    OR has_role(auth.uid(), 'hr'::app_role)
    OR has_role(auth.uid(), 'uploader'::app_role)
    OR has_role(auth.uid(), 'assistant'::app_role)
  )
);

-- Fix med-cert-photos UPDATE policy to include assistant
DROP POLICY "Admin Staff and HR can update med cert photos" ON storage.objects;
CREATE POLICY "Admin Staff HR Assistant can update med cert photos"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'med-cert-photos'
  AND (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'staff'::app_role)
    OR has_role(auth.uid(), 'hr'::app_role)
    OR has_role(auth.uid(), 'uploader'::app_role)
    OR has_role(auth.uid(), 'assistant'::app_role)
  )
);
