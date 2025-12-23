-- Modify the foreign key constraint on stock_releases to SET NULL instead of cascade delete
-- This prevents stock releases from being deleted when inventory items are cleared

-- First drop the existing foreign key constraint
ALTER TABLE public.stock_releases DROP CONSTRAINT IF EXISTS stock_releases_item_id_fkey;

-- Make item_id nullable
ALTER TABLE public.stock_releases ALTER COLUMN item_id DROP NOT NULL;

-- Re-add the foreign key with ON DELETE SET NULL
ALTER TABLE public.stock_releases 
ADD CONSTRAINT stock_releases_item_id_fkey 
FOREIGN KEY (item_id) REFERENCES public.inventory_items(id) ON DELETE SET NULL;