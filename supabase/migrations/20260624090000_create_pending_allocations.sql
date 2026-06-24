CREATE TABLE IF NOT EXISTS public.pending_allocations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  batch_id UUID NOT NULL DEFAULT gen_random_uuid(),
  allocation_bill TEXT,
  destination TEXT NOT NULL,
  category TEXT,
  boxes INTEGER NOT NULL DEFAULT 1,
  amount NUMERIC,
  total_qty INTEGER,
  remarks TEXT,
  set_date TIMESTAMP WITH TIME ZONE,
  courier TEXT,
  product_code TEXT,
  product_description TEXT,
  unit_price NUMERIC,
  status TEXT NOT NULL DEFAULT 'pending',
  source_file TEXT,
  branch_id UUID REFERENCES public.branches(id) ON DELETE SET NULL,
  imported_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  deleted_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.pending_allocations ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_pending_allocations_active_branch_created
ON public.pending_allocations (branch_id, created_at DESC)
WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_pending_allocations_allocation_bill
ON public.pending_allocations (allocation_bill)
WHERE deleted_at IS NULL;

DROP TRIGGER IF EXISTS update_pending_allocations_updated_at ON public.pending_allocations;
CREATE TRIGGER update_pending_allocations_updated_at
BEFORE UPDATE ON public.pending_allocations
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

DROP POLICY IF EXISTS "Authenticated users can view pending allocations" ON public.pending_allocations;
CREATE POLICY "Authenticated users can view pending allocations"
ON public.pending_allocations
FOR SELECT
TO authenticated
USING (true);

DROP POLICY IF EXISTS "Authenticated users can create pending allocations" ON public.pending_allocations;
CREATE POLICY "Authenticated users can create pending allocations"
ON public.pending_allocations
FOR INSERT
TO authenticated
WITH CHECK (imported_by = auth.uid());

DROP POLICY IF EXISTS "Users can update pending allocations" ON public.pending_allocations;
CREATE POLICY "Users can update pending allocations"
ON public.pending_allocations
FOR UPDATE
TO authenticated
USING (imported_by = auth.uid() OR public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'assistant'))
WITH CHECK (imported_by = auth.uid() OR public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'assistant'));

DROP POLICY IF EXISTS "Admins can delete pending allocations" ON public.pending_allocations;
CREATE POLICY "Admins can delete pending allocations"
ON public.pending_allocations
FOR DELETE
TO authenticated
USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'assistant'));
