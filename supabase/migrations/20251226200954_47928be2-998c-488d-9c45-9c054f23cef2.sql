-- Add status column to notes table
ALTER TABLE public.notes 
ADD COLUMN status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved'));

-- Allow admins to update any note (for approval)
CREATE POLICY "Admins can update all notes" 
ON public.notes 
FOR UPDATE 
USING (has_role(auth.uid(), 'admin'::app_role));