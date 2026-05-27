WITH direct_history_imports AS (
  SELECT id
  FROM public.stock_releases
  WHERE item_id IS NULL
    AND product_code IS NOT NULL
    AND lower(btrim(product_code)) NOT IN ('', '-', 'n/a', 'na', 'null')
)
DELETE FROM public.stock_releases
WHERE id IN (SELECT id FROM direct_history_imports);

DELETE FROM public.activity_logs
WHERE module = 'stock_releases'
  AND action_type = 'import'
  AND description ILIKE '%directly to History%';
