-- Create repeat_orders table
CREATE TABLE public.repeat_orders (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  item_name TEXT NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1,
  destination TEXT NOT NULL DEFAULT '',
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_by UUID,
  deleted_at TIMESTAMP WITH TIME ZONE
);

-- Enable Row Level Security
ALTER TABLE public.repeat_orders ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Authenticated users can view repeat orders"
ON public.repeat_orders
FOR SELECT
USING (auth.uid() IS NOT NULL);

CREATE POLICY "Staff and admin can insert repeat orders"
ON public.repeat_orders
FOR INSERT
WITH CHECK (auth.uid() IS NOT NULL AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'staff'::app_role) OR has_role(auth.uid(), 'uploader'::app_role)));

CREATE POLICY "Staff and admin can update repeat orders"
ON public.repeat_orders
FOR UPDATE
USING (auth.uid() IS NOT NULL AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'staff'::app_role) OR has_role(auth.uid(), 'uploader'::app_role)));

CREATE POLICY "Admin can delete repeat orders"
ON public.repeat_orders
FOR DELETE
USING (auth.uid() IS NOT NULL AND has_role(auth.uid(), 'admin'::app_role));