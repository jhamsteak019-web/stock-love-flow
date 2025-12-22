-- Add new columns to inventory_items for the new format
ALTER TABLE public.inventory_items 
ADD COLUMN IF NOT EXISTS year text,
ADD COLUMN IF NOT EXISTS upc text,
ADD COLUMN IF NOT EXISTS description text,
ADD COLUMN IF NOT EXISTS branch text,
ADD COLUMN IF NOT EXISTS restock_location text;