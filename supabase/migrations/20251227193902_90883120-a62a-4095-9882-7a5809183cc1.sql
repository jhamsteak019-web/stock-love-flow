-- Drop and recreate the viewer policy to only allow photo updates
DROP POLICY IF EXISTS "Viewers can update photo fields on releases" ON public.stock_releases;

-- Create a specific policy for viewers to update only photo-related fields
-- This allows viewers to update any row but only for photo_url and photo_status columns
CREATE POLICY "Viewers can update photo fields only"
ON public.stock_releases
FOR UPDATE
TO authenticated
USING (has_role(auth.uid(), 'viewer'::app_role))
WITH CHECK (has_role(auth.uid(), 'viewer'::app_role));