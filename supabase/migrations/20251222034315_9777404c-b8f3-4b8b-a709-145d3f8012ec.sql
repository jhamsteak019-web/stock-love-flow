-- Add columns for second Excel format (Sheet No., Deliver To, Supplier, Qty, Remarks)
ALTER TABLE public.imported_items 
ADD COLUMN IF NOT EXISTS sheet_no TEXT,
ADD COLUMN IF NOT EXISTS deliver_to TEXT,
ADD COLUMN IF NOT EXISTS supplier TEXT,
ADD COLUMN IF NOT EXISTS qty NUMERIC DEFAULT 0,
ADD COLUMN IF NOT EXISTS remarks TEXT,
ADD COLUMN IF NOT EXISTS format_type TEXT DEFAULT 'format1';