UPDATE public.stock_releases
SET amount = unit_price,
    unit_price = NULL,
    updated_at = now()
WHERE deleted_at IS NULL
  AND item_id IS NULL
  AND (product_code IS NULL OR btrim(product_code) = '' OR btrim(product_code) = '-')
  AND total_qty IS NOT NULL
  AND total_qty > 1
  AND unit_price IS NOT NULL
  AND unit_price > 0
  AND amount IS NOT NULL
  AND amount > unit_price
  AND abs(amount - (unit_price * total_qty)) <= greatest(0.01, abs(unit_price * total_qty) * 0.0001);
