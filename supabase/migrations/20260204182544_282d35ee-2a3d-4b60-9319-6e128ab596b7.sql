-- Update storage policies for employee-photos bucket to include 'assistant' role

-- Drop existing policies
DROP POLICY IF EXISTS "Admin Staff and HR can upload employee photos" ON storage.objects;
DROP POLICY IF EXISTS "Admin Staff and HR can update employee photos" ON storage.objects;

-- Create updated policies with 'assistant' role included
CREATE POLICY "Admin Staff HR and Assistant can upload employee photos"
ON storage.objects
FOR INSERT
WITH CHECK (
  bucket_id = 'employee-photos' 
  AND auth.uid() IS NOT NULL 
  AND (
    has_role(auth.uid(), 'admin'::app_role) OR 
    has_role(auth.uid(), 'staff'::app_role) OR 
    has_role(auth.uid(), 'hr'::app_role) OR 
    has_role(auth.uid(), 'assistant'::app_role)
  )
);

CREATE POLICY "Admin Staff HR and Assistant can update employee photos"
ON storage.objects
FOR UPDATE
USING (
  bucket_id = 'employee-photos' 
  AND auth.uid() IS NOT NULL 
  AND (
    has_role(auth.uid(), 'admin'::app_role) OR 
    has_role(auth.uid(), 'staff'::app_role) OR 
    has_role(auth.uid(), 'hr'::app_role) OR 
    has_role(auth.uid(), 'assistant'::app_role)
  )
);