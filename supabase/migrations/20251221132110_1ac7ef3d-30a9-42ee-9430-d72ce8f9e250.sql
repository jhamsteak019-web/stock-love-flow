-- Add allocation_bill column to stock_releases table
ALTER TABLE public.stock_releases 
ADD COLUMN allocation_bill text;