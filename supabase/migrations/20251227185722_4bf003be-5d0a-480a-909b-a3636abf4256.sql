-- Update RLS policies for stock_releases to allow viewers to update photo-related fields only
CREATE POLICY "Viewers can update photo fields on releases"
ON public.stock_releases
FOR UPDATE
USING (has_role(auth.uid(), 'viewer'::app_role))
WITH CHECK (has_role(auth.uid(), 'viewer'::app_role));