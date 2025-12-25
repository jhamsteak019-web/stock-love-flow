-- Create sales table for Metro Group sales data
CREATE TABLE public.sales (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category text NOT NULL,
  mp text NOT NULL,
  branch_name text NOT NULL,
  sale_date date NOT NULL,
  mhb numeric DEFAULT 0,
  mlp numeric DEFAULT 0,
  msh numeric DEFAULT 0,
  mum numeric DEFAULT 0,
  ts numeric DEFAULT 0,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.sales ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Admins can manage sales"
ON public.sales
FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Staff can view sales"
ON public.sales
FOR SELECT
USING (true);

CREATE POLICY "Staff can create sales"
ON public.sales
FOR INSERT
WITH CHECK (auth.uid() = created_by);

-- Trigger for updated_at
CREATE TRIGGER update_sales_updated_at
BEFORE UPDATE ON public.sales
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();