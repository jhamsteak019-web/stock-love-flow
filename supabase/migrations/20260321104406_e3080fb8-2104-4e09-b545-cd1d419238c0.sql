
-- Create reports table
CREATE TABLE public.reports (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  title TEXT NOT NULL,
  file_url TEXT NOT NULL,
  file_name TEXT NOT NULL,
  slides JSONB NOT NULL DEFAULT '[]'::jsonb,
  status TEXT NOT NULL DEFAULT 'processing',
  branch_id UUID REFERENCES public.branches(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Authenticated users can view reports"
ON public.reports FOR SELECT
USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can insert reports"
ON public.reports FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own reports"
ON public.reports FOR UPDATE
USING (auth.uid() = user_id OR has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admin can delete reports"
ON public.reports FOR DELETE
USING (has_role(auth.uid(), 'admin'::app_role) OR auth.uid() = user_id);

-- Trigger for updated_at
CREATE TRIGGER update_reports_updated_at
BEFORE UPDATE ON public.reports
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Storage bucket for report files
INSERT INTO storage.buckets (id, name, public) VALUES ('report-files', 'report-files', true);

-- Storage policies
CREATE POLICY "Authenticated users can upload report files"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'report-files' AND auth.uid() IS NOT NULL);

CREATE POLICY "Anyone can view report files"
ON storage.objects FOR SELECT
USING (bucket_id = 'report-files');

CREATE POLICY "Users can delete their own report files"
ON storage.objects FOR DELETE
USING (bucket_id = 'report-files' AND auth.uid() IS NOT NULL);
