-- Add photo_url column to repeat_orders table
ALTER TABLE public.repeat_orders 
ADD COLUMN photo_url TEXT;

-- Create storage bucket for repeat order photos
INSERT INTO storage.buckets (id, name, public)
VALUES ('repeat-order-photos', 'repeat-order-photos', true)
ON CONFLICT (id) DO NOTHING;

-- Create storage policies for repeat order photos
CREATE POLICY "Anyone can view repeat order photos"
ON storage.objects FOR SELECT
USING (bucket_id = 'repeat-order-photos');

CREATE POLICY "Authenticated users can upload repeat order photos"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'repeat-order-photos' AND auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can update their uploads"
ON storage.objects FOR UPDATE
USING (bucket_id = 'repeat-order-photos' AND auth.uid() IS NOT NULL);

CREATE POLICY "Admins can delete repeat order photos"
ON storage.objects FOR DELETE
USING (bucket_id = 'repeat-order-photos' AND EXISTS (
  SELECT 1 FROM public.user_roles 
  WHERE user_id = auth.uid() AND role = 'admin'
));