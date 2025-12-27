-- Update the staff policy to also allow photo updates by all authenticated users
DROP POLICY IF EXISTS "Staff can update delivery status on their releases" ON public.stock_releases;

-- Recreate staff policy for their own releases
CREATE POLICY "Staff can update their own releases"
ON public.stock_releases
FOR UPDATE
TO authenticated
USING (released_by = auth.uid())
WITH CHECK (released_by = auth.uid());

-- Ensure admins can update all
DROP POLICY IF EXISTS "Admins can manage all releases" ON public.stock_releases;
CREATE POLICY "Admins can manage all releases"
ON public.stock_releases
FOR ALL
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Ensure viewer photo policy exists and works
DROP POLICY IF EXISTS "Viewers can update photo fields on releases" ON public.stock_releases;
CREATE POLICY "Viewers can update photo fields on releases"
ON public.stock_releases
FOR UPDATE
TO authenticated
USING (has_role(auth.uid(), 'viewer'::app_role))
WITH CHECK (has_role(auth.uid(), 'viewer'::app_role));