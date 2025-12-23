-- Add new columns to stock_releases table
ALTER TABLE public.stock_releases 
ADD COLUMN IF NOT EXISTS category text,
ADD COLUMN IF NOT EXISTS waybill_no text,
ADD COLUMN IF NOT EXISTS set_date timestamp with time zone,
ADD COLUMN IF NOT EXISTS total_qty integer;