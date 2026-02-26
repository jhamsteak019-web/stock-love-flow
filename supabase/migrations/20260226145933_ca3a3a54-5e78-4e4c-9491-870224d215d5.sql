
-- Add renewal columns to employees table
ALTER TABLE public.employees 
ADD COLUMN IF NOT EXISTS last_renewal_date date DEFAULT NULL,
ADD COLUMN IF NOT EXISTS renewal_photos text[] DEFAULT '{}'::text[];

-- Create renewal-photos storage bucket
INSERT INTO storage.buckets (id, name, public) 
VALUES ('renewal-photos', 'renewal-photos', true)
ON CONFLICT (id) DO NOTHING;

-- RLS for renewal-photos bucket - allow admin, staff, hr, assistant to upload
CREATE POLICY "Admin Staff HR Assistant can upload renewal photos"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'renewal-photos' AND
  auth.uid() IS NOT NULL AND
  (
    public.has_role(auth.uid(), 'admin'::app_role) OR
    public.has_role(auth.uid(), 'staff'::app_role) OR
    public.has_role(auth.uid(), 'hr'::app_role) OR
    public.has_role(auth.uid(), 'assistant'::app_role)
  )
);

CREATE POLICY "Admin Staff HR Assistant can update renewal photos"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'renewal-photos' AND
  auth.uid() IS NOT NULL AND
  (
    public.has_role(auth.uid(), 'admin'::app_role) OR
    public.has_role(auth.uid(), 'staff'::app_role) OR
    public.has_role(auth.uid(), 'hr'::app_role) OR
    public.has_role(auth.uid(), 'assistant'::app_role)
  )
);

CREATE POLICY "Anyone can view renewal photos"
ON storage.objects FOR SELECT
USING (bucket_id = 'renewal-photos' AND auth.uid() IS NOT NULL);
