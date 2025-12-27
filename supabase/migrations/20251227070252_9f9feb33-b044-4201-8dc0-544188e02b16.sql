-- Add concern column to notes table
ALTER TABLE public.notes ADD COLUMN IF NOT EXISTS concern text NOT NULL DEFAULT '';