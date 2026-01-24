-- Create store_visit_schedules table for tracking store visits
CREATE TABLE public.store_visit_schedules (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  area TEXT NOT NULL, -- NCR, NORTH AREA, SOUTH AREA, VISAYAS AREA, etc.
  store_name TEXT NOT NULL, -- METRO Paranaque, METRO Market Market, etc.
  category TEXT, -- BSW, BSWU, etc.
  visit_date DATE NOT NULL,
  remarks TEXT,
  branch_id UUID REFERENCES public.branches(id),
  created_by TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  deleted_at TIMESTAMP WITH TIME ZONE
);

-- Enable RLS
ALTER TABLE public.store_visit_schedules ENABLE ROW LEVEL SECURITY;

-- Create policies for access
CREATE POLICY "Authenticated users can view store visit schedules"
ON public.store_visit_schedules
FOR SELECT
TO authenticated
USING (deleted_at IS NULL);

CREATE POLICY "Admin and staff can create store visit schedules"
ON public.store_visit_schedules
FOR INSERT
TO authenticated
WITH CHECK (true);

CREATE POLICY "Admin and staff can update store visit schedules"
ON public.store_visit_schedules
FOR UPDATE
TO authenticated
USING (true);

CREATE POLICY "Admin can delete store visit schedules"
ON public.store_visit_schedules
FOR DELETE
TO authenticated
USING (true);

-- Create index for faster queries
CREATE INDEX idx_store_visit_schedules_area ON public.store_visit_schedules(area);
CREATE INDEX idx_store_visit_schedules_visit_date ON public.store_visit_schedules(visit_date);
CREATE INDEX idx_store_visit_schedules_branch_id ON public.store_visit_schedules(branch_id);

-- Add trigger for updated_at
CREATE TRIGGER update_store_visit_schedules_updated_at
BEFORE UPDATE ON public.store_visit_schedules
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();