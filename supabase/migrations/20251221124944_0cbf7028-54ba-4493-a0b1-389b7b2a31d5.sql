-- Add courier column to stock_releases table
ALTER TABLE public.stock_releases
ADD COLUMN courier text;