-- Add new columns to repeat_orders table
ALTER TABLE public.repeat_orders 
ADD COLUMN branch_store TEXT,
ADD COLUMN category TEXT,
ADD COLUMN date_give_store DATE,
ADD COLUMN date_give_warehouse DATE,
ADD COLUMN date_out_warehouse DATE;

-- Drop old columns that are no longer needed
ALTER TABLE public.repeat_orders 
DROP COLUMN IF EXISTS item_name,
DROP COLUMN IF EXISTS quantity,
DROP COLUMN IF EXISTS destination,
DROP COLUMN IF EXISTS notes;