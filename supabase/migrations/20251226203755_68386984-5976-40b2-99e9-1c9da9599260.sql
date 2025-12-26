-- Add foreign key relationship between notes.user_id and profiles.id
ALTER TABLE public.notes 
ADD CONSTRAINT notes_user_id_fkey 
FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;