ALTER TABLE public.stock_releases
ADD COLUMN IF NOT EXISTS pending_allocation_status text DEFAULT 'pending';

ALTER TABLE public.stock_releases
DROP CONSTRAINT IF EXISTS stock_releases_pending_allocation_status_check;

ALTER TABLE public.stock_releases
ADD CONSTRAINT stock_releases_pending_allocation_status_check
CHECK (
  pending_allocation_status IS NULL
  OR pending_allocation_status IN ('pending', 'warehouse_process', 'cancelled', 'for_delete')
);

UPDATE public.stock_releases
SET pending_allocation_status = 'pending'
WHERE action_status = 'pending_allocation'
  AND pending_allocation_status IS NULL;

CREATE INDEX IF NOT EXISTS stock_releases_pending_allocation_status_idx
ON public.stock_releases (branch_id, pending_allocation_status, created_at DESC)
WHERE deleted_at IS NULL
  AND action_status = 'pending_allocation';
