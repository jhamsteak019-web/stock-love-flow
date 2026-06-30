CREATE OR REPLACE FUNCTION public.normalize_allocation_bill_key(value text)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT regexp_replace(lower(coalesce(value, '')), '[^a-z0-9]', '', 'g');
$$;

CREATE OR REPLACE FUNCTION public.is_pending_allocation_action_status(value text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT coalesce(value, '') IN (
    'pending_allocation',
    'pending_allocation_warehouse_process',
    'pending_allocation_cancelled',
    'pending_allocation_for_delete'
  );
$$;

CREATE OR REPLACE FUNCTION public.prevent_pending_allocation_when_released_exists()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  bill_key text;
BEGIN
  bill_key := public.normalize_allocation_bill_key(NEW.allocation_bill);

  IF bill_key = '' OR NEW.deleted_at IS NOT NULL THEN
    RETURN NEW;
  END IF;

  IF public.is_pending_allocation_action_status(NEW.action_status) THEN
    IF EXISTS (
      SELECT 1
      FROM public.stock_releases existing
      WHERE existing.deleted_at IS NULL
        AND public.normalize_allocation_bill_key(existing.allocation_bill) = bill_key
        AND NOT public.is_pending_allocation_action_status(existing.action_status)
      LIMIT 1
    ) THEN
      RETURN NULL;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.clear_pending_allocations_for_released_bill()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  bill_key text;
BEGIN
  bill_key := public.normalize_allocation_bill_key(NEW.allocation_bill);

  IF bill_key = '' OR NEW.deleted_at IS NOT NULL THEN
    RETURN NEW;
  END IF;

  IF NOT public.is_pending_allocation_action_status(NEW.action_status) THEN
    UPDATE public.stock_releases pending
    SET deleted_at = now(),
        updated_at = now()
    WHERE pending.deleted_at IS NULL
      AND pending.id <> NEW.id
      AND public.is_pending_allocation_action_status(pending.action_status)
      AND public.normalize_allocation_bill_key(pending.allocation_bill) = bill_key;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_pending_allocation_when_released_exists ON public.stock_releases;
CREATE TRIGGER trg_prevent_pending_allocation_when_released_exists
BEFORE INSERT ON public.stock_releases
FOR EACH ROW
EXECUTE FUNCTION public.prevent_pending_allocation_when_released_exists();

DROP TRIGGER IF EXISTS trg_clear_pending_allocations_for_released_bill ON public.stock_releases;
CREATE TRIGGER trg_clear_pending_allocations_for_released_bill
AFTER INSERT OR UPDATE OF action_status, allocation_bill ON public.stock_releases
FOR EACH ROW
EXECUTE FUNCTION public.clear_pending_allocations_for_released_bill();

WITH active_release_bills AS (
  SELECT DISTINCT public.normalize_allocation_bill_key(allocation_bill) AS bill_key
  FROM public.stock_releases
  WHERE deleted_at IS NULL
    AND allocation_bill IS NOT NULL
    AND public.normalize_allocation_bill_key(allocation_bill) <> ''
    AND NOT public.is_pending_allocation_action_status(action_status)
),
pending_rows_to_remove AS (
  SELECT pending.id
  FROM public.stock_releases pending
  INNER JOIN active_release_bills active
    ON active.bill_key = public.normalize_allocation_bill_key(pending.allocation_bill)
  WHERE pending.deleted_at IS NULL
    AND public.is_pending_allocation_action_status(pending.action_status)
)
UPDATE public.stock_releases releases
SET deleted_at = now(),
    updated_at = now()
FROM pending_rows_to_remove duplicates
WHERE releases.id = duplicates.id;
