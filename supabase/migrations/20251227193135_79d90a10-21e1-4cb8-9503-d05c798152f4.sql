-- Drop the existing viewer photo policy and recreate it properly
DROP POLICY IF EXISTS "Viewers can update photo fields on releases" ON public.stock_releases;

-- Create a proper policy that allows viewers to update photo fields
CREATE POLICY "Viewers can update photo fields on releases"
ON public.stock_releases
FOR UPDATE
TO authenticated
USING (has_role(auth.uid(), 'viewer'::app_role))
WITH CHECK (has_role(auth.uid(), 'viewer'::app_role));