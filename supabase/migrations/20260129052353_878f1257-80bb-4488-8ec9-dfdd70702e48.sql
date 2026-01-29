-- Create table for page access PINs
CREATE TABLE public.page_access_pins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  page_name text NOT NULL UNIQUE,
  pin text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id)
);

-- Enable RLS
ALTER TABLE public.page_access_pins ENABLE ROW LEVEL SECURITY;

-- Admins can manage PINs
CREATE POLICY "Admins can manage page PINs"
ON public.page_access_pins
FOR ALL
USING (has_role(auth.uid(), 'admin'))
WITH CHECK (has_role(auth.uid(), 'admin'));

-- Authenticated users can view PINs (for verification)
CREATE POLICY "Authenticated users can view PINs"
ON public.page_access_pins
FOR SELECT
USING (auth.uid() IS NOT NULL);

-- Insert default PIN for manpower page (123456)
INSERT INTO public.page_access_pins (page_name, pin) 
VALUES ('manpower', '123456');