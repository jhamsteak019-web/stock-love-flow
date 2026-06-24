CREATE INDEX IF NOT EXISTS stock_releases_pending_allocation_created_idx
ON public.stock_releases (created_at DESC)
WHERE deleted_at IS NULL
  AND action_status = 'pending_allocation';

CREATE INDEX IF NOT EXISTS stock_releases_pending_allocation_branch_created_idx
ON public.stock_releases (branch_id, created_at DESC)
WHERE deleted_at IS NULL
  AND action_status = 'pending_allocation';

CREATE INDEX IF NOT EXISTS stock_releases_pending_allocation_bill_idx
ON public.stock_releases (allocation_bill)
WHERE deleted_at IS NULL
  AND action_status = 'pending_allocation';
