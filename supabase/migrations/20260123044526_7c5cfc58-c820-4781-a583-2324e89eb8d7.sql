-- Add deleted_at column to attendance_records for soft delete
ALTER TABLE public.attendance_records 
ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP WITH TIME ZONE DEFAULT NULL;

-- Add deleted_at column to employees for tracking deletion time (in addition to is_active)
ALTER TABLE public.employees 
ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP WITH TIME ZONE DEFAULT NULL;