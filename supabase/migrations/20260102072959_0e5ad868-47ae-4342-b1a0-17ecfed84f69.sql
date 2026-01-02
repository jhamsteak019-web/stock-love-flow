-- Add remarks column to containers table
ALTER TABLE public.containers ADD COLUMN IF NOT EXISTS remarks text;