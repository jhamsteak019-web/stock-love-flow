WITH p_import_bills AS (
  SELECT DISTINCT bill AS allocation_bill
  FROM public.activity_logs logs
  CROSS JOIN LATERAL jsonb_array_elements_text(
    CASE
      WHEN jsonb_typeof(COALESCE(logs.metadata::jsonb, '{}'::jsonb)->'allocation_bills') = 'array'
        THEN logs.metadata::jsonb->'allocation_bills'
      ELSE '[]'::jsonb
    END
  ) AS bill
  WHERE logs.action_type = 'import'
    AND logs.module IN ('stock_releases', 'pending_allocations')
    AND logs.description ILIKE 'P Imported%'
)
UPDATE public.stock_releases releases
SET action_status = 'pending_allocation',
    updated_at = now()
FROM p_import_bills
WHERE releases.allocation_bill = p_import_bills.allocation_bill
  AND releases.deleted_at IS NULL
  AND releases.delivery_status <> 'delivered'
  AND COALESCE(releases.action_status, '') <> 'pending_allocation';
