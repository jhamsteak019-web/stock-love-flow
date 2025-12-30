-- Create containers table
CREATE TABLE public.containers (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  out_factory TEXT,
  photo_url TEXT,
  date_receive_factory DATE,
  receive_photo_url TEXT,
  category TEXT,
  notes TEXT,
  created_by UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.containers ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Authenticated users can view containers"
ON public.containers
FOR SELECT
USING (auth.uid() IS NOT NULL);

CREATE POLICY "Staff and admin can insert containers"
ON public.containers
FOR INSERT
WITH CHECK (auth.uid() IS NOT NULL AND (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'staff')));

CREATE POLICY "Staff and admin can update containers"
ON public.containers
FOR UPDATE
USING (auth.uid() IS NOT NULL AND (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'staff')));

CREATE POLICY "Admin can delete containers"
ON public.containers
FOR DELETE
USING (auth.uid() IS NOT NULL AND has_role(auth.uid(), 'admin'));

-- Create storage bucket for container photos
INSERT INTO storage.buckets (id, name, public) VALUES ('container-photos', 'container-photos', true);

-- Storage policies for container photos
CREATE POLICY "Anyone can view container photos"
ON storage.objects FOR SELECT
USING (bucket_id = 'container-photos');

CREATE POLICY "Authenticated users can upload container photos"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'container-photos' AND auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can update container photos"
ON storage.objects FOR UPDATE
USING (bucket_id = 'container-photos' AND auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can delete container photos"
ON storage.objects FOR DELETE
USING (bucket_id = 'container-photos' AND auth.uid() IS NOT NULL);