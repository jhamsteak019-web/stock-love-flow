WITH pending_rows AS (
  SELECT
    id,
    COALESCE(batch_id::text, id::text) AS batch_key,
    regexp_replace(lower(trim(allocation_bill)), '[^a-z0-9]', '', 'g') AS bill_key,
    created_at
  FROM public.stock_releases
  WHERE deleted_at IS NULL
    AND action_status = 'pending_allocation'
    AND allocation_bill IS NOT NULL
    AND trim(allocation_bill) <> ''
),
batch_groups AS (
  SELECT
    bill_key,
    batch_key,
    min(created_at) AS first_created_at,
    array_agg(id) AS release_ids
  FROM pending_rows
  WHERE bill_key <> ''
  GROUP BY bill_key, batch_key
),
ranked_batches AS (
  SELECT
    *,
    row_number() OVER (PARTITION BY bill_key ORDER BY first_created_at ASC, batch_key ASC) AS batch_rank
  FROM batch_groups
),
duplicate_release_ids AS (
  SELECT unnest(release_ids) AS id
  FROM ranked_batches
  WHERE batch_rank > 1
)
UPDATE public.stock_releases releases
SET deleted_at = now(),
    updated_at = now()
FROM duplicate_release_ids duplicates
WHERE releases.id = duplicates.id;
