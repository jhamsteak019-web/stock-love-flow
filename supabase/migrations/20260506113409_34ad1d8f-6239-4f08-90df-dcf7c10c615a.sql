ALTER TABLE public.stock_releases
  ADD COLUMN IF NOT EXISTS product_code text,
  ADD COLUMN IF NOT EXISTS product_description text,
  ADD COLUMN IF NOT EXISTS unit_price numeric(12,2);