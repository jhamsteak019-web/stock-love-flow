-- Drop existing UPDATE policy and recreate with explicit soft-delete support
DROP POLICY IF EXISTS "Admin can update damage claims" ON public.damage_claims;

CREATE POLICY "Admin and assistant can update damage claims"
ON public.damage_claims
FOR UPDATE
TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role) 
  OR has_role(auth.uid(), 'assistant'::app_role)
)
WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role) 
  OR has_role(auth.uid(), 'assistant'::app_role)
);

-- Also allow viewing soft-deleted rows briefly is not needed; SELECT already filters deleted_at IS NULL.
-- Ensure DELETE policy exists for admins (hard delete fallback)
DROP POLICY IF EXISTS "Admin can delete damage claims" ON public.damage_claims;
CREATE POLICY "Admin can delete damage claims"
ON public.damage_claims
FOR DELETE
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));