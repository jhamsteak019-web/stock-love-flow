UPDATE public.stock_releases
SET destination = 'SM Tarlac',
    updated_at = now()
WHERE allocation_bill = 'BILL11430217090'
  AND destination = 'SM Lucena'
  AND deleted_at IS NULL;
