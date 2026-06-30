CREATE OR REPLACE FUNCTION public.normalize_allocation_bill_key(value text)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT regexp_replace(lower(coalesce(value, '')), '[^a-z0-9]', '', 'g');
$$;

WITH active_release_bills AS (
  SELECT DISTINCT public.normalize_allocation_bill_key(allocation_bill) AS bill_key
  FROM public.stock_releases
  WHERE deleted_at IS NULL
    AND allocation_bill IS NOT NULL
    AND public.normalize_allocation_bill_key(allocation_bill) <> ''
    AND COALESCE(action_status, '') NOT IN (
      'pending_allocation',
      'pending_allocation_warehouse_process',
      'pending_allocation_cancelled',
      'pending_allocation_for_delete'
    )
),
pending_rows_to_remove AS (
  SELECT pending.id
  FROM public.stock_releases pending
  INNER JOIN active_release_bills active
    ON active.bill_key = public.normalize_allocation_bill_key(pending.allocation_bill)
  WHERE pending.deleted_at IS NULL
    AND pending.allocation_bill IS NOT NULL
    AND pending.action_status IN (
      'pending_allocation',
      'pending_allocation_warehouse_process',
      'pending_allocation_cancelled',
      'pending_allocation_for_delete'
    )
)
UPDATE public.stock_releases releases
SET deleted_at = now(),
    updated_at = now()
FROM pending_rows_to_remove duplicates
WHERE releases.id = duplicates.id;
