-- Allow Staff to update employees (not just Admin)
DROP POLICY IF EXISTS "Only Admin can update employees" ON public.employees;

CREATE POLICY "Admin and Staff can update employees" 
ON public.employees 
FOR UPDATE 
USING (
  (auth.uid() IS NOT NULL) AND 
  (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'staff'::app_role))
)
WITH CHECK (
  (auth.uid() IS NOT NULL) AND 
  (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'staff'::app_role))
);