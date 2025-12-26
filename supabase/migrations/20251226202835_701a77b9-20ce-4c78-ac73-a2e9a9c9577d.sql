-- Drop existing constraint and recreate with new values
ALTER TABLE public.notes DROP CONSTRAINT IF EXISTS notes_status_check;

ALTER TABLE public.notes 
ADD CONSTRAINT notes_status_check 
CHECK (status IN ('pending', 'waiting_to_follow', 'waiting_approval', 'approved'));