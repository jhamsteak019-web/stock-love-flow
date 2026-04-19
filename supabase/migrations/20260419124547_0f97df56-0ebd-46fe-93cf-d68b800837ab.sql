DROP POLICY IF EXISTS "Authenticated users can view discrepancies" ON public.discrepancies;
DROP POLICY IF EXISTS "Admins can view deleted discrepancies" ON public.discrepancies;
DROP POLICY IF EXISTS "Staff and admin can update discrepancies" ON public.discrepancies;
DROP POLICY IF EXISTS "Admin can delete discrepancies" ON public.discrepancies;

CREATE POLICY "Authenticated users can view active discrepancies"
ON public.discrepancies
FOR SELECT
TO authenticated
USING (
  auth.uid() IS NOT NULL
  AND deleted_at IS NULL
);

CREATE POLICY "Admins can view deleted discrepancies"
ON public.discrepancies
FOR SELECT
TO authenticated
USING (
  auth.uid() IS NOT NULL
  AND public.has_role(auth.uid(), 'admin'::public.app_role)
);

CREATE POLICY "Authorized users can update discrepancies"
ON public.discrepancies
FOR UPDATE
TO authenticated
USING (
  auth.uid() IS NOT NULL
  AND (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'staff'::public.app_role)
    OR public.has_role(auth.uid(), 'assistant'::public.app_role)
    OR public.has_role(auth.uid(), 'encoder'::public.app_role)
  )
)
WITH CHECK (
  auth.uid() IS NOT NULL
  AND (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'staff'::public.app_role)
    OR public.has_role(auth.uid(), 'assistant'::public.app_role)
    OR public.has_role(auth.uid(), 'encoder'::public.app_role)
  )
);

CREATE POLICY "Admin can delete discrepancies"
ON public.discrepancies
FOR DELETE
TO authenticated
USING (
  auth.uid() IS NOT NULL
  AND public.has_role(auth.uid(), 'admin'::public.app_role)
);