-- Add columns for letter photos and resume letter photos (up to 3 each)
ALTER TABLE public.attendance_records 
ADD COLUMN IF NOT EXISTS letter_photos text[] DEFAULT '{}',
ADD COLUMN IF NOT EXISTS resume_letter_photos text[] DEFAULT '{}';

-- Create storage bucket for resume-to-work photos
INSERT INTO storage.buckets (id, name, public)
VALUES ('resume-letters', 'resume-letters', true)
ON CONFLICT (id) DO NOTHING;

-- Storage policies for resume-letters bucket
CREATE POLICY "Authenticated users can view resume letter photos"
ON storage.objects FOR SELECT
USING (bucket_id = 'resume-letters' AND auth.uid() IS NOT NULL);

CREATE POLICY "Staff and admin can upload resume letter photos"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'resume-letters' 
  AND auth.uid() IS NOT NULL 
  AND (
    has_role(auth.uid(), 'admin'::app_role) 
    OR has_role(auth.uid(), 'staff'::app_role)
  )
);

CREATE POLICY "Staff and admin can update resume letter photos"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'resume-letters' 
  AND auth.uid() IS NOT NULL 
  AND (
    has_role(auth.uid(), 'admin'::app_role) 
    OR has_role(auth.uid(), 'staff'::app_role)
  )
);

CREATE POLICY "Admin can delete resume letter photos"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'resume-letters' 
  AND auth.uid() IS NOT NULL 
  AND has_role(auth.uid(), 'admin'::app_role)
);