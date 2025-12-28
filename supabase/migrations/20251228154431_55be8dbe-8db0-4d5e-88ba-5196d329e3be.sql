-- Create collection_items table
CREATE TABLE public.collection_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  item_name TEXT NOT NULL,
  description TEXT,
  category TEXT,
  quantity INTEGER DEFAULT 0,
  photo_url TEXT,
  status TEXT DEFAULT 'active',
  notes TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.collection_items ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Authenticated users can view collection items"
ON public.collection_items
FOR SELECT
USING (auth.uid() IS NOT NULL);

CREATE POLICY "Staff and admin can insert collection items"
ON public.collection_items
FOR INSERT
WITH CHECK (
  auth.uid() IS NOT NULL AND 
  (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'staff'))
);

CREATE POLICY "Staff and admin can update collection items"
ON public.collection_items
FOR UPDATE
USING (
  auth.uid() IS NOT NULL AND 
  (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'staff'))
);

CREATE POLICY "Admin can delete collection items"
ON public.collection_items
FOR DELETE
USING (
  auth.uid() IS NOT NULL AND 
  public.has_role(auth.uid(), 'admin')
);

-- Create trigger for updated_at
CREATE TRIGGER update_collection_items_updated_at
BEFORE UPDATE ON public.collection_items
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Create storage bucket for collection item photos
INSERT INTO storage.buckets (id, name, public) VALUES ('collection-photos', 'collection-photos', true);

-- Storage policies for collection photos
CREATE POLICY "Anyone can view collection photos"
ON storage.objects FOR SELECT
USING (bucket_id = 'collection-photos');

CREATE POLICY "Authenticated users can upload collection photos"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'collection-photos' AND auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can update collection photos"
ON storage.objects FOR UPDATE
USING (bucket_id = 'collection-photos' AND auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can delete collection photos"
ON storage.objects FOR DELETE
USING (bucket_id = 'collection-photos' AND auth.uid() IS NOT NULL);