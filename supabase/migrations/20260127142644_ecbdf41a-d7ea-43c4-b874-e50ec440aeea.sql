-- Drop the old permissive SELECT policies that allow viewing all messages
DROP POLICY IF EXISTS "Authenticated users can view messages" ON public.team_chat_messages;

-- Also drop and recreate the branch-filtered policy (remove NULL allowance)
DROP POLICY IF EXISTS "Users can view chat messages" ON public.team_chat_messages;

CREATE POLICY "Users can view chat messages" 
ON public.team_chat_messages 
FOR SELECT 
TO authenticated
USING (
  -- Admins can see all messages
  public.has_role(auth.uid(), 'admin'::public.app_role) 
  OR 
  -- Non-admins can only see messages from their branch (must match exactly)
  branch_id = (SELECT branch_id FROM public.profiles WHERE id = auth.uid())
);