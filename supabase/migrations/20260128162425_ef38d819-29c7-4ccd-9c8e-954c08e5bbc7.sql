-- Drop existing restrictive policies for resume-letters bucket
DROP POLICY IF EXISTS "Staff and admin can upload resume letter photos" ON storage.objects;
DROP POLICY IF EXISTS "Staff and admin can update resume letter photos" ON storage.objects;

-- Drop existing restrictive policies for employee-photos bucket
DROP POLICY IF EXISTS "Admin and Staff can upload employee photos" ON storage.objects;
DROP POLICY IF EXISTS "Admin and Staff can update employee photos" ON storage.objects;

-- Create new policies that include HR role for resume-letters bucket
CREATE POLICY "Admin Staff and HR can upload resume letter photos"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'resume-letters' 
  AND auth.uid() IS NOT NULL 
  AND (
    has_role(auth.uid(), 'admin') 
    OR has_role(auth.uid(), 'staff') 
    OR has_role(auth.uid(), 'hr')
  )
);

CREATE POLICY "Admin Staff and HR can update resume letter photos"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'resume-letters' 
  AND auth.uid() IS NOT NULL 
  AND (
    has_role(auth.uid(), 'admin') 
    OR has_role(auth.uid(), 'staff') 
    OR has_role(auth.uid(), 'hr')
  )
);

-- Create new policies that include HR role for employee-photos bucket
CREATE POLICY "Admin Staff and HR can upload employee photos"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'employee-photos' 
  AND auth.uid() IS NOT NULL 
  AND (
    has_role(auth.uid(), 'admin') 
    OR has_role(auth.uid(), 'staff') 
    OR has_role(auth.uid(), 'hr')
  )
);

CREATE POLICY "Admin Staff and HR can update employee photos"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'employee-photos' 
  AND auth.uid() IS NOT NULL 
  AND (
    has_role(auth.uid(), 'admin') 
    OR has_role(auth.uid(), 'staff') 
    OR has_role(auth.uid(), 'hr')
  )
);