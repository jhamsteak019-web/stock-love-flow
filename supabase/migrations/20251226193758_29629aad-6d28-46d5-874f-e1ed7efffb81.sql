-- Create table to store column settings per page
CREATE TABLE public.column_settings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  page_name TEXT NOT NULL UNIQUE,
  settings JSONB NOT NULL DEFAULT '{}',
  updated_by UUID REFERENCES auth.users(id),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.column_settings ENABLE ROW LEVEL SECURITY;

-- Anyone can read column settings
CREATE POLICY "Anyone can view column settings"
ON public.column_settings
FOR SELECT
TO authenticated
USING (true);

-- Only admins can insert column settings
CREATE POLICY "Admins can insert column settings"
ON public.column_settings
FOR INSERT
TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Only admins can update column settings
CREATE POLICY "Admins can update column settings"
ON public.column_settings
FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Insert default settings for each page
INSERT INTO public.column_settings (page_name, settings) VALUES
  ('deliveries', '{"visibleColumns": ["allocation", "destination", "category", "totalBoxes", "totalQty", "dateOut", "status", "waybill", "remarks", "actions"], "columnWidths": {}}'),
  ('history', '{"visibleColumns": ["allocation", "destination", "category", "totalBoxes", "totalQty", "dateOut", "dateReceived", "courier", "waybill", "remarks", "actions"], "columnWidths": {}}'),
  ('releaseStock', '{"visibleColumns": ["allocation", "destination", "category", "totalBoxes", "totalQty", "remarks", "waybill"], "columnWidths": {}}');