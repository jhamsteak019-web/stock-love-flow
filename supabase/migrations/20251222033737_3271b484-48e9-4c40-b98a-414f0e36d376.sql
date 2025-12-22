-- Create table for imported Excel items
CREATE TABLE public.imported_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  batch_id UUID NOT NULL DEFAULT gen_random_uuid(),
  file_name TEXT NOT NULL,
  year TEXT,
  name TEXT NOT NULL,
  upc TEXT,
  description TEXT,
  category TEXT,
  price_a NUMERIC DEFAULT 0,
  branch TEXT,
  imported_by UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.imported_items ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Authenticated users can view imported items"
ON public.imported_items
FOR SELECT
USING (true);

CREATE POLICY "Authenticated users can insert imported items"
ON public.imported_items
FOR INSERT
WITH CHECK (auth.uid() = imported_by);

CREATE POLICY "Admins can delete imported items"
ON public.imported_items
FOR DELETE
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can manage all imported items"
ON public.imported_items
FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role));