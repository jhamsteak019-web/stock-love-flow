-- Add price column to inventory_items table
ALTER TABLE public.inventory_items 
ADD COLUMN price NUMERIC(12,2) DEFAULT 0;

-- Add amount column (calculated as price * total_stock, but we'll store it for reporting)
ALTER TABLE public.inventory_items 
ADD COLUMN amount NUMERIC(14,2) DEFAULT 0;