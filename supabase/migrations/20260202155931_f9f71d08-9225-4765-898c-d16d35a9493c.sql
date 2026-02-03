-- =============================================
-- SECURITY FIX: Make all storage buckets private
-- =============================================

UPDATE storage.buckets 
SET public = false 
WHERE id IN (
  'collection-photos', 'container-photos', 'repeat-order-photos',
  'employee-photos', 'chat-attachments', 'med-cert-photos',
  'delivery-photos', 'resume-letters', 'allocation-bills'
);

-- =============================================
-- SECURITY FIX: store_access_tokens - Admin only access
-- =============================================

-- Drop the overly permissive policy
DROP POLICY IF EXISTS "Staff can view store tokens" ON public.store_access_tokens;

-- Create admin-only view policy
CREATE POLICY "Admin only can view store tokens"
ON public.store_access_tokens FOR SELECT
USING (has_role(auth.uid(), 'admin'::app_role));

-- =============================================
-- SECURITY FIX: Rotate all exposed tokens
-- =============================================

UPDATE public.store_access_tokens
SET access_token = encode(extensions.gen_random_bytes(32), 'hex'),
    updated_at = now();

-- =============================================
-- SECURITY FIX: sales table - restrict to authorized roles
-- =============================================

DROP POLICY IF EXISTS "Staff can view sales" ON public.sales;

CREATE POLICY "Authorized users can view sales"
ON public.sales FOR SELECT
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'teamleader'::app_role)
  OR has_role(auth.uid(), 'staff'::app_role)
);