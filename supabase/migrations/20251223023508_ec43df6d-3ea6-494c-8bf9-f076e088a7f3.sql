-- Add deleted_at column for soft delete functionality
ALTER TABLE public.stock_releases 
ADD COLUMN deleted_at timestamp with time zone DEFAULT NULL;

-- Create index for faster filtering on deleted_at
CREATE INDEX idx_stock_releases_deleted_at ON public.stock_releases(deleted_at);