CREATE INDEX IF NOT EXISTS idx_stock_releases_active_branch_status_created
ON public.stock_releases (branch_id, action_status, delivery_status, created_at DESC)
WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_stock_releases_pending_delivery_branch_created
ON public.stock_releases (branch_id, created_at DESC)
WHERE deleted_at IS NULL AND action_status = 'yes' AND delivery_status <> 'delivered';

CREATE INDEX IF NOT EXISTS idx_stock_releases_active_branch_set_date
ON public.stock_releases (branch_id, set_date, created_at DESC)
WHERE deleted_at IS NULL AND set_date IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_stock_releases_active_branch_date_released
ON public.stock_releases (branch_id, date_released, created_at DESC)
WHERE deleted_at IS NULL AND set_date IS NULL;

CREATE INDEX IF NOT EXISTS idx_stock_releases_pending_review_branch_created
ON public.stock_releases (branch_id, created_at DESC)
WHERE deleted_at IS NULL AND action_status IS NULL;

CREATE INDEX IF NOT EXISTS idx_stock_releases_active_status_created
ON public.stock_releases (action_status, delivery_status, created_at DESC)
WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_stock_releases_active_set_date
ON public.stock_releases (set_date, created_at DESC)
WHERE deleted_at IS NULL AND set_date IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_stock_releases_active_date_released
ON public.stock_releases (date_released, created_at DESC)
WHERE deleted_at IS NULL AND set_date IS NULL;
