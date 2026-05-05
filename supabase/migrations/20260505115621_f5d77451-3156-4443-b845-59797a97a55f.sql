-- Auto-set delivery_status='delivered' when date_delivered is set
CREATE OR REPLACE FUNCTION public.auto_mark_delivered()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.date_delivered IS NOT NULL AND (NEW.delivery_status IS NULL OR NEW.delivery_status <> 'delivered') THEN
    NEW.delivery_status := 'delivered';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_mark_delivered ON public.stock_releases;
CREATE TRIGGER trg_auto_mark_delivered
BEFORE INSERT OR UPDATE OF date_delivered ON public.stock_releases
FOR EACH ROW
EXECUTE FUNCTION public.auto_mark_delivered();

-- Backfill existing rows: any release with date_delivered set should be marked delivered
UPDATE public.stock_releases
SET delivery_status = 'delivered'
WHERE date_delivered IS NOT NULL AND delivery_status <> 'delivered';