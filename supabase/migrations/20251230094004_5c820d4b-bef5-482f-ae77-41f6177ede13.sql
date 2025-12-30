-- Add is_favorite column to collection_items table
ALTER TABLE public.collection_items 
ADD COLUMN is_favorite boolean NOT NULL DEFAULT false;

-- Create index for faster favorite queries
CREATE INDEX idx_collection_items_favorite ON public.collection_items(is_favorite) WHERE is_favorite = true;