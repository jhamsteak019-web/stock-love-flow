-- Add status column to containers table
ALTER TABLE public.containers 
ADD COLUMN status text DEFAULT 'pending';

-- Add comment for documentation
COMMENT ON COLUMN public.containers.status IS 'Status of the container: pending, in_transit, delivered, etc.';