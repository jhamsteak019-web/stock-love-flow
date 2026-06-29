CREATE OR REPLACE FUNCTION public.normalize_allocation_bill_key(value text)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT regexp_replace(lower(coalesce(value, '')), '[^a-z0-9]', '', 'g');
$$;

ALTER TABLE public.stock_releases
ADD COLUMN IF NOT EXISTS allocation_bill_key text
GENERATED ALWAYS AS (
  public.normalize_allocation_bill_key(allocation_bill)
) STORED;

CREATE INDEX IF NOT EXISTS stock_releases_allocation_bill_key_active_idx
ON public.stock_releases (allocation_bill_key)
WHERE deleted_at IS NULL
  AND allocation_bill_key <> '';

CREATE INDEX IF NOT EXISTS stock_releases_pending_allocation_key_active_idx
ON public.stock_releases (allocation_bill_key, created_at DESC)
WHERE deleted_at IS NULL
  AND action_status IN (
    'pending_allocation',
    'pending_allocation_warehouse_process',
    'pending_allocation_cancelled',
    'pending_allocation_for_delete'
  )
  AND allocation_bill_key <> '';
