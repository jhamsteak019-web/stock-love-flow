-- Backfill: mark all existing stock_releases as confirmed (action_status='yes')
-- so they continue to appear in Deliveries after we change the gating logic.
UPDATE public.stock_releases
SET action_status = 'yes'
WHERE action_status IS NULL AND deleted_at IS NULL;