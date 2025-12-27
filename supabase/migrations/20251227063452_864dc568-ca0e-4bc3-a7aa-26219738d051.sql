-- Add policy for admins to delete any note
CREATE POLICY "Admins can delete all notes" 
ON public.notes 
FOR DELETE 
USING (has_role(auth.uid(), 'admin'::app_role));