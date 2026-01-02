-- Add deleted_at column to containers table for soft delete
ALTER TABLE public.containers 
ADD COLUMN IF NOT EXISTS deleted_at timestamp with time zone DEFAULT NULL;

-- Add deleted_at column to collection_items table for soft delete
ALTER TABLE public.collection_items 
ADD COLUMN IF NOT EXISTS deleted_at timestamp with time zone DEFAULT NULL;

-- Add deleted_at column to notes table for soft delete
ALTER TABLE public.notes 
ADD COLUMN IF NOT EXISTS deleted_at timestamp with time zone DEFAULT NULL;

-- Create index for faster querying of non-deleted items
CREATE INDEX IF NOT EXISTS idx_containers_deleted_at ON public.containers(deleted_at);
CREATE INDEX IF NOT EXISTS idx_collection_items_deleted_at ON public.collection_items(deleted_at);
CREATE INDEX IF NOT EXISTS idx_notes_deleted_at ON public.notes(deleted_at);