-- Add visibility column to notes table
ALTER TABLE public.notes 
ADD COLUMN is_public boolean NOT NULL DEFAULT false;

-- Drop existing staff/user SELECT policies that are too restrictive
DROP POLICY IF EXISTS "Users can view their own notes" ON public.notes;

-- Create new policy that allows staff to see public notes OR their own notes
CREATE POLICY "Users can view own notes and public notes"
ON public.notes
FOR SELECT
USING (
  auth.uid() = user_id 
  OR is_public = true
);