-- Create chat_message_reactions table
CREATE TABLE public.chat_message_reactions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  message_id UUID NOT NULL REFERENCES public.team_chat_messages(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  emoji TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (message_id, user_id, emoji)
);

-- Enable Row Level Security
ALTER TABLE public.chat_message_reactions ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view all reactions"
ON public.chat_message_reactions
FOR SELECT
USING (auth.uid() IS NOT NULL);

CREATE POLICY "Users can insert their own reactions"
ON public.chat_message_reactions
FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own reactions"
ON public.chat_message_reactions
FOR DELETE
USING (auth.uid() = user_id);

CREATE POLICY "Admins can delete any reaction"
ON public.chat_message_reactions
FOR DELETE
USING (has_role(auth.uid(), 'admin'::app_role));

-- Enable realtime for instant updates
ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_message_reactions;