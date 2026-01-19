-- Create tasks table for task calendar
CREATE TABLE public.tasks (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  task_date DATE NOT NULL,
  color TEXT NOT NULL DEFAULT 'blue',
  created_by UUID NOT NULL,
  branch_id UUID REFERENCES public.branches(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Authenticated users can view tasks"
ON public.tasks FOR SELECT
USING (auth.uid() IS NOT NULL);

CREATE POLICY "Staff and admin can create tasks"
ON public.tasks FOR INSERT
WITH CHECK (
  auth.uid() IS NOT NULL AND 
  (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'staff'::app_role) OR has_role(auth.uid(), 'uploader'::app_role))
);

CREATE POLICY "Staff and admin can update tasks"
ON public.tasks FOR UPDATE
USING (
  auth.uid() IS NOT NULL AND 
  (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'staff'::app_role) OR has_role(auth.uid(), 'uploader'::app_role))
);

CREATE POLICY "Admin can delete tasks"
ON public.tasks FOR DELETE
USING (auth.uid() IS NOT NULL AND has_role(auth.uid(), 'admin'::app_role));

-- Trigger for updated_at
CREATE TRIGGER update_tasks_updated_at
  BEFORE UPDATE ON public.tasks
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();