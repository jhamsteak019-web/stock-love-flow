-- Allow admins to view all notes
CREATE POLICY "Admins can view all notes" 
ON public.notes 
FOR SELECT 
USING (has_role(auth.uid(), 'admin'::app_role));