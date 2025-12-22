-- Add pieces_per_box column to imported_items
ALTER TABLE public.imported_items 
ADD COLUMN pieces_per_box integer NOT NULL DEFAULT 1;