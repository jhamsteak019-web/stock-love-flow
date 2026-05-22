UPDATE public.stock_releases
SET amount = unit_price,
    unit_price = NULL,
    updated_at = now()
WHERE allocation_bill = 'BILL11430217077'
  AND deleted_at IS NULL
  AND total_qty IS NOT NULL
  AND total_qty > 1
  AND unit_price IS NOT NULL
  AND amount IS NOT NULL
  AND amount > 500000
  AND abs(amount - (unit_price * total_qty)) <= greatest(0.01, abs(unit_price * total_qty) * 0.0001);
