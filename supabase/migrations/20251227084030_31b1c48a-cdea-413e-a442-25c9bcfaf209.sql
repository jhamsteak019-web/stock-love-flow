-- Allow all authenticated users to view profiles (for displaying creator names)
CREATE POLICY "Authenticated users can view all profiles" 
ON public.profiles 
FOR SELECT 
TO authenticated
USING (true);