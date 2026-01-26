-- Add reply_to column for message replies
ALTER TABLE public.team_chat_messages 
ADD COLUMN reply_to_id uuid REFERENCES public.team_chat_messages(id) ON DELETE SET NULL;