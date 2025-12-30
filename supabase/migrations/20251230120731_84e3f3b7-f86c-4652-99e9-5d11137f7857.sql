-- Update the RLS policy for stock_releases to allow uploaders to update photo fields
DROP POLICY IF EXISTS "Uploaders can update photo fields only" ON public.stock_releases;

CREATE POLICY "Uploaders can update photo fields only"
ON public.stock_releases
FOR UPDATE
USING (has_role(auth.uid(), 'uploader'::app_role))
WITH CHECK (has_role(auth.uid(), 'uploader'::app_role));