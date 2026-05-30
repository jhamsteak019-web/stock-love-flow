DROP POLICY IF EXISTS "Authenticated users can view approver roles for notifications" ON public.user_roles;

CREATE POLICY "Authenticated users can view approver roles for notifications"
ON public.user_roles
FOR SELECT
TO authenticated
USING (role IN ('admin', 'assistant'));
