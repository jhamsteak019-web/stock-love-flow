-- Add resign_letter_photos column to employees for storing resignation letter images
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS resign_letter_photos text[] DEFAULT '{}'::text[];