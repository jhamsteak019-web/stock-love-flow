-- Add day_off and shift columns to attendance_records table
ALTER TABLE public.attendance_records
ADD COLUMN IF NOT EXISTS day_off TEXT,
ADD COLUMN IF NOT EXISTS shift TEXT;