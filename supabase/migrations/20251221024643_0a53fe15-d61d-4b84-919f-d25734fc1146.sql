-- Add batch_id to group multiple releases into one allocation bill
ALTER TABLE public.stock_releases ADD COLUMN batch_id uuid DEFAULT gen_random_uuid();

-- Create index for faster batch lookups
CREATE INDEX idx_stock_releases_batch_id ON public.stock_releases(batch_id);