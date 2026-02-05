-- Add category column to tasks table for schedule types
ALTER TABLE public.tasks
ADD COLUMN category TEXT DEFAULT 'event';

-- Add comment for clarity
COMMENT ON COLUMN public.tasks.category IS 'Schedule category: event, daily, roving, ccn';