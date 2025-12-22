-- Add pieces_per_box column to inventory_items
ALTER TABLE public.inventory_items 
ADD COLUMN pieces_per_box integer NOT NULL DEFAULT 1;

-- Add a comment explaining the column
COMMENT ON COLUMN public.inventory_items.pieces_per_box IS 'Number of pieces per box (e.g., 1 box = 20 pieces)';