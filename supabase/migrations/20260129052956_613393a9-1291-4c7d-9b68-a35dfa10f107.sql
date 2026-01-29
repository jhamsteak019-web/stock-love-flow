-- Update repeat_orders RLS to allow Staff and HR to update (for photo uploads)
DROP POLICY IF EXISTS "Only Admin can update repeat orders" ON public.repeat_orders;

CREATE POLICY "Admin Staff and HR can update repeat orders"
ON public.repeat_orders
FOR UPDATE
USING (
  auth.uid() IS NOT NULL AND (
    has_role(auth.uid(), 'admin') OR 
    has_role(auth.uid(), 'staff') OR 
    has_role(auth.uid(), 'hr')
  )
)
WITH CHECK (
  auth.uid() IS NOT NULL AND (
    has_role(auth.uid(), 'admin') OR 
    has_role(auth.uid(), 'staff') OR 
    has_role(auth.uid(), 'hr')
  )
);

-- Create storage policies for repeat-order-photos bucket
-- Allow staff and HR to upload photos
CREATE POLICY "Staff and HR can upload repeat order photos"
ON storage.objects
FOR INSERT
WITH CHECK (
  bucket_id = 'repeat-order-photos' AND (
    has_role(auth.uid(), 'admin') OR 
    has_role(auth.uid(), 'staff') OR 
    has_role(auth.uid(), 'hr') OR
    has_role(auth.uid(), 'uploader')
  )
);

-- Allow staff and HR to update their photos
CREATE POLICY "Staff and HR can update repeat order photos"
ON storage.objects
FOR UPDATE
USING (
  bucket_id = 'repeat-order-photos' AND (
    has_role(auth.uid(), 'admin') OR 
    has_role(auth.uid(), 'staff') OR 
    has_role(auth.uid(), 'hr') OR
    has_role(auth.uid(), 'uploader')
  )
);

-- Allow authenticated users to view repeat order photos
CREATE POLICY "Authenticated users can view repeat order photos"
ON storage.objects
FOR SELECT
USING (bucket_id = 'repeat-order-photos' AND auth.uid() IS NOT NULL);

-- Allow admin to delete repeat order photos
CREATE POLICY "Admin can delete repeat order photos"
ON storage.objects
FOR DELETE
USING (bucket_id = 'repeat-order-photos' AND has_role(auth.uid(), 'admin'));