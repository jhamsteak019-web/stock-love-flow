-- Add med_cert_photos column to attendance_records table
ALTER TABLE public.attendance_records
ADD COLUMN IF NOT EXISTS med_cert_photos text[] DEFAULT '{}'::text[];

-- Create storage bucket for med cert photos (if not exists)
INSERT INTO storage.buckets (id, name, public)
VALUES ('med-cert-photos', 'med-cert-photos', true)
ON CONFLICT (id) DO NOTHING;

-- Storage policies for med-cert-photos bucket
CREATE POLICY "Anyone can view med cert photos"
ON storage.objects FOR SELECT
USING (bucket_id = 'med-cert-photos');

CREATE POLICY "Admin Staff and HR can upload med cert photos"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'med-cert-photos' AND
  (
    public.has_role(auth.uid(), 'admin'::public.app_role) OR
    public.has_role(auth.uid(), 'staff'::public.app_role) OR
    public.has_role(auth.uid(), 'hr'::public.app_role) OR
    public.has_role(auth.uid(), 'uploader'::public.app_role)
  )
);

CREATE POLICY "Admin Staff and HR can update med cert photos"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'med-cert-photos' AND
  (
    public.has_role(auth.uid(), 'admin'::public.app_role) OR
    public.has_role(auth.uid(), 'staff'::public.app_role) OR
    public.has_role(auth.uid(), 'hr'::public.app_role) OR
    public.has_role(auth.uid(), 'uploader'::public.app_role)
  )
);

CREATE POLICY "Admin can delete med cert photos"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'med-cert-photos' AND
  public.has_role(auth.uid(), 'admin'::public.app_role)
);