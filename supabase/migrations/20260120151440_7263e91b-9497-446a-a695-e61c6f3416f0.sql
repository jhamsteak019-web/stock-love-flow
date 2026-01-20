-- Create employees table for tracking employee information
CREATE TABLE public.employees (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  full_name TEXT NOT NULL,
  branch_id UUID REFERENCES public.branches(id),
  date_hired DATE NOT NULL,
  employment_status TEXT NOT NULL DEFAULT 'regular', -- 'regular' or 'seasonal'
  photo_url TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create attendance_records table
CREATE TABLE public.attendance_records (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  attendance_date DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'present', -- 'present', 'absent', 'late'
  reason TEXT,
  date_of_absent DATE,
  date_of_resume DATE,
  remarks TEXT,
  notes TEXT,
  branch_id UUID REFERENCES public.branches(id),
  created_by UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance_records ENABLE ROW LEVEL SECURITY;

-- RLS Policies for employees
CREATE POLICY "Authenticated users can view employees"
ON public.employees
FOR SELECT
USING (auth.uid() IS NOT NULL);

CREATE POLICY "Admin and Staff can insert employees"
ON public.employees
FOR INSERT
WITH CHECK (
  auth.uid() IS NOT NULL AND 
  (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'staff'))
);

CREATE POLICY "Admin and Staff can update employees"
ON public.employees
FOR UPDATE
USING (
  auth.uid() IS NOT NULL AND 
  (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'staff'))
);

CREATE POLICY "Admin can delete employees"
ON public.employees
FOR DELETE
USING (
  auth.uid() IS NOT NULL AND 
  has_role(auth.uid(), 'admin')
);

-- RLS Policies for attendance_records
CREATE POLICY "Authenticated users can view attendance records"
ON public.attendance_records
FOR SELECT
USING (auth.uid() IS NOT NULL);

CREATE POLICY "Admin and Staff can insert attendance records"
ON public.attendance_records
FOR INSERT
WITH CHECK (
  auth.uid() IS NOT NULL AND 
  (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'staff'))
);

CREATE POLICY "Admin and Staff can update attendance records"
ON public.attendance_records
FOR UPDATE
USING (
  auth.uid() IS NOT NULL AND 
  (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'staff'))
);

CREATE POLICY "Admin can delete attendance records"
ON public.attendance_records
FOR DELETE
USING (
  auth.uid() IS NOT NULL AND 
  has_role(auth.uid(), 'admin')
);

-- Create storage bucket for employee photos
INSERT INTO storage.buckets (id, name, public) VALUES ('employee-photos', 'employee-photos', true);

-- Storage policies for employee photos
CREATE POLICY "Employee photos are publicly accessible"
ON storage.objects FOR SELECT
USING (bucket_id = 'employee-photos');

CREATE POLICY "Admin and Staff can upload employee photos"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'employee-photos' AND 
  auth.uid() IS NOT NULL AND 
  (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'staff'))
);

CREATE POLICY "Admin and Staff can update employee photos"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'employee-photos' AND 
  auth.uid() IS NOT NULL AND 
  (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'staff'))
);

CREATE POLICY "Admin can delete employee photos"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'employee-photos' AND 
  auth.uid() IS NOT NULL AND 
  has_role(auth.uid(), 'admin')
);