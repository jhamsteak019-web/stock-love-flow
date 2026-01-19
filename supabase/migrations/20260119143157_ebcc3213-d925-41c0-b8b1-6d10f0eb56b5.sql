-- Add branch_id column to profiles table
ALTER TABLE public.profiles ADD COLUMN branch_id uuid REFERENCES public.branches(id) ON DELETE SET NULL;

-- Create index for better query performance
CREATE INDEX idx_profiles_branch_id ON public.profiles(branch_id);