-- Remove the auto-update trigger from sales table
DROP TRIGGER IF EXISTS update_sales_updated_at ON public.sales;