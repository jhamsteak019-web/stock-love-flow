-- Add photo columns to stock_releases
ALTER TABLE public.stock_releases 
ADD COLUMN IF NOT EXISTS photo_url TEXT,
ADD COLUMN IF NOT EXISTS photo_status TEXT DEFAULT 'no_photo' CHECK (photo_status IN ('no_photo', 'pending_approval', 'approved', 'rejected'));

-- Create store access tokens table for OIC portal access
CREATE TABLE IF NOT EXISTS public.store_access_tokens (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  store_name TEXT NOT NULL UNIQUE,
  access_token TEXT NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(32), 'hex'),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  is_active BOOLEAN NOT NULL DEFAULT true
);

-- Enable RLS on store_access_tokens
ALTER TABLE public.store_access_tokens ENABLE ROW LEVEL SECURITY;

-- Admins can manage store access tokens
CREATE POLICY "Admins can manage store tokens"
ON public.store_access_tokens
FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role));

-- Staff can view store tokens
CREATE POLICY "Staff can view store tokens"
ON public.store_access_tokens
FOR SELECT
USING (true);

-- Create storage bucket for allocation bill photos
INSERT INTO storage.buckets (id, name, public) 
VALUES ('allocation-bills', 'allocation-bills', true)
ON CONFLICT (id) DO NOTHING;

-- Storage policies for allocation bills bucket
CREATE POLICY "Anyone can upload allocation bills"
ON storage.objects
FOR INSERT
WITH CHECK (bucket_id = 'allocation-bills');

CREATE POLICY "Anyone can view allocation bills"
ON storage.objects
FOR SELECT
USING (bucket_id = 'allocation-bills');

CREATE POLICY "Authenticated users can update allocation bills"
ON storage.objects
FOR UPDATE
USING (bucket_id = 'allocation-bills' AND auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can delete allocation bills"
ON storage.objects
FOR DELETE
USING (bucket_id = 'allocation-bills' AND auth.role() = 'authenticated');