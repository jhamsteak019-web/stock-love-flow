-- Add favorite_remarks column to collection_items table
ALTER TABLE public.collection_items 
ADD COLUMN favorite_remarks text DEFAULT NULL;