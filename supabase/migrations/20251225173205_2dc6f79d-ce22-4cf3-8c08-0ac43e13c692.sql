-- Add new columns for sales plan and comparison data
ALTER TABLE public.sales 
ADD COLUMN IF NOT EXISTS running_sale numeric DEFAULT 0,
ADD COLUMN IF NOT EXISTS sales_plan numeric DEFAULT 0,
ADD COLUMN IF NOT EXISTS dec_2024 numeric DEFAULT 0;