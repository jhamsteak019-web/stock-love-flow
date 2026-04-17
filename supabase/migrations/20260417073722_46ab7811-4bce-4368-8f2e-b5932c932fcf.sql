
-- 1) Add action_status to stock_releases for Yes (ok) / No (not ok)
ALTER TABLE public.stock_releases
ADD COLUMN IF NOT EXISTS action_status text;

-- 2) Create discrepancies table
CREATE TABLE IF NOT EXISTS public.discrepancies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id uuid,
  allocation_bill text,
  destination text,
  category text,
  courier text,
  waybill_no text,
  total_boxes integer,
  total_qty integer,
  amount numeric,
  date_out timestamp with time zone,
  date_received timestamp with time zone,
  remarks text,
  discrepancy_notes text,
  resolution_status text DEFAULT 'unresolved',
  branch_id uuid,
  created_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  deleted_at timestamp with time zone
);

ALTER TABLE public.discrepancies ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can view discrepancies" ON public.discrepancies;
CREATE POLICY "Authenticated users can view discrepancies"
ON public.discrepancies FOR SELECT
TO authenticated
USING (deleted_at IS NULL);

DROP POLICY IF EXISTS "Staff and admin can insert discrepancies" ON public.discrepancies;
CREATE POLICY "Staff and admin can insert discrepancies"
ON public.discrepancies FOR INSERT
TO authenticated
WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'staff'::app_role)
  OR has_role(auth.uid(), 'assistant'::app_role)
  OR has_role(auth.uid(), 'encoder'::app_role)
  OR has_role(auth.uid(), 'hr'::app_role)
);

DROP POLICY IF EXISTS "Staff and admin can update discrepancies" ON public.discrepancies;
CREATE POLICY "Staff and admin can update discrepancies"
ON public.discrepancies FOR UPDATE
TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'staff'::app_role)
  OR has_role(auth.uid(), 'assistant'::app_role)
  OR has_role(auth.uid(), 'encoder'::app_role)
)
WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'staff'::app_role)
  OR has_role(auth.uid(), 'assistant'::app_role)
  OR has_role(auth.uid(), 'encoder'::app_role)
);

DROP POLICY IF EXISTS "Admin can delete discrepancies" ON public.discrepancies;
CREATE POLICY "Admin can delete discrepancies"
ON public.discrepancies FOR DELETE
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

-- updated_at trigger
DROP TRIGGER IF EXISTS update_discrepancies_updated_at ON public.discrepancies;
CREATE TRIGGER update_discrepancies_updated_at
BEFORE UPDATE ON public.discrepancies
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- 3) Ensure damage_claims DELETE policy permits admin (re-create cleanly)
DROP POLICY IF EXISTS "Admin can delete damage claims" ON public.damage_claims;
CREATE POLICY "Admin can delete damage claims"
ON public.damage_claims FOR DELETE
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

-- Also ensure UPDATE permits admin AND assistant for soft-delete via deleted_at
DROP POLICY IF EXISTS "Admin can update damage claims" ON public.damage_claims;
CREATE POLICY "Admin can update damage claims"
ON public.damage_claims FOR UPDATE
TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'assistant'::app_role)
)
WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'assistant'::app_role)
);
