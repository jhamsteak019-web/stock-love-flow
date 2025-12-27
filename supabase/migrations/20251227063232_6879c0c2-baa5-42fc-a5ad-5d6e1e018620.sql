-- Fix the trigger to only auto-update if updated_at wasn't explicitly set
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
BEGIN
  -- Only auto-update if updated_at wasn't explicitly changed in the update
  IF NEW.updated_at = OLD.updated_at THEN
    NEW.updated_at = now();
  END IF;
  RETURN NEW;
END;
$function$;