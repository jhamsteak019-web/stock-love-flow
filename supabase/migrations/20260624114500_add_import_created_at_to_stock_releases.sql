ALTER TABLE public.stock_releases
ADD COLUMN IF NOT EXISTS import_created_at text;
