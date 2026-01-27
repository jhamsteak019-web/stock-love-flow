-- Add delete policy for admins
CREATE POLICY "Admins can delete activity logs" 
ON public.activity_logs 
FOR DELETE 
USING (has_role(auth.uid(), 'admin'::app_role));