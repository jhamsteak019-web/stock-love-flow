-- Make employee-photos bucket public so photos can be displayed
UPDATE storage.buckets 
SET public = true 
WHERE id = 'employee-photos';