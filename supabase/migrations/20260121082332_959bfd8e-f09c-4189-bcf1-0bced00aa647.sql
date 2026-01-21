-- Add branch text column to employees table for manual branch input
ALTER TABLE public.employees
ADD COLUMN IF NOT EXISTS branch TEXT;