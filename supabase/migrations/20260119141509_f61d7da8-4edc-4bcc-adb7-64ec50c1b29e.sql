-- Create branches table for admin-managed branch list
CREATE TABLE public.branches (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL UNIQUE,
  code text NOT NULL UNIQUE,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  is_active boolean NOT NULL DEFAULT true
);

-- Enable RLS
ALTER TABLE public.branches ENABLE ROW LEVEL SECURITY;

-- Everyone can view active branches
CREATE POLICY "Authenticated users can view branches"
ON public.branches
FOR SELECT
TO authenticated
USING (is_active = true);

-- Only admins can manage branches
CREATE POLICY "Admins can manage branches"
ON public.branches
FOR ALL
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Insert default branches (SM 1 and SM 2 as examples)
INSERT INTO public.branches (name, code) VALUES 
  ('SM 1 - TIM', 'SM1'),
  ('SM 2 - JERRY', 'SM2');

-- Add branch_id to stock_releases table
ALTER TABLE public.stock_releases 
ADD COLUMN branch_id uuid REFERENCES public.branches(id);

-- Add branch_id to imported_items table  
ALTER TABLE public.imported_items
ADD COLUMN branch_id uuid REFERENCES public.branches(id);

-- Add branch_id to repeat_orders table
ALTER TABLE public.repeat_orders
ADD COLUMN branch_id uuid REFERENCES public.branches(id);

-- Add branch_id to notes table
ALTER TABLE public.notes
ADD COLUMN branch_id uuid REFERENCES public.branches(id);

-- Add branch_id to containers table
ALTER TABLE public.containers
ADD COLUMN branch_id uuid REFERENCES public.branches(id);

-- Create trigger to update updated_at
CREATE OR REPLACE FUNCTION public.update_branches_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_branches_updated_at
BEFORE UPDATE ON public.branches
FOR EACH ROW
EXECUTE FUNCTION public.update_branches_updated_at();