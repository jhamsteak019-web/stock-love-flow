-- Update existing messages to have branch_id from sender's profile
UPDATE public.team_chat_messages m
SET branch_id = (
  SELECT p.branch_id 
  FROM public.profiles p 
  WHERE p.id = m.user_id
)
WHERE m.branch_id IS NULL;

-- Drop existing select policy and create a stricter one
DROP POLICY IF EXISTS "Users can view chat messages" ON public.team_chat_messages;

CREATE POLICY "Users can view chat messages" 
ON public.team_chat_messages 
FOR SELECT 
TO authenticated
USING (
  -- Admins can see all messages
  public.has_role(auth.uid(), 'admin'::public.app_role) 
  OR 
  -- Non-admins can only see messages from their branch (must match, no NULL)
  (
    branch_id IS NOT NULL 
    AND branch_id = (SELECT branch_id FROM public.profiles WHERE id = auth.uid())
  )
);