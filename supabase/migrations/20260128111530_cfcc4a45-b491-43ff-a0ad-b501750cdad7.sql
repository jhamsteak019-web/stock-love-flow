-- Add UPDATE policy for HR role on stock_releases
CREATE POLICY "HR can update stock releases" 
ON public.stock_releases 
FOR UPDATE 
TO authenticated
USING (public.has_role(auth.uid(), 'hr'::public.app_role))
WITH CHECK (public.has_role(auth.uid(), 'hr'::public.app_role));

-- Update Staff policy to allow updating any release (not just their own)
DROP POLICY IF EXISTS "Staff can update their own releases" ON public.stock_releases;

CREATE POLICY "Staff can update stock releases" 
ON public.stock_releases 
FOR UPDATE 
TO authenticated
USING (public.has_role(auth.uid(), 'staff'::public.app_role))
WITH CHECK (public.has_role(auth.uid(), 'staff'::public.app_role));