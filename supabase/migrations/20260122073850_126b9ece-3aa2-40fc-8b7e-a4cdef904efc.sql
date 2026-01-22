-- Add amount column to stock_releases table
ALTER TABLE public.stock_releases 
ADD COLUMN amount NUMERIC(12, 2) DEFAULT NULL;