-- Drop the old Admin-only UPDATE policy for attendance_records
DROP POLICY IF EXISTS "Only Admin can update attendance records" ON public.attendance_records;

-- Create new UPDATE policy that allows Admin, Staff, and HR to update attendance records
CREATE POLICY "Admin Staff and HR can update attendance records"
ON public.attendance_records
FOR UPDATE
TO authenticated
USING (
  (auth.uid() IS NOT NULL) AND (
    has_role(auth.uid(), 'admin'::app_role) OR 
    has_role(auth.uid(), 'staff'::app_role) OR 
    has_role(auth.uid(), 'hr'::app_role)
  )
)
WITH CHECK (
  (auth.uid() IS NOT NULL) AND (
    has_role(auth.uid(), 'admin'::app_role) OR 
    has_role(auth.uid(), 'staff'::app_role) OR 
    has_role(auth.uid(), 'hr'::app_role)
  )
);