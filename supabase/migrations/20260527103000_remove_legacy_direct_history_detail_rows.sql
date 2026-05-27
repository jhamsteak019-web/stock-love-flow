WITH legacy_direct_history_rows AS (
  SELECT id
  FROM public.stock_releases
  WHERE item_id IS NULL
    AND action_status IS NULL
    AND (
      lower(btrim(coalesce(product_code, ''))) NOT IN ('', '-', 'n/a', 'na', 'null')
      OR lower(btrim(coalesce(product_description, ''))) NOT IN ('', '-', 'n/a', 'na', 'null')
      OR unit_price IS NOT NULL
    )
)
DELETE FROM public.stock_releases
WHERE id IN (SELECT id FROM legacy_direct_history_rows);
