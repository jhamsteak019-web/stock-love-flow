ALTER TABLE public.stock_releases
  ADD COLUMN IF NOT EXISTS allocation_bill_key text,
  ADD COLUMN IF NOT EXISTS pending_allocation_status text;