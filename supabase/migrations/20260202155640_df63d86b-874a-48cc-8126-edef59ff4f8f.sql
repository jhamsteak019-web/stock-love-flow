-- =============================================
-- SECURITY FIX: Add remaining authenticated-only view policies
-- (Some were already created, only creating missing ones)
-- =============================================

-- Drop and recreate policies that might conflict
DROP POLICY IF EXISTS "Authenticated users can view collection photos" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can view container photos" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can view repeat order photos" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can view employee photos" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can view chat attachments" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can view med cert photos" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can view delivery photos" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can view resume letters" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can view allocation bills" ON storage.objects;

-- Recreate all authenticated-only view policies
CREATE POLICY "Authenticated users can view collection photos"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'collection-photos');

CREATE POLICY "Authenticated users can view container photos"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'container-photos');

CREATE POLICY "Authenticated users can view repeat order photos"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'repeat-order-photos');

CREATE POLICY "Authenticated users can view employee photos"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'employee-photos');

CREATE POLICY "Authenticated users can view chat attachments"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'chat-attachments');

CREATE POLICY "Authenticated users can view med cert photos"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'med-cert-photos');

CREATE POLICY "Authenticated users can view delivery photos"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'delivery-photos');

CREATE POLICY "Authenticated users can view resume letters"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'resume-letters');

CREATE POLICY "Authenticated users can view allocation bills"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'allocation-bills');