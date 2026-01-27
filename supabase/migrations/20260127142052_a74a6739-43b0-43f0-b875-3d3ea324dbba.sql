-- Add branch_id column to team_chat_messages for branch isolation
ALTER TABLE public.team_chat_messages 
ADD COLUMN branch_id uuid REFERENCES public.branches(id) ON DELETE SET NULL;

-- Create index for faster branch-based queries
CREATE INDEX idx_team_chat_messages_branch_id ON public.team_chat_messages(branch_id);

-- Update RLS policy to allow users to only see messages from their branch (or all if admin)
DROP POLICY IF EXISTS "Users can view chat messages" ON public.team_chat_messages;
DROP POLICY IF EXISTS "Users can insert chat messages" ON public.team_chat_messages;
DROP POLICY IF EXISTS "Users can delete their own messages" ON public.team_chat_messages;

-- Policy: Admins can view all messages, non-admins can only view messages from their branch
CREATE POLICY "Users can view chat messages"
ON public.team_chat_messages
FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role) OR 
  branch_id IS NULL OR
  branch_id IN (SELECT branch_id FROM public.profiles WHERE id = auth.uid())
);

-- Policy: Authenticated users can insert messages
CREATE POLICY "Users can insert chat messages"
ON public.team_chat_messages
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

-- Policy: Users can delete their own messages, admins can delete any
CREATE POLICY "Users can delete chat messages"
ON public.team_chat_messages
FOR DELETE
TO authenticated
USING (
  auth.uid() = user_id OR 
  has_role(auth.uid(), 'admin'::app_role)
);