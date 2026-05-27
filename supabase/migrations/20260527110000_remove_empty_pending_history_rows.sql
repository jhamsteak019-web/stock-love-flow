DELETE FROM public.stock_releases
WHERE item_id IS NULL
  AND action_status IS NULL
  AND coalesce(boxes_released, 0) = 0
  AND coalesce(total_qty, 0) = 0
  AND coalesce(amount, 0) = 0
  AND lower(btrim(coalesce(product_code, ''))) IN ('', '-', 'n/a', 'na', 'null')
  AND lower(btrim(coalesce(product_description, ''))) IN ('', '-', 'n/a', 'na', 'null')
  AND unit_price IS NULL;
